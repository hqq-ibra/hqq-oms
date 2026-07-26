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
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { FactoriesService } from './factories.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';
import { uploadsPath } from '../config/uploads';

const UPLOADS_DIR = uploadsPath('logos');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

@Controller('api/v1/factories')
@UseGuards(JwtAuthGuard)
export class FactoriesController {
  constructor(private readonly factoriesService: FactoriesService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.factoriesService.list({
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  // ── Import from Projects (must be before :id to avoid route conflict) ──

  @Get('import/projects')
  listProjectsWithCandidates() {
    return this.factoriesService.listProjectsWithCandidates();
  }

  @Get('import/projects/:projectId/candidates')
  listCandidatesForProject(@Param('projectId') projectId: string) {
    return this.factoriesService.listCandidatesForProject(projectId);
  }

  @Post('import/from-candidates')
  @UseInterceptors(AuditInterceptor)
  @Audit('FACTORY')
  importFromCandidates(@Body() body: { supplierIds: string[] }) {
    return this.factoriesService.importCandidatesAsFactories(body.supplierIds);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.factoriesService.getById(id);
  }

  @Post()
  @UseInterceptors(AuditInterceptor)
  @Audit('FACTORY')
  create(@Body() body: Record<string, unknown>) {
    return this.factoriesService.create(body as any);
  }

  @Patch(':id')
  @UseInterceptors(AuditInterceptor)
  @Audit('FACTORY')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.factoriesService.update(id, body);
  }

  @Delete(':id')
  @UseInterceptors(AuditInterceptor)
  @Audit('FACTORY')
  delete(@Param('id') id: string) {
    return this.factoriesService.delete(id);
  }

  // ── Logo Upload ──

  @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|gif|webp|svg\+xml)$/)) {
          cb(new BadRequestException('Only image files are allowed'), false);
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const logoUrl = `/uploads/logos/${file.filename}`;
    return this.factoriesService.update(id, { logo: logoUrl });
  }

  // ── Contacts ──

  @Post(':factoryId/contacts')
  @UseInterceptors(AuditInterceptor)
  @Audit('VENDOR_CONTACT')
  addContact(
    @Param('factoryId') factoryId: string,
    @Body() body: { name: string; role: string; wechatId: string },
  ) {
    return this.factoriesService.addContact(factoryId, body);
  }

  @Patch('contacts/:contactId')
  @UseInterceptors(AuditInterceptor)
  @Audit('VENDOR_CONTACT')
  updateContact(
    @Param('contactId') contactId: string,
    @Body() body: { name?: string; role?: string; wechatId?: string },
  ) {
    return this.factoriesService.updateContact(contactId, body);
  }

  @Delete('contacts/:contactId')
  @UseInterceptors(AuditInterceptor)
  @Audit('VENDOR_CONTACT')
  deleteContact(@Param('contactId') contactId: string) {
    return this.factoriesService.deleteContact(contactId);
  }
}
