import { fixtureIssues, AS_OF } from './fixtures/issues.js';
import { mockRequester } from './fixtures/mockJira.js';

jest.mock('@forge/api', () => {
  const actual = jest.requireActual('@forge/api');
  return { __esModule: true, ...actual, route: actual.route, default: { ...actual.default, asUser: () => global.__mockRequester } };
});

const { handler } = require('../src/resolvers/index.js');
const call = (functionKey, payload, extension) => handler({ call: { functionKey, payload }, context: { extension } });

beforeEach(() => {
  global.__mockRequester = mockRequester(fixtureIssues);
  jest.useFakeTimers({ now: AS_OF, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  console.error.mockRestore();
});

describe('UI resolver', () => {
  test('getDashboard uses the project key from the Forge context', async () => {
    const r = await call('getDashboard', { days: 10 }, { project: { key: 'MINE' } });
    expect(r.ok).toBe(true);
    expect(r.data.projectKey).toBe('MINE');
    expect(r.data.fleet.availabilityPct).toBe(95.5);
  });

  test('getIssueInsight uses the issue key from the Forge context', async () => {
    const r = await call('getIssueInsight', {}, { issue: { key: 'MINE-1' } });
    expect(r.ok).toBe(true);
    expect(r.data.target.unitId).toBe('HT-101');
  });

  test('saveDowntimeDetails returns validation errors as data', async () => {
    const r = await call('saveDowntimeDetails', { details: { unitId: '' } }, { issue: { key: 'MINE-11' } });
    expect(r.ok).toBe(true);
    expect(r.data.ok).toBe(false);
  });

  test('getHandover validates the project key from the payload', async () => {
    const bad = await call('getHandover', { projectKey: 'x" OR 1=1' }, {});
    expect(bad).toEqual({ ok: false, error: expect.stringMatching(/Invalid project key/) });
    const good = await call('getHandover', { projectKey: 'MINE', shift: 'A', hours: 12 }, {});
    expect(good.ok).toBe(true);
    expect(good.data.crew).toBe('A');
  });

  test('listProjects and getCatalog', async () => {
    expect((await call('listProjects', {}, {})).data).toEqual([{ key: 'MINE', name: 'Example Pit North' }]);
    expect(Object.keys((await call('getCatalog', {}, {})).data.causes)).toContain('HYD');
  });
});
