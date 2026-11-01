import { classLabel, causeLabel } from './constants.js';

// ISO-style UTC timestamp: 2026-10-03 08:15Z
export function fmtTime(ms) {
  if (ms === null || ms === undefined) return '-';
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

export function fmtHours(h) {
  if (h === null || h === undefined) return '-';
  return `${Math.round(h * 10) / 10} h`;
}

export function fmtPct(p) {
  if (p === null || p === undefined) return '-';
  return `${Math.round(p * 10) / 10} %`;
}

export { classLabel, causeLabel };
