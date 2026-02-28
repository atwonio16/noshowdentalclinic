import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import { DateTime } from 'luxon';
import { createSupabaseAuthClient } from '../db/supabase';
import { clearSessionCookies, setSessionCookies } from '../auth/session';
import { getManagerUserByAuthId } from '../db/users';
import { dayAfterTomorrowLocal, dayRangeUtc } from '../utils/datetime';
import { countAppointmentsByStatus, getAppointmentById, getAppointmentsInRange, setAppointmentStatus } from '../db/appointments';
import { getClinicById, updateClinicSettings } from '../db/clinics';
import {
  renderAppointmentsPage,
  renderDashboardPage,
  renderImportPage,
  renderLoginPage,
  renderSettingsPage,
  renderTokenNeutralPage,
  renderTokenSuccessPage
} from '../views/pages';
import { requireClinicOwnership, requireManagerAuth } from '../auth/middleware';
import { importCsvSnapshot } from './csvImportService';
import { findTokenWithAppointment, markAllTokensUsedForAppointment } from '../db/tokens';
import { validateTokenRecord } from '../utils/tokenValidation';
import { notifyClinicForPatientCancellation, sendConfirmedAckIfEnabled } from '../jobs/confirmorJobs';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

function csrfToken(req: Request): string {
  const maybeFn = (req as Request & { csrfToken?: () => string }).csrfToken;
  if (typeof maybeFn === 'function') {
    return maybeFn();
  }
  return '';
}

function parseHour(input: unknown): number {
  const hour = Number(input);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('Hour must be an integer between 0 and 23');
  }
  return hour;
}

function badRequest(res: Response, message: string): void {
  res.status(400).send(renderTokenNeutralPage(message));
}

function formatImportMessage(summary: {
  totalRows: number;
  upsertedRows: number;
  canceledMissingCount: number;
}): string {
  return `Import OK. Rows: ${summary.totalRows}, upserted: ${summary.upsertedRows}, missing->canceled_by_patient: ${summary.canceledMissingCount}`;
}

async function handleCsvImportRequest(req: Request, res: Response): Promise<void> {
  const auth = req.authContext;
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'Missing file in multipart field "file"' });
    return;
  }

  const csvContent = req.file.buffer.toString('utf8');
  const summary = await importCsvSnapshot({
    clinic: auth.clinic,
    csvContent
  });

  res.status(200).json({
    ok: true,
    summary
  });
}

async function tokenAction(req: Request, res: Response, expectedPurpose: 'confirm' | 'cancel'): Promise<void> {
  const tokenValue = req.params.token;
  if (!tokenValue) {
    badRequest(res, 'Link invalid.');
    return;
  }

  const token = await findTokenWithAppointment(tokenValue);
  if (!token || !token.appointments) {
    res.status(200).send(renderTokenNeutralPage('Link invalid sau expirat.'));
    return;
  }

  const validation = validateTokenRecord({
    purpose: token.purpose,
    expectedPurpose,
    expiresAt: token.expires_at,
    usedAt: token.used_at
  });

  if (!validation.ok) {
    res.status(200).send(renderTokenNeutralPage('Link invalid, expirat sau deja folosit.'));
    return;
  }

  const clinic = await getClinicById(token.appointments.clinic_id);
  if (!clinic) {
    res.status(404).send(renderTokenNeutralPage('Clinica nu a fost gasita.'));
    return;
  }

  if (expectedPurpose === 'confirm') {
    const updated = await setAppointmentStatus(token.appointment_id, 'confirmed', ['pending']);
    if (!updated) {
      const current = await getAppointmentById(token.appointment_id);
      if (current?.status === 'confirmed') {
        await markAllTokensUsedForAppointment(token.appointment_id);
        res.status(200).send(renderTokenSuccessPage('Programarea este deja confirmata.'));
        return;
      }

      res.status(200).send(renderTokenNeutralPage('Programarea nu mai poate fi confirmata.'));
      return;
    }

    await markAllTokensUsedForAppointment(token.appointment_id);
    await sendConfirmedAckIfEnabled({ clinic, appointment: updated });

    res.status(200).send(renderTokenSuccessPage('Programarea a fost confirmata cu succes.'));
    return;
  }

  const canceled = await setAppointmentStatus(token.appointment_id, 'canceled_by_patient', ['pending', 'confirmed']);
  if (!canceled) {
    res.status(200).send(renderTokenNeutralPage('Programarea nu mai poate fi anulata.'));
    return;
  }

  await markAllTokensUsedForAppointment(token.appointment_id);
  await notifyClinicForPatientCancellation({ clinic, appointment: canceled });
  res.status(200).send(renderTokenSuccessPage('Programarea a fost anulata.'));
}

