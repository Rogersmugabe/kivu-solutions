import { BUSINESS_TIME_ZONE } from '@/config';

/** All money is whole Rwandan Francs. */
export function money(value: unknown): string {
  return `${new Intl.NumberFormat('en-RW', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0))} RWF`;
}

export function formatAmount(value: unknown): string {
  return new Intl.NumberFormat('en-RW', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
}

/** Parses user input like "2,000,000" or "2 000" into an integer amount (0 when empty/invalid). */
export function parseMoney(value: unknown): number {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Business day (YYYY-MM-DD) in Rwanda time, whatever the device time zone. */
export function businessDay(value: string | number | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p: Record<string, string> = {};
  for (const part of dayFormatter.formatToParts(d)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

export function minuteOfDay(value: string | number | Date): number {
  const p: Record<string, string> = {};
  for (const part of timeFormatter.formatToParts(new Date(value))) p[part.type] = part.value;
  return Number(p.hour) * 60 + Number(p.minute);
}

export function daysAgo(n: number, from: Date = new Date()): string {
  return businessDay(from.getTime() - n * 86_400_000);
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: BUSINESS_TIME_ZONE });
}

export function formatTime(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIME_ZONE });
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  return `${formatDate(value)}, ${formatTime(value)}`;
}

/** Normalises Rwandan phone numbers to +2507XXXXXXXX. */
export function normalizeRwPhone(value: string): string {
  let p = String(value || '').replace(/[^0-9+]/g, '');
  if (p.startsWith('07')) p = `+250${p.slice(1)}`;
  else if (p.startsWith('250')) p = `+${p}`;
  return p;
}

export const isValidRwPhone = (phone: string) => /^\+2507\d{8}$/.test(phone);

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
