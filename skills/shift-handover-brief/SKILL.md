---
name: shift-handover-brief
description: Produce a shift handover brief for a heavy-equipment operation from Haulboard downtime issues in Jira - open downtime ranked by priority, safety notes, recurring failures and what the incoming crew should do first. Use at shift change or when asked what happened on a shift.
allowed-tools: summarize-shift get-unit-history flag-recurring-failure
compatibility: Requires Jira with the Haulboard Forge app installed and downtime issues labelled "downtime".
metadata:
  app: haulboard
  version: "1.0"
---

# Shift handover brief

Use this skill when a user asks for a shift handover, a shift summary, "what is still down", or what the incoming crew should prioritise.

## Steps

1. Call `summarize-shift` with:
   - `projectKey` if the user named a project (otherwise omit it; the action uses the current Jira project).
   - `shift` = the outgoing crew letter (A, B, C or D) if given.
   - `hours` = shift length if given (default 12).
2. If the result has `error: "NO_PROJECT"`, ask the user for the Jira project key and call again.
3. For the top one or two items in `open` (highest `priority`), call `get-unit-history` with the `unitId` to add context: failures, MTTR and whether the failure is recurring.
4. Write the brief in this order:
   - **Safety**: every entry in `safety`. If empty, say "No safety notes recorded."
   - **Priorities for incoming crew**: the `priorities` list, in order.
   - **Recurring failures**: entries in `recurringAlerts`, with issue keys.
   - **Still down**: count of `open` by equipment class.
   - **This shift**: counts of `started` and `closed`.
5. If a unit is recurring and the user agrees, call `flag-recurring-failure` with the `unitId` and `causeCode`. Do not call it without the user's agreement, because it changes issues.

## Rules

- Use only values returned by the actions. Never estimate durations or invent events.
- Use issue keys (for example MINE-42) so readers can open the issue.
- Dates in ISO form, YYYY-MM-DD HH:mm UTC. Hours with one decimal.
- `handoverText` is a copy-ready plain-text version; offer it when the user wants to paste the handover elsewhere.
