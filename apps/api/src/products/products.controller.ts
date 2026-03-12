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
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync, renameSync } from 'fs';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt.strategy';

const PRODUCT_FILES_DIR = join(process.cwd(), 'uploads', 'products');
if (!existsSync(PRODUCT_FILES_DIR)) mkdirSync(PRODUCT_FILES_DIR, { recursive: true });

@Controller('api/v1/products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('specMachine') specMachine?: string,
    @Query('specCapacity') specCapacity?: string,
    @Query('specGrams') specGrams?: string,
    @Query('specPattern') specPattern?: string,
    @Query('unlinked') unlinked?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.productsService.list({
      search,
      categoryId,
      subcategoryId,
      specMachine,
      specCapacity,
      specGrams,
      specPattern,
      unlinked: unlinked === 'true',
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('categories')
  listCategories() {
    return this.productsService.listCategories();
  }

  @Post('categories')
  createCategory(@Body() body: { name: string; skuPrefix: string }) {
    return this.productsService.createCategory(body);
  }

  @Post('categories/:categoryId/subcategories')
  createSubcategory(
    @Param('categoryId') categoryId: string,
    @Body() body: { name: string; skuCode: string },
  ) {
    return this.productsService.createSubcategory(categoryId, body);
  }

  @Delete('categories/:categoryId')
  deleteCategory(@Param('categoryId') categoryId: string) {
    return this.productsService.deleteCategory(categoryId);
  }

  @Delete('categories/:categoryId/subcategories/:subcategoryId')
  deleteSubcategory(
    @Param('categoryId') categoryId: string,
    @Param('subcategoryId') subcategoryId: string,
  ) {
    return this.productsService.deleteSubcategory(categoryId, subcategoryId);
  }

  @Get('spec-options')
  specOptions(
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('specMachine') specMachine?: string,
    @Query('specCapacity') specCapacity?: string,
    @Query('specGrams') specGrams?: string,
    @Query('specPattern') specPattern?: string,
  ) {
    return this.productsService.getSpecOptions({
      categoryId,
      subcategoryId,
      specMachine,
      specCapacity,
      specGrams,
      specPattern,
    });
  }

  @Get('suggest-sku')
  suggestSku(
    @Query('categoryId') categoryId: string,
    @Query('subcategoryId') subcategoryId?: string,
  ) {
    return this.productsService.suggestSku(categoryId, subcategoryId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.productsService.getById(id);
  }

  @Post()
  @UseInterceptors(AuditInterceptor)
  @Audit('PRODUCT')
  create(@Body() body: Record<string, unknown>) {
    return this.productsService.create(body as any);
  }

  @Patch(':id')
  @UseInterceptors(AuditInterceptor)
  @Audit('PRODUCT')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.productsService.update(id, body);
  }

  @Delete(':id')
  @UseInterceptors(AuditInterceptor)
  @Audit('PRODUCT')
  delete(@Param('id') id: string) {
    return this.productsService.delete(id);
  }

  @Get(':id/customers')
  getCustomers(@Param('id') id: string) {
    return this.productsService.getCustomers(id);
  }

  @Post(':id/customers')
  linkCustomer(@Param('id') id: string, @Body('customerId') customerId: string) {
    return this.productsService.linkCustomer(id, customerId);
  }

  @Delete(':id/customers/:customerId')
  unlinkCustomer(
    @Param('id') id: string,
    @Param('customerId') customerId: string,
  ) {
    return this.productsService.unlinkCustomer(id, customerId);
  }

  @Get(':id/files')
  getFiles(@Param('id') id: string) {
    return this.productsService.getFiles(id);
  }

  @Post(':id/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: PRODUCT_FILES_DIR,
        filename: (_req, file, cb) => {
          const tmp = `tmp-${Date.now()}-${Math.round(Math.random() * 1e6)}${extname(file.originalname)}`;
          cb(null, tmp);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^(image\/(jpeg|png|gif|webp)|application\/pdf)$/)) {
          cb(new BadRequestException('Only images (JPG, PNG, GIF, WebP) and PDF files are allowed'), false);
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    const product = await this.productsService.getById(id);
    const ext = extname(file.originalname);
    let finalName = `${product.sku}${ext}`;
    let counter = 1;
    while (existsSync(join(PRODUCT_FILES_DIR, finalName))) {
      counter++;
      finalName = `${product.sku}-${counter}${ext}`;
    }

    renameSync(file.path, join(PRODUCT_FILES_DIR, finalName));

    const fileUrl = `/uploads/products/${finalName}`;
    const fileType = file.mimetype === 'application/pdf' ? 'PDF' : 'IMAGE';
    return this.productsService.addFile(id, {
      fileName: finalName,
      fileUrl,
      fileType,
    }, user.userId);
  }

  @Delete(':id/files/:fileId')
  deleteFile(@Param('id') id: string, @Param('fileId') fileId: string) {
    return this.productsService.deleteFile(id, fileId);
  }
}
