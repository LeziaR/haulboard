// Application services shared by UI resolvers and Rovo actions.

import { fetchDowntimeEvents, getIssue, setDowntimeProperty, addLabels, addComment, assertProjectKey } from './jira.js';
import { normalizeIssue, validateDowntimeDetails } from './normalize.js';
import {
  buildDashboard,
  makeWindow,
  unitReliability,
  stripRaw,
  unitHistory,
  similarEvents,
  detectRecurring,
} from './metrics.js';
import { buildHandover } from './handover.js';
import { DOWNTIME_LABEL, RECURRING_LABEL, causeLabel } from './constants.js';

const clampInt = (v, lo, hi, dflt) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export async function dashboardFor(projectKey, { days, asOf = Date.now(), requester } = {}) {
  const d = clampInt(days, 1, 365, 30);
  const { events, truncated } = await fetchDowntimeEvents(assertProjectKey(projectKey), { requester });
  return { projectKey, truncated, ...buildDashboard(events, { days: d, asOf }) };
}

export async function unitReport(projectKey, unitId, { days, asOf = Date.now(), requester } = {}) {
  const d = clampInt(days, 1, 365, 90);
  const uid = String(unitId || '').trim().toUpperCase();
  if (!uid) throw new Error('unitId is required.');
  const { events, truncated } = await fetchDowntimeEvents(assertProjectKey(projectKey), { requester });
  const win = makeWindow({ days: d, asOf });
  const unitEvents = events.filter((e) => e.unitId === uid);
  const reliability = stripRaw(unitReliability(unitEvents, win))[0] || null;
  const history = unitHistory(events, uid, { asOf, limit: 20 });
  const recurring = detectRecurring(events, uid, { asOf });
  return { projectKey, unitId: uid, days: d, found: unitEvents.length > 0, truncated, reliability, recurring, history };
}

export async function issueInsight(issueKey, { asOf = Date.now(), requester } = {}) {
  const raw = await getIssue(issueKey, { requester });
  const target = normalizeIssue(raw);
  const projectKey = raw.key.split('-')[0];
  const base = { issueKey: raw.key, projectKey, target, hasDetails: target.source !== 'none' };
  if (!target.unitId) return { ...base, reliability: null, history: [], similar: [], recurring: null };
  const { events, truncated } = await fetchDowntimeEvents(projectKey, { requester });
  // The issue itself may not be labelled yet; make sure it is in the set.
  const all = events.some((e) => e.key === target.key) ? events : [...events, target];
  const win = makeWindow({ days: 90, asOf });
  const reliability = stripRaw(unitReliability(all.filter((e) => e.unitId === target.unitId), win))[0] || null;
  return {
    ...base,
    truncated,
    reliability,
    history: unitHistory(all, target.unitId, { asOf, limit: 10 }).filter((h) => h.key !== target.key),
    similar: similarEvents(all, target, { asOf, limit: 5 }),
    recurring: target.causeCategory === 'unplanned' ? detectRecurring(all, target.unitId, { causeCode: target.causeCode, asOf }) : null,
  };
}

export async function saveDetails(issueKey, details, { requester } = {}) {
  const v = validateDowntimeDetails(details);
  if (!v.ok) return { ok: false, errors: v.errors };
  await setDowntimeProperty(issueKey, v.value, { requester });
  let labelWarning = null;
  try {
    await addLabels(issueKey, [DOWNTIME_LABEL], { requester });
  } catch (e) {
    labelWarning = `Details saved, but the "${DOWNTIME_LABEL}" label could not be added (${e.message}). Add it manually so the dashboard includes this issue.`;
  }
  return { ok: true, value: v.value, labelWarning };
}

export async function handoverFor(projectKey, { shift, hours, asOf = Date.now(), requester } = {}) {
  const h = clampInt(hours, 1, 48, 12);
  const pk = assertProjectKey(projectKey);
  const { events, truncated } = await fetchDowntimeEvents(pk, { requester });
  return { truncated, ...buildHandover(events, { asOf, hours: h, shift, projectKey: pk }) };
}

export async function flagRecurring(projectKey, unitId, { causeCode, threshold, days, asOf = Date.now(), requester } = {}) {
  const pk = assertProjectKey(projectKey);
  const t = clampInt(threshold, 2, 50, 3);
  const d = clampInt(days, 1, 365, 30);
  const { events } = await fetchDowntimeEvents(pk, { requester });
  const r = detectRecurring(events, unitId, { causeCode, threshold: t, days: d, asOf });
  if (!r.isRecurring) {
    return { flagged: false, ...r, message: `${r.unitId}: ${r.count} ${r.causeCode ? causeLabel(r.causeCode) : 'unplanned'} event(s) in ${d} days, below the threshold of ${t}. Nothing was changed.` };
  }
  const already = new Set(events.filter((e) => e.recurringFlagged).map((e) => e.key));
  const toLabel = r.keys.filter((k) => !already.has(k));
  const errors = [];
  for (const k of toLabel) {
    try {
      await addLabels(k, [RECURRING_LABEL], { requester });
    } catch (e) {
      errors.push(`${k}: ${e.message}`);
    }
  }
  const comment = [
    `Haulboard recurring-failure flag: ${r.unitId} has ${r.count} ${causeLabel(r.causeCode)} (${r.causeCode}) failures in the last ${d} days (threshold ${t}).`,
    `Related issues: ${r.keys.join(', ')}.`,
    'Suggested next step: root-cause review before the unit is released again.',
  ].join('\n');
  let commented = false;
  try {
    await addComment(r.latestKey, comment, { requester });
    commented = true;
  } catch (e) {
    errors.push(`comment on ${r.latestKey}: ${e.message}`);
  }
  return { flagged: true, ...r, labelled: toLabel, commentedOn: commented ? r.latestKey : null, errors };
}
