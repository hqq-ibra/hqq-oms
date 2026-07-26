import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('VIEW_REPORTS')
export class AnalyticsController {}
