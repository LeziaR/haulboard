// Thin Jira REST layer. Everything runs through Forge's requestJira, so
// there are no external servers and Jira permissions of the calling user
// apply (asUser).

import api, { route } from '@forge/api';
import { PROPERTY_KEY, DOWNTIME_LABEL } from './constants.js';
import { SEARCH_FIELDS, normalizeIssues } from './normalize.js';

export const MAX_ISSUES = 1000;
const PAGE_SIZE = 100;

export function assertProjectKey(key) {
  const k = String(key || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,254}$/.test(k)) throw new Error(`Invalid project key "${key}".`);
  return k;
}

export function assertIssueKey(key) {
  const k = String(key || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(k)) throw new Error(`Invalid issue key "${key}".`);
  return k;
}

export function downtimeJql(projectKey) {
  return `project = "${assertProjectKey(projectKey)}" AND labels = "${DOWNTIME_LABEL}" ORDER BY created DESC`;
}

async function ok(res, what) {
  if (res.ok) return res.status === 204 ? null : res.json();
  let detail = '';
  try {
    detail = JSON.stringify(await res.json());
  } catch (e) {
    detail = res.statusText || '';
  }
  throw new Error(`${what} failed (${res.status}): ${detail}`.slice(0, 600));
}

// Fetches up to MAX_ISSUES downtime issues for a project, newest first.
export async function fetchDowntimeIssues(projectKey, { requester = api.asUser(), maxIssues = MAX_ISSUES } = {}) {
  const issues = [];
  let nextPageToken;
  do {
    const body = {
      jql: downtimeJql(projectKey),
      fields: SEARCH_FIELDS,
      properties: [PROPERTY_KEY],
      maxResults: Math.min(PAGE_SIZE, maxIssues - issues.length),
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await requester.requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await ok(res, 'Issue search');
    issues.push(...(data.issues || []));
    nextPageToken = data.isLast === true ? undefined : data.nextPageToken || undefined;
  } while (nextPageToken && issues.length < maxIssues);
  return { issues, truncated: !!nextPageToken };
}

export async function fetchDowntimeEvents(projectKey, opts) {
  const { issues, truncated } = await fetchDowntimeIssues(projectKey, opts);
  return { events: normalizeIssues(issues), truncated };
}

export async function getIssue(issueKey, { requester = api.asUser() } = {}) {
  const key = assertIssueKey(issueKey);
  const res = await requester.requestJira(
    route`/rest/api/3/issue/${key}?fields=${SEARCH_FIELDS.join(',')}&properties=${PROPERTY_KEY}`,
    { headers: { Accept: 'application/json' } },
  );
  return ok(res, 'Get issue');
}

export async function setDowntimeProperty(issueKey, value, { requester = api.asUser() } = {}) {
  const key = assertIssueKey(issueKey);
  const res = await requester.requestJira(route`/rest/api/3/issue/${key}/properties/${PROPERTY_KEY}`, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  return ok(res, 'Save downtime details');
}

export async function addLabels(issueKey, labels, { requester = api.asUser() } = {}) {
  const key = assertIssueKey(issueKey);
  const res = await requester.requestJira(route`/rest/api/3/issue/${key}`, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ update: { labels: labels.map((l) => ({ add: l })) } }),
  });
  return ok(res, `Add labels to ${key}`);
}

export function adfParagraphs(text) {
  return {
    type: 'doc',
    version: 1,
    content: String(text)
      .split('\n')
      .map((t) => (t ? { type: 'paragraph', content: [{ type: 'text', text: t }] } : { type: 'paragraph', content: [] })),
  };
}

export async function addComment(issueKey, text, { requester = api.asUser() } = {}) {
  const key = assertIssueKey(issueKey);
  const res = await requester.requestJira(route`/rest/api/3/issue/${key}/comment`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: adfParagraphs(text) }),
  });
  return ok(res, `Comment on ${key}`);
}

export async function listProjects({ requester = api.asUser() } = {}) {
  const res = await requester.requestJira(route`/rest/api/3/project/search?maxResults=100&orderBy=name`, {
    headers: { Accept: 'application/json' },
  });
  const data = await ok(res, 'List projects');
  return (data.values || []).map((p) => ({ key: p.key, name: p.name }));
}
