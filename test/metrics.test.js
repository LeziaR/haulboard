import { fixtureIssues, AS_OF } from './fixtures/issues.js';
import { normalizeIssues } from '../src/lib/normalize.js';
import {
  makeWindow,
  overlapHours,
  unionHours,
  downtimeByClass,
  downtimeByCause,
  downtimeByClassAndCause,
  unitReliability,
  classReliability,
  fleetSummary,
  topRecurring,
  detectRecurring,
  openByShift,
  unitHistory,
  similarEvents,
  buildDashboard,
  tokens,
  jaccard,
} from '../src/lib/metrics.js';

const H = 3600 * 1000;
const events = normalizeIssues(fixtureIssues);
const win = makeWindow({ days: 10, asOf: AS_OF });
const unit = (rows, id) => rows.find((r) => r.unitId === id);

describe('window and interval helpers', () => {
  test('makeWindow spans N days ending at asOf', () => {
    expect(win.to).toBe(AS_OF);
    expect((win.to - win.from) / H).toBe(240);
  });

  test('overlapHours clips to window and treats open events as running to asOf', () => {
    const f = events.find((e) => e.key === 'MINE-6');
    expect(overlapHours(f, win)).toBe(2);
    const e = events.find((x) => x.key === 'MINE-5');
    expect(overlapHours(e, win)).toBe(4);
  });

  test('unionHours does not double count overlapping intervals', () => {
    const t0 = win.from;
    expect(unionHours([[t0, t0 + 12 * H], [t0 + 6 * H, t0 + 8 * H]], win)).toBe(12);
    expect(unionHours([[t0, t0 + 2 * H], [t0 + 2 * H, t0 + 3 * H]], win)).toBe(3);
    expect(unionHours([[t0 - 5 * H, t0 + 1 * H]], win)).toBe(1);
    expect(unionHours([], win)).toBe(0);
  });
});

describe('downtime breakdowns', () => {
  test('downtime hours by equipment class', () => {
    expect(downtimeByClass(events, win)).toEqual([
      { equipmentClass: 'haul-truck', hours: 26, events: 5 },
      { equipmentClass: 'excavator', hours: 18, events: 4 },
      { equipmentClass: 'drill', hours: 3, events: 1 },
    ]);
  });

  test('downtime hours by cause, sorted by hours', () => {
    const rows = downtimeByCause(events, win);
    expect(rows.map((r) => [r.causeCode, r.hours])).toEqual([
      ['HYD', 16],
      ['ENG', 12],
      ['PM', 10],
      ['ELE', 5],
      ['GET', 2],
      ['OPS', 2],
    ]);
    expect(rows.find((r) => r.causeCode === 'OPS').category).toBe('operational');
  });

  test('class x cause matrix sums to class totals', () => {
    const m = downtimeByClassAndCause(events, win);
    const truck = m.filter((r) => r.equipmentClass === 'haul-truck').reduce((s, r) => s + r.hours, 0);
    expect(truck).toBe(26);
    expect(m.find((r) => r.equipmentClass === 'excavator' && r.causeCode === 'HYD').hours).toBe(2);
  });
});

describe('MTBF / MTTR / availability per unit', () => {
  const rows = unitReliability(events, win);

  test('HT-101: PM counts toward availability, OPS does not, open failure counts as failure', () => {
    const r = unit(rows, 'HT-101');
    expect(r.failures).toBe(3);
    expect(r.lossHours).toBe(24);
    expect(r.mtbfHours).toBe(72);
    expect(r.mttrHours).toBe(5);
    expect(r.availabilityPct).toBe(90);
    expect(r.downtimeHours).toBe(26);
    expect(r.openEvents).toBe(1);
  });

  test('EX-01: overlap is unioned and an event starting before the window is not a failure', () => {
    const r = unit(rows, 'EX-01');
    expect(r.failures).toBe(3);
    expect(r.lossHours).toBe(16);
    expect(r.mtbfHours).toBe(74.7);
    expect(r.mttrHours).toBe(7);
    expect(r.availabilityPct).toBe(93.3);
    expect(r.downtimeHours).toBe(18);
  });

  test('DR-01 from label convention', () => {
    const r = unit(rows, 'DR-01');
    expect(r.equipmentClass).toBe('drill');
    expect(r.failures).toBe(1);
    expect(r.mtbfHours).toBe(237);
    expect(r.mttrHours).toBe(3);
    expect(r.availabilityPct).toBeCloseTo(98.8, 1);
  });

  test('DZ-01 with no events in window: 100 % availability, MTBF/MTTR null', () => {
    const r = unit(rows, 'DZ-01');
    expect(r.failures).toBe(0);
    expect(r.availabilityPct).toBe(100);
    expect(r.mtbfHours).toBeNull();
    expect(r.mttrHours).toBeNull();
  });

  test('rows are sorted worst availability first and unclassified issues are excluded', () => {
    expect(rows.map((r) => r.unitId)).toEqual(['HT-101', 'EX-01', 'DR-01', 'DZ-01']);
  });

  test('class reliability aggregates units', () => {
    const cls = classReliability(rows);
    expect(cls.map((c) => c.equipmentClass)).toEqual(['haul-truck', 'excavator', 'drill', 'dozer']);
    const ex = cls.find((c) => c.equipmentClass === 'excavator');
    expect(ex.units).toBe(1);
    expect(ex.mtbfHours).toBe(74.7);
  });

  test('fleet summary', () => {
    const f = fleetSummary(events, win, rows);
    expect(f.units).toBe(4);
    expect(f.failures).toBe(7);
    expect(f.mtbfHours).toBe(131);
    expect(f.mttrHours).toBe(5.4);
    expect(f.availabilityPct).toBe(95.5);
    expect(f.downtimeHours).toBe(47);
    expect(f.eventsInWindow).toBe(10);
    expect(f.openEvents).toBe(2);
    expect(f.unclassifiedIssues).toBe(1);
  });
});

