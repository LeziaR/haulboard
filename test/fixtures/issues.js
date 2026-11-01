// Hand-built fixture issues with hand-calculated expected metrics.
// Fictional project MINE, fictional units. asOf = 2026-11-01T00:00:00Z.
//
// 10-day window: 2026-10-22T00:00Z .. 2026-11-01T00:00Z  (W = 240 h per unit)
//
// HT-101  a HYD 6h, b HYD 4h, c PM 10h, d OPS 2h, e HYD open 4h
//         loss 24 h -> uptime 216, failures 3, MTBF 72, MTTR 5, avail 90 %
// EX-01   f GET starts before window (2 h inside), g ENG 12h, h ELE 2h inside g,
//         l HYD open 2h (safety note)
//         loss 2+12+2 = 16 -> uptime 224, failures 3, MTBF 74.7, MTTR 7, avail 93.3 %
// DR-01   i ELE 3h, label convention only -> MTBF 237, MTTR 3, avail 98.75 %
// DZ-01   j TRN outside window -> 0 failures, avail 100 %
// k       labelled downtime, no unit -> unclassified

export const AS_OF = Date.parse('2026-11-01T00:00:00Z');

const done = { name: 'Done', statusCategory: { key: 'done' } };
const todo = { name: 'In Progress', statusCategory: { key: 'indeterminate' } };

function issue(key, summary, prop, { status = done, labels = ['downtime'], created, resolutiondate } = {}) {
  return {
    id: String(10000 + parseInt(key.split('-')[1], 10)),
    key,
    fields: {
      summary,
      status,
      labels,
      created: created || '2026-10-01T00:00:00.000+0000',
      updated: '2026-11-01T00:00:00.000+0000',
      resolutiondate: resolutiondate || null,
    },
    properties: prop ? { haulboard_downtime: prop } : {},
  };
}

const p = (unitId, causeCode, shift, startedAt, endedAt = null, extra = {}) => ({
  schemaVersion: 1,
  unitId,
  causeCode,
  shift,
  startedAt,
  endedAt,
  ...extra,
});

export const fixtureIssues = [
  issue('MINE-1', 'Hoist cylinder leak', p('HT-101', 'HYD', 'A', '2026-10-23T00:00:00Z', '2026-10-23T06:00:00Z', { equipmentClass: 'haul-truck' })),
  issue('MINE-2', 'Hoist cylinder seal leak', p('HT-101', 'HYD', 'B', '2026-10-25T00:00:00Z', '2026-10-25T04:00:00Z')),
  issue('MINE-3', '500 h service', p('HT-101', 'PM', 'C', '2026-10-27T00:00:00Z', '2026-10-27T10:00:00Z')),
  issue('MINE-4', 'No operator at shift start', p('HT-101', 'OPS', 'D', '2026-10-28T00:00:00Z', '2026-10-28T02:00:00Z')),
  issue('MINE-5', 'Hoist cylinder leaking again', p('HT-101', 'HYD', 'B', '2026-10-31T20:00:00Z'), { status: todo }),
  issue('MINE-6', 'Bucket tooth lost', p('EX-01', 'GET', 'A', '2026-10-21T20:00:00Z', '2026-10-22T02:00:00Z')),
  issue('MINE-7', 'Engine overheating alarm', p('EX-01', 'ENG', 'A', '2026-10-24T00:00:00Z', '2026-10-24T12:00:00Z')),
  issue('MINE-8', 'Alternator fault code', p('EX-01', 'ELE', 'B', '2026-10-24T06:00:00Z', '2026-10-24T08:00:00Z')),
  issue(
    'MINE-12',
    'Main pump pressure loss',
    p('EX-01', 'HYD', 'C', '2026-10-31T22:00:00Z', null, { safetyNote: 'Isolation lock on main pump - do not start' }),
    { status: todo },
  ),
  issue('MINE-9', 'Drill rotation motor fault', null, {
    labels: ['downtime', 'hb-unit-DR-01', 'hb-cause-ELE', 'hb-shift-C'],
    created: '2026-10-29T00:00:00.000+0000',
    resolutiondate: '2026-10-29T03:00:00.000+0000',
  }),
  issue('MINE-10', 'Final drive noise', p('DZ-01', 'TRN', 'D', '2026-10-10T00:00:00Z', '2026-10-11T00:00:00Z')),
  issue('MINE-11', 'Something broke, details to follow', null, { status: todo }),
];
