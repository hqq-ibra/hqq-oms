import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';
import { JwtUser } from '../auth/jwt.strategy';

@Controller('api/v1/files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  list(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (!entityType || !entityId) {
      return { data: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
    }
    return this.filesService.list({
      entityType,
      entityId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('UPLOAD_FILES')
  @UseInterceptors(AuditInterceptor)
  @Audit('FILE')
  create(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.filesService.create(
      body as {
        entityType: string;
        entityId: string;
        fileType: string;
        fileName: string;
        fileUrl: string;
      },
      user.userId,
    );
  }

  @Delete(':id')
  @UseInterceptors(AuditInterceptor)
  @Audit('FILE')
  delete(@Param('id') id: string) {
    return this.filesService.delete(id);
  }
}
