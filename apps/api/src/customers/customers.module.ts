import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, AuditInterceptor],
  exports: [CustomersService],
})
export class CustomersModule {}
