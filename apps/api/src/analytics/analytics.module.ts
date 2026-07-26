import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { StockService } from './stock.service';
import { SalesService } from './sales.service';
import { CustomersAnalyticsService } from './customers.service';
import { OperationsService } from './operations.service';

@Module({
  controllers: [AnalyticsController],
  providers: [StockService, SalesService, CustomersAnalyticsService, OperationsService],
})
export class AnalyticsModule {}
