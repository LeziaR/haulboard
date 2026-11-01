// Pure metric calculations over normalised downtime events.
// No I/O here: everything is unit-tested with fixture events.
//
// Definitions (window = [from, to], W = window length in hours):
//   downtime hours      overlap of [start, end ?? asOf] with the window, all causes
//   failure             an event with an `unplanned` cause starting inside the window
//   availability loss   union of unplanned + planned intervals for a unit,
//                       clipped to the window (overlaps are not double counted)
//   availability %      (W - availability loss) / W
//   MTBF (h)            (W - availability loss) / failures      (null if 0 failures)
//   MTTR (h)            mean full duration of closed failures that started in window
//   Operational delays (OPS, WX, SAF) are reported as downtime but do not
//   count as failures or availability loss.

import { HOUR_MS, DAY_MS, EQUIPMENT_CLASSES, CAUSE_CODES } from './constants.js';

export function makeWindow({ days = 30, asOf = Date.now() } = {}) {
  return { from: asOf - days * DAY_MS, to: asOf, asOf };
}

const round1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

function effectiveEnd(e, asOf) {
  return e.end !== null && e.end !== undefined ? e.end : asOf;
}

export function overlapHours(e, win) {
  if (e.start === null || e.start === undefined) return 0;
  const s = Math.max(e.start, win.from);
  const t = Math.min(effectiveEnd(e, win.asOf ?? win.to), win.to);
  return t > s ? (t - s) / HOUR_MS : 0;
}

export function fullDurationHours(e, asOf) {
  if (e.start === null || e.start === undefined) return 0;
  return Math.max(0, (effectiveEnd(e, asOf) - e.start) / HOUR_MS);
}

function startsInWindow(e, win) {
  return e.start !== null && e.start >= win.from && e.start <= win.to;
}

// Total length (h) of the union of intervals, clipped to the window.
export function unionHours(intervals, win) {
  const clipped = intervals
    .map(([s, t]) => [Math.max(s, win.from), Math.min(t, win.to)])
    .filter(([s, t]) => t > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur = null;
  for (const iv of clipped) {
    if (!cur) cur = [...iv];
    else if (iv[0] <= cur[1]) cur[1] = Math.max(cur[1], iv[1]);
    else {
      total += cur[1] - cur[0];
      cur = [...iv];
    }
  }
  if (cur) total += cur[1] - cur[0];
  return total / HOUR_MS;
}

const classified = (events) => events.filter((e) => e.unitId);

export function downtimeByClass(events, win) {
  const map = new Map();
  for (const e of classified(events)) {
    const h = overlapHours(e, win);
    if (h <= 0) continue;
    const k = e.equipmentClass || 'unclassified';
    const row = map.get(k) || { equipmentClass: k, hours: 0, events: 0 };
    row.hours += h;
    row.events += 1;
    map.set(k, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, hours: round1(r.hours) }))
    .sort((a, b) => b.hours - a.hours || a.equipmentClass.localeCompare(b.equipmentClass));
}

export function downtimeByCause(events, win) {
  const map = new Map();
  for (const e of classified(events)) {
    const h = overlapHours(e, win);
    if (h <= 0) continue;
    const k = e.causeCode || 'UNK';
    const row = map.get(k) || { causeCode: k, category: e.causeCategory, hours: 0, events: 0 };
    row.hours += h;
    row.events += 1;
    map.set(k, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, hours: round1(r.hours) }))
    .sort((a, b) => b.hours - a.hours || a.causeCode.localeCompare(b.causeCode));
}

export function downtimeByClassAndCause(events, win) {
  const map = new Map();
  for (const e of classified(events)) {
    const h = overlapHours(e, win);
    if (h <= 0) continue;
    const k = `${e.equipmentClass || 'unclassified'}|${e.causeCode || 'UNK'}`;
    map.set(k, (map.get(k) || 0) + h);
  }
  return [...map.entries()]
    .map(([k, h]) => {
      const [equipmentClass, causeCode] = k.split('|');
      return { equipmentClass, causeCode, hours: round1(h) };
    })
    .sort((a, b) => a.equipmentClass.localeCompare(b.equipmentClass) || b.hours - a.hours);
}

