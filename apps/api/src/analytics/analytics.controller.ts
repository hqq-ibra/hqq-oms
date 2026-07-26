import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { StockService } from './stock.service';

@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('VIEW_REPORTS')
export class AnalyticsController {
  constructor(private readonly stockService: StockService) {}

  @Get('stock/demand')
  getStockDemand() {
    return this.stockService.getDemand();
  }

  @Get('stock/catalogue-health')
  getCatalogueHealth() {
    return this.stockService.getCatalogueHealth();
  }
}
