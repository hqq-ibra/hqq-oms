import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { StockService } from './stock.service';

@Module({
  controllers: [AnalyticsController],
  providers: [StockService],
})
export class AnalyticsModule {}
