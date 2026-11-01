# Haulboard - Devpost text

**Tagline:** Equipment downtime, reliability and shift handover for mines, quarries and construction fleets, inside Jira, with a Rovo agent.

**Category:** Apps for Specialized Industries
**Bonus prize:** Best Agents

## Inspiration

I am a mine planning engineer and have worked at open-pit operations for eight years. Heavy-equipment sites run on availability. When a haul truck, an excavator or a drill stops, it costs production every hour. At every shift change, the outgoing supervisor has to tell the incoming crew what is down, why, what is unsafe and what to fix first.

In practice that information is spread across radio logs, spreadsheets and maintenance tickets. Reliability numbers such as MTBF, MTTR and repeat failures are usually worked out later in a spreadsheet, if at all. Many teams already track work in Jira, so I wanted the downtime record, the metrics and the handover in the same place, plus an assistant that can answer "what is the history of this truck?" during the shift.

## What it does

Haulboard treats any Jira issue labelled `downtime` as an equipment downtime event. It records the unit ID, equipment class (haul truck, excavator, drill, dozer), cause code, crew (A/B/C/D), down and back-in-service times and an optional safety note.

- **Project page dashboard (UI Kit):** downtime hours by equipment class stacked by cause, downtime by cause, fleet availability, MTBF and MTTR per class and per unit, top recurring failures and open items by crew, for the last 7, 30 or 90 days.
- **Issue panel:** a form to record the downtime details, plus the unit's failure history, a recurring-failure warning and similar past events.
- **Shift handover page:** for a project and outgoing crew, it lists safety notes first, then priorities for the incoming crew ranked by equipment criticality and time down, recurring failures, open downtime, what started and closed during the shift, and copy-ready text for the shift log.
- **Shift Supervisor Assistant (Rovo agent):** answers questions in Rovo Chat using four actions:
  - `get-unit-history`
  - `summarize-shift`
  - `get-fleet-reliability`
  - `flag-recurring-failure`, which labels the related issues and comments on the latest one after the user confirms.
- **Reusable agent building blocks:** the four actions return structured JSON with a plain-language summary, and a `rovo:skill` (`shift-handover-brief`) packages the handover procedure, so other agents can reuse them.
- **JQL:** details are stored in an indexed issue property, so `hbUnit = "HT-104" AND hbCause = HYD` works in normal Jira search.

## How we built it

- **Atlassian Forge**, Node.js 22 runtime, with **UI Kit** (`@forge/react`) for the project page, issue panel and global page.
- Data comes from Jira through `requestJira` with `asUser()`, using the enhanced JQL search endpoint and issue properties. There are no external servers, no egress and no Forge storage. The only scopes are `read:jira-work` and `write:jira-work`.
- Downtime details live in an issue property indexed by a `jira:entityProperty` module, instead of custom fields. Teams can start without screen or field-configuration changes, and the data stays searchable in JQL.
- All metric logic (downtime overlap, interval union for availability, MTBF, MTTR, recurrence detection, similarity scoring and handover ranking) is in pure functions. The same code serves the UI resolvers and the Rovo actions.
- It is tested with Jest against hand-calculated fixtures, plus a mocked Jira layer for pagination, writes and the Rovo action responses.
- A deterministic generator creates about 60 clearly fictional downtime events for a fictional pit, and a seed script loads them through the Jira REST API.

## Challenges we ran into

- **Defining the metrics honestly.** Overlapping breakdowns on the same unit must not be counted twice, so availability uses the union of downtime intervals. Planned maintenance reduces availability but is not a failure. Operational delays like weather or no operator are shown but are not counted as equipment downtime. A unit with no failures has no MTBF rather than an infinite one.
- **Avoiding admin setup.** Custom fields would have needed screen changes in every project before a judge or a site could try the app. Indexed issue properties removed that step.
- **Designing actions for other agents.** Each action needed a clear description within Forge's length limits. Each returns structured data plus a short summary, and reports missing inputs (such as an unknown project) in a form an agent can act on.
- **Working without a live site during most of development.** I validated the manifest with the Forge CLI's own linter and bundler and kept the logic testable offline.

## Accomplishments that we're proud of

- One code path computes the numbers for the dashboard, the issue panel, the handover page and the Rovo agent, so they always agree.
- The handover ranking reflects how a pit actually works: a stopped excavator idles the trucks it loads, so it comes before a single truck.
- It uses only two Jira scopes, and it adds no external services or data stores.

## What we learned

- How to combine Forge UI Kit modules, Rovo agents, actions and skills in one app, and how agents use action descriptions to choose tools.
- How the enhanced JQL search, issue properties and `jira:entityProperty` indexing work together.
- That writing reliability metrics as tested, pure functions forces you to make every definition explicit.

## What's next for Haulboard

- An equipment register (fleet list and scheduled hours) so availability can use real schedules instead of 24 h days.
- Shift calendars per site and time zone.
- A Confluence macro that embeds the handover in the shift log page.
- Optional import from fleet-management or maintenance systems through Jira automation.
- Trend charts (availability and MTBF over time) and per-component failure codes.

## Built with

Atlassian Forge, Jira Cloud REST API, UI Kit (`@forge/react`), Rovo agents, actions and skills, Node.js, JavaScript, Jest.
