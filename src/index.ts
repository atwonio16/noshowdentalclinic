import app from './app';
import { env } from './config/env';
import { startScheduler } from './jobs/scheduler';
import { logInfo } from './utils/logger';

app.listen(env.PORT, () => {
  logInfo(`Confirmor listening on port ${env.PORT}`);
});

if (!env.DISABLE_SCHEDULER) {
  startScheduler();
} else {
  logInfo('Scheduler disabled by env flag');
}