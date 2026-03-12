import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditOptions {
  entityType: string;
  idParam?: string;
}

export const Audit = (entityType: string, idParam = 'id') =>
  SetMetadata(AUDIT_KEY, { entityType, idParam } as AuditOptions);
