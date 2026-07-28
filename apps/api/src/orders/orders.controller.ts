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
  BadRequestException,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt.strategy';
import { uploadsPath } from '../config/uploads';

const ORDERS_FILES_DIR = uploadsPath('orders');
if (!existsSync(ORDERS_FILES_DIR)) mkdirSync(ORDERS_FILES_DIR, { recursive: true });

@Controller('api/v1/orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('orderType') orderType?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('factoryId') factoryId?: string,
    @Query('customerId') customerId?: string,
    @Query('search') search?: string,
    @Query('delayed') delayed?: string,
    @Query('nearDeadline') nearDeadline?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
  ) {
    return this.ordersService.list({
      status,
      orderType,
      assignedUserId,
      factoryId,
      customerId,
      search,
      delayed: delayed === 'true',
      nearDeadline: nearDeadline === 'true',
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sort,
    });
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_ORDERS')
  @UseInterceptors(AuditInterceptor)
  @Audit('ORDER')
  create(@Body() dto: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.ordersService.create(
      dto as Parameters<OrdersService['create']>[0],
      user.userId,
    );
  }

  @Patch('costs/:costId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_COSTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('ORDER_COST', 'costId')
  updateCost(
    @Param('costId') costId: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.updateCost(
      costId,
      dto as Parameters<OrdersService['updateCost']>[1],
      user.userId,
    );
  }

  @Delete('costs/:costId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_COSTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('ORDER_COST', 'costId')
  deleteCost(@Param('costId') costId: string) {
    return this.ordersService.deleteCost(costId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.ordersService.getById(id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_ORDERS')
  @UseInterceptors(AuditInterceptor)
  @Audit('ORDER')
  update(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.update(
      id,
      dto as Parameters<OrdersService['update']>[1],
      user.userId,
    );
  }

  @Post(':id/status')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('CHANGE_STATUS')
  @UseInterceptors(AuditInterceptor)
  @Audit('ORDER')
  changeStatus(
    @Param('id') id: string,
    @Body() body: { newStatus: string; note?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.changeStatus(
      id,
      body.newStatus,
      user.userId,
      body.note,
    );
  }

  @Get(':id/costs')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('VIEW_COSTS')
  listCosts(@Param('id') id: string) {
    return this.ordersService.listCosts(id);
  }

  @Post(':id/costs')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_COSTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('ORDER_COST')
  addCost(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.addCost(
      id,
      dto as Parameters<OrdersService['addCost']>[1],
      user.userId,
    );
  }

  @Post(':id/items')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_ORDERS')
  @UseInterceptors(AuditInterceptor)
  @Audit('ORDER')
  addItem(
    @Param('id') id: string,
    @Body() dto: { productId: string; quantity: number },
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.addItem(id, dto, user.userId);
  }

  @Patch(':id/items/:itemId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_ORDERS')
  @UseInterceptors(AuditInterceptor)
  @Audit('ORDER')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: { quantity: number },
  ) {
    return this.ordersService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_ORDERS')
  @UseInterceptors(AuditInterceptor)
  @Audit('ORDER')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.ordersService.removeItem(id, itemId);
  }

  @Post(':id/files')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('UPLOAD_FILES')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const dir = join(ORDERS_FILES_DIR, req.params.id as string);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname) || '.jpg';
          const name = `receipt-${Date.now()}${ext}`;
          cb(null, name);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|gif|webp)$/)) {
          cb(
            new BadRequestException(
              'Only images (JPG, PNG, GIF, WebP) are allowed for receipts',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadReceipt(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const fileUrl = `/uploads/orders/${id}/${file.filename}`;
    return this.ordersService.addUploadedFile(
      id,
      { fileName: file.originalname || file.filename, fileUrl, fileType: 'RECEIPT' },
      user.userId,
    );
  }

  @Get(':id/factory-sheet')
  getFactorySheet(@Param('id') id: string) {
    return this.ordersService.getFactorySheet(id);
  }

  @Get(':id/quotation')
  getQuotation(@Param('id') id: string) {
    return this.ordersService.getQuotation(id);
  }

  @Patch(':id/quotation')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_ORDERS')
  @UseInterceptors(AuditInterceptor)
  @Audit('ORDER')
  updateQuotation(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.ordersService.updateQuotation(
      id,
      dto as Parameters<OrdersService['updateQuotation']>[1],
    );
  }
}
