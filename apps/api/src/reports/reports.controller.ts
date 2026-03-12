import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('api/v1/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('VIEW_REPORTS')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('monthly-profit')
  getMonthlyProfit() {
    return this.reportsService.getMonthlyProfit();
  }

  @Get('orders-performance')
  getOrdersPerformance() {
    return this.reportsService.getOrdersPerformance();
  }

  @Get('factory-performance')
  getFactoryPerformance() {
    return this.reportsService.getFactoryPerformance();
  }

  @Get('inactive-customers')
  getInactiveCustomers() {
    return this.reportsService.getInactiveCustomers();
  }
}
