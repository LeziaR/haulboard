// Rovo action handlers. Each returns a JSON string so any agent (ours or a
// third-party agent that reuses these actions) gets structured data plus a
// short plain-language `summary`.

import { unitReport, handoverFor, dashboardFor, flagRecurring } from '../lib/service.js';
import { fmtHours, fmtPct, classLabel, causeLabel } from '../lib/format.js';

const TIME_KEYS = new Set(['start', 'end', 'from', 'to', 'lastStart', 'lastEventStart']);

export function isoTimes(value) {
  if (Array.isArray(value)) return value.map(isoTimes);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = TIME_KEYS.has(k) && typeof v === 'number' ? new Date(v).toISOString() : isoTimes(v);
    }
    return out;
  }
  return value;
}

export function resolveProjectKey(payload) {
  const explicit = payload && payload.projectKey ? String(payload.projectKey).trim() : '';
  if (explicit) return explicit.toUpperCase();
  const ctx = (payload && payload.context) || {};
  if (ctx.jira && ctx.jira.projectKey) return ctx.jira.projectKey;
  if (ctx.jira && ctx.jira.issueKey) return String(ctx.jira.issueKey).split('-')[0];
  return null;
}

const respond = (obj) => JSON.stringify(isoTimes(obj));
const needProject = () =>
  respond({ error: 'NO_PROJECT', summary: 'I need the Jira project key that holds the downtime issues (for example MINE). Ask the user for it.' });

async function run(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    return respond({ error: 'FAILED', summary: `The request failed: ${e.message}` });
  }
}

export const getUnitHistory = (payload) =>
  run(async () => {
    const pk = resolveProjectKey(payload);
    if (!pk) return needProject();
    const r = await unitReport(pk, payload.unitId, { days: payload.days });
    if (!r.found) return respond({ ...r, summary: `No downtime issues found for unit ${r.unitId} in project ${pk}.` });
    const rel = r.reliability;
    const summary =
      `${r.unitId} (${classLabel(rel.equipmentClass)}), last ${r.days} d: ${rel.failures} failure(s), ` +
      `${fmtHours(rel.downtimeHours)} downtime, MTBF ${fmtHours(rel.mtbfHours)}, MTTR ${fmtHours(rel.mttrHours)}, ` +
      `availability ${fmtPct(rel.availabilityPct)}, ${rel.openEvents} open.` +
      (r.recurring.isRecurring ? ` Recurring ${causeLabel(r.recurring.causeCode)}: ${r.recurring.count}x in ${r.recurring.days} d.` : '');
    return respond({ ...r, summary });
  });

export const summarizeShift = (payload) =>
  run(async () => {
    const pk = resolveProjectKey(payload);
    if (!pk) return needProject();
    const h = await handoverFor(pk, { shift: payload.shift, hours: payload.hours });
    return respond({ summary: h.text.split('\n').slice(0, 3).join(' '), handoverText: h.text, ...h, text: undefined });
  });

export const getFleetReliability = (payload) =>
  run(async () => {
    const pk = resolveProjectKey(payload);
    if (!pk) return needProject();
    const d = await dashboardFor(pk, { days: payload.days });
    const f = d.fleet;
    const summary =
      `Project ${pk}, last ${d.window.days} d: ${f.eventsInWindow} downtime events, ${fmtHours(f.downtimeHours)} downtime, ` +
      `${f.failures} failures, fleet MTBF ${fmtHours(f.mtbfHours)}, MTTR ${fmtHours(f.mttrHours)}, availability ${fmtPct(f.availabilityPct)}, ${f.openEvents} open.`;
    const { causeCatalog, units, ...rest } = d;
    // Keep the payload small: worst 10 units by availability.
    return respond({ summary, ...rest, worstUnits: units.slice(0, 10) });
  });

export const flagRecurringFailure = (payload) =>
  run(async () => {
    const pk = resolveProjectKey(payload);
    if (!pk) return needProject();
    if (!payload.unitId) return respond({ error: 'NO_UNIT', summary: 'unitId is required, for example HT-104.' });
    const r = await flagRecurring(pk, payload.unitId, {
      causeCode: payload.causeCode,
      threshold: payload.threshold,
      days: payload.days,
    });
    const summary = r.flagged
      ? `Flagged ${r.unitId} ${causeLabel(r.causeCode)}: ${r.count}x in ${r.days} d. Labelled ${r.labelled.length} issue(s)` +
        (r.commentedOn ? `, commented on ${r.commentedOn}.` : '.') +
        (r.errors.length ? ` Errors: ${r.errors.join('; ')}` : '')
      : r.message;
    return respond({ ...r, summary });
  });
