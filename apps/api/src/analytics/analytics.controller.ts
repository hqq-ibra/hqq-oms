import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { StockService } from './stock.service';
import { SalesService } from './sales.service';
import { CustomersAnalyticsService } from './customers.service';

@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('VIEW_REPORTS')
export class AnalyticsController {
  constructor(
    private readonly stockService: StockService,
    private readonly salesService: SalesService,
    private readonly customersService: CustomersAnalyticsService,
  ) {}

  @Get('stock/demand')
  getStockDemand() {
    return this.stockService.getDemand();
  }

  @Get('stock/catalogue-health')
  getCatalogueHealth() {
    return this.stockService.getCatalogueHealth();
  }

  @Get('sales/cost-breakdown')
  getCostBreakdown() {
    return this.salesService.getCostBreakdown();
  }

  @Get('sales/monthly')
  getMonthlySales() {
    return this.salesService.getMonthlyMoney();
  }

  @Get('customers/breadth')
  getCustomerBreadth() {
    return this.customersService.getBreadth();
  }

  @Get('customers/segments')
  getCustomerSegments() {
    return this.customersService.getSegments();
  }
}
