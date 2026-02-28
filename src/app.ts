import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import express from 'express';
import { env, isProduction } from './config/env';
import { buildRouter } from './api/routes';
import { logInfo } from './utils/logger';

const app = express();

app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser(env.COOKIE_SECRET));

app.use((req, _res, next) => {
  logInfo(`${req.method} ${req.originalUrl}`);
  next();
});

const csrfProtection = csurf({
  cookie: {
    key: 'confirmor_csrf',
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction
  }
}) as unknown as express.RequestHandler;

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }

  csrfProtection(req, res, next);
});

app.use(buildRouter());

export default app;
