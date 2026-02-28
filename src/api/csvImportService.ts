import { parse } from 'csv-parse/sync';
import { DateTime } from 'luxon';
import { markAppointmentsCanceledByPatient, upsertAppointments, getAppointmentsInRange } from '../db/appointments';
import type { AppointmentStatus, ClinicRow } from '../types/domain';
import { parseCsvDateTimeToUtcIso, tomorrowLocal } from '../utils/datetime';
import { normalizeRomanianPhone } from '../utils/phone';

interface CsvImportRow {
  appointment_id: string;
  start_datetime: string;
  phone: string;
  appointment_type: string;
  patient_name?: string;
  provider_name?: string;
  status?: string;
}

export interface CsvImportSummary {
  clinicId: string;
  totalRows: number;
  upsertedRows: number;
  canceledMissingCount: number;
}

const REQUIRED_COLUMNS = ['appointment_id', 'start_datetime', 'phone', 'appointment_type'] as const;

function normalizeHeaderRecord(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[key.trim()] = String(value ?? '').trim();
  }

  return normalized;
}

function getCsvValue(row: Record<string, string>, key: keyof CsvImportRow): string {
  return row[key] ?? '';
}

function mapCsvStatus(raw?: string): AppointmentStatus | undefined {
  if (!raw) {
    return undefined;
  }

  const value = raw.trim().toLowerCase();

  if (['confirmed', 'confirmat'].includes(value)) {
    return 'confirmed';
  }

  if (['canceled', 'cancelled', 'anulat', 'canceled_by_patient'].includes(value)) {
    return 'canceled_by_patient';
  }

  if (['canceled_auto', 'auto_canceled', 'anulat_automat'].includes(value)) {
    return 'canceled_auto';
  }

  if (['pending', 'scheduled', 'programat'].includes(value)) {
    return 'pending';
  }

  return undefined;
}

function deriveStatus(existingStatus: AppointmentStatus | undefined, csvStatus: AppointmentStatus | undefined): AppointmentStatus {
  if (existingStatus === 'confirmed' || existingStatus === 'canceled_auto') {
    return existingStatus;
  }

  if (csvStatus) {
    return csvStatus;
  }

  return 'pending';
}

function rowKey(externalAppointmentId: string, startDatetimeIso: string): string {
  return `${externalAppointmentId}__${startDatetimeIso}`;
}

export async function importCsvSnapshot(params: {
  clinic: ClinicRow;
  csvContent: string;
}): Promise<CsvImportSummary> {
  let parsedHeaders: string[] = [];

  const records = parse(params.csvContent, {
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
    columns: (headers: string[]) => {
      parsedHeaders = headers.map((header) => header.trim());
      return parsedHeaders;
    }
  }) as Record<string, unknown>[];

  const missingColumns = REQUIRED_COLUMNS.filter((column) => !parsedHeaders.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`CSV missing required columns: ${missingColumns.join(', ')}`);
  }

  const todayLocal = DateTime.now().setZone(params.clinic.timezone).startOf('day');
  const snapshotStartLocal = tomorrowLocal(params.clinic.timezone, todayLocal);
  const snapshotEndLocal = snapshotStartLocal.plus({ days: 2 });

  const snapshotRangeStartIso = snapshotStartLocal.toUTC().toISO();
  const snapshotRangeEndIso = snapshotEndLocal.toUTC().toISO();

  if (!snapshotRangeStartIso || !snapshotRangeEndIso) {
    throw new Error('Unable to compute snapshot date range');
  }

  const existingAppointments = await getAppointmentsInRange(
    params.clinic.id,
    snapshotRangeStartIso,
    snapshotRangeEndIso
  );

  const existingByKey = new Map(existingAppointments.map((item) => [rowKey(item.external_appointment_id, item.start_datetime), item]));

  const importedKeys = new Set<string>();
  const upsertRows = [] as Array<{
    clinic_id: string;
    external_appointment_id: string;
    start_datetime: string;
    phone: string;
    appointment_type: string;
    patient_name: string | null;
    provider_name: string | null;
    source: 'csv_upload';
    status: AppointmentStatus;
  }>;

  for (const rawRecord of records) {
    const record = normalizeHeaderRecord(rawRecord);

    const appointmentId = getCsvValue(record, 'appointment_id').trim();
    const startDatetime = getCsvValue(record, 'start_datetime').trim();
    const phone = getCsvValue(record, 'phone').trim();
    const appointmentType = getCsvValue(record, 'appointment_type').trim();

    if (!appointmentId || !startDatetime || !phone || !appointmentType) {
      throw new Error('CSV row has missing required values (appointment_id, start_datetime, phone, appointment_type)');
    }

    const normalizedStartUtcIso = parseCsvDateTimeToUtcIso(startDatetime, params.clinic.timezone);
    const normalizedPhone = normalizeRomanianPhone(phone);
    const key = rowKey(appointmentId, normalizedStartUtcIso);
    const existing = existingByKey.get(key);

    const csvStatus = mapCsvStatus(getCsvValue(record, 'status'));
    const status = deriveStatus(existing?.status, csvStatus);

    importedKeys.add(key);

    upsertRows.push({
      clinic_id: params.clinic.id,
      external_appointment_id: appointmentId,
      start_datetime: normalizedStartUtcIso,
      phone: normalizedPhone,
      appointment_type: appointmentType,
      patient_name: getCsvValue(record, 'patient_name').trim() || null,
      provider_name: getCsvValue(record, 'provider_name').trim() || null,
      source: 'csv_upload',
      status
    });
  }

  await upsertAppointments(upsertRows);

  const missingPendingIds = existingAppointments
    .filter((existing) => !importedKeys.has(rowKey(existing.external_appointment_id, existing.start_datetime)))
    .filter((existing) => existing.status === 'pending')
    .map((existing) => existing.id);

  await markAppointmentsCanceledByPatient(missingPendingIds);

  return {
    clinicId: params.clinic.id,
    totalRows: records.length,
    upsertedRows: upsertRows.length,
    canceledMissingCount: missingPendingIds.length
  };
}
