import type { NextFunction, Request, Response } from 'express';
import { getClinicById } from '../db/clinics';
import { getManagerUserByAuthId } from '../db/users';
import { createSupabaseAuthClient } from '../db/supabase';
import { clearSessionCookies, getSessionTokens, setSessionCookies } from './session';

function unauthorized(req: Request, res: Response): void {
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.redirect('/login');
}

export async function requireManagerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { accessToken, refreshToken } = getSessionTokens(req);

    if (!accessToken) {
      unauthorized(req, res);
      return;
    }

    const authClient = createSupabaseAuthClient();
    let currentAccessToken = accessToken;

    let { data: userData, error: userError } = await authClient.auth.getUser(currentAccessToken);

    if (userError && refreshToken) {
      const { data: refreshed, error: refreshError } = await authClient.auth.refreshSession({
        refresh_token: refreshToken
      });

      if (!refreshError && refreshed.session) {
        setSessionCookies(res, refreshed.session);
        currentAccessToken = refreshed.session.access_token;
        const refreshedUser = await authClient.auth.getUser(currentAccessToken);
        userData = refreshedUser.data;
        userError = refreshedUser.error;
      }
    }

    if (userError || !userData.user) {
      clearSessionCookies(res);
      unauthorized(req, res);
      return;
    }

    const manager = await getManagerUserByAuthId(userData.user.id);
    if (!manager) {
      clearSessionCookies(res);
      unauthorized(req, res);
      return;
    }

    const clinic = await getClinicById(manager.clinic_id);
    if (!clinic) {
      clearSessionCookies(res);
      unauthorized(req, res);
      return;
    }

    req.authContext = {
      userId: userData.user.id,
      email: userData.user.email ?? '',
      clinic,
      user: manager
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requireClinicOwnership(req: Request, res: Response, next: NextFunction): void {
  const clinicId = req.params.clinicId;
  const authContext = req.authContext;

  if (!authContext) {
    unauthorized(req, res);
    return;
  }

  if (!clinicId || clinicId !== authContext.clinic.id) {
    res.status(403).json({ error: 'Forbidden for this clinic' });
    return;
  }

  next();
}