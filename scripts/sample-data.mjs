// Deterministic, clearly fictional sample downtime events for demos.
// Fleet, site and events are invented. Same seed + same asOf = same data.
//
// Planted patterns so the demo has something to find:
//   HT-104 hoist-cylinder hydraulics, 4 events in ~25 days (recurring)
//   EX-02  ground engaging tools, 3 events (recurring)
//   DR-01  electrical, 3 events (recurring)
//   ~8 events still open at seed time, including a safety-noted excavator.

export const SAMPLE_SITE = 'Example Pit North (fictional)';
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const CREWS = ['A', 'B', 'C', 'D'];

export const FLEET = [
  ...Array.from({ length: 12 }, (_, i) => ({ unitId: `HT-${101 + i}`, equipmentClass: 'haul-truck' })),
  ...[1, 2, 3].map((n) => ({ unitId: `EX-0${n}`, equipmentClass: 'excavator' })),
  ...[1, 2, 3].map((n) => ({ unitId: `DR-0${n}`, equipmentClass: 'drill' })),
  ...[1, 2].map((n) => ({ unitId: `DZ-0${n}`, equipmentClass: 'dozer' })),
];

// cause -> [minHours, maxHours, summaries per class]
const CAUSES = {
  ENG: [6, 30, { 'haul-truck': ['Engine overheating alarm', 'Low engine oil pressure warning'], excavator: ['Engine derate - high exhaust temperature'], drill: ['Compressor engine will not start'], dozer: ['Engine coolant leak'] }],
  HYD: [2, 10, { 'haul-truck': ['Hoist cylinder leak'], excavator: ['Main pump pressure loss', 'Boom cylinder hose burst'], drill: ['Feed cylinder hose leak'], dozer: ['Blade lift cylinder leak'] }],
  ELE: [1, 6, { 'haul-truck': ['Alternator fault code', 'Payload system sensor fault'], excavator: ['Swing motor contactor fault'], drill: ['Rotation motor electrical fault', 'Drill PLC communication loss'], dozer: ['Starter motor failure'] }],
  TRN: [8, 36, { 'haul-truck': ['Transmission slipping in 3rd gear'], dozer: ['Final drive noise - inspection'] }],
  BRK: [2, 6, { 'haul-truck': ['Service brake temperature alarm', 'Retarder fault'] }],
  TYR: [3, 8, { 'haul-truck': ['Front left tyre cut - change out', 'Rear tyre low pressure'], dozer: ['Track tension adjustment / undercarriage'] }],
  GET: [1, 4, { excavator: ['Bucket tooth lost - GET change', 'Bucket lip shroud worn through'] }],
  STR: [12, 48, { 'haul-truck': ['Tray liner crack - welding repair'], excavator: ['Stick crack found on inspection'] }],
  PM: [8, 12, { 'haul-truck': ['500 h service'], excavator: ['1000 h service'], drill: ['250 h service'], dozer: ['500 h service'] }],
  OPS: [0.5, 2, { 'haul-truck': ['No operator available at shift start', 'Waiting at crusher - queue'], excavator: ['Waiting on blast clearance'], drill: ['Pattern not surveyed - waiting'] }],
  WX: [2, 6, { 'haul-truck': ['Dust storm - visibility stop'], drill: ['High wind - mast lowered'] }],
  SAF: [0.5, 2, { 'haul-truck': ['Berm height below standard - stopped by supervisor'], dozer: ['Edge protection inspection - stopped'] }],
};

const CLASS_CAUSES = {
  'haul-truck': ['TYR', 'BRK', 'ENG', 'TRN', 'ELE', 'PM', 'OPS', 'WX', 'STR'],
  excavator: ['HYD', 'ELE', 'ENG', 'PM', 'OPS'],
  drill: ['HYD', 'ENG', 'PM', 'WX', 'OPS'],
  dozer: ['TRN', 'TYR', 'HYD', 'PM', 'SAF'],
};

