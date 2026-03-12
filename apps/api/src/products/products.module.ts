import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, AuditInterceptor],
  exports: [ProductsService],
})
export class ProductsModule {}
