import { fixtureIssues, AS_OF } from './fixtures/issues.js';
import { mockRequester } from './fixtures/mockJira.js';

// Route Forge's api.asUser() to the in-memory Jira mock.
jest.mock('@forge/api', () => {
  const actual = jest.requireActual('@forge/api');
  return {
    __esModule: true,
    ...actual,
    route: actual.route,
    default: { ...actual.default, asUser: () => global.__mockRequester },
  };
});

const { getUnitHistory, summarizeShift, getFleetReliability, flagRecurringFailure, resolveProjectKey, isoTimes } = require('../src/actions/index.js');

beforeEach(() => {
  global.__mockRequester = mockRequester(fixtureIssues);
  jest.useFakeTimers({ now: AS_OF, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
});
afterEach(() => jest.useRealTimers());

describe('helpers', () => {
  test('resolveProjectKey prefers explicit input, then Rovo context', () => {
    expect(resolveProjectKey({ projectKey: 'mine' })).toBe('MINE');
    expect(resolveProjectKey({ context: { jira: { projectKey: 'PIT' } } })).toBe('PIT');
    expect(resolveProjectKey({ context: { jira: { issueKey: 'QRY-12' } } })).toBe('QRY');
    expect(resolveProjectKey({})).toBeNull();
  });

  test('isoTimes converts epoch fields to ISO strings recursively', () => {
    expect(isoTimes({ start: 0, nested: [{ end: 3600000, hours: 1 }] })).toEqual({
      start: '1970-01-01T00:00:00.000Z',
      nested: [{ end: '1970-01-01T01:00:00.000Z', hours: 1 }],
    });
  });
});

describe('Rovo actions', () => {
  test('get-unit-history returns JSON with a plain summary', async () => {
    const out = JSON.parse(await getUnitHistory({ unitId: 'HT-101', projectKey: 'MINE', days: 10 }));
    expect(out.summary).toMatch(/^HT-101 \(Haul truck\), last 10 d: 3 failure\(s\)/);
    expect(out.summary).toMatch(/MTBF 72 h, MTTR 5 h, availability 90 %/);
    expect(out.summary).toMatch(/Recurring Hydraulics: 3x in 30 d/);
    expect(out.history[0].start).toBe('2026-10-31T20:00:00.000Z');
  });

  test('get-unit-history asks for the project when it cannot infer one', async () => {
    const out = JSON.parse(await getUnitHistory({ unitId: 'HT-101' }));
    expect(out.error).toBe('NO_PROJECT');
  });

  test('get-unit-history for unknown unit says so', async () => {
    const out = JSON.parse(await getUnitHistory({ unitId: 'HT-404', context: { jira: { projectKey: 'MINE' } } }));
    expect(out.found).toBe(false);
    expect(out.summary).toMatch(/No downtime issues found for unit HT-404/);
  });

  test('summarize-shift returns the handover text and ranked open items', async () => {
    const out = JSON.parse(await summarizeShift({ projectKey: 'MINE', shift: 'B', hours: 12 }));
    expect(out.handoverText).toContain('SHIFT HANDOVER - Crew B - MINE');
    expect(out.open.map((o) => o.key)).toEqual(['MINE-12', 'MINE-5']);
    expect(out).not.toHaveProperty('text');
  });

  test('get-fleet-reliability summarises the fleet and trims units', async () => {
    const out = JSON.parse(await getFleetReliability({ projectKey: 'MINE', days: 10 }));
    expect(out.summary).toMatch(/availability 95.5 %/);
    expect(out.worstUnits[0].unitId).toBe('HT-101');
    expect(out).not.toHaveProperty('causeCatalog');
  });

  test('flag-recurring-failure flags and reports', async () => {
    const out = JSON.parse(await flagRecurringFailure({ projectKey: 'MINE', unitId: 'HT-101' }));
    expect(out.flagged).toBe(true);
    expect(out.summary).toMatch(/Flagged HT-101 Hydraulics: 3x in 30 d\. Labelled 3 issue\(s\), commented on MINE-5\./);
  });

  test('flag-recurring-failure requires a unit', async () => {
    const out = JSON.parse(await flagRecurringFailure({ projectKey: 'MINE' }));
    expect(out.error).toBe('NO_UNIT');
  });

  test('errors become a readable FAILED response, not a thrown exception', async () => {
    global.__mockRequester = mockRequester(fixtureIssues, { failOn: () => true });
    const out = JSON.parse(await getFleetReliability({ projectKey: 'MINE' }));
    expect(out.error).toBe('FAILED');
    expect(out.summary).toMatch(/Issue search failed \(400\)/);
  });
});
