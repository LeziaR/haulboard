// Shared vocabulary for Haulboard. All values are generic industry terms;
// nothing here is tied to any real site or operator.

export const PROPERTY_KEY = 'haulboard_downtime';
export const DOWNTIME_LABEL = 'downtime';
export const RECURRING_LABEL = 'hb-recurring-failure';
export const SAMPLE_LABEL = 'hb-sample';
export const SCHEMA_VERSION = 1;

export const HOUR_MS = 3600 * 1000;
export const DAY_MS = 24 * HOUR_MS;

// Equipment classes. `criticality` weights handover priority: a stopped
// loading unit (excavator) idles every truck assigned to it, so it outranks
// a single haul truck.
export const EQUIPMENT_CLASSES = {
  'haul-truck': { label: 'Haul truck', prefix: 'HT', criticality: 1 },
  excavator: { label: 'Excavator', prefix: 'EX', criticality: 3 },
  drill: { label: 'Drill', prefix: 'DR', criticality: 2 },
  dozer: { label: 'Dozer', prefix: 'DZ', criticality: 1.5 },
};

// Cause codes. `category` decides how an event counts:
//   unplanned   -> a failure: counts in MTBF/MTTR and in availability
//   planned     -> planned maintenance: counts in availability only
//   operational -> not an equipment fault (no operator, weather, blasting):
//                  reported as downtime but excluded from availability,
//                  MTBF and MTTR.
export const CAUSE_CODES = {
  ENG: { label: 'Engine', category: 'unplanned' },
  HYD: { label: 'Hydraulics', category: 'unplanned' },
  ELE: { label: 'Electrical', category: 'unplanned' },
  TRN: { label: 'Transmission / drivetrain', category: 'unplanned' },
  BRK: { label: 'Brakes', category: 'unplanned' },
  TYR: { label: 'Tyres / undercarriage', category: 'unplanned' },
  GET: { label: 'Ground engaging tools', category: 'unplanned' },
  STR: { label: 'Structural / damage', category: 'unplanned' },
  PM: { label: 'Planned maintenance', category: 'planned' },
  OPS: { label: 'Operational delay', category: 'operational' },
  WX: { label: 'Weather', category: 'operational' },
  SAF: { label: 'Safety stop', category: 'operational' },
};

export const SHIFTS = ['A', 'B', 'C', 'D'];

export function classForUnit(unitId) {
  if (!unitId) return null;
  const prefix = String(unitId).toUpperCase().split('-')[0];
  const hit = Object.entries(EQUIPMENT_CLASSES).find(([, v]) => v.prefix === prefix);
  return hit ? hit[0] : null;
}

export function causeCategory(code) {
  return CAUSE_CODES[code] ? CAUSE_CODES[code].category : 'unplanned';
}

export function classLabel(cls) {
  return EQUIPMENT_CLASSES[cls] ? EQUIPMENT_CLASSES[cls].label : 'Unclassified';
}

export function causeLabel(code) {
  return CAUSE_CODES[code] ? CAUSE_CODES[code].label : code || 'Unknown';
}
