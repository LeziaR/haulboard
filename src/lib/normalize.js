// Turns raw Jira issues (from /rest/api/3/search/jql) into downtime events.
//
// Source of truth, in order:
//   1. Issue property `haulboard_downtime` (written by the issue panel,
//      the seed script, or any integration).
//   2. Label convention: hb-unit-HT-104, hb-cause-HYD, hb-shift-B.
//      Start falls back to `created`, end to `resolutiondate`.

import { PROPERTY_KEY, RECURRING_LABEL, classForUnit, causeCategory, EQUIPMENT_CLASSES, CAUSE_CODES, SHIFTS } from './constants.js';

export const SEARCH_FIELDS = ['summary', 'status', 'created', 'updated', 'resolutiondate', 'labels', 'priority', 'issuetype'];

function toMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function fromLabels(labels) {
  const out = {};
  for (const raw of labels || []) {
    const l = String(raw);
    let m = l.match(/^hb-unit-(.+)$/i);
    if (m) out.unitId = m[1].toUpperCase();
    m = l.match(/^hb-cause-([a-z]+)$/i);
    if (m) out.causeCode = m[1].toUpperCase();
    m = l.match(/^hb-shift-([a-d])$/i);
    if (m) out.shift = m[1].toUpperCase();
  }
  return out;
}

export function normalizeIssue(issue) {
  const f = issue.fields || {};
  const props = issue.properties || {};
  const prop = props[PROPERTY_KEY] && typeof props[PROPERTY_KEY] === 'object' ? props[PROPERTY_KEY] : null;
  const labels = f.labels || [];
  const lab = fromLabels(labels);
  const warnings = [];

  const source = prop && prop.unitId ? 'property' : lab.unitId ? 'labels' : 'none';
  const base = source === 'property' ? prop : lab;

  const unitId = base.unitId ? String(base.unitId).toUpperCase() : null;
  let equipmentClass = base.equipmentClass || classForUnit(unitId);
  if (equipmentClass && !EQUIPMENT_CLASSES[equipmentClass]) {
    warnings.push(`unknown equipment class "${equipmentClass}"`);
    equipmentClass = classForUnit(unitId);
  }
  let causeCode = base.causeCode ? String(base.causeCode).toUpperCase() : null;
  if (causeCode && !CAUSE_CODES[causeCode]) warnings.push(`unknown cause code "${causeCode}"`);
  let shift = base.shift ? String(base.shift).toUpperCase() : null;
  if (shift && !SHIFTS.includes(shift)) {
    warnings.push(`unknown shift "${shift}"`);
    shift = null;
  }

  const statusCategory = f.status && f.status.statusCategory ? f.status.statusCategory.key : 'new';
  const done = statusCategory === 'done';

  let start = toMs(source === 'property' ? prop.startedAt : null);
  if (start === null) start = toMs(f.created);

  let end = toMs(source === 'property' ? prop.endedAt : null);
  if (end === null && done) end = toMs(f.resolutiondate) ?? toMs(f.updated);
  if (end !== null && start !== null && end < start) {
    warnings.push('end is before start; end ignored');
    end = null;
  }

  return {
    key: issue.key,
    id: issue.id,
    summary: f.summary || '',
    statusCategory,
    statusName: f.status ? f.status.name : '',
    unitId,
    equipmentClass: equipmentClass || null,
    causeCode,
    causeCategory: causeCategory(causeCode),
    shift,
    start,
    end,
    open: end === null && !done,
    safetyNote: source === 'property' && prop.safetyNote ? String(prop.safetyNote) : '',
    recurringFlagged: labels.includes(RECURRING_LABEL),
    labels,
    source,
    warnings,
  };
}

export function normalizeIssues(issues) {
  return (issues || []).map(normalizeIssue);
}

// Validates and canonicalises details coming from the issue panel form or
// from any caller before they are written to the issue property.
export function validateDowntimeDetails(input) {
  const errors = [];
  const d = input || {};
  const unitId = String(d.unitId || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(unitId)) errors.push('Unit ID is required (letters, digits, - or _), e.g. HT-104.');
  const equipmentClass = d.equipmentClass || classForUnit(unitId);
  if (!EQUIPMENT_CLASSES[equipmentClass]) errors.push('Equipment class must be haul-truck, excavator, drill or dozer.');
  const causeCode = String(d.causeCode || '').toUpperCase();
  if (!CAUSE_CODES[causeCode]) errors.push(`Cause code must be one of ${Object.keys(CAUSE_CODES).join(', ')}.`);
  const shift = String(d.shift || '').toUpperCase();
  if (!SHIFTS.includes(shift)) errors.push('Shift must be A, B, C or D.');
  const startMs = parseUserDate(d.startedAt);
  if (startMs === null) errors.push('Start time is required (ISO 8601, e.g. 2026-10-03T08:15Z).');
  let endMs = null;
  if (d.endedAt !== undefined && d.endedAt !== null && String(d.endedAt).trim() !== '') {
    endMs = parseUserDate(d.endedAt);
    if (endMs === null) errors.push('End time is not a valid ISO 8601 date-time.');
    else if (startMs !== null && endMs < startMs) errors.push('End time is before start time.');
  }
  const safetyNote = String(d.safetyNote || '').trim().slice(0, 500);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      unitId,
      equipmentClass,
      causeCode,
      shift,
      startedAt: isoSeconds(startMs),
      endedAt: endMs === null ? null : isoSeconds(endMs),
      safetyNote,
    },
  };
}

// Accepts full ISO strings, or "YYYY-MM-DD HH:mm" / "YYYY-MM-DDTHH:mm"
// without an offset, which are read as UTC (stated in the UI).
export function parseUserDate(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?Z?$/i);
  const candidate = m ? `${m[1]}T${m[2]}${m[3] || ':00'}Z` : s;
  if (!/^\d{4}-\d{2}-\d{2}/.test(candidate)) return null;
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? ms : null;
}

// Jira entity-property date indexing expects YYYY-MM-DDThh:mm:ssZ.
export function isoSeconds(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
