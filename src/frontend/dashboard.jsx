import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  DynamicTable,
  EmptyState,
  Heading,
  HorizontalBarChart,
  Inline,
  Link,
  Lozenge,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  StackBarChart,
  Text,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { fmtTime, fmtHours, fmtPct, classLabel, causeLabel } from '../lib/format.js';

const WINDOWS = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];

const tile = xcss({
  padding: 'space.200',
  borderRadius: 'radius.medium',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  minWidth: '150px',
});

const Kpi = ({ label, value, hint }) => (
  <Box xcss={tile}>
    <Stack space="space.050">
      <Text size="small" color="color.text.subtle">{label}</Text>
      <Heading size="large">{value}</Heading>
      {hint ? <Text size="small" color="color.text.subtlest">{hint}</Text> : null}
    </Stack>
  </Box>
);

const issueLink = (key) => <Link href={`/browse/${key}`}>{key}</Link>;

const availabilityLozenge = (p) => {
  if (p === null || p === undefined) return <Lozenge>-</Lozenge>;
  const appearance = p >= 90 ? 'success' : p >= 80 ? 'moved' : 'removed';
  return <Lozenge appearance={appearance}>{fmtPct(p)}</Lozenge>;
};

const App = () => {
  const [days, setDays] = useState(WINDOWS[1]);
  const [state, setState] = useState({ loading: true });

  const load = async (d) => {
    setState((s) => ({ ...s, loading: true }));
    const res = await invoke('getDashboard', { days: d.value });
    setState(res.ok ? { loading: false, data: res.data } : { loading: false, error: res.error });
  };

  useEffect(() => {
    load(days);
  }, [days]);

  const header = (
    <Inline space="space.200" alignBlock="center" spread="space-between">
      <Heading size="large">Equipment downtime and reliability</Heading>
      <Inline space="space.100" alignBlock="center">
        <Box xcss={xcss({ width: '180px' })}>
          <Select options={WINDOWS} value={days} onChange={(o) => setDays(o)} />
        </Box>
        <Button onClick={() => load(days)} isDisabled={state.loading}>
          Refresh
        </Button>
      </Inline>
    </Inline>
  );

  if (state.loading && !state.data) {
    return (
      <Stack space="space.300">
        {header}
        <Spinner size="large" label="Loading downtime issues" />
      </Stack>
    );
  }
  if (state.error) {
    return (
      <Stack space="space.300">
        {header}
        <SectionMessage appearance="error" title="Could not load downtime data">
          <Text>{state.error}</Text>
        </SectionMessage>
      </Stack>
    );
  }

  const d = state.data;
  const f = d.fleet;

  if (f.units === 0) {
    return (
      <Stack space="space.300">
        {header}
        <EmptyState
          header="No downtime events yet"
          description='Label issues "downtime" and fill in the Haulboard panel on each issue (unit, cause, shift, start/end), or run the sample-data script from the README.'
        />
      </Stack>
    );
  }

  const stackData = d.byClassAndCause.map((r) => [classLabel(r.equipmentClass), r.hours, r.causeCode]);
  const causeData = d.byCause.map((r) => [`${r.causeCode} ${causeLabel(r.causeCode)}`, r.hours]);

  const unitHead = {
    cells: [
      { key: 'unit', content: 'Unit', isSortable: true },
      { key: 'class', content: 'Class', isSortable: true },
      { key: 'failures', content: 'Failures', isSortable: true },
      { key: 'downtime', content: 'Downtime', isSortable: true },
      { key: 'mtbf', content: 'MTBF', isSortable: true },
      { key: 'mttr', content: 'MTTR', isSortable: true },
      { key: 'avail', content: 'Availability', isSortable: true },
      { key: 'open', content: 'Open', isSortable: true },
    ],
  };
  const unitRows = d.units.map((u) => ({
    key: u.unitId,
    cells: [
      { key: u.unitId, content: <Text weight="bold">{u.unitId}</Text> },
      { key: u.equipmentClass, content: classLabel(u.equipmentClass) },
      { key: u.failures, content: String(u.failures) },
      { key: u.downtimeHours, content: fmtHours(u.downtimeHours) },
      { key: u.mtbfHours ?? 1e9, content: fmtHours(u.mtbfHours) },
      { key: u.mttrHours ?? -1, content: fmtHours(u.mttrHours) },
      { key: u.availabilityPct ?? 100, content: availabilityLozenge(u.availabilityPct) },
      { key: u.openEvents, content: u.openEvents ? <Lozenge appearance="removed">{String(u.openEvents)}</Lozenge> : '0' },
    ],
  }));

  const classHead = {
    cells: ['Class', 'Units', 'Failures', 'Downtime', 'MTBF', 'MTTR', 'Availability'].map((c) => ({ key: c, content: c })),
  };
  const classRows = d.classReliability.map((c) => ({
    key: c.equipmentClass,
    cells: [
      { key: 'c', content: classLabel(c.equipmentClass) },
      { key: 'u', content: String(c.units) },
      { key: 'f', content: String(c.failures) },
      { key: 'd', content: fmtHours(c.downtimeHours) },
      { key: 'b', content: fmtHours(c.mtbfHours) },
      { key: 'r', content: fmtHours(c.mttrHours) },
      { key: 'a', content: availabilityLozenge(c.availabilityPct) },
    ],
  }));

  const recHead = {
    cells: ['Unit', 'Cause', 'Events', 'Hours', 'Last', 'Issues'].map((c) => ({ key: c, content: c })),
  };
  const recRows = d.recurring.map((r) => ({
    key: `${r.unitId}-${r.causeCode}`,
    cells: [
      { key: 'u', content: <Text weight="bold">{r.unitId}</Text> },
      { key: 'c', content: `${r.causeCode} ${causeLabel(r.causeCode)}` },
      { key: 'n', content: <Lozenge appearance={r.count >= 3 ? 'removed' : 'moved'}>{`${r.count}x`}</Lozenge> },
      { key: 'h', content: fmtHours(r.hours) },
      { key: 'l', content: fmtTime(r.lastStart) },
      { key: 'k', content: <Inline space="space.050" shouldWrap>{r.keys.slice(0, 5).map((k) => <Box key={k}>{issueLink(k)}</Box>)}</Inline> },
    ],
  }));

  const openHead = { cells: ['Issue', 'Unit', 'Cause', 'Crew', 'Since', 'Down for', 'Summary'].map((c) => ({ key: c, content: c })) };
  const openRows = d.openEvents.map((o) => ({
    key: o.key,
    cells: [
      { key: 'k', content: issueLink(o.key) },
      { key: 'u', content: o.unitId },
      { key: 'c', content: o.causeCode || '-' },
      { key: 's', content: o.shift || '-' },
      { key: 't', content: fmtTime(o.start) },
      { key: 'h', content: fmtHours(o.hours) },
      { key: 'm', content: o.summary },
    ],
  }));

  return (
    <Stack space="space.400">
      {header}
      <Text color="color.text.subtle">
        {`Project ${d.projectKey}. Window ${fmtTime(d.window.from)} to ${fmtTime(d.window.to)}. Computed live from Jira issues labelled "downtime".`}
      </Text>
      {d.truncated ? (
        <SectionMessage appearance="warning" title="Large project">
          <Text>Only the newest 1000 downtime issues were analysed.</Text>
        </SectionMessage>
      ) : null}
      {f.unclassifiedIssues > 0 ? (
        <SectionMessage appearance="information" title={`${f.unclassifiedIssues} downtime issue(s) have no unit details`}>
          <Text>Open them and complete the Haulboard panel so they count in the metrics.</Text>
        </SectionMessage>
      ) : null}

      <Inline space="space.200" shouldWrap>
        <Kpi label="Downtime" value={fmtHours(f.downtimeHours)} hint={`${f.eventsInWindow} events`} />
        <Kpi label="Fleet availability" value={fmtPct(f.availabilityPct)} hint={`${f.units} units`} />
        <Kpi label="MTBF" value={fmtHours(f.mtbfHours)} hint={`${f.failures} failures`} />
        <Kpi label="MTTR" value={fmtHours(f.mttrHours)} hint="closed failures" />
        <Kpi label="Open now" value={String(f.openEvents)} hint="all crews" />
      </Inline>

      <Inline space="space.400" shouldWrap>
        <Box xcss={xcss({ minWidth: '420px' })}>
          <StackBarChart
            data={stackData}
            xAccessor={0}
            yAccessor={1}
            colorAccessor={2}
            title="Downtime hours by equipment class"
            subtitle="Stacked by cause code"
            height={340}
          />
        </Box>
        <Box xcss={xcss({ minWidth: '420px' })}>
          <HorizontalBarChart data={causeData} xAccessor={0} yAccessor={1} title="Downtime hours by cause" height={340} />
        </Box>
      </Inline>

      <Heading size="medium">Reliability by class</Heading>
      <DynamicTable head={classHead} rows={classRows} />

      <Heading size="medium">MTBF / MTTR per unit</Heading>
      <DynamicTable head={unitHead} rows={unitRows} rowsPerPage={10} defaultSortKey="avail" />

      <Heading size="medium">Top recurring failures</Heading>
      <DynamicTable head={recHead} rows={recRows} emptyView={<Text>No unit has the same unplanned cause twice in this window.</Text>} />

      <Heading size="medium">Open items by crew</Heading>
      <Inline space="space.100" shouldWrap>
        {d.openByShift.map((s) => (
          <Lozenge key={s.shift} appearance={s.open ? 'inprogress' : 'default'} isBold={s.open > 0}>
            {`${s.shift === 'Unassigned' ? 'No crew' : `Crew ${s.shift}`}: ${s.open}`}
          </Lozenge>
        ))}
      </Inline>
      <DynamicTable head={openHead} rows={openRows} rowsPerPage={10} emptyView={<Text>No open downtime.</Text>} />
      <Text size="small" color="color.text.subtlest">
        MTBF = uptime / unplanned failures. MTTR = mean duration of closed unplanned failures. Availability counts unplanned and
        planned maintenance downtime; operational delays (OPS, WX, SAF) are shown but not counted as equipment downtime.
      </Text>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