describe('recurring failures', () => {
  test('topRecurring finds HT-101 hydraulics 3x', () => {
    const rec = topRecurring(events, win);
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ unitId: 'HT-101', causeCode: 'HYD', count: 3, hours: 14 });
    expect(rec[0].keys).toEqual(['MINE-5', 'MINE-2', 'MINE-1']);
  });

  test('topRecurring respects minCount', () => {
    expect(topRecurring(events, win, { minCount: 4 })).toHaveLength(0);
  });

  test('detectRecurring with explicit cause', () => {
    const r = detectRecurring(events, 'ht-101', { causeCode: 'HYD', threshold: 3, days: 30, asOf: AS_OF });
    expect(r.isRecurring).toBe(true);
    expect(r.count).toBe(3);
    expect(r.latestKey).toBe('MINE-5');
  });

  test('detectRecurring picks the most frequent cause when none is given', () => {
    const r = detectRecurring(events, 'HT-101', { asOf: AS_OF });
    expect(r.causeCode).toBe('HYD');
    const ex = detectRecurring(events, 'EX-01', { asOf: AS_OF });
    expect(ex.isRecurring).toBe(false);
    expect(ex.count).toBe(1);
  });

  test('detectRecurring below threshold and for unknown unit', () => {
    expect(detectRecurring(events, 'HT-101', { causeCode: 'HYD', threshold: 4, asOf: AS_OF }).isRecurring).toBe(false);
    const none = detectRecurring(events, 'HT-999', { asOf: AS_OF });
    expect(none.causeCode).toBeNull();
    expect(none.isRecurring).toBe(false);
  });
});

describe('open items, history, similarity', () => {
  test('openByShift counts open classified events per crew', () => {
    expect(openByShift(events)).toEqual([
      { shift: 'A', open: 0 },
      { shift: 'B', open: 1 },
      { shift: 'C', open: 1 },
      { shift: 'D', open: 0 },
      { shift: 'Unassigned', open: 0 },
    ]);
  });

  test('unitHistory is newest first with durations', () => {
    const h = unitHistory(events, 'HT-101', { asOf: AS_OF });
    expect(h.map((x) => x.key)).toEqual(['MINE-5', 'MINE-4', 'MINE-3', 'MINE-2', 'MINE-1']);
    expect(h[0]).toMatchObject({ open: true, hours: 4 });
  });

  test('similarEvents ranks same unit + same cause first, then same cause on other units', () => {
    const target = events.find((e) => e.key === 'MINE-1');
    const sim = similarEvents(events, target, { asOf: AS_OF });
    expect(sim.map((s) => s.key)).toEqual(['MINE-2', 'MINE-5', 'MINE-12']);
    expect(sim[0].sameUnit).toBe(true);
    expect(sim.find((s) => s.key === 'MINE-12').sameUnit).toBe(false);
  });

  test('tokens and jaccard', () => {
    expect([...tokens('Hoist cylinder leak on HT-101')]).toEqual(['hoist', 'cylinder', 'leak']);
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });
});

describe('buildDashboard', () => {
  test('assembles every section', () => {
    const d = buildDashboard(events, { days: 10, asOf: AS_OF });
    expect(d.window.days).toBe(10);
    expect(d.fleet.availabilityPct).toBe(95.5);
    expect(d.units[0]).not.toHaveProperty('_raw');
    expect(d.openEvents.map((o) => o.key)).toEqual(['MINE-5', 'MINE-12']);
    expect(d.recurring[0].unitId).toBe('HT-101');
  });

  test('handles an empty project', () => {
    const d = buildDashboard([], { days: 30, asOf: AS_OF });
    expect(d.fleet.units).toBe(0);
    expect(d.fleet.mtbfHours).toBeNull();
    expect(d.fleet.availabilityPct).toBeNull();
    expect(d.byClass).toEqual([]);
  });
});