function reliabilityFor(unitEvents, win) {
  const W = (win.to - win.from) / HOUR_MS;
  const asOf = win.asOf ?? win.to;
  const lossIntervals = unitEvents
    .filter((e) => e.causeCategory === 'unplanned' || e.causeCategory === 'planned')
    .filter((e) => e.start !== null)
    .map((e) => [e.start, effectiveEnd(e, asOf)]);
  const lossHours = unionHours(lossIntervals, win);
  const failures = unitEvents.filter((e) => e.causeCategory === 'unplanned' && startsInWindow(e, win));
  const closedFailures = failures.filter((e) => e.end !== null);
  const repairHours = closedFailures.reduce((s, e) => s + fullDurationHours(e, asOf), 0);
  const uptime = Math.max(0, W - lossHours);
  return {
    windowHours: W,
    lossHours,
    uptimeHours: uptime,
    failures: failures.length,
    closedFailures: closedFailures.length,
    repairHours,
    mtbfHours: failures.length ? uptime / failures.length : null,
    mttrHours: closedFailures.length ? repairHours / closedFailures.length : null,
    availabilityPct: W > 0 ? Math.min(100, Math.max(0, (uptime / W) * 100)) : null,
  };
}

// Per-unit reliability. The unit universe is every unit seen in `events`
// (not only those with events in the window), so a unit with no failures
// this month still shows 100 % availability instead of disappearing.
export function unitReliability(events, win) {
  const byUnit = new Map();
  for (const e of classified(events)) {
    if (!byUnit.has(e.unitId)) byUnit.set(e.unitId, []);
    byUnit.get(e.unitId).push(e);
  }
  const rows = [];
  for (const [unitId, list] of byUnit) {
    const r = reliabilityFor(list, win);
    const downtimeHours = list.reduce((s, e) => s + overlapHours(e, win), 0);
    const last = list.reduce((a, e) => (a === null || (e.start ?? 0) > (a.start ?? 0) ? e : a), null);
    rows.push({
      unitId,
      equipmentClass: list.find((e) => e.equipmentClass)?.equipmentClass || 'unclassified',
      events: list.filter((e) => overlapHours(e, win) > 0).length,
      failures: r.failures,
      downtimeHours: round1(downtimeHours),
      lossHours: round1(r.lossHours),
      mtbfHours: round1(r.mtbfHours),
      mttrHours: round1(r.mttrHours),
      availabilityPct: round1(r.availabilityPct),
      openEvents: list.filter((e) => e.open).length,
      lastEventKey: last ? last.key : null,
      lastEventStart: last ? last.start : null,
      _raw: r,
    });
  }
  return rows.sort((a, b) => (a.availabilityPct ?? 100) - (b.availabilityPct ?? 100) || a.unitId.localeCompare(b.unitId));
}

function aggregate(rows) {
  const sum = (k) => rows.reduce((s, r) => s + r._raw[k], 0);
  const W = sum('windowHours');
  const uptime = sum('uptimeHours');
  const failures = sum('failures');
  const closed = sum('closedFailures');
  return {
    units: rows.length,
    failures,
    downtimeHours: round1(rows.reduce((s, r) => s + r.downtimeHours, 0)),
    mtbfHours: failures ? round1(uptime / failures) : null,
    mttrHours: closed ? round1(sum('repairHours') / closed) : null,
    availabilityPct: W > 0 ? round1((uptime / W) * 100) : null,
  };
}

export function classReliability(unitRows) {
  const groups = new Map();
  for (const r of unitRows) {
    if (!groups.has(r.equipmentClass)) groups.set(r.equipmentClass, []);
    groups.get(r.equipmentClass).push(r);
  }
  const order = Object.keys(EQUIPMENT_CLASSES);
  return [...groups.entries()]
    .map(([equipmentClass, rows]) => ({ equipmentClass, ...aggregate(rows) }))
    .sort((a, b) => order.indexOf(a.equipmentClass) - order.indexOf(b.equipmentClass));
}

export function fleetSummary(events, win, unitRows = unitReliability(events, win)) {
  const inWindow = classified(events).filter((e) => overlapHours(e, win) > 0);
  return {
    ...aggregate(unitRows),
    eventsInWindow: inWindow.length,
    openEvents: classified(events).filter((e) => e.open).length,
    unclassifiedIssues: events.filter((e) => !e.unitId).length,
  };
}

// (unit, cause) pairs with >= minCount unplanned events starting in the window.
export function topRecurring(events, win, { minCount = 2, limit = 10 } = {}) {
  const groups = new Map();
  for (const e of classified(events)) {
    if (e.causeCategory !== 'unplanned' || !startsInWindow(e, win)) continue;
    const k = `${e.unitId}|${e.causeCode || 'UNK'}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  return [...groups.values()]
    .filter((list) => list.length >= minCount)
    .map((list) => {
      const sorted = [...list].sort((a, b) => b.start - a.start);
      return {
        unitId: sorted[0].unitId,
        equipmentClass: sorted[0].equipmentClass,
        causeCode: sorted[0].causeCode || 'UNK',
        count: list.length,
        hours: round1(list.reduce((s, e) => s + fullDurationHours(e, win.asOf ?? win.to), 0)),
        lastStart: sorted[0].start,
        keys: sorted.map((e) => e.key),
      };
    })
    .sort((a, b) => b.count - a.count || b.hours - a.hours || a.unitId.localeCompare(b.unitId))
    .slice(0, limit);
}

// Recurring-failure rule used by the issue panel and the Rovo action.
export function detectRecurring(events, unitId, { causeCode = null, threshold = 3, days = 30, asOf = Date.now() } = {}) {
  const win = makeWindow({ days, asOf });
  const uid = String(unitId || '').toUpperCase();
  const unplanned = events.filter((e) => e.unitId === uid && e.causeCategory === 'unplanned' && startsInWindow(e, win));
  let code = causeCode ? String(causeCode).toUpperCase() : null;
  if (!code) {
    const counts = new Map();
    for (const e of unplanned) counts.set(e.causeCode, (counts.get(e.causeCode) || 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
    code = best ? best[0] : null;
  }
  const matches = unplanned.filter((e) => e.causeCode === code).sort((a, b) => b.start - a.start);
  return {
    unitId: uid,
    causeCode: code,
    count: matches.length,
    threshold,
    days,
    isRecurring: code !== null && matches.length >= threshold,
    keys: matches.map((e) => e.key),
    latestKey: matches.length ? matches[0].key : null,
  };
}

export function openByShift(events) {
  const counts = { A: 0, B: 0, C: 0, D: 0, Unassigned: 0 };
  for (const e of classified(events)) {
    if (!e.open) continue;
    counts[e.shift && counts[e.shift] !== undefined ? e.shift : 'Unassigned'] += 1;
  }
  return Object.entries(counts).map(([shift, open]) => ({ shift, open }));
}

export function unitHistory(events, unitId, { limit = 20, asOf = Date.now() } = {}) {
  const uid = String(unitId || '').toUpperCase();
  return events
    .filter((e) => e.unitId === uid)
    .sort((a, b) => (b.start ?? 0) - (a.start ?? 0))
    .slice(0, limit)
    .map((e) => ({
      key: e.key,
      summary: e.summary,
      causeCode: e.causeCode,
      shift: e.shift,
      start: e.start,
      end: e.end,
      open: e.open,
      hours: round1(fullDurationHours(e, asOf)),
    }));
}

const STOP = new Set(['the', 'a', 'an', 'on', 'in', 'at', 'of', 'to', 'and', 'or', 'for', 'with', 'down', 'unit']);
export function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t)),
  );
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

// Similar past events for an issue: same cause on the same class of
// equipment ranks highest; summary wording overlap breaks ties.
export function similarEvents(events, target, { limit = 5, asOf = Date.now() } = {}) {
  if (!target) return [];
  const tt = tokens(target.summary);
  return events
    .filter((e) => e.key !== target.key && e.unitId)
    .map((e) => {
      const sameCause = !!target.causeCode && e.causeCode === target.causeCode;
      const sameClass = !!target.equipmentClass && e.equipmentClass === target.equipmentClass;
      const sameUnit = !!target.unitId && e.unitId === target.unitId;
      const text = jaccard(tt, tokens(e.summary));
      const score = (sameCause ? 3 : 0) + (sameCause && sameClass ? 1 : 0) + (sameCause && sameUnit ? 1 : 0) + text * 2;
      return { e, score, sameCause, sameClass, sameUnit, text };
    })
    .filter((x) => x.sameCause || x.text >= 0.3)
    .sort((a, b) => b.score - a.score || (b.e.start ?? 0) - (a.e.start ?? 0))
    .slice(0, limit)
    .map(({ e, score, sameUnit }) => ({
      key: e.key,
      unitId: e.unitId,
      summary: e.summary,
      causeCode: e.causeCode,
      start: e.start,
      hours: round1(fullDurationHours(e, asOf)),
      sameUnit,
      score: Math.round(score * 100) / 100,
    }));
}

export function stripRaw(rows) {
  return rows.map(({ _raw, ...rest }) => rest);
}

export function buildDashboard(events, { days = 30, asOf = Date.now() } = {}) {
  const win = makeWindow({ days, asOf });
  const units = unitReliability(events, win);
  return {
    window: { days, from: win.from, to: win.to },
    fleet: fleetSummary(events, win, units),
    byClass: downtimeByClass(events, win),
    byCause: downtimeByCause(events, win),
    byClassAndCause: downtimeByClassAndCause(events, win),
    classReliability: classReliability(units),
    units: stripRaw(units),
    recurring: topRecurring(events, win),
    openByShift: openByShift(events),
    openEvents: events
      .filter((e) => e.open && e.unitId)
      .sort((a, b) => a.start - b.start)
      .map((e) => ({ key: e.key, unitId: e.unitId, causeCode: e.causeCode, shift: e.shift, start: e.start, hours: round1(fullDurationHours(e, asOf)), summary: e.summary })),
    causeCatalog: CAUSE_CODES,
  };
}
