// Structured shift handover for the outgoing crew.
// Pure function of (events, options) so it is shared by the global page,
// the Rovo action and the tests.

import { HOUR_MS, EQUIPMENT_CLASSES, SHIFTS } from './constants.js';
import { fullDurationHours, detectRecurring } from './metrics.js';
import { fmtTime, fmtHours, classLabel, causeLabel } from './format.js';

const round1 = (n) => Math.round(n * 10) / 10;

// Higher = handle first. Loading units outrank trucks, long outages grow,
// safety notes and recurring failures are boosted.
export function priorityScore(e, { asOf, recurring = false }) {
  const crit = EQUIPMENT_CLASSES[e.equipmentClass] ? EQUIPMENT_CLASSES[e.equipmentClass].criticality : 1;
  const hoursOpen = fullDurationHours(e, asOf);
  let score = crit * (1 + hoursOpen / 12);
  if (recurring) score *= 1.5;
  if (e.safetyNote || e.causeCode === 'SAF') score *= 2;
  return Math.round(score * 100) / 100;
}

function line(e, asOf) {
  return {
    key: e.key,
    unitId: e.unitId,
    equipmentClass: e.equipmentClass,
    causeCode: e.causeCode,
    shift: e.shift,
    start: e.start,
    end: e.end,
    hours: round1(fullDurationHours(e, asOf)),
    summary: e.summary,
    safetyNote: e.safetyNote,
  };
}

export function buildHandover(events, { asOf = Date.now(), hours = 12, shift = null, projectKey = '' } = {}) {
  const crew = shift && SHIFTS.includes(String(shift).toUpperCase()) ? String(shift).toUpperCase() : null;
  const from = asOf - hours * HOUR_MS;
  const evs = events.filter((e) => e.unitId);
  const crewMatch = (e) => !crew || !e.shift || e.shift === crew;

  const recurringCache = new Map();
  const isRecurring = (e) => {
    if (e.causeCategory !== 'unplanned') return null;
    const k = `${e.unitId}|${e.causeCode}`;
    if (!recurringCache.has(k)) recurringCache.set(k, detectRecurring(events, e.unitId, { causeCode: e.causeCode, asOf }));
    const r = recurringCache.get(k);
    return r.isRecurring ? r : null;
  };

  const open = evs
    .filter((e) => e.open)
    .map((e) => {
      const rec = isRecurring(e);
      return { ...line(e, asOf), recurring: rec ? { count: rec.count, days: rec.days } : null, priority: priorityScore(e, { asOf, recurring: !!rec }) };
    })
    .sort((a, b) => b.priority - a.priority || a.start - b.start);

  const started = evs
    .filter((e) => e.start !== null && e.start >= from && e.start <= asOf && crewMatch(e))
    .sort((a, b) => a.start - b.start)
    .map((e) => line(e, asOf));

  const closed = evs
    .filter((e) => e.end !== null && e.end >= from && e.end <= asOf && crewMatch(e))
    .sort((a, b) => a.end - b.end)
    .map((e) => line(e, asOf));

  const safety = evs
    .filter((e) => (e.safetyNote || e.causeCode === 'SAF') && (e.open || (e.start !== null && e.start >= from) || (e.end !== null && e.end >= from)))
    .map((e) => ({ key: e.key, unitId: e.unitId, note: e.safetyNote || `Safety stop logged on ${e.unitId}`, open: e.open }));

  const recurringAlerts = [];
  const seen = new Set();
  for (const e of evs.filter((x) => x.open || (x.start !== null && x.start >= from))) {
    const rec = isRecurring(e);
    const k = `${e.unitId}|${e.causeCode}`;
    if (rec && !seen.has(k)) {
      seen.add(k);
      recurringAlerts.push({ unitId: e.unitId, causeCode: e.causeCode, count: rec.count, days: rec.days, keys: rec.keys });
    }
  }

  const priorities = open.slice(0, 5).map((o, i) => {
    const bits = [`${i + 1}. ${o.unitId} (${classLabel(o.equipmentClass)}) - ${causeLabel(o.causeCode)} - down ${fmtHours(o.hours)} - ${o.key}`];
    if (o.recurring) bits.push(`recurring: ${o.recurring.count}x in ${o.recurring.days} d`);
    if (o.safetyNote) bits.push(`safety: ${o.safetyNote}`);
    return bits.join('; ');
  });

  const openByClass = {};
  for (const o of open) openByClass[o.equipmentClass] = (openByClass[o.equipmentClass] || 0) + 1;

  const result = {
    projectKey,
    crew,
    window: { from, to: asOf, hours },
    totals: {
      open: open.length,
      startedThisShift: started.length,
      closedThisShift: closed.length,
      safetyItems: safety.length,
      recurringAlerts: recurringAlerts.length,
      openByClass,
    },
    open,
    started,
    closed,
    safety,
    recurringAlerts,
    priorities,
  };
  result.text = handoverText(result);
  return result;
}

export function handoverText(h) {
  const L = [];
  const crewTxt = h.crew ? `Crew ${h.crew}` : 'All crews';
  L.push(`SHIFT HANDOVER - ${crewTxt}${h.projectKey ? ` - ${h.projectKey}` : ''}`);
  L.push(`Window: ${fmtTime(h.window.from)} to ${fmtTime(h.window.to)} (${h.window.hours} h)`);
  const cls = Object.entries(h.totals.openByClass)
    .map(([c, n]) => `${n} ${classLabel(c).toLowerCase()}`)
    .join(', ');
  L.push(`Summary: ${h.totals.open} open downtime${cls ? ` (${cls})` : ''}; ${h.totals.startedThisShift} started and ${h.totals.closedThisShift} closed this shift.`);
  L.push('');
  L.push('SAFETY');
  if (!h.safety.length) L.push('- No safety notes recorded.');
  for (const s of h.safety) L.push(`- ${s.unitId} ${s.key}: ${s.note}${s.open ? ' (still open)' : ''}`);
  L.push('');
  L.push('PRIORITIES FOR INCOMING CREW');
  if (!h.priorities.length) L.push('- No open downtime.');
  for (const p of h.priorities) L.push(p);
  if (h.recurringAlerts.length) {
    L.push('');
    L.push('RECURRING FAILURES');
    for (const r of h.recurringAlerts) L.push(`- ${r.unitId} ${causeLabel(r.causeCode)}: ${r.count}x in ${r.days} d (${r.keys.join(', ')})`);
  }
  L.push('');
  L.push('OPEN DOWNTIME');
  if (!h.open.length) L.push('- None.');
  for (const o of h.open) L.push(`- ${o.key} ${o.unitId} ${o.causeCode || '?'} since ${fmtTime(o.start)} (${fmtHours(o.hours)}) crew ${o.shift || '?'}: ${o.summary}`);
  L.push('');
  L.push('STARTED THIS SHIFT');
  if (!h.started.length) L.push('- None.');
  for (const s of h.started) L.push(`- ${s.key} ${s.unitId} ${s.causeCode || '?'} at ${fmtTime(s.start)}${s.end ? `, closed ${fmtTime(s.end)}` : ', still open'}`);
  L.push('');
  L.push('CLOSED THIS SHIFT');
  if (!h.closed.length) L.push('- None.');
  for (const c of h.closed) L.push(`- ${c.key} ${c.unitId} ${c.causeCode || '?'} back in service ${fmtTime(c.end)} after ${fmtHours(c.hours)}`);
  return L.join('\n');
}
