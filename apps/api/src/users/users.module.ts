import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AuditInterceptor],
  exports: [UsersService],
})
export class UsersModule {}
