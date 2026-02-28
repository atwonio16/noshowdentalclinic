import type { AppointmentRow, ClinicRow } from '../types/domain';
import { escapeHtml } from '../utils/html';
import { formatDateForRo, formatTimeForRo } from '../utils/datetime';

function navigation(clinicId: string): string {
  return `
    <nav style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;">
      <a href="/dashboard">Dashboard</a>
      <a href="/dashboard/import">Import CSV</a>
      <a href="/dashboard/appointments">Appointments</a>
      <a href="/dashboard/settings">Settings</a>
      <a href="/logout">Logout</a>
      <span style="color:#666">Clinic ID: ${escapeHtml(clinicId)}</span>
    </nav>
  `;
}

function renderLayout(input: { title: string; body: string; clinic?: ClinicRow }): string {
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)} - Confirmor</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; margin: 24px; color: #222; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    input, select, button { padding: 8px; margin: 4px 0; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .muted { color: #666; }
    .ok { color: #0a7d30; }
    .error { color: #b00020; }
    .counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
    .count { border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
  </style>
</head>
<body>
  ${input.clinic ? `<h1>${escapeHtml(input.clinic.name)} - Confirmor</h1>${navigation(input.clinic.id)}` : ''}
  ${input.body}
</body>
</html>`;
}

export function renderLoginPage(input: { csrfToken: string; error?: string }): string {
  const body = `
    <h1>Confirmor Login</h1>
    <p class="muted">Acces pentru manager clinica.</p>
    ${input.error ? `<p class="error">${escapeHtml(input.error)}</p>` : ''}
    <form method="post" action="/login">
      <input type="hidden" name="_csrf" value="${escapeHtml(input.csrfToken)}" />
      <div><label>Email<br /><input name="email" type="email" required /></label></div>
      <div><label>Parola<br /><input name="password" type="password" required /></label></div>
      <button type="submit">Login</button>
    </form>
  `;

  return renderLayout({ title: 'Login', body });
}

export function renderDashboardPage(input: {
  clinic: ClinicRow;
  dayKey: string;
  counts: {
    total: number;
    pending: number;
    confirmed: number;
    canceled_by_patient: number;
    canceled_auto: number;
  };
}): string {
  const body = `
    <div class="card">
      <h2>Zi monitorizata (day-after-tomorrow): ${escapeHtml(input.dayKey)}</h2>
      <p class="muted">Timezone clinica: ${escapeHtml(input.clinic.timezone)}</p>
      <div class="counts">
        <div class="count"><strong>Total</strong><br />${input.counts.total}</div>
        <div class="count"><strong>Pending</strong><br />${input.counts.pending}</div>
        <div class="count"><strong>Confirmed</strong><br />${input.counts.confirmed}</div>
        <div class="count"><strong>Canceled by patient</strong><br />${input.counts.canceled_by_patient}</div>
        <div class="count"><strong>Canceled auto</strong><br />${input.counts.canceled_auto}</div>
      </div>
      <p><a href="/dashboard/appointments?day=${escapeHtml(input.dayKey)}">Vezi lista de programari</a></p>
    </div>
  `;

  return renderLayout({ title: 'Dashboard', body, clinic: input.clinic });
}

export function renderImportPage(input: {
  clinic: ClinicRow;
  csrfToken: string;
  message?: string;
  error?: string;
}): string {
  const body = `
    <div class="card">
      <h2>Import CSV Snapshot</h2>
      <p class="muted">Accepta doar snapshot pentru urmatoarele 2 zile.</p>
      ${input.message ? `<p class="ok">${escapeHtml(input.message)}</p>` : ''}
      ${input.error ? `<p class="error">${escapeHtml(input.error)}</p>` : ''}
      <form method="post" action="/dashboard/import?_csrf=${encodeURIComponent(input.csrfToken)}" enctype="multipart/form-data">
        <input type="file" name="file" accept=".csv,text/csv" required />
        <button type="submit">Upload</button>
      </form>
      <p class="muted">API endpoint: POST /api/clinics/:clinicId/csv-import (multipart)</p>
    </div>
  `;

  return renderLayout({ title: 'Import', body, clinic: input.clinic });
}

export function renderAppointmentsPage(input: {
  clinic: ClinicRow;
  day: string;
  appointments: AppointmentRow[];
}): string {
  const rows = input.appointments
    .map((appointment) => {
      const date = formatDateForRo(appointment.start_datetime, input.clinic.timezone);
      const time = formatTimeForRo(appointment.start_datetime, input.clinic.timezone);

      return `<tr>
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(time)}</td>
        <td>${escapeHtml(appointment.external_appointment_id)}</td>
        <td>${escapeHtml(appointment.phone)}</td>
        <td>${escapeHtml(appointment.appointment_type)}</td>
        <td>${escapeHtml(appointment.patient_name ?? '-')}</td>
        <td>${escapeHtml(appointment.provider_name ?? '-')}</td>
        <td>${escapeHtml(appointment.status)}</td>
      </tr>`;
    })
    .join('');

  const body = `
    <div class="card">
      <h2>Programari pentru ${escapeHtml(input.day)}</h2>
      <form method="get" action="/dashboard/appointments">
        <label>Zi (YYYY-MM-DD): <input name="day" value="${escapeHtml(input.day)}" required /></label>
        <button type="submit">Filtreaza</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Ora</th>
            <th>External ID</th>
            <th>Telefon</th>
            <th>Tip</th>
            <th>Pacient</th>
            <th>Medic</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="8">Nu exista programari.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  return renderLayout({ title: 'Appointments', body, clinic: input.clinic });
}

export function renderSettingsPage(input: {
  clinic: ClinicRow;
  csrfToken: string;
  message?: string;
  error?: string;
}): string {
  const body = `
    <div class="card">
      <h2>Clinic Settings</h2>
      ${input.message ? `<p class="ok">${escapeHtml(input.message)}</p>` : ''}
      ${input.error ? `<p class="error">${escapeHtml(input.error)}</p>` : ''}
      <form method="post" action="/dashboard/settings">
        <input type="hidden" name="_csrf" value="${escapeHtml(input.csrfToken)}" />
        <div><label>Nume clinica<br /><input name="name" value="${escapeHtml(input.clinic.name)}" required /></label></div>
        <div><label>Timezone<br /><input name="timezone" value="${escapeHtml(input.clinic.timezone)}" required /></label></div>
        <div><label>Export hour (0-23)<br /><input name="export_hour" type="number" min="0" max="23" value="${input.clinic.export_hour}" required /></label></div>
        <div><label>Deadline hour (0-23)<br /><input name="deadline_hour" type="number" min="0" max="23" value="${input.clinic.deadline_hour}" required /></label></div>
        <button type="submit">Save</button>
      </form>
    </div>
  `;

  return renderLayout({ title: 'Settings', body, clinic: input.clinic });
}

export function renderTokenNeutralPage(message: string): string {
  const body = `
    <h1>Confirmor</h1>
    <p>${escapeHtml(message)}</p>
  `;

  return renderLayout({ title: 'Link Status', body });
}

export function renderTokenSuccessPage(message: string): string {
  const body = `
    <h1>Confirmor</h1>
    <p>${escapeHtml(message)}</p>
  `;

  return renderLayout({ title: 'Success', body });
}
