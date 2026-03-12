import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';

@Module({
  controllers: [FilesController],
  providers: [FilesService, AuditInterceptor],
  exports: [FilesService],
})
export class FilesModule {}
