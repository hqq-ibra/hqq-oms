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
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('api/v1/customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    const allowedSortFields = ['name', 'type', 'city', 'createdAt', 'customerCode'];
    return this.customersService.list({
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy: sortBy && allowedSortFields.includes(sortBy) ? sortBy : undefined,
      sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined,
    });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.customersService.getById(id);
  }

  @Post()
  @UseInterceptors(AuditInterceptor)
  @Audit('CUSTOMER')
  create(@Body() body: Record<string, unknown>) {
    return this.customersService.create(body as any);
  }

  @Patch(':id')
  @UseInterceptors(AuditInterceptor)
  @Audit('CUSTOMER')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.customersService.update(id, body);
  }

  @Delete(':id')
  @UseInterceptors(AuditInterceptor)
  @Audit('CUSTOMER')
  delete(@Param('id') id: string) {
    return this.customersService.delete(id);
  }

  @Get(':id/products')
  getProducts(@Param('id') id: string) {
    return this.customersService.getProducts(id);
  }

  @Post(':id/products')
  linkProduct(@Param('id') id: string, @Body('productId') productId: string) {
    return this.customersService.linkProduct(id, productId);
  }

  @Delete(':id/products/:productId')
  unlinkProduct(
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    return this.customersService.unlinkProduct(id, productId);
  }
}
