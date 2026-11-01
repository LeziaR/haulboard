import { fixtureIssues, AS_OF } from './fixtures/issues.js';
import { mockRequester } from './fixtures/mockJira.js';
import { fetchDowntimeIssues, downtimeJql, assertProjectKey, assertIssueKey, adfParagraphs, listProjects } from '../src/lib/jira.js';
import { dashboardFor, unitReport, issueInsight, saveDetails, handoverFor, flagRecurring } from '../src/lib/service.js';

describe('jira layer', () => {
  test('paginates the enhanced JQL search with nextPageToken', async () => {
    const rq = mockRequester(fixtureIssues, { pageSize: 5 });
    const { issues, truncated } = await fetchDowntimeIssues('MINE', { requester: rq });
    expect(issues).toHaveLength(fixtureIssues.length);
    expect(truncated).toBe(false);
    const searches = rq.calls.filter((c) => c.path === '/rest/api/3/search/jql');
    expect(searches).toHaveLength(3);
    expect(searches[0].body.properties).toEqual(['haulboard_downtime']);
    expect(searches[0].body.jql).toBe('project = "MINE" AND labels = "downtime" ORDER BY created DESC');
    expect(searches[1].body.nextPageToken).toBe('5');
  });

  test('stops at maxIssues and reports truncation', async () => {
    const rq = mockRequester(fixtureIssues, { pageSize: 5 });
    const { issues, truncated } = await fetchDowntimeIssues('MINE', { requester: rq, maxIssues: 5 });
    expect(issues).toHaveLength(5);
    expect(truncated).toBe(true);
  });

  test('rejects keys that could inject JQL', () => {
    expect(() => downtimeJql('MINE" OR project = "X')).toThrow(/Invalid project key/);
    expect(() => assertIssueKey('MINE-1; DROP')).toThrow(/Invalid issue key/);
    expect(assertProjectKey(' mine ')).toBe('MINE');
  });

  test('surfaces Jira errors with status code', async () => {
    const rq = mockRequester(fixtureIssues, { failOn: (m, p) => p.includes('search') });
    await expect(fetchDowntimeIssues('MINE', { requester: rq })).rejects.toThrow(/Issue search failed \(400\)/);
  });

  test('adfParagraphs builds a valid ADF doc', () => {
    const d = adfParagraphs('a\n\nb');
    expect(d.type).toBe('doc');
    expect(d.content).toHaveLength(3);
    expect(d.content[0].content[0]).toEqual({ type: 'text', text: 'a' });
  });

  test('listProjects maps key and name', async () => {
    expect(await listProjects({ requester: mockRequester([]) })).toEqual([{ key: 'MINE', name: 'Example Pit North' }]);
  });
});

describe('service layer', () => {
  test('dashboardFor clamps days and computes metrics', async () => {
    const d = await dashboardFor('MINE', { days: 10, asOf: AS_OF, requester: mockRequester(fixtureIssues) });
    expect(d.fleet.availabilityPct).toBe(95.5);
    const big = await dashboardFor('MINE', { days: 9999, asOf: AS_OF, requester: mockRequester(fixtureIssues) });
    expect(big.window.days).toBe(365);
  });

  test('unitReport for a known and an unknown unit', async () => {
    const r = await unitReport('MINE', 'ht-101', { days: 10, asOf: AS_OF, requester: mockRequester(fixtureIssues) });
    expect(r.found).toBe(true);
    expect(r.reliability).toMatchObject({ unitId: 'HT-101', failures: 3, mtbfHours: 72, mttrHours: 5 });
    expect(r.recurring.isRecurring).toBe(true);
    const none = await unitReport('MINE', 'HT-999', { asOf: AS_OF, requester: mockRequester(fixtureIssues) });
    expect(none.found).toBe(false);
  });

  test('issueInsight returns history excluding the issue itself, plus similar events', async () => {
    const r = await issueInsight('MINE-2', { asOf: AS_OF, requester: mockRequester(fixtureIssues) });
    expect(r.hasDetails).toBe(true);
    expect(r.history.map((h) => h.key)).not.toContain('MINE-2');
    expect(r.similar[0].key).toBe('MINE-1');
    expect(r.recurring.isRecurring).toBe(true);
  });

  test('issueInsight on an issue without details does not search', async () => {
    const rq = mockRequester(fixtureIssues);
    const r = await issueInsight('MINE-11', { asOf: AS_OF, requester: rq });
    expect(r.hasDetails).toBe(false);
    expect(rq.calls.some((c) => c.path.includes('search'))).toBe(false);
  });

  test('saveDetails validates, writes the property and adds the downtime label', async () => {
    const rq = mockRequester(fixtureIssues);
    const bad = await saveDetails('MINE-11', { unitId: '' }, { requester: rq });
    expect(bad.ok).toBe(false);
    expect(rq.calls).toHaveLength(0);
    const good = await saveDetails('MINE-11', { unitId: 'DZ-02', causeCode: 'TYR', shift: 'D', startedAt: '2026-10-30T05:00Z' }, { requester: rq });
    expect(good.ok).toBe(true);
    expect(rq.calls[0]).toMatchObject({ method: 'PUT', path: '/rest/api/3/issue/MINE-11/properties/haulboard_downtime' });
    expect(rq.calls[0].body.equipmentClass).toBe('dozer');
    expect(rq.calls[1].body).toEqual({ update: { labels: [{ add: 'downtime' }] } });
  });

  test('saveDetails reports a label failure without losing the saved details', async () => {
    const rq = mockRequester(fixtureIssues, { failOn: (m, p) => m === 'PUT' && /issue\/MINE-11$/.test(p) });
    const r = await saveDetails('MINE-11', { unitId: 'DZ-02', causeCode: 'TYR', shift: 'D', startedAt: '2026-10-30T05:00Z' }, { requester: rq });
    expect(r.ok).toBe(true);
    expect(r.labelWarning).toMatch(/label could not be added/);
  });

  test('handoverFor clamps hours', async () => {
    const h = await handoverFor('MINE', { hours: 100, asOf: AS_OF, requester: mockRequester(fixtureIssues) });
    expect(h.window.hours).toBe(48);
    expect(h.open).toHaveLength(2);
  });

  test('flagRecurring labels matching issues and comments on the latest', async () => {
    const rq = mockRequester(fixtureIssues);
    const r = await flagRecurring('MINE', 'HT-101', { causeCode: 'HYD', asOf: AS_OF, requester: rq });
    expect(r.flagged).toBe(true);
    expect(r.labelled).toEqual(['MINE-5', 'MINE-2', 'MINE-1']);
    expect(r.commentedOn).toBe('MINE-5');
    const comment = rq.calls.find((c) => c.path.endsWith('/comment'));
    expect(JSON.stringify(comment.body)).toContain('3 Hydraulics (HYD) failures');
  });

  test('flagRecurring below threshold changes nothing', async () => {
    const rq = mockRequester(fixtureIssues);
    const r = await flagRecurring('MINE', 'EX-01', { asOf: AS_OF, requester: rq });
    expect(r.flagged).toBe(false);
    expect(rq.calls.filter((c) => c.method !== 'POST' || !c.path.includes('search'))).toHaveLength(0);
  });
});
