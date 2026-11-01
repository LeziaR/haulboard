import Resolver from '@forge/resolver';
import { dashboardFor, issueInsight, saveDetails, handoverFor } from '../lib/service.js';
import { listProjects } from '../lib/jira.js';
import { CAUSE_CODES, EQUIPMENT_CLASSES, SHIFTS } from '../lib/constants.js';

const resolver = new Resolver();

// Wraps handlers so the UI always gets { ok, data | error } instead of an
// opaque invocation failure.
const safe = (fn) => async (req) => {
  try {
    return { ok: true, data: await fn(req) };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e.message || String(e) };
  }
};

// Project and issue keys come from the trusted Forge context, not from the
// UI payload.
resolver.define(
  'getDashboard',
  safe(({ payload, context }) => dashboardFor(context.extension.project.key, { days: payload && payload.days })),
);

resolver.define('getIssueInsight', safe(({ context }) => issueInsight(context.extension.issue.key)));

resolver.define('saveDowntimeDetails', safe(({ payload, context }) => saveDetails(context.extension.issue.key, payload && payload.details)));

resolver.define('listProjects', safe(() => listProjects()));

resolver.define(
  'getHandover',
  safe(({ payload }) => handoverFor(payload.projectKey, { shift: payload.shift, hours: payload.hours })),
);

resolver.define('getCatalog', safe(() => ({ causes: CAUSE_CODES, classes: EQUIPMENT_CLASSES, shifts: SHIFTS })));

export const handler = resolver.getDefinitions();
