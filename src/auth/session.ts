import type { Request, Response } from 'express';
import type { Session } from '@supabase/supabase-js';
import { env, isProduction } from '../config/env';

export function setSessionCookies(res: Response, session: Session): void {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 14
  };

  res.cookie(env.ACCESS_COOKIE_NAME, session.access_token, cookieOptions);
  res.cookie(env.REFRESH_COOKIE_NAME, session.refresh_token, cookieOptions);
}

export function clearSessionCookies(res: Response): void {
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/'
  };

  res.clearCookie(env.ACCESS_COOKIE_NAME, options);
  res.clearCookie(env.REFRESH_COOKIE_NAME, options);
}

export function getSessionTokens(req: Request): { accessToken?: string; refreshToken?: string } {
  const accessToken = req.cookies?.[env.ACCESS_COOKIE_NAME] as string | undefined;
  const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;

  return { accessToken, refreshToken };
}