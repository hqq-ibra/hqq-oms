import { Module } from '@nestjs/common';
import { FactoriesService } from './factories.service';
import { FactoriesController } from './factories.controller';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';

@Module({
  controllers: [FactoriesController],
  providers: [FactoriesService, AuditInterceptor],
  exports: [FactoriesService],
})
export class FactoriesModule {}
