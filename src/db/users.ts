import { supabaseAdmin } from './supabase';
import type { UserRow } from '../types/domain';

export async function getManagerUserByAuthId(authUserId: string): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', authUserId)
    .eq('role', 'manager')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as UserRow | null) ?? null;
}

export async function getManagerContactByClinicId(clinicId: string): Promise<{
  user: UserRow;
  email: string | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('role', 'manager')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const user = data as UserRow;
  const authUser = await supabaseAdmin.auth.admin.getUserById(user.id);
  if (authUser.error) {
    throw authUser.error;
  }
  const email = authUser.data.user?.email ?? null;

  return { user, email };
}
