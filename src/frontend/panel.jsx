import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  DynamicTable,
  Heading,
  Inline,
  Label,
  Link,
  Lozenge,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Text,
  Textfield,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { CAUSE_CODES, EQUIPMENT_CLASSES, SHIFTS, classForUnit } from '../lib/constants.js';
import { fmtTime, fmtHours, fmtPct, classLabel, causeLabel } from '../lib/format.js';

const classOptions = Object.entries(EQUIPMENT_CLASSES).map(([value, v]) => ({ value, label: v.label }));
const causeOptions = Object.entries(CAUSE_CODES).map(([value, v]) => ({ value, label: `${value} - ${v.label}` }));
const shiftOptions = SHIFTS.map((s) => ({ value: s, label: `Crew ${s}` }));
const pick = (opts, v) => opts.find((o) => o.value === v) || null;
const nowIso = () => new Date().toISOString().slice(0, 16) + 'Z';
const toInput = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16) + 'Z' : '');

const issueLink = (key) => <Link href={`/browse/${key}`}>{key}</Link>;

const Field = ({ id, label, children }) => (
  <Stack space="space.050">
    <Label labelFor={id}>{label}</Label>
    {children}
  </Stack>
);

const DetailsForm = ({ initial, onSaved, onCancel }) => {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));

  const save = async () => {
    setBusy(true);
    setErrors([]);
    const res = await invoke('saveDowntimeDetails', { details: v });
    setBusy(false);
    if (!res.ok) return setErrors([res.error]);
    if (!res.data.ok) return setErrors(res.data.errors);
    onSaved(res.data.labelWarning);
  };

  return (
    <Stack space="space.150">
      <Inline space="space.150" shouldWrap>
        <Box xcss={xcss({ width: '140px' })}>
          <Field id="hb-unit" label="Unit ID">
            <Textfield
              id="hb-unit"
              value={v.unitId}
              placeholder="HT-104"
              onChange={(e) => {
                const unitId = e.target.value;
                setV((s) => ({ ...s, unitId, equipmentClass: classForUnit(unitId) || s.equipmentClass }));
              }}
            />
          </Field>
        </Box>
        <Box xcss={xcss({ width: '170px' })}>
          <Field id="hb-class" label="Class">
            <Select inputId="hb-class" options={classOptions} value={pick(classOptions, v.equipmentClass)} onChange={(o) => set('equipmentClass', o && o.value)} />
          </Field>
        </Box>
        <Box xcss={xcss({ width: '230px' })}>
          <Field id="hb-cause" label="Cause code">
            <Select inputId="hb-cause" options={causeOptions} value={pick(causeOptions, v.causeCode)} onChange={(o) => set('causeCode', o && o.value)} />
          </Field>
        </Box>
        <Box xcss={xcss({ width: '120px' })}>
          <Field id="hb-shift" label="Crew">
            <Select inputId="hb-shift" options={shiftOptions} value={pick(shiftOptions, v.shift)} onChange={(o) => set('shift', o && o.value)} />
          </Field>
        </Box>
      </Inline>
      <Inline space="space.150" shouldWrap alignBlock="end">
        <Box xcss={xcss({ width: '200px' })}>
          <Field id="hb-start" label="Down at (UTC)">
            <Textfield id="hb-start" value={v.startedAt} placeholder="2026-10-03T08:15Z" onChange={(e) => set('startedAt', e.target.value)} />
          </Field>
        </Box>
        <Button spacing="compact" onClick={() => set('startedAt', nowIso())}>Now</Button>
        <Box xcss={xcss({ width: '200px' })}>
          <Field id="hb-end" label="Back in service (UTC)">
            <Textfield id="hb-end" value={v.endedAt} placeholder="empty = still down" onChange={(e) => set('endedAt', e.target.value)} />
          </Field>
        </Box>
        <Button spacing="compact" onClick={() => set('endedAt', nowIso())}>Now</Button>
      </Inline>
      <Field id="hb-safety" label="Safety note (optional)">
        <Textfield id="hb-safety" value={v.safetyNote} maxLength={500} placeholder="e.g. Isolation tag on hydraulic pump, do not start" onChange={(e) => set('safetyNote', e.target.value)} />
      </Field>
      {errors.length ? (
        <SectionMessage appearance="error" title="Not saved">
          {errors.map((er) => (
            <Text key={er}>{er}</Text>
          ))}
        </SectionMessage>
      ) : null}
      <ButtonGroup>
        <Button appearance="primary" onClick={save} isDisabled={busy}>
          {busy ? 'Saving...' : 'Save downtime details'}
        </Button>
        {onCancel ? <Button appearance="subtle" onClick={onCancel}>Cancel</Button> : null}
      </ButtonGroup>
    </Stack>
  );
};

const App = () => {
  const [state, setState] = useState({ loading: true });
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    setState({ loading: true });
    const res = await invoke('getIssueInsight');
    setState(res.ok ? { loading: false, data: res.data } : { loading: false, error: res.error });
  };
  useEffect(() => {
    load();
  }, []);

  if (state.loading) return <Spinner label="Loading unit history" />;
  if (state.error)
    return (
      <SectionMessage appearance="error" title="Haulboard could not load">
        <Text>{state.error}</Text>
      </SectionMessage>
    );

  const d = state.data;
  const t = d.target;
  const initial = {
    unitId: t.unitId || '',
    equipmentClass: t.equipmentClass || null,
    causeCode: t.causeCode || null,
    shift: t.shift || null,
    startedAt: toInput(t.source !== 'none' ? t.start : null),
    endedAt: toInput(t.source !== 'none' ? t.end : null),
    safetyNote: t.safetyNote || '',
  };
  const onSaved = (warning) => {
    setEditing(false);
    setNotice(warning || 'Downtime details saved.');
    load();
  };

  if (!d.hasDetails || editing) {
    return (
      <Stack space="space.200">
        {!d.hasDetails ? (
          <SectionMessage appearance="information" title="Log this as an equipment downtime event">
            <Text>Fill in the unit and cause. Haulboard stores them on the issue (searchable in JQL as hbUnit, hbCause, hbShift, hbStart, hbEnd) and adds the "downtime" label.</Text>
          </SectionMessage>
        ) : null}
        <DetailsForm initial={initial} onSaved={onSaved} onCancel={d.hasDetails ? () => setEditing(false) : null} />
      </Stack>
    );
  }

  const r = d.reliability;
  const histHead = { cells: ['Issue', 'Cause', 'Crew', 'Down at', 'Duration', 'Status'].map((c) => ({ key: c, content: c })) };
  const histRows = d.history.map((h) => ({
    key: h.key,
    cells: [
      { key: 'k', content: issueLink(h.key) },
      { key: 'c', content: `${h.causeCode || '-'} ${causeLabel(h.causeCode)}` },
      { key: 's', content: h.shift || '-' },
      { key: 't', content: fmtTime(h.start) },
      { key: 'h', content: fmtHours(h.hours) },
      { key: 'o', content: h.open ? <Lozenge appearance="removed">down</Lozenge> : <Lozenge appearance="success">closed</Lozenge> },
    ],
  }));
  const simHead = { cells: ['Issue', 'Unit', 'Cause', 'Down at', 'Duration', 'Summary'].map((c) => ({ key: c, content: c })) };
  const simRows = d.similar.map((s) => ({
    key: s.key,
    cells: [
      { key: 'k', content: issueLink(s.key) },
      { key: 'u', content: s.sameUnit ? <Text weight="bold">{s.unitId}</Text> : s.unitId },
      { key: 'c', content: s.causeCode || '-' },
      { key: 't', content: fmtTime(s.start) },
      { key: 'h', content: fmtHours(s.hours) },
      { key: 'm', content: s.summary },
    ],
  }));

  return (
    <Stack space="space.200">
      {notice ? (
        <SectionMessage appearance="success">
          <Text>{notice}</Text>
        </SectionMessage>
      ) : null}
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Heading size="small">{t.unitId}</Heading>
        <Lozenge>{classLabel(t.equipmentClass)}</Lozenge>
        <Lozenge appearance="moved">{`${t.causeCode || '?'} ${causeLabel(t.causeCode)}`}</Lozenge>
        <Lozenge>{`Crew ${t.shift || '?'}`}</Lozenge>
        {t.open ? <Lozenge appearance="removed" isBold>still down</Lozenge> : <Lozenge appearance="success">back in service</Lozenge>}
        <Button spacing="compact" appearance="subtle" onClick={() => setEditing(true)}>Edit details</Button>
      </Inline>
      <Text size="small" color="color.text.subtle">
        {`Down at ${fmtTime(t.start)}${t.end ? `, back ${fmtTime(t.end)}` : ''}.${t.source === 'labels' ? ' (Read from hb-* labels.)' : ''}`}
      </Text>
      {t.safetyNote ? (
        <SectionMessage appearance="warning" title="Safety note">
          <Text>{t.safetyNote}</Text>
        </SectionMessage>
      ) : null}
      {d.recurring && d.recurring.isRecurring ? (
        <SectionMessage appearance="error" title={`Recurring failure: ${d.recurring.count}x ${causeLabel(d.recurring.causeCode)} in ${d.recurring.days} days`}>
          <Text>{`Related: ${d.recurring.keys.join(', ')}. Ask the Shift Supervisor Assistant to flag it, or review root cause before release.`}</Text>
        </SectionMessage>
      ) : null}
      {r ? (
        <Text>
          {`Last 90 days for ${t.unitId}: ${r.failures} failure(s), downtime ${fmtHours(r.downtimeHours)}, MTBF ${fmtHours(r.mtbfHours)}, MTTR ${fmtHours(r.mttrHours)}, availability ${fmtPct(r.availabilityPct)}.`}
        </Text>
      ) : null}
      <Heading size="xsmall">Failure history for this unit</Heading>
      <DynamicTable head={histHead} rows={histRows} rowsPerPage={5} emptyView={<Text>No other events for this unit.</Text>} />
      <Heading size="xsmall">Similar past events</Heading>
      <DynamicTable head={simHead} rows={simRows} emptyView={<Text>No similar events found.</Text>} />
      {d.truncated ? <Text size="small">Only the newest 1000 downtime issues were searched.</Text> : null}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