export function causeCodesUsed() {
  return Object.keys(CAUSES);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fictional 4-crew rotation: consecutive 12 h blocks (06:00/18:00 UTC)
// cycle A, B, C, D.
export function crewAt(ms) {
  const block = Math.floor((ms - 6 * HOUR) / (12 * HOUR));
  return CREWS[((block % 4) + 4) % 4];
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const roundTo = (ms, minutes) => Math.round(ms / (minutes * 60000)) * minutes * 60000;

export function generateSampleEvents({ asOf = Date.now(), seed = 20261222, count = 60 } = {}) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (lo, hi) => lo + rnd() * (hi - lo);
  const unitClass = (id) => FLEET.find((u) => u.unitId === id).equipmentClass;
  const base = roundTo(asOf, 15);
  const events = [];

  const add = (unitId, causeCode, startMs, hours, opts = {}) => {
    const cls = unitClass(unitId);
    const start = roundTo(startMs, 15);
    const end = opts.open ? null : roundTo(start + hours * HOUR, 15);
    const summaries = CAUSES[causeCode][2][cls] || ['Unspecified fault'];
    events.push({
      unitId,
      equipmentClass: cls,
      causeCode,
      shift: crewAt(start),
      startedAt: iso(start),
      endedAt: end === null ? null : iso(end),
      safetyNote: opts.safetyNote || '',
      summary: `${unitId} - ${opts.summary || pick(summaries)}`,
    });
  };

  // A unit cannot be down twice at the same time; keep a 1 h gap.
  const overlapsExisting = (unitId, s, t) =>
    events.some((e) => {
      if (e.unitId !== unitId) return false;
      const es = Date.parse(e.startedAt);
      const et = e.endedAt ? Date.parse(e.endedAt) : base;
      return s < et + HOUR && t > es - HOUR;
    });

  // Planted recurring patterns.
  [25, 17, 9, 2].forEach((d, i) => add('HT-104', 'HYD', base - d * DAY - between(0, 10) * HOUR, between(2, 6), i === 3 ? { summary: 'Hoist cylinder leaking again' } : {}));
  [21, 12, 4].forEach((d) => add('EX-02', 'GET', base - d * DAY - between(0, 10) * HOUR, between(1, 3)));
  [19, 11, 6].forEach((d) => add('DR-01', 'ELE', base - d * DAY - between(0, 10) * HOUR, between(1, 4)));

  // Currently open events (started within the last 30 h).
  add('EX-01', 'HYD', base - 9 * HOUR, 0, { open: true, summary: 'Main pump pressure loss', safetyNote: 'Isolation lock on main hydraulic pump - do not start until released by maintenance' });
  add('HT-107', 'TYR', base - 5 * HOUR, 0, { open: true, safetyNote: 'Damaged tyre - keep 50 m exclusion zone until deflated' });
  add('HT-110', 'ENG', base - 27 * HOUR, 0, { open: true });
  add('DR-03', 'HYD', base - 14 * HOUR, 0, { open: true });
  add('DZ-02', 'TRN', base - 20 * HOUR, 0, { open: true });
  add('HT-102', 'BRK', base - 3 * HOUR, 0, { open: true });
  add('HT-112', 'PM', base - 6 * HOUR, 0, { open: true });
  add('HT-104', 'HYD', base - 2 * HOUR, 0, { open: true, summary: 'Hoist cylinder leak - repeat failure' });

  // Background events spread over the last 45 days.
  while (events.length < count) {
    const unit = pick(FLEET);
    const causeCode = pick(CLASS_CAUSES[unit.equipmentClass]);
    if (unit.unitId === 'HT-104' && causeCode === 'HYD') continue;
    const [lo, hi] = CAUSES[causeCode];
    const hours = between(lo, hi);
    const start = base - between(1.5, 45) * DAY;
    if (start + hours * HOUR > base - HOUR) continue;
    if (overlapsExisting(unit.unitId, start, start + hours * HOUR)) continue;
    add(unit.unitId, causeCode, start, hours, causeCode === 'SAF' ? { safetyNote: 'Stopped for edge protection check - cleared after inspection' } : {});
  }

  return events.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

// Jira bulk-create payload for one event.
export function toIssueUpdate(e, { projectKey, issueTypeId }) {
  const text = [
    `FICTIONAL SAMPLE DATA generated by the Haulboard seed script for ${SAMPLE_SITE}.`,
    `Unit ${e.unitId} (${e.equipmentClass}), cause ${e.causeCode}, crew ${e.shift}.`,
    `Down at ${e.startedAt}${e.endedAt ? `, back in service ${e.endedAt}` : ', still down'}.`,
    e.safetyNote ? `Safety: ${e.safetyNote}` : '',
  ].filter(Boolean);
  return {
    fields: {
      project: { key: projectKey },
      issuetype: { id: issueTypeId },
      summary: e.summary,
      labels: ['downtime', 'hb-sample', `hb-unit-${e.unitId}`, `hb-cause-${e.causeCode}`, `hb-shift-${e.shift}`],
      description: { type: 'doc', version: 1, content: text.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) },
    },
    properties: [
      {
        key: 'haulboard_downtime',
        value: {
          schemaVersion: 1,
          unitId: e.unitId,
          equipmentClass: e.equipmentClass,
          causeCode: e.causeCode,
          shift: e.shift,
          startedAt: e.startedAt,
          endedAt: e.endedAt,
          safetyNote: e.safetyNote,
        },
      },
    ],
  };
}
