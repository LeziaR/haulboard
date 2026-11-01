import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  CodeBlock,
  DynamicTable,
  Heading,
  Inline,
  Label,
  Link,
  List,
  ListItem,
  Lozenge,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Text,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { SHIFTS } from '../lib/constants.js';
import { fmtTime, fmtHours, causeLabel } from '../lib/format.js';

const crewOptions = [{ value: '', label: 'All crews' }, ...SHIFTS.map((s) => ({ value: s, label: `Crew ${s}` }))];
const hourOptions = [8, 10, 12].map((h) => ({ value: h, label: `${h} h shift` }));
const issueLink = (key) => <Link href={`/browse/${key}`}>{key}</Link>;

const App = () => {
  const [projects, setProjects] = useState(null);
  const [project, setProject] = useState(null);
  const [crew, setCrew] = useState(crewOptions[0]);
  const [hours, setHours] = useState(hourOptions[2]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoke('listProjects').then((res) => {
      if (!res.ok) return setError(res.error);
      const opts = res.data.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }));
      setProjects(opts);
      if (opts.length === 1) setProject(opts[0]);
    });
  }, []);

  const generate = async () => {
    if (!project) return;
    setBusy(true);
    setError(null);
    const res = await invoke('getHandover', { projectKey: project.value, shift: crew.value || null, hours: hours.value });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setResult(res.data);
  };

  const h = result;
  const openHead = { cells: ['Priority', 'Issue', 'Unit', 'Cause', 'Crew', 'Down for', 'Flags'].map((c) => ({ key: c, content: c })) };
  const openRows = h
    ? h.open.map((o, i) => ({
        key: o.key,
        cells: [
          { key: 'p', content: String(i + 1) },
          { key: 'k', content: issueLink(o.key) },
          { key: 'u', content: <Text weight="bold">{o.unitId}</Text> },
          { key: 'c', content: `${o.causeCode || '-'} ${causeLabel(o.causeCode)}` },
          { key: 's', content: o.shift || '-' },
          { key: 'h', content: fmtHours(o.hours) },
          {
            key: 'f',
            content: (
              <Inline space="space.050">
                {o.recurring ? <Lozenge appearance="removed">{`recurring ${o.recurring.count}x`}</Lozenge> : null}
                {o.safetyNote ? <Lozenge appearance="moved">safety</Lozenge> : null}
              </Inline>
            ),
          },
        ],
      }))
    : [];
  const simpleHead = (label) => ({ cells: ['Issue', 'Unit', 'Cause', label, 'Duration'].map((c) => ({ key: c, content: c })) });
  const simpleRows = (list, field) =>
    list.map((e) => ({
      key: e.key,
      cells: [
        { key: 'k', content: issueLink(e.key) },
        { key: 'u', content: e.unitId },
        { key: 'c', content: e.causeCode || '-' },
        { key: 't', content: fmtTime(e[field]) },
        { key: 'h', content: e.end ? fmtHours(e.hours) : `${fmtHours(e.hours)} (open)` },
      ],
    }));

  return (
    <Stack space="space.300">
      <Heading size="large">Shift handover</Heading>
      <Text color="color.text.subtle">Generates a structured handover for the outgoing crew from live Jira downtime issues.</Text>
      <Inline space="space.200" alignBlock="end" shouldWrap>
        <Box xcss={xcss({ width: '300px' })}>
          <Stack space="space.050">
            <Label labelFor="hb-project">Project</Label>
            <Select inputId="hb-project" isLoading={!projects} options={projects || []} value={project} onChange={setProject} placeholder="Select project" />
          </Stack>
        </Box>
        <Box xcss={xcss({ width: '160px' })}>
          <Stack space="space.050">
            <Label labelFor="hb-crew">Outgoing crew</Label>
            <Select inputId="hb-crew" options={crewOptions} value={crew} onChange={setCrew} />
          </Stack>
        </Box>
        <Box xcss={xcss({ width: '160px' })}>
          <Stack space="space.050">
            <Label labelFor="hb-hours">Shift length</Label>
            <Select inputId="hb-hours" options={hourOptions} value={hours} onChange={setHours} />
          </Stack>
        </Box>
        <Button appearance="primary" onClick={generate} isDisabled={!project || busy}>
          Generate handover
        </Button>
      </Inline>

      {busy ? <Spinner label="Building handover" /> : null}
      {error ? (
        <SectionMessage appearance="error" title="Could not build the handover">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      {h && !busy ? (
        <Stack space="space.300">
          <Text weight="bold">
            {`${h.crew ? `Crew ${h.crew}` : 'All crews'} - ${fmtTime(h.window.from)} to ${fmtTime(h.window.to)}: ${h.totals.open} open, ${h.totals.startedThisShift} started, ${h.totals.closedThisShift} closed this shift.`}
          </Text>

          <SectionMessage appearance={h.safety.length ? 'warning' : 'success'} title="Safety">
            {h.safety.length ? (
              <List type="unordered">
                {h.safety.map((s) => (
                  <ListItem key={s.key}>{`${s.unitId} ${s.key}: ${s.note}${s.open ? ' (still open)' : ''}`}</ListItem>
                ))}
              </List>
            ) : (
              <Text>No safety notes recorded in this window.</Text>
            )}
          </SectionMessage>

          <Heading size="medium">Priorities for the incoming crew</Heading>
          {h.priorities.length ? (
            <List type="ordered">
              {h.priorities.map((p) => (
                <ListItem key={p}>{p.replace(/^\d+\.\s*/, '')}</ListItem>
              ))}
            </List>
          ) : (
            <Text>No open downtime.</Text>
          )}

          {h.recurringAlerts.length ? (
            <SectionMessage appearance="error" title="Recurring failures">
              <List type="unordered">
                {h.recurringAlerts.map((r) => (
                  <ListItem key={`${r.unitId}-${r.causeCode}`}>{`${r.unitId} ${causeLabel(r.causeCode)}: ${r.count}x in ${r.days} days (${r.keys.join(', ')})`}</ListItem>
                ))}
              </List>
            </SectionMessage>
          ) : null}

          <Heading size="medium">Open downtime (ranked)</Heading>
          <DynamicTable head={openHead} rows={openRows} emptyView={<Text>No open downtime.</Text>} />
          <Heading size="medium">Started this shift</Heading>
          <DynamicTable head={simpleHead('Down at')} rows={simpleRows(h.started, 'start')} emptyView={<Text>Nothing started this shift.</Text>} />
          <Heading size="medium">Closed this shift</Heading>
          <DynamicTable head={simpleHead('Back at')} rows={simpleRows(h.closed, 'end')} emptyView={<Text>Nothing closed this shift.</Text>} />

          <Heading size="medium">Copy-ready handover text</Heading>
          <Text size="small" color="color.text.subtle">Paste into the shift log, an email, or a Confluence page.</Text>
          <CodeBlock text={h.text} language="text" shouldWrapLongLines />
        </Stack>
      ) : null}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
