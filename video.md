# Demo video - 3 minutes

Target length 2:50-3:00. Record at 1920x1080 in a Jira site loaded with the fictional sample data (`node scripts/seed-sample-data.mjs`). Use voice-over, no music, or royalty-free music only. Hide your email and site name if you prefer (browser zoom 110 %, close other tabs). Every number on screen comes from the live app, so do not script specific figures. Read them off the screen, or leave them unsaid.

Prep before recording:
- Project `MINE` seeded within the last hour, so the "open" events look current.
- Rovo agent enabled in Rovo Chat. Run one throw-away question first so the first answer isn't the slowest.
- Have these tabs open: (1) Haulboard project page, (2) issue "HT-104 - Hoist cylinder leak - repeat failure", (3) Apps > Haulboard shift handover, (4) Rovo Chat.

## Shot list and voice-over

| # | Time | Screen | Voice-over (read naturally, adjust to what is on screen) |
|---|---|---|---|
| 1 | 0:00-0:15 | Title card: "Haulboard - downtime, reliability and shift handover in Jira". Small caption: "All data shown is fictional". | "I've worked as a mine planning engineer at open-pit operations for eight years. Every shift change, someone has to explain which trucks, shovels and drills are down, why, and what to do first. Haulboard puts that into Jira." |
| 2 | 0:15-0:30 | Jira issue list filtered `labels = downtime`. Then open one issue and show the issue property via the panel. | "Each breakdown is a normal Jira issue labelled downtime. Haulboard stores the unit, cause code, crew, and down and back-in-service times on the issue itself. There are no custom-field screens to configure, and it's searchable in JQL." Type in the search bar: `hbUnit = "HT-104"`. |
| 3 | 0:30-1:05 | Tab 1: Haulboard project page. Scroll slowly: KPI tiles, stacked bar by class/cause, cause chart. Switch the window from 30 to 7 days and back. | "This project page is computed live from those issues through the Jira REST API. It shows downtime by equipment class stacked by cause, fleet availability, MTBF and MTTR. Planned maintenance counts against availability, but operational delays like weather don't count as equipment failures." |
| 4 | 1:05-1:25 | Same page: per-unit table sorted by availability, then "Top recurring failures" with HT-104 hydraulics at the top, then "Open items by crew". | "Per unit you get failures, MTBF, MTTR and availability, worst first. Below that, repeat failures: the same unit with the same cause again and again. Here it's a haul truck with a hoist-cylinder leak. That's the pattern a reliability engineer wants to catch early." |
| 5 | 1:25-1:50 | Tab 2: issue HT-104 with the Haulboard panel: recurring-failure warning, history table, similar events. Click "Edit details" briefly to show the form, then Cancel. | "On the issue, the panel shows this unit's history and similar past events on other trucks. The same form records new events, with no admin setup." |
| 6 | 1:50-2:15 | Tab 3: Shift handover page. Choose MINE, crew, 12 h, then Generate. Show Safety box, ranked priorities, then scroll to the copy-ready text. | "At shift change the outgoing supervisor generates a handover. Safety items come first. Then priorities for the incoming crew, ranked so a stopped excavator outranks a single truck, because it idles every truck it loads. There's plain text ready for the shift log." |
| 7 | 2:15-2:45 | Tab 4: Rovo Chat > Shift Supervisor Assistant. Ask: "Summarise open downtime for crew A in project MINE." Then: "Flag the recurring failure on HT-104." Show the confirmation and the result. Cut to the issue showing the new label and comment. | "The Shift Supervisor Assistant is a Rovo agent built on four actions: unit history, shift summary, fleet reliability and flag recurring failure. They're normal Forge action modules, and the handover steps are packaged as a Rovo skill, so other agents can reuse them. Flagging changes issues, so Rovo asks first." |
| 8 | 2:45-3:00 | Architecture slide: Jira issues -> requestJira -> metrics -> UI Kit pages + Rovo actions. Text: "Forge only - no external servers - read/write Jira work scopes". End card with app name. | "It all runs on Forge, with no external servers and only two Jira scopes. It works for mines, quarries and construction fleets. Thanks for watching." |

## Recording tips

- Record each shot separately and cut. It is easier than one take.
- If Rovo is slow, cut the waiting time. Do not fake answers.
- Show the caption "Fictional sample data" in shot 1, and again in shot 3 if the project name is visible.
- Do not show any real company name, logo, site or person.
