export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'canceled_by_patient'
  | 'canceled_auto';

export type AppointmentSource = 'csv_upload' | 'email';
export type TokenPurpose = 'confirm' | 'cancel';
export type MessageChannel = 'sms' | 'email';
export type MessageTemplate =
  | 'confirm_request'
  | 'confirmed_ack'
  | 'auto_cancel_notice'
  | 'clinic_cancel_notice';

export interface ClinicRow {
  id: string;
  name: string;
  timezone: string;
  export_hour: number;
  deadline_hour: number;
  created_at: string;
}

export interface UserRow {
  id: string;
  clinic_id: string;
  role: 'manager';
  created_at: string;
}

export interface AppointmentRow {
  id: string;
  clinic_id: string;
  external_appointment_id: string;
  start_datetime: string;
  phone: string;
  appointment_type: string;
  patient_name: string | null;
  provider_name: string | null;
  source: AppointmentSource;
  status: AppointmentStatus;
  created_at: string;
  updated_at: string;
}

export interface TokenRow {
  id: string;
  appointment_id: string;
  token: string;
  purpose: TokenPurpose;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  appointment_id: string;
  channel: MessageChannel;
  template: MessageTemplate;
  to: string;
  sent_at: string;
  provider_message_id: string | null;
  delivery_status: string | null;
  raw: unknown;
}