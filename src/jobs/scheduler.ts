import cron from 'node-cron';
import { DateTime } from 'luxon';
import { listClinics } from '../db/clinics';
import { runAutoCancelJobForClinic, runConfirmRequestJobForClinic } from './confirmorJobs';
import { logError, logInfo } from '../utils/logger';

let schedulerRunning = false;

export async function runSchedulerTick(): Promise<void> {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;

  try {
    const clinics = await listClinics();

    for (const clinic of clinics) {
      const nowLocal = DateTime.now().setZone(clinic.timezone);

      if (nowLocal.hour === clinic.export_hour && nowLocal.minute === 5) {
        logInfo('Running Job A (confirm requests)', { clinicId: clinic.id });
        await runConfirmRequestJobForClinic(clinic);
      }

      if (nowLocal.hour === clinic.deadline_hour && nowLocal.minute === 1) {
        logInfo('Running Job B (auto-cancel)', { clinicId: clinic.id });
        await runAutoCancelJobForClinic(clinic);
      }
    }
  } catch (error) {
    logError('Scheduler tick failed', error);
  } finally {
    schedulerRunning = false;
  }
}

export function startScheduler(): void {
  cron.schedule('* * * * *', async () => {
    await runSchedulerTick();
  });

  logInfo('Scheduler started (minute-level tick)');
}