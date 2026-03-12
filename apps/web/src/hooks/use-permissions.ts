'use client';

import { useAuth } from '@/providers/auth-provider';
import type { Permission } from '@/lib/types';

type PermissionKey = keyof typeof Permission;

export function usePermissions() {
  const { user } = useAuth();
  const raw = user?.permissions as unknown;
  const permissions = Array.isArray(raw)
    ? raw.map((p) =>
        typeof p === 'string' ? p : (p as { permissionKey: string }).permissionKey
      )
    : [];

  const hasPermission = (perm: Permission | PermissionKey): boolean =>
    permissions.includes(perm as string);

  return { permissions, hasPermission };
}
