import { generateSampleEvents, toIssueUpdate, crewAt, FLEET, causeCodesUsed } from '../scripts/sample-data.mjs';
import { CAUSE_CODES, classForUnit } from '../src/lib/constants.js';
import { normalizeIssue } from '../src/lib/normalize.js';
import { buildDashboard } from '../src/lib/metrics.js';
import { buildHandover } from '../src/lib/handover.js';

const AS_OF = Date.parse('2026-11-01T09:07:00Z');
const events = generateSampleEvents({ asOf: AS_OF });

// Turn generated events into what Jira search would return.
const asIssues = events.map((e, i) => {
  const u = toIssueUpdate(e, { projectKey: 'MINE', issueTypeId: '10001' });
  return {
    id: String(20000 + i),
    key: `MINE-${i + 1}`,
    fields: {
      summary: u.fields.summary,
      labels: u.fields.labels,
      status: { name: e.endedAt ? 'Done' : 'To Do', statusCategory: { key: e.endedAt ? 'done' : 'new' } },
      created: new Date(AS_OF).toISOString(),
      updated: new Date(AS_OF).toISOString(),
      resolutiondate: null,
    },
    properties: { haulboard_downtime: u.properties[0].value },
  };
});
const normalized = asIssues.map(normalizeIssue);

describe('fictional sample data', () => {
  test('is deterministic for the same seed and asOf', () => {
    expect(generateSampleEvents({ asOf: AS_OF })).toEqual(events);
    expect(generateSampleEvents({ asOf: AS_OF, seed: 7 })).not.toEqual(events);
  });

  test('creates 60 events with 8 open', () => {
    expect(events).toHaveLength(60);
    expect(events.filter((e) => !e.endedAt)).toHaveLength(8);
  });

  test('uses only known cause codes, classes and units', () => {
    for (const c of causeCodesUsed()) expect(CAUSE_CODES[c]).toBeDefined();
    const units = new Set(FLEET.map((u) => u.unitId));
    for (const e of events) {
      expect(units.has(e.unitId)).toBe(true);
      expect(classForUnit(e.unitId)).toBe(e.equipmentClass);
      expect(['A', 'B', 'C', 'D']).toContain(e.shift);
      expect(e.summary.startsWith(e.unitId)).toBe(true);
    }
  });

  test('no unit is down twice at the same time', () => {
    const byUnit = {};
    for (const e of events) (byUnit[e.unitId] = byUnit[e.unitId] || []).push(e);
    for (const list of Object.values(byUnit)) {
      const iv = list.map((e) => [Date.parse(e.startedAt), e.endedAt ? Date.parse(e.endedAt) : AS_OF]).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < iv.length; i++) expect(iv[i][0]).toBeGreaterThanOrEqual(iv[i - 1][1]);
    }
  });

  test('all events are in the past 45 days and end after they start', () => {
    for (const e of events) {
      const s = Date.parse(e.startedAt);
      expect(s).toBeLessThan(AS_OF);
      expect(s).toBeGreaterThan(AS_OF - 46 * 86400000);
      if (e.endedAt) expect(Date.parse(e.endedAt)).toBeGreaterThan(s);
    }
  });

  test('crew rotation cycles A-D every 12 h block', () => {
    const t = Date.parse('2026-10-01T06:00:00Z');
    const crews = [0, 1, 2, 3, 4].map((i) => crewAt(t + i * 12 * 3600000));
    expect(crews[4]).toBe(crews[0]);
    expect(new Set(crews.slice(0, 4)).size).toBe(4);
  });

  test('bulk-create payload carries labels, ADF description and the indexed property', () => {
    const u = toIssueUpdate(events[0], { projectKey: 'MINE', issueTypeId: '10001' });
    expect(u.fields.labels).toEqual(expect.arrayContaining(['downtime', 'hb-sample']));
    expect(u.fields.description.type).toBe('doc');
    expect(JSON.stringify(u.fields.description)).toContain('FICTIONAL SAMPLE DATA');
    expect(u.properties[0].key).toBe('haulboard_downtime');
    expect(u.properties[0].value.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test('round-trips through normalisation and surfaces the planted recurring failures', () => {
    expect(normalized.every((e) => e.source === 'property' && e.warnings.length === 0)).toBe(true);
    const d = buildDashboard(normalized, { days: 30, asOf: AS_OF });
    const pairs = d.recurring.filter((r) => r.count >= 3).map((r) => `${r.unitId}/${r.causeCode}`);
    expect(pairs).toEqual(expect.arrayContaining(['HT-104/HYD', 'EX-02/GET', 'DR-01/ELE']));
    expect(d.fleet.openEvents).toBe(8);
    expect(d.fleet.availabilityPct).toBeGreaterThan(50);
    expect(d.fleet.availabilityPct).toBeLessThan(100);
  });

  test('handover ranks the safety-noted excavator first', () => {
    const h = buildHandover(normalized, { asOf: AS_OF, hours: 12 });
    expect(h.open[0].unitId).toBe('EX-01');
    expect(h.safety.length).toBeGreaterThanOrEqual(2);
    expect(h.recurringAlerts.some((r) => r.unitId === 'HT-104')).toBe(true);
  });
});
