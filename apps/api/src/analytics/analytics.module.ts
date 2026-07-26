import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { StockService } from './stock.service';
import { SalesService } from './sales.service';
import { CustomersAnalyticsService } from './customers.service';

@Module({
  controllers: [AnalyticsController],
  providers: [StockService, SalesService, CustomersAnalyticsService],
})
export class AnalyticsModule {}