export function buildRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  router.get('/login', (req, res) => {
    const error = typeof req.query.error === 'string' ? req.query.error : undefined;
    res.status(200).send(renderLoginPage({ csrfToken: csrfToken(req), error }));
  });

  router.post('/login', async (req, res, next) => {
    try {
      const email = String(req.body.email ?? '').trim();
      const password = String(req.body.password ?? '').trim();

      if (!email || !password) {
        res.status(400).send(renderLoginPage({ csrfToken: csrfToken(req), error: 'Email si parola obligatorii.' }));
        return;
      }

      const authClient = createSupabaseAuthClient();
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });

      if (error || !data.session || !data.user) {
        res.status(401).send(renderLoginPage({ csrfToken: csrfToken(req), error: 'Credentiale invalide.' }));
        return;
      }

      const manager = await getManagerUserByAuthId(data.user.id);
      if (!manager) {
        clearSessionCookies(res);
        res.status(403).send(renderLoginPage({ csrfToken: csrfToken(req), error: 'Cont fara clinica asociata.' }));
        return;
      }

      setSessionCookies(res, data.session);
      res.redirect('/dashboard');
    } catch (error) {
      next(error);
    }
  });

  router.get('/logout', (_req, res) => {
    clearSessionCookies(res);
    res.redirect('/login');
  });

  router.get('/c/:token', async (req, res, next) => {
    try {
      await tokenAction(req, res, 'confirm');
    } catch (error) {
      next(error);
    }
  });

  router.get('/x/:token', async (req, res, next) => {
    try {
      await tokenAction(req, res, 'cancel');
    } catch (error) {
      next(error);
    }
  });

  const authRouter = Router();
  authRouter.use(requireManagerAuth);

  authRouter.get('/dashboard', async (req, res, next) => {
    try {
      const clinic = req.authContext!.clinic;
      const dayLocal = dayAfterTomorrowLocal(clinic.timezone);
      const range = dayRangeUtc(dayLocal);

      const counts = await countAppointmentsByStatus(clinic.id, range.startUtcIso, range.endUtcIso);

      res.status(200).send(
        renderDashboardPage({
          clinic,
          dayKey: dayLocal.toFormat('yyyy-MM-dd'),
          counts
        })
      );
    } catch (error) {
      next(error);
    }
  });

  authRouter.get('/dashboard/import', (req, res) => {
    const clinic = req.authContext!.clinic;
    const message = typeof req.query.message === 'string' ? req.query.message : undefined;
    const error = typeof req.query.error === 'string' ? req.query.error : undefined;

    res.status(200).send(
      renderImportPage({
        clinic,
        csrfToken: csrfToken(req),
        message,
        error
      })
    );
  });

  authRouter.post('/dashboard/import', upload.single('file'), async (req, res, next) => {
    try {
      const auth = req.authContext!;
      if (!req.file) {
        res.redirect('/dashboard/import?error=Missing%20file');
        return;
      }

      const csvContent = req.file.buffer.toString('utf8');
      const summary = await importCsvSnapshot({
        clinic: auth.clinic,
        csvContent
      });

      res.redirect(`/dashboard/import?message=${encodeURIComponent(formatImportMessage(summary))}`);
    } catch (error) {
      next(error);
    }
  });

  authRouter.get('/dashboard/appointments', async (req, res, next) => {
    try {
      const clinic = req.authContext!.clinic;
      const requestedDay = typeof req.query.day === 'string' ? req.query.day : '';

      const dayLocal = requestedDay
        ? DateTime.fromISO(requestedDay, { zone: clinic.timezone }).startOf('day')
        : dayAfterTomorrowLocal(clinic.timezone);

      if (!dayLocal.isValid) {
        res.status(400).send(renderTokenNeutralPage('Invalid day parameter. Use YYYY-MM-DD.'));
        return;
      }

      const range = dayRangeUtc(dayLocal);
      const appointments = await getAppointmentsInRange(clinic.id, range.startUtcIso, range.endUtcIso);

      res.status(200).send(
        renderAppointmentsPage({
          clinic,
          day: dayLocal.toFormat('yyyy-MM-dd'),
          appointments
        })
      );
    } catch (error) {
      next(error);
    }
  });

  authRouter.get('/dashboard/settings', (req, res) => {
    const clinic = req.authContext!.clinic;
    const message = typeof req.query.message === 'string' ? req.query.message : undefined;
    const error = typeof req.query.error === 'string' ? req.query.error : undefined;

    res.status(200).send(
      renderSettingsPage({
        clinic,
        csrfToken: csrfToken(req),
        message,
        error
      })
    );
  });

  authRouter.post('/dashboard/settings', async (req, res, next) => {
    try {
      const auth = req.authContext!;

      const name = String(req.body.name ?? '').trim();
      const timezone = String(req.body.timezone ?? '').trim();
      const exportHour = parseHour(req.body.export_hour);
      const deadlineHour = parseHour(req.body.deadline_hour);

      if (!name || !timezone) {
        res.redirect('/dashboard/settings?error=Name%20and%20timezone%20are%20required');
        return;
      }

      const updatedClinic = await updateClinicSettings({
        clinicId: auth.clinic.id,
        name,
        timezone,
        exportHour,
        deadlineHour
      });

      req.authContext = {
        ...auth,
        clinic: updatedClinic
      };

      res.redirect('/dashboard/settings?message=Settings%20updated');
    } catch (error) {
      next(error);
    }
  });

  authRouter.post(
    '/api/clinics/:clinicId/csv-import',
    requireClinicOwnership,
    upload.single('file'),
    async (req, res, next) => {
      try {
        await handleCsvImportRequest(req, res);
      } catch (error) {
        next(error);
      }
    }
  );

  router.use(authRouter);

  router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unexpected error';

    if (req.path.startsWith('/api/')) {
      res.status(500).json({ error: message });
      return;
    }

    res.status(500).send(renderTokenNeutralPage(`Eroare: ${message}`));
  });

  return router;
}
