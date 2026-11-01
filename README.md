# Haulboard

**Equipment downtime, reliability metrics and shift handover for heavy-equipment operations, inside Jira, with a Rovo agent.**

Haulboard is an Atlassian Forge app for open-pit mines, quarries and construction fleets that already log breakdowns as Jira issues. It turns those issues into the numbers a shift supervisor and a maintenance planner use every day (downtime by class and cause, MTBF, MTTR, availability, repeat failures). It also builds a structured handover for the outgoing crew and adds a Rovo agent that answers the same questions in chat.

- Codegeist 2026 category: **Apps for Specialized Industries**
- Bonus prize targeted: **Best Agents** (a `rovo:agent`, four reusable `action` modules and a reusable `rovo:skill`)
- Runs entirely on Atlassian: there are no external servers and no egress. Data stays in Jira issues and issue properties.
- All sample data is fictional ("Example Pit North", units HT-101..HT-112, EX-01..03, DR-01..03, DZ-01..02).

---

## What it does

| Surface | Forge module | What you get |
|---|---|---|
| **Haulboard** project page | `jira:projectPage` (UI Kit) | KPI tiles (downtime, fleet availability, MTBF, MTTR, open now); downtime hours by class stacked by cause; downtime by cause; reliability by class; MTBF/MTTR/availability per unit; top recurring failures; open items by crew. Window: 7, 30 or 90 days. |
| **Haulboard - unit history** issue panel | `jira:issuePanel` (UI Kit) | A form to record the downtime details on any issue. The panel then shows the unit's 90-day reliability, its failure history, a recurring-failure warning and similar past events (same cause on the same class, plus wording overlap). |
| **Haulboard shift handover** | `jira:globalPage` (UI Kit) | Pick a project, the outgoing crew (A/B/C/D) and the shift length. You get safety notes first, then ranked priorities for the incoming crew, recurring failures, open downtime, what started and closed this shift, and a copy-ready plain-text handover. |
| **Shift Supervisor Assistant** | `rovo:agent` | A Rovo chat agent for supervisors: unit history, shift summary, fleet reliability and flagging repeat failures. |
| Reusable actions | `action` x4 | `get-unit-history`, `summarize-shift`, `get-fleet-reliability` (GET), `flag-recurring-failure` (UPDATE). Each returns JSON with a plain-language `summary`, so other agents can call them too. |
| Reusable skill | `rovo:skill` | `shift-handover-brief`: step-by-step instructions any agent can load to produce a handover with the actions above. |
| JQL fields | `jira:entityProperty` | Downtime details are indexed, so you can search `hbUnit = "HT-104" AND hbCause = HYD AND hbStart >= -30d`. |

### Data model (no screen configuration needed)

A downtime event is any Jira issue with the label `downtime`. Its details live in the issue property `haulboard_downtime`:

```json
{
  "schemaVersion": 1,
  "unitId": "HT-104",
  "equipmentClass": "haul-truck",
  "causeCode": "HYD",
  "shift": "B",
  "startedAt": "2026-10-03T08:15:00Z",
  "endedAt": null,
  "safetyNote": "Isolation lock on hoist circuit"
}
```

The issue panel writes this property, and so do the seed script and any integration that can call the Jira REST API. A `jira:entityProperty` module indexes it for JQL:

| JQL alias | Path | Type |
|---|---|---|
| `hbUnit` | unitId | string |
| `hbClass` | equipmentClass (`haul-truck`, `excavator`, `drill`, `dozer`) | string |
| `hbCause` | causeCode | string |
| `hbShift` | shift (`A`-`D`) | string |
| `hbStart` / `hbEnd` | startedAt / endedAt | date |
| `hbSafety` | safetyNote | text |

**Why an issue property and not custom fields?** Custom fields have to be added to screens and field configurations project by project before anyone can enter data. An indexed issue property works in team-managed and company-managed projects as soon as the app is installed, and it is still searchable in JQL. **Recommended convention:** create an issue type called "Downtime" (or use Task) and label it `downtime`. The panel adds the label for you.

**Label fallback.** Issues created by other tools can use labels `hb-unit-HT-104`, `hb-cause-HYD`, `hb-shift-B`. Start falls back to `created` and end falls back to `resolutiondate`.

**Cause codes**

| Code | Meaning | Counts as |
|---|---|---|
| ENG, HYD, ELE, TRN, BRK, TYR, GET, STR | engine, hydraulics, electrical, transmission, brakes, tyres/undercarriage, ground engaging tools, structural | unplanned failure |
| PM | planned maintenance | planned downtime |
| OPS, WX, SAF | operational delay, weather, safety stop | operational (not equipment downtime) |

### Metric definitions

The window is the last N days. W is the window length in hours, per unit.

- **Downtime hours:** the overlap of each event with the window, all causes. Open events run to "now".
- **Failure:** an unplanned event that starts inside the window.
- **Availability:** (W - availability loss) / W. Availability loss is the union of unplanned and planned intervals for the unit, so overlapping events are not double counted. Operational delays are excluded.
- **MTBF:** (W - availability loss) / failures. Shown as "-" when a unit has no failures.
- **MTTR:** the mean full duration of closed failures that started in the window.
- **Recurring failure:** the same unit and the same unplanned cause at least 3 times in 30 days. The dashboard also lists every pair seen 2 or more times in the window.
- **Handover priority:** class criticality (excavator 3, drill 2, dozer 1.5, haul truck 1) x (1 + hours down / 12). The result is x1.5 if recurring and x2 if it has a safety note or a SAF cause.
- Fleet and class figures cover every unit seen in the project's downtime issues. A unit with no events in the window counts as 100 % available.

All of these are pure functions in `src/lib/metrics.js` and `src/lib/handover.js`. They are covered by Jest tests against hand-calculated fixtures (see `test/`).

---

## Install (judges)

You need a Jira Cloud site where you are a site admin. The Rovo agent also needs Rovo activated on that site.

1. Open the **installation link** from the Devpost submission. Choose your site and **Jira**, then approve the scopes (`read:jira-work`, `write:jira-work`).
2. Create (or pick) a Jira project, for example key `MINE`.
3. Load the fictional sample data (about 60 issues, 8 of them still open):
   ```bash
   git clone <repo-url> haulboard && cd haulboard
   export JIRA_BASE_URL=https://<your-site>.atlassian.net
   export JIRA_EMAIL=<your-atlassian-email>
   export JIRA_API_TOKEN=<api token from https://id.atlassian.com/manage-profile/security/api-tokens>
   export JIRA_PROJECT_KEY=MINE
   node scripts/seed-sample-data.mjs --dry-run   # preview, no network calls
   node scripts/seed-sample-data.mjs             # create the issues
   ```
   The script needs Node 18+ and no `npm install`. It uses only your own token and talks only to your Jira site. Remove the data later with `node scripts/seed-sample-data.mjs --delete-sample --yes`, which deletes only issues labelled `hb-sample`.
4. In the project sidebar, open **Haulboard**. The first time, Forge asks you to allow access; click it once.
5. Open any sample issue (for example one titled "HT-104 - Hoist cylinder leak") and add the **Haulboard - unit history** panel. Jira shows Forge issue panels after you click the app's button under the issue summary, once per issue.
6. Open **Apps > Haulboard shift handover**, pick the project and a crew, then click **Generate handover**.
7. Open **Rovo Chat > Browse agents > Shift Supervisor Assistant** and click **Enable**. Then try a conversation starter, or ask: *"Summarise open downtime for crew A in project MINE"*, *"What is the failure history of HT-104?"*, *"Flag the recurring failure on HT-104"*. The flag action changes issues, so Rovo asks you to confirm first.

The sample data has repeat failures planted in it on purpose (HT-104 hydraulics, EX-02 ground engaging tools, DR-01 electrical), plus a safety-noted excavator that is still down. This gives every view something to show.

## Using it on real data

1. Label breakdown issues `downtime` (or use a "Downtime" issue type and label it).
2. Fill in the panel on each issue: unit, class, cause, crew, down at, back in service, safety note. Times are UTC unless you type an offset (for example `2026-10-03T16:15+08:00`).
3. Close the event by entering "back in service", by moving the issue to a Done status, or both.

## Develop

```bash
npm install
npm test            # Jest: metrics, normalisation, handover, Jira layer, UI resolver, Rovo actions, sample data
forge lint          # needs `forge login`
```

Deploy and distribution steps are in [DEPLOY.md](DEPLOY.md).

```
manifest.yml                 Forge modules, scopes, resources
src/index.js                 function entry points
src/lib/constants.js         classes, cause codes, crews
src/lib/normalize.js         Jira issue -> downtime event; input validation
src/lib/metrics.js           downtime, MTBF, MTTR, availability, recurring, similarity
src/lib/handover.js          shift handover (structured + plain text)
src/lib/jira.js              requestJira calls (enhanced JQL search, properties, labels, comments)
src/lib/service.js           use cases shared by UI resolvers and Rovo actions
src/resolvers/index.js       UI Kit resolver
src/actions/index.js         Rovo action handlers
src/frontend/*.jsx           UI Kit: dashboard, issue panel, handover page
prompts/                     Rovo agent prompt
skills/shift-handover-brief/ Rovo skill (SKILL.md)
scripts/                     fictional sample-data generator and seed script
test/                        Jest tests and fixtures
```

## Limits and known gaps

- Each view analyses the newest 1000 downtime issues per project and shows a warning when it hits that cap.
- Fleet size is taken from the units seen in downtime issues. A unit that has never had a logged event does not appear.
- Availability assumes every unit is scheduled 24 h a day. Shift calendars and standby time are not modelled.
- The crew letter is whatever was recorded on the event. Haulboard does not hold a roster.
- The app has not been tested on a live Jira site by the author yet. See DEPLOY.md.

## Privacy and security

- Scopes: `read:jira-work` and `write:jira-work` only.
- Every Jira call runs `asUser()`, so users only see and change what their Jira permissions allow.
- No external fetch, no Forge storage, no analytics. Project and issue keys come from the Forge context or are checked against strict patterns before they are used in JQL.

## License

MIT, see [LICENSE](LICENSE).
