import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('api/v1/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.usersService.list({
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.usersService.getById(id);
  }

  @Post()
  @UseInterceptors(AuditInterceptor)
  @Audit('USER')
  create(@Body() body: Record<string, unknown>) {
    return this.usersService.create(body as {
      name: string;
      email: string;
      password: string;
      role?: string;
      permissions?: string[];
    });
  }

  @Patch(':id')
  @UseInterceptors(AuditInterceptor)
  @Audit('USER')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.usersService.update(id, body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      permissions?: string[];
    });
  }

  @Delete(':id')
  @UseInterceptors(AuditInterceptor)
  @Audit('USER')
  delete(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
