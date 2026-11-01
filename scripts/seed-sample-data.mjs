#!/usr/bin/env node
// Creates ~60 FICTIONAL equipment-downtime issues in a Jira Cloud project
// via the Jira REST API, so the Haulboard dashboard, panel, handover page
// and Rovo agent have data to work on.
//
// Requires Node 18+ (global fetch). Uses your own Atlassian API token;
// nothing is sent anywhere except your Jira site.
//
//   export JIRA_BASE_URL=https://your-site.atlassian.net
//   export JIRA_EMAIL=you@example.com
//   export JIRA_API_TOKEN=...            # https://id.atlassian.com/manage-profile/security/api-tokens
//   export JIRA_PROJECT_KEY=MINE
//   node scripts/seed-sample-data.mjs --dry-run      # print what would be created
//   node scripts/seed-sample-data.mjs                # create issues
//   node scripts/seed-sample-data.mjs --delete-sample --yes   # remove issues labelled hb-sample
//
// Options: --issue-type "Task" (default: "Downtime" if the project has it, else "Task"),
//          --count 60, --seed 20261222

import { generateSampleEvents, toIssueUpdate } from './sample-data.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const DRY = flag('dry-run');
const BASE = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
const EMAIL = process.env.JIRA_EMAIL || '';
const TOKEN = process.env.JIRA_API_TOKEN || '';
const PROJECT = (process.env.JIRA_PROJECT_KEY || opt('project', '')).toUpperCase();
const COUNT = parseInt(opt('count', '60'), 10);
const SEED = parseInt(opt('seed', '20261222'), 10);

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!PROJECT) die('Set JIRA_PROJECT_KEY (or pass --project KEY).');
if (!DRY && (!BASE || !EMAIL || !TOKEN)) die('Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN (or use --dry-run).');

const auth = 'Basic ' + Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64');

async function jira(method, path, body, attempt = 1) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt <= 5) {
    const wait = (parseInt(res.headers.get('retry-after') || '5', 10) || 5) * 1000;
    console.log(`  rate limited, waiting ${wait / 1000} s`);
    await new Promise((r) => setTimeout(r, wait));
    return jira(method, path, body, attempt + 1);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return data;
}

async function pickIssueType() {
  const wanted = opt('issue-type', null);
  const data = await jira('GET', `/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=100`);
  const types = (data.issueTypes || data.createMetaIssueType || data.values || []).filter((t) => !t.subtask);
  const find = (n) => types.find((t) => t.name.toLowerCase() === n.toLowerCase());
  const t = (wanted && find(wanted)) || find('Downtime') || find('Task') || types[0];
  if (!t) die(`No usable issue type in project ${PROJECT}.`);
  if (wanted && !find(wanted)) console.log(`Issue type "${wanted}" not found; using "${t.name}".`);
  return t;
}

async function closeIssue(key) {
  const { transitions } = await jira('GET', `/rest/api/3/issue/${key}/transitions`);
  const done = (transitions || []).find((t) => t.to && t.to.statusCategory && t.to.statusCategory.key === 'done');
  if (!done) return false;
  await jira('POST', `/rest/api/3/issue/${key}/transitions`, { transition: { id: done.id } });
  return true;
}

async function seed() {
  const events = generateSampleEvents({ asOf: Date.now(), seed: SEED, count: COUNT });
  const open = events.filter((e) => !e.endedAt).length;
  console.log(`Generated ${events.length} fictional downtime events (${open} open) for project ${PROJECT}.`);

  if (DRY) {
    const sample = toIssueUpdate(events[events.length - 1], { projectKey: PROJECT, issueTypeId: '<issue-type-id>' });
    console.log(JSON.stringify(sample, null, 2));
    for (const e of events) console.log(`${e.startedAt}  ${e.unitId.padEnd(6)} ${e.causeCode.padEnd(4)} crew ${e.shift}  ${e.endedAt ? 'closed' : 'OPEN  '}  ${e.summary}`);
    return;
  }

  await jira('GET', `/rest/api/3/project/${PROJECT}`);
  const type = await pickIssueType();
  console.log(`Using issue type "${type.name}" (${type.id}).`);

  const created = [];
  for (let i = 0; i < events.length; i += 50) {
    const batch = events.slice(i, i + 50);
    const res = await jira('POST', '/rest/api/3/issue/bulk', {
      issueUpdates: batch.map((e) => toIssueUpdate(e, { projectKey: PROJECT, issueTypeId: type.id })),
    });
    const failed = new Set((res.errors || []).map((err) => err.failedElementNumber));
    for (const err of res.errors || []) console.error(`  item ${err.failedElementNumber} failed: ${JSON.stringify(err.elementErrors)}`);
    // Created issues come back in request order, minus the failed elements.
    const ok = batch.filter((_, idx) => !failed.has(idx));
    (res.issues || []).forEach((iss, j) => ok[j] && created.push({ key: iss.key, event: ok[j] }));
    console.log(`  created ${created.length}/${events.length}`);
  }

  // Make sure the property is set even on sites that ignore `properties`
  // in bulk create, then close finished events.
  let closed = 0;
  let closeMissing = 0;
  for (const { key, event } of created) {
    const value = toIssueUpdate(event, { projectKey: PROJECT, issueTypeId: type.id }).properties[0].value;
    await jira('PUT', `/rest/api/3/issue/${key}/properties/haulboard_downtime`, value);
    if (event.endedAt) {
      if (await closeIssue(key)) closed += 1;
      else closeMissing += 1;
    }
  }
  console.log(`Done. ${created.length} issues created, ${closed} moved to a Done status.`);
  if (closeMissing) console.log(`${closeMissing} issues had no transition to Done; Haulboard still treats them as closed because endedAt is set.`);
  console.log(`Open the project in Jira and choose "Haulboard" in the project sidebar.`);
}

async function deleteSample() {
  if (!flag('yes')) die('Deleting is permanent. Re-run with --delete-sample --yes to confirm.');
  let total = 0;
  let idle = 0;
  const deleted = new Set();
  for (;;) {
    const res = await jira('POST', '/rest/api/3/search/jql', {
      jql: `project = "${PROJECT}" AND labels = "hb-sample"`,
      fields: ['summary'],
      maxResults: 100,
    });
    // Search can lag behind deletes; skip keys already removed.
    const issues = (res.issues || []).filter((i) => !deleted.has(i.key));
    if (!issues.length) {
      if (!res.issues || !res.issues.length || ++idle > 3) break;
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    idle = 0;
    for (const i of issues) {
      await jira('DELETE', `/rest/api/3/issue/${i.key}`);
      deleted.add(i.key);
      total += 1;
    }
    console.log(`  deleted ${total}`);
  }
  console.log(`Deleted ${total} sample issues from ${PROJECT}.`);
}

(flag('delete-sample') ? deleteSample() : seed()).catch((e) => die(e.message));
