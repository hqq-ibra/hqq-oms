import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY, AuditOptions } from '../decorators/audit.decorator';
import { JwtUser } from '../../auth/jwt.strategy';

function toPrismaModel(entityType: string): string {
  return entityType.charAt(0).toLowerCase() + entityType.slice(1);
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const auditOptions = this.reflector.getAllAndOverride<AuditOptions>(
      AUDIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const user = request.user as JwtUser | undefined;
    const userId = user?.userId ?? null;
    const idParam = auditOptions.idParam ?? 'id';
    const entityId = request.params[idParam] as string | undefined;
    const { entityType } = auditOptions;

    let oldValue: Record<string, unknown> | null = null;

    if (entityId && ['PATCH', 'PUT', 'DELETE'].includes(method)) {
      const modelName = toPrismaModel(entityType);
      const delegate = (this.prisma as unknown as Record<string, { findUnique: (args: unknown) => Promise<unknown> }>)[modelName];
      if (delegate?.findUnique) {
        const entity = await delegate.findUnique({
          where: { id: entityId },
        });
        if (entity) {
          oldValue = JSON.parse(JSON.stringify(entity)) as Record<string, unknown>;
        }
      }
    }

    return next.handle().pipe(
      tap(async (response: unknown) => {
        const action =
          method === 'POST'
            ? 'CREATE'
            : method === 'DELETE'
              ? 'DELETE'
              : ['PATCH', 'PUT'].includes(method)
                ? 'UPDATE'
                : null;

        if (!action) return;

        const res = response as { id?: string } | null;
        let newValue: Record<string, unknown> | null = null;
        let resolvedEntityId = entityId;

        if (action === 'CREATE' && res?.id) {
          resolvedEntityId = res.id;
          newValue = JSON.parse(JSON.stringify(response)) as Record<string, unknown>;
        } else if (action === 'UPDATE' && (res?.id || entityId)) {
          resolvedEntityId = res?.id ?? entityId ?? '';
          newValue = response
            ? (JSON.parse(JSON.stringify(response)) as Record<string, unknown>)
            : oldValue;
        } else if (action === 'DELETE') {
          newValue = null;
          resolvedEntityId = entityId ?? '';
        }

        if (!resolvedEntityId && action !== 'DELETE') return;

        await this.prisma.auditLog.create({
          data: {
            userId,
            entityType,
            entityId: resolvedEntityId ?? '',
            action,
            oldValue: (oldValue ?? undefined) as any,
            newValue: (newValue ?? undefined) as any,
          },
        });
      }),
    );
  }
}
