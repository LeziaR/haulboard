import { fixtureIssues } from './fixtures/issues.js';
import { normalizeIssue, normalizeIssues, validateDowntimeDetails, parseUserDate, isoSeconds } from '../src/lib/normalize.js';

const byKey = (k) => normalizeIssues(fixtureIssues).find((e) => e.key === k);

describe('normalizeIssue', () => {
  test('reads the haulboard_downtime property', () => {
    const e = byKey('MINE-1');
    expect(e).toMatchObject({
      unitId: 'HT-101',
      equipmentClass: 'haul-truck',
      causeCode: 'HYD',
      causeCategory: 'unplanned',
      shift: 'A',
      source: 'property',
      open: false,
    });
    expect(e.start).toBe(Date.parse('2026-10-23T00:00:00Z'));
    expect(e.end).toBe(Date.parse('2026-10-23T06:00:00Z'));
  });

  test('derives class from unit prefix when the property omits it', () => {
    expect(byKey('MINE-7').equipmentClass).toBe('excavator');
    expect(byKey('MINE-10').equipmentClass).toBe('dozer');
  });

  test('open event: no end and status not done', () => {
    const e = byKey('MINE-5');
    expect(e.open).toBe(true);
    expect(e.end).toBeNull();
  });

  test('falls back to hb-* labels with created/resolutiondate', () => {
    const e = byKey('MINE-9');
    expect(e).toMatchObject({ unitId: 'DR-01', equipmentClass: 'drill', causeCode: 'ELE', shift: 'C', source: 'labels', open: false });
    expect((e.end - e.start) / 3600000).toBe(3);
  });

  test('issue without details is unclassified', () => {
    const e = byKey('MINE-11');
    expect(e.unitId).toBeNull();
    expect(e.source).toBe('none');
  });

  test('carries the safety note', () => {
    expect(byKey('MINE-12').safetyNote).toMatch(/Isolation lock/);
  });

  test('flags bad data instead of crashing', () => {
    const e = normalizeIssue({
      key: 'MINE-99',
      fields: { summary: 'x', status: { statusCategory: { key: 'new' } }, labels: [], created: '2026-10-01T00:00:00Z' },
      properties: {
        haulboard_downtime: { unitId: 'ht-7', causeCode: 'zzz', shift: 'Q', startedAt: '2026-10-05T10:00:00Z', endedAt: '2026-10-05T09:00:00Z', equipmentClass: 'crane' },
      },
    });
    expect(e.unitId).toBe('HT-7');
    expect(e.equipmentClass).toBe('haul-truck');
    expect(e.shift).toBeNull();
    expect(e.end).toBeNull();
    expect(e.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/class/), expect.stringMatching(/cause/), expect.stringMatching(/shift/), expect.stringMatching(/end is before/)]),
    );
  });

  test('done issue with property but no endedAt uses resolutiondate', () => {
    const e = normalizeIssue({
      key: 'MINE-98',
      fields: { summary: 'x', status: { statusCategory: { key: 'done' } }, labels: [], created: '2026-10-01T00:00:00Z', resolutiondate: '2026-10-05T12:00:00Z' },
      properties: { haulboard_downtime: { unitId: 'EX-02', causeCode: 'GET', shift: 'A', startedAt: '2026-10-05T10:00:00Z', endedAt: null } },
    });
    expect(e.open).toBe(false);
    expect((e.end - e.start) / 3600000).toBe(2);
  });
});

describe('validateDowntimeDetails', () => {
  test('accepts and canonicalises valid input', () => {
    const v = validateDowntimeDetails({ unitId: ' ex-02 ', causeCode: 'hyd', shift: 'b', startedAt: '2026-10-03 08:15', endedAt: '' });
    expect(v.ok).toBe(true);
    expect(v.value).toEqual({
      schemaVersion: 1,
      unitId: 'EX-02',
      equipmentClass: 'excavator',
      causeCode: 'HYD',
      shift: 'B',
      startedAt: '2026-10-03T08:15:00Z',
      endedAt: null,
      safetyNote: '',
    });
  });

  test('rejects missing or inconsistent fields with readable errors', () => {
    const v = validateDowntimeDetails({ unitId: '', causeCode: 'XXX', shift: 'E', startedAt: 'yesterday', endedAt: 'soon' });
    expect(v.ok).toBe(false);
    expect(v.errors.length).toBeGreaterThanOrEqual(5);
  });

  test('rejects end before start', () => {
    const v = validateDowntimeDetails({ unitId: 'HT-1', causeCode: 'ENG', shift: 'A', startedAt: '2026-10-03T10:00Z', endedAt: '2026-10-03T09:00Z' });
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/before start/);
  });

  test('truncates long safety notes', () => {
    const v = validateDowntimeDetails({ unitId: 'HT-1', causeCode: 'ENG', shift: 'A', startedAt: '2026-10-03T10:00Z', safetyNote: 'x'.repeat(900) });
    expect(v.value.safetyNote).toHaveLength(500);
  });
});

describe('date helpers', () => {
  test('parseUserDate reads offset-less input as UTC and keeps explicit offsets', () => {
    expect(parseUserDate('2026-10-03 08:15')).toBe(Date.parse('2026-10-03T08:15:00Z'));
    expect(parseUserDate('2026-10-03T08:15Z')).toBe(Date.parse('2026-10-03T08:15:00Z'));
    expect(parseUserDate('2026-10-03T16:15:00+08:00')).toBe(Date.parse('2026-10-03T08:15:00Z'));
    expect(parseUserDate('03/10/2026')).toBeNull();
    expect(parseUserDate('')).toBeNull();
  });

  test('isoSeconds matches the entity-property date format', () => {
    expect(isoSeconds(Date.parse('2026-10-03T08:15:00.123Z'))).toBe('2026-10-03T08:15:00Z');
  });
});
