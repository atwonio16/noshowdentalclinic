import { DateTime } from 'luxon';

export function dayRangeUtc(dateLocal: DateTime): { startUtcIso: string; endUtcIso: string } {
  const startLocal = dateLocal.startOf('day');
  const endLocal = startLocal.plus({ days: 1 });

  return {
    startUtcIso: startLocal.toUTC().toISO() ?? new Date(0).toISOString(),
    endUtcIso: endLocal.toUTC().toISO() ?? new Date(0).toISOString()
  };
}

export function dayAfterTomorrowLocal(zone: string, base: DateTime = DateTime.now()): DateTime {
  return base.setZone(zone).startOf('day').plus({ days: 2 });
}

export function tomorrowLocal(zone: string, base: DateTime = DateTime.now()): DateTime {
  return base.setZone(zone).startOf('day').plus({ days: 1 });
}

export function formatDateForRo(dtIso: string, zone: string): string {
  return DateTime.fromISO(dtIso, { zone: 'utc' }).setZone(zone).toFormat('dd.MM.yyyy');
}

export function formatTimeForRo(dtIso: string, zone: string): string {
  return DateTime.fromISO(dtIso, { zone: 'utc' }).setZone(zone).toFormat('HH:mm');
}

export function toLocalDateKey(dtIso: string, zone: string): string {
  return DateTime.fromISO(dtIso, { zone: 'utc' }).setZone(zone).toFormat('yyyy-MM-dd');
}

export function parseCsvDateTimeToUtcIso(value: string, zone: string): string {
  const trimmed = value.trim();
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);

  let dt: DateTime;

  if (hasZone) {
    dt = DateTime.fromISO(trimmed, { setZone: true });
  } else {
    dt = DateTime.fromISO(trimmed, { zone });
    if (!dt.isValid) {
      dt = DateTime.fromFormat(trimmed, 'yyyy-MM-dd HH:mm', { zone });
    }
    if (!dt.isValid) {
      dt = DateTime.fromFormat(trimmed, 'yyyy-MM-dd HH:mm:ss', { zone });
    }
  }

  if (!dt.isValid) {
    throw new Error(`Invalid start_datetime format: ${value}`);
  }

  const utcIso = dt.toUTC().toISO();
  if (!utcIso) {
    throw new Error(`Could not normalize datetime: ${value}`);
  }

  return utcIso;
}