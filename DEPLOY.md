# DEPLOY.md - owner checklist

These are the exact steps to take Haulboard from this folder to a judge installation link. Run them yourself on your own machine. Nothing here was run against a live Atlassian account while the app was being built.

## 0. Prerequisites (one time)

| Need | How |
|---|---|
| Node.js 22.23.4+ or 24.22.1+ | `nvm install 22 && nvm use 22` then `node --version`. Forge CLI 15 refuses older Node. CLI 14.2.0 works on Node 22.22 if you are stuck. |
| Forge CLI | `npm install -g @forge/cli` then `forge --version`. Do not use sudo. |
| Atlassian account | Create a free one at https://id.atlassian.com/signup if you don't have one. |
| Developer site (Jira Cloud) | http://go.atlassian.com/cloud-dev. Complete the setup wizard and note `<your-site>.atlassian.net`. |
| Rovo on that site | Needed for the agent: Admin > Atlassian Administration > Rovo, then activate. If Rovo is not offered on the site, everything except the agent still works. |
| API token for Forge | https://id.atlassian.com/manage-profile/security/api-tokens > **Create API token with scopes** > app **Forge**. Copy it. |

## 1. Log in and register the app

```bash
cd codegeist                 # this folder
npm install
forge login                  # email + the Forge API token
                             # (headless/no keychain: export FORGE_EMAIL=... FORGE_API_TOKEN=... instead)
forge register "Haulboard"   # creates a new app in your account and writes the real app.id into manifest.yml
```

If `forge register` asks for a Developer Space, choose your personal space or create one.

## 2. Check before deploying

```bash
npm test                     # expect: 7 suites, 88 tests passing
forge lint                   # expect: no errors
```

## 3. Deploy and install on your development environment

```bash
forge deploy -e development
forge install -e development --site <your-site>.atlassian.net --product jira
```

Approve the scopes when prompted (`read:jira-work`, `write:jira-work`). After you change any code, redeploy. After you change the manifest scopes, also run `forge install --upgrade -e development --site <your-site>.atlassian.net --product jira`.

Load sample data into a test project (key `MINE` here, create it first in Jira):

```bash
export JIRA_BASE_URL=https://<your-site>.atlassian.net
export JIRA_EMAIL=<your-email>
export JIRA_API_TOKEN=<a normal API token, classic or scoped for Jira>
export JIRA_PROJECT_KEY=MINE
node scripts/seed-sample-data.mjs --dry-run
node scripts/seed-sample-data.mjs
```

Smoke test (this is also the shot list for the demo video):

1. Jira > project MINE > sidebar **Haulboard**: KPIs, charts and tables load. Click "Allow access" once if asked.
2. Open an issue titled "HT-104 - Hoist cylinder leak - repeat failure" and add the **Haulboard - unit history** panel. It should show a red recurring-failure message, the history table and similar events.
3. Top nav **Apps > Haulboard shift handover**: choose MINE and a crew, then **Generate handover**.
4. **Rovo Chat > Browse agents > Shift Supervisor Assistant > Enable**. Ask "What is the failure history of HT-104 in project MINE?"
5. `forge logs -e development --since 15m` should show no errors.

Problems you may hit:

| Symptom | Fix |
|---|---|
| Panel or page shows "Could not load ... 403" | The user has not granted access yet (click "Allow access"), or lacks Browse permission on the project. |
| Dashboard empty but issues exist | Issues need the label `downtime` plus panel details (or `hb-*` labels). |
| JQL `hbUnit = ...` returns nothing right after install | Jira indexes properties on install/update. Edit the issue or re-run the seed script. |
| Seed script: "Field 'labels' cannot be set" | Labels are not on the project's create screen. Add the Labels field to the screen, or use a team-managed project. |
| Agent missing from Rovo | Rovo not activated on the site, or the app is installed on a site without Rovo. Check `forge install list`. |

## 4. Production deploy and the judge installation link

```bash
forge deploy -e production
forge install -e production --site <your-site>.atlassian.net --product jira   # optional: check prod yourself
```

Then in the browser:

1. Go to https://developer.atlassian.com/console/myapps/ and choose **Haulboard**.
2. In the left menu, choose **Distribution**. Under **Distribution controls**, click **Edit**.
3. Choose **Sharing** (not "Sharing within organization", because judges are outside your organization). Fill in the app details: name, short description, vendor name, privacy policy and support contact. For the privacy section, answer that the app stores no personal data outside Jira, has no egress and no external storage. Then **Save changes**.
4. Under Atlassian apps, select **Jira**.
5. **Copy the installation link.** Paste it into the Devpost submission field and into the README "Install (judges)" section.

Notes:

- Do not add a `licensing` block to the manifest and do not submit the app to Marketplace. Licensed or Marketplace-submitted apps cannot be shared by installation link.
- The link always installs the latest **production** deployment. Run `forge deploy -e production` after every fix you want judges to see.
- Keep production deployed and the link working until judging ends.

## 5. Devpost submission checklist (verify against the current Codegeist 2026 rules)

- [ ] Category: Apps for Specialized Industries
- [ ] Bonus: Best Agents (explain the `rovo:agent`, the 4 `action` modules and the `rovo:skill`, see devpost_text.md)
- [ ] Installation link (step 4)
- [ ] Public demo video under the length limit (script in video.md), with no copyrighted music
- [ ] Public repository link if required (push this folder; `node_modules/` is git-ignored)
- [ ] Text from devpost_text.md, edited in your own words
- [ ] Deadline: 2026-12-22 12:00 PT
