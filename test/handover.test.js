import { fixtureIssues, AS_OF } from './fixtures/issues.js';
import { normalizeIssues } from '../src/lib/normalize.js';
import { buildHandover, priorityScore } from '../src/lib/handover.js';

const events = normalizeIssues(fixtureIssues);

describe('priorityScore', () => {
  const ex = events.find((e) => e.key === 'MINE-12');
  const ht = events.find((e) => e.key === 'MINE-5');

  test('excavator with safety note: 3 x (1 + 2/12) x 2 = 7', () => {
    expect(priorityScore(ex, { asOf: AS_OF })).toBe(7);
  });

  test('recurring haul truck: 1 x (1 + 4/12) x 1.5 = 2', () => {
    expect(priorityScore(ht, { asOf: AS_OF, recurring: true })).toBe(2);
  });
});

describe('buildHandover', () => {
  const h = buildHandover(events, { asOf: AS_OF, hours: 12, projectKey: 'MINE' });

  test('window is the last N hours', () => {
    expect(h.window.to).toBe(AS_OF);
    expect((h.window.to - h.window.from) / 3600000).toBe(12);
  });

  test('open downtime is ranked: loading unit with safety note first', () => {
    expect(h.open.map((o) => o.key)).toEqual(['MINE-12', 'MINE-5']);
    expect(h.open[1].recurring).toEqual({ count: 3, days: 30 });
    expect(h.open[0].recurring).toBeNull();
  });

  test('started / closed this shift', () => {
    expect(h.started.map((s) => s.key)).toEqual(['MINE-5', 'MINE-12']);
    expect(h.closed).toEqual([]);
    expect(h.totals).toMatchObject({ open: 2, startedThisShift: 2, closedThisShift: 0, safetyItems: 1, recurringAlerts: 1 });
    expect(h.totals.openByClass).toEqual({ excavator: 1, 'haul-truck': 1 });
  });

  test('safety notes and recurring alerts', () => {
    expect(h.safety).toEqual([{ key: 'MINE-12', unitId: 'EX-01', note: 'Isolation lock on main pump - do not start', open: true }]);
    expect(h.recurringAlerts[0]).toMatchObject({ unitId: 'HT-101', causeCode: 'HYD', count: 3 });
  });

  test('priorities list is numbered and carries flags', () => {
    expect(h.priorities[0]).toMatch(/^1\. EX-01 \(Excavator\) - Hydraulics - down 2 h - MINE-12; safety:/);
    expect(h.priorities[1]).toMatch(/^2\. HT-101 .*recurring: 3x in 30 d/);
  });

  test('crew filter limits started/closed to that crew, keeps all open items', () => {
    const b = buildHandover(events, { asOf: AS_OF, hours: 12, shift: 'b' });
    expect(b.crew).toBe('B');
    expect(b.started.map((s) => s.key)).toEqual(['MINE-5']);
    expect(b.open).toHaveLength(2);
  });

  test('closed this shift picks up events that ended in the window', () => {
    const later = buildHandover(events, { asOf: Date.parse('2026-10-24T13:00:00Z'), hours: 12 });
    expect(later.closed.map((c) => c.key)).toEqual(['MINE-8', 'MINE-7']);
  });

  test('plain-text handover contains every section in order', () => {
    const t = h.text;
    const order = ['SHIFT HANDOVER', 'SAFETY', 'PRIORITIES FOR INCOMING CREW', 'RECURRING FAILURES', 'OPEN DOWNTIME', 'STARTED THIS SHIFT', 'CLOSED THIS SHIFT'];
    let last = -1;
    for (const s of order) {
      const i = t.indexOf(s);
      expect(i).toBeGreaterThan(last);
      last = i;
    }
    expect(t).toContain('2026-10-31 12:00Z to 2026-11-01 00:00Z');
  });

  test('empty project produces a valid, explicit handover', () => {
    const e = buildHandover([], { asOf: AS_OF });
    expect(e.totals.open).toBe(0);
    expect(e.text).toContain('No open downtime.');
    expect(e.text).toContain('No safety notes recorded.');
  });
});
