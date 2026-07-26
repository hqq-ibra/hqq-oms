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
  UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { uploadsPath } from '../config/uploads';
import { ProjectsService } from './projects.service';
import { StageWorkspaceService } from './stage-workspace.service';
import { CandidateSupplierService } from './candidate-supplier.service';
import { QuotationWorkspaceService } from './quotation-workspace.service';
import { ClientApprovalService } from './client-approval.service';
import { QuoteComparisonService } from './quote-comparison.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { Audit } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt.strategy';

@Controller('api/v1/projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly stageWorkspace: StageWorkspaceService,
    private readonly candidateSupplier: CandidateSupplierService,
    private readonly quotationWorkspace: QuotationWorkspaceService,
    private readonly clientApproval: ClientApprovalService,
    private readonly quoteComparison: QuoteComparisonService,
  ) {}

  // ─── Projects ───

  @Get()
  list(
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.projectsService.list({
      status,
      priority,
      ownerUserId,
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.projectsService.getById(id);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT')
  create(@Body() dto: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.projectsService.create(
      dto as Parameters<ProjectsService['create']>[0],
      user.userId,
    );
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT')
  update(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.update(
      id,
      dto as Parameters<ProjectsService['update']>[1],
      user.userId,
    );
  }

  @Post(':id/duplicate')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('MANAGE_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT')
  duplicate(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.projectsService.duplicate(id, user.userId);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('MANAGE_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.projectsService.remove(id, user.userId);
  }

  // ─── Stages ───

  @Get(':id/stages')
  listStages(@Param('id') id: string) {
    return this.projectsService.listStages(id);
  }

  @Post(':id/stages')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT_STAGE')
  createStage(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.createStage(
      id,
      dto as Parameters<ProjectsService['createStage']>[1],
      user.userId,
    );
  }

  @Patch(':id/stages/:stageId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT_STAGE', 'stageId')
  updateStage(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.updateStage(
      id,
      stageId,
      dto as Parameters<ProjectsService['updateStage']>[2],
      user.userId,
    );
  }

  @Delete(':id/stages/:stageId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('MANAGE_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT_STAGE', 'stageId')
  deleteStage(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.deleteStage(id, stageId, user.userId);
  }

  // ─── Tasks ───

  @Get(':id/tasks')
  listTasks(@Param('id') id: string) {
    return this.projectsService.listTasks(id);
  }

  @Post(':id/tasks')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT_TASK')
  createTask(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.createTask(
      id,
      dto as Parameters<ProjectsService['createTask']>[1],
      user.userId,
    );
  }

  @Patch(':id/tasks/:taskId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT_TASK', 'taskId')
  updateTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.updateTask(
      id,
      taskId,
      dto as Parameters<ProjectsService['updateTask']>[2],
      user.userId,
    );
  }

  @Delete(':id/tasks/:taskId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT_TASK', 'taskId')
  deleteTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.deleteTask(id, taskId, user.userId);
  }

  // ─── Contacts ───

  @Get(':id/contacts')
  listContacts(@Param('id') id: string) {
    return this.projectsService.listContacts(id);
  }

  @Post(':id/contacts')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT_CONTACT')
  createContact(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.createContact(
      id,
      dto as Parameters<ProjectsService['createContact']>[1],
      user.userId,
    );
  }

  @Patch(':id/contacts/:contactId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT_CONTACT', 'contactId')
  updateContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.updateContact(
      id,
      contactId,
      dto as Parameters<ProjectsService['updateContact']>[2],
      user.userId,
    );
  }

  @Delete(':id/contacts/:contactId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT_CONTACT', 'contactId')
  deleteContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.deleteContact(id, contactId, user.userId);
  }

  // ─── Files ───

  @Get(':id/files')
  listFiles(@Param('id') id: string) {
    return this.projectsService.listFiles(id);
  }

  @Post(':id/files')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT_FILE')
  createFile(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.createFile(
      id,
      dto as Parameters<ProjectsService['createFile']>[1],
      user.userId,
    );
  }

  @Post(':id/files/upload')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const projectId = (req.params as { id: string }).id;
          const dest = uploadsPath('projects', projectId);
          if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
          cb(null, dest);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
          const ext = extname(file.originalname);
          cb(null, `${unique}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadFiles(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtUser,
  ) {
    const results = [];
    for (const file of files) {
      const url = `/uploads/projects/${id}/${file.filename}`;
      const ext = extname(file.originalname).toLowerCase();
      let type = 'OTHER';
      if (['.pdf'].includes(ext)) type = 'PDF';
      else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) type = 'IMAGE';
      else if (['.dwg', '.dxf', '.step', '.stp', '.igs', '.stl'].includes(ext)) type = 'CAD';

      const created = await this.projectsService.createFile(
        id,
        { type, title: file.originalname, url },
        user.userId,
      );
      results.push(created);
    }
    return results;
  }

  @Delete(':id/files/:fileId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT_FILE', 'fileId')
  deleteFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.deleteFile(id, fileId, user.userId);
  }

  // ─── Activity ───

  @Get(':id/activity')
  listActivities(@Param('id') id: string) {
    return this.projectsService.listActivities(id);
  }

  // ─── Client Quotation & Decision ───

  @Get(':id/client-quote')
  getClientQuote(@Param('id') id: string) {
    return this.projectsService.getClientQuote(id);
  }

  @Patch(':id/client-quote')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT')
  upsertClientQuote(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.upsertClientQuote(
      id,
      dto as Parameters<ProjectsService['upsertClientQuote']>[1],
      user.userId,
    );
  }

  @Get(':id/client-decision')
  getClientDecision(@Param('id') id: string) {
    return this.projectsService.getClientDecision(id);
  }

  @Patch(':id/client-decision')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(AuditInterceptor)
  @Audit('PROJECT')
  upsertClientDecision(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.upsertClientDecision(
      id,
      dto as Parameters<ProjectsService['upsertClientDecision']>[1],
      user.userId,
    );
  }

  // ─── Stage Workspace ───

  @Get(':id/stages/:stageId/workspace')
  getStageWorkspace(@Param('stageId') stageId: string) {
    return this.stageWorkspace.getStageWorkspace(stageId);
  }

  // ─── Sticky Notes ───

  @Get(':id/stages/:stageId/notes')
  listStickyNotes(@Param('stageId') stageId: string) {
    return this.stageWorkspace.listStickyNotes(stageId);
  }

  @Post(':id/stages/:stageId/notes')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  createStickyNote(
    @Param('stageId') stageId: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.stageWorkspace.createStickyNote(
      stageId,
      dto as Parameters<StageWorkspaceService['createStickyNote']>[1],
      user.userId,
    );
  }

  @Patch(':id/stages/:stageId/notes/:noteId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateStickyNote(
    @Param('stageId') stageId: string,
    @Param('noteId') noteId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.stageWorkspace.updateStickyNote(
      stageId,
      noteId,
      dto as Parameters<StageWorkspaceService['updateStickyNote']>[2],
    );
  }

  @Delete(':id/stages/:stageId/notes/:noteId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  deleteStickyNote(
    @Param('stageId') stageId: string,
    @Param('noteId') noteId: string,
  ) {
    return this.stageWorkspace.deleteStickyNote(stageId, noteId);
  }

  // ─── Stage Document ───

  @Get(':id/stages/:stageId/document')
  getDocument(@Param('stageId') stageId: string) {
    return this.stageWorkspace.getDocument(stageId);
  }

  @Patch(':id/stages/:stageId/document')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateDocument(
    @Param('stageId') stageId: string,
    @Body() dto: { content: unknown },
    @CurrentUser() user: JwtUser,
  ) {
    return this.stageWorkspace.updateDocument(stageId, dto.content, user.userId);
  }

  // ─── Stage Files ───

  @Get(':id/stages/:stageId/files')
  listStageFiles(@Param('stageId') stageId: string) {
    return this.stageWorkspace.listFiles(stageId);
  }

  @Post(':id/stages/:stageId/files/upload')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const stageId = (req.params as { stageId: string }).stageId;
          const dest = uploadsPath('stages', stageId);
          if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
          cb(null, dest);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
          const ext = extname(file.originalname);
          cb(null, `${unique}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadStageFiles(
    @Param('stageId') stageId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtUser,
  ) {
    const results = [];
    for (const file of files) {
      const filePath = `/uploads/stages/${stageId}/${file.filename}`;
      const ext = extname(file.originalname).toLowerCase();
      let fileType = 'OTHER';
      if (['.pdf'].includes(ext)) fileType = 'PDF';
      else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) fileType = 'IMAGE';
      else if (['.dwg', '.dxf', '.step', '.stp', '.igs', '.stl'].includes(ext)) fileType = 'CAD';
      else if (['.zip', '.rar', '.7z'].includes(ext)) fileType = 'ZIP';

      const created = await this.stageWorkspace.createFile(
        stageId,
        { title: file.originalname, filePath, fileType, fileSize: file.size },
        user.userId,
      );
      results.push(created);
    }
    return results;
  }

  @Delete(':id/stages/:stageId/files/:fileId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  deleteStageFile(
    @Param('stageId') stageId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.stageWorkspace.deleteFile(stageId, fileId, user.userId);
  }

  // ─── Stage Tasks ───

  @Get(':id/stages/:stageId/tasks')
  listStageTasks(@Param('stageId') stageId: string) {
    return this.stageWorkspace.listTasks(stageId);
  }

  @Post(':id/stages/:stageId/tasks')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  createStageTask(
    @Param('stageId') stageId: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.stageWorkspace.createTask(
      stageId,
      dto as Parameters<StageWorkspaceService['createTask']>[1],
      user.userId,
    );
  }

  @Patch(':id/stages/:stageId/tasks/:taskId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateStageTask(
    @Param('stageId') stageId: string,
    @Param('taskId') taskId: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.stageWorkspace.updateTask(
      stageId,
      taskId,
      dto as Parameters<StageWorkspaceService['updateTask']>[2],
      user.userId,
    );
  }

  @Delete(':id/stages/:stageId/tasks/:taskId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  deleteStageTask(
    @Param('stageId') stageId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.stageWorkspace.deleteTask(stageId, taskId, user.userId);
  }

  // ─── Mind Map ───

  @Get(':id/stages/:stageId/mindmap')
  getMindMap(@Param('stageId') stageId: string) {
    return this.stageWorkspace.getMindMap(stageId);
  }

  @Patch(':id/stages/:stageId/mindmap')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateMindMap(
    @Param('stageId') stageId: string,
    @Body() dto: { content: unknown },
    @CurrentUser() user: JwtUser,
  ) {
    return this.stageWorkspace.updateMindMap(stageId, dto.content, user.userId);
  }

  // ─── Flowchart ───

  @Get(':id/stages/:stageId/flowchart')
  getFlowchart(@Param('stageId') stageId: string) {
    return this.stageWorkspace.getFlowchart(stageId);
  }

  @Patch(':id/stages/:stageId/flowchart')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateFlowchart(
    @Param('stageId') stageId: string,
    @Body() dto: { content: unknown },
    @CurrentUser() user: JwtUser,
  ) {
    return this.stageWorkspace.updateFlowchart(stageId, dto.content, user.userId);
  }

  // ─── Stage Links ───

  @Get(':id/stages/:stageId/links')
  listStageLinks(@Param('stageId') stageId: string) {
    return this.stageWorkspace.listLinks(stageId);
  }

  @Post(':id/stages/:stageId/links')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  createStageLink(
    @Param('stageId') stageId: string,
    @Body() dto: { title: string; url: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.stageWorkspace.createLink(stageId, dto, user.userId);
  }

  @Patch(':id/stages/:stageId/links/:linkId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateStageLink(
    @Param('stageId') stageId: string,
    @Param('linkId') linkId: string,
    @Body() dto: { title?: string; url?: string; description?: string | null },
  ) {
    return this.stageWorkspace.updateLink(stageId, linkId, dto);
  }

  @Delete(':id/stages/:stageId/links/:linkId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  deleteStageLink(
    @Param('stageId') stageId: string,
    @Param('linkId') linkId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.stageWorkspace.deleteLink(stageId, linkId, user.userId);
  }

  // ─── Pinning ───

  @Get(':id/pinned')
  listPinnedItems(@Param('id') id: string) {
    return this.stageWorkspace.listPinnedItems(id);
  }

  @Post(':id/pinned')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  pinItem(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.stageWorkspace.pinItem(
      id,
      dto as Parameters<StageWorkspaceService['pinItem']>[1],
      user.userId,
    );
  }

  @Delete(':id/pinned/:pinId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  unpinItem(
    @Param('id') id: string,
    @Param('pinId') pinId: string,
  ) {
    return this.stageWorkspace.unpinItem(id, pinId);
  }

  // ─── Candidate Suppliers ───

  @Get(':id/stages/:stageId/candidates')
  listCandidates(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Query('status') status?: string,
  ) {
    return this.candidateSupplier.list(id, stageId, status);
  }

  @Get(':id/stages/:stageId/candidates/:supplierId')
  getCandidate(@Param('supplierId') supplierId: string) {
    return this.candidateSupplier.getById(supplierId);
  }

  @Post(':id/stages/:stageId/candidates')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  createCandidate(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.candidateSupplier.create(
      id,
      stageId,
      dto as Parameters<CandidateSupplierService['create']>[2],
      user.userId,
    );
  }

  @Patch(':id/stages/:stageId/candidates/:supplierId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateCandidate(
    @Param('supplierId') supplierId: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.candidateSupplier.update(
      supplierId,
      dto as Parameters<CandidateSupplierService['update']>[1],
      user.userId,
    );
  }

  @Delete(':id/stages/:stageId/candidates/:supplierId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  removeCandidate(
    @Param('supplierId') supplierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.candidateSupplier.remove(supplierId, user.userId);
  }

  @Post(':id/stages/:stageId/candidates/:supplierId/files/upload')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const supplierId = (req.params as { supplierId: string }).supplierId;
          const dest = uploadsPath('candidates', supplierId);
          if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
          cb(null, dest);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
          const ext = extname(file.originalname);
          cb(null, `${unique}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadCandidateFiles(
    @Param('supplierId') supplierId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtUser,
  ) {
    const results = [];
    for (const file of files) {
      const filePath = `/uploads/candidates/${supplierId}/${file.filename}`;
      const ext = extname(file.originalname).toLowerCase();
      let fileType = 'OTHER';
      if (['.pdf'].includes(ext)) fileType = 'PDF';
      else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) fileType = 'IMAGE';
      else if (['.xls', '.xlsx', '.csv'].includes(ext)) fileType = 'SPREADSHEET';
      else if (['.doc', '.docx'].includes(ext)) fileType = 'DOCUMENT';

      const created = await this.candidateSupplier.createFile(
        supplierId,
        { title: file.originalname, filePath, fileType, fileSize: file.size },
        user.userId,
      );
      results.push(created);
    }
    return results;
  }

  @Delete(':id/stages/:stageId/candidates/:supplierId/files/:fileId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  deleteCandidateFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.candidateSupplier.deleteFile(fileId, user.userId);
  }

  @Post(':id/stages/:stageId/candidates/promote')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  promoteCandidates(
    @Param('id') id: string,
    @Body() dto: { supplierIds: string[] },
    @CurrentUser() user: JwtUser,
  ) {
    return this.candidateSupplier.promoteToFactories(id, dto.supplierIds, user.userId);
  }

  @Post(':id/stages/:stageId/candidates/import-vendors')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  importFromVendors(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() dto: { factoryIds: string[] },
    @CurrentUser() user: JwtUser,
  ) {
    return this.candidateSupplier.importFromFactories(id, stageId, dto.factoryIds, user.userId);
  }

  // ─── Quotation & Samples Workspace ───

  @Post(':id/stages/:stageId/quotation/init')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  initQuotation(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.quotationWorkspace.initializeCapabilities(id, stageId, user.userId);
  }

  @Get(':id/stages/:stageId/quotation/capabilities')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('VIEW_PROJECTS')
  getQuotationCapabilities(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
  ) {
    return this.quotationWorkspace.getCapabilities(id, stageId);
  }

  @Post(':id/stages/:stageId/quotation/:capId/files/upload')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = uploadsPath('quotations', String(_req.params.capId));
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadQuotationFiles(
    @Param('id') projectId: string,
    @Param('capId') capId: string,
    @Query('supplierId') supplierId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtUser,
  ) {
    const results = [];
    for (const file of files) {
      const ext = extname(file.originalname).toLowerCase();
      let fileType = 'OTHER';
      if (['.pdf'].includes(ext)) fileType = 'PDF';
      else if (['.xls', '.xlsx', '.csv'].includes(ext)) fileType = 'SPREADSHEET';
      else if (['.doc', '.docx'].includes(ext)) fileType = 'DOCUMENT';
      else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) fileType = 'IMAGE';
      else if (['.zip', '.rar', '.7z'].includes(ext)) fileType = 'ARCHIVE';
      else if (['.dwg', '.dxf', '.step', '.stp', '.igs'].includes(ext)) fileType = 'CAD';

      const record = await this.quotationWorkspace.uploadFile(
        projectId,
        capId,
        supplierId,
        {
          fileName: file.originalname,
          filePath: `/uploads/quotations/${capId}/${file.filename}`,
          fileType,
          fileSize: file.size,
        },
        user.userId,
      );
      results.push(record);
    }
    return results;
  }

  @Delete(':id/stages/:stageId/quotation/files/:fileId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  deleteQuotationFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.quotationWorkspace.deleteFile(fileId, user.userId);
  }

  @Post(':id/stages/:stageId/quotation/:capId/attributes')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  addAttribute(
    @Param('capId') capId: string,
    @Body() dto: { name: string },
  ) {
    return this.quotationWorkspace.addAttribute(capId, dto.name);
  }

  @Delete(':id/stages/:stageId/quotation/attributes/:attrId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  deleteAttribute(@Param('attrId') attrId: string) {
    return this.quotationWorkspace.deleteAttribute(attrId);
  }

  @Patch(':id/stages/:stageId/quotation/:capId/attributes/reorder')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  reorderAttributes(
    @Param('capId') capId: string,
    @Body() dto: { attributeIds: string[] },
  ) {
    return this.quotationWorkspace.reorderAttributes(capId, dto.attributeIds);
  }

  @Patch(':id/stages/:stageId/quotation/values')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateComparisonValue(
    @Body() dto: { attributeId: string; supplierId: string; value: string },
  ) {
    return this.quotationWorkspace.updateValue(dto.attributeId, dto.supplierId, dto.value);
  }

  @Post(':id/stages/:stageId/quotation/:capId/winner')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  selectWinner(
    @Param('id') id: string,
    @Param('capId') capId: string,
    @Body() dto: { candidateId: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.quotationWorkspace.selectWinner(id, capId, dto.candidateId, user.userId);
  }

  @Delete(':id/stages/:stageId/quotation/:capId/winner')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  clearWinner(
    @Param('id') id: string,
    @Param('capId') capId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.quotationWorkspace.clearWinner(id, capId, user.userId);
  }

  @Get(':id/quotation/winners')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('VIEW_PROJECTS')
  getProjectWinners(@Param('id') id: string) {
    return this.quotationWorkspace.getProjectWinners(id);
  }

  // ─── Quote Comparison (Quotation & Samples v2) ───

  @Post(':id/stages/:stageId/quote-comparison/sync')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  syncQuoteComparison(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.quoteComparison.syncFromShortlist(id, stageId, user.userId);
  }

  @Get(':id/stages/:stageId/quote-comparison')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('VIEW_PROJECTS')
  getQuoteComparisons(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
  ) {
    return this.quoteComparison.getAllForStage(id, stageId);
  }

  @Post(':id/stages/:stageId/quote-comparison/reorder')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  reorderQuoteComparisons(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body('orderedIds') orderedIds: string[],
  ) {
    return this.quoteComparison.reorderComparisons(id, stageId, orderedIds);
  }

  @Post(':id/stages/:stageId/quote-comparison/:compId/switch-currency')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  switchQuoteCurrency(
    @Param('compId') compId: string,
    @Body() dto: { currency: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.quoteComparison.switchCurrency(compId, dto.currency, user.userId);
  }

  @Post(':id/stages/:stageId/quote-comparison/:compId/items')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  addQuoteItem(
    @Param('compId') compId: string,
    @Body()
    dto: {
      itemName: string;
      targetQty?: number;
      unitLabel?: string;
      baselineSpec?: string;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.quoteComparison.addItem(compId, dto, user.userId);
  }

  @Patch(':id/stages/:stageId/quote-comparison/items/:itemId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateQuoteItem(
    @Param('itemId') itemId: string,
    @Body()
    dto: {
      itemName?: string;
      targetQty?: number;
      unitLabel?: string;
      baselineSpec?: string | null;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.quoteComparison.updateItem(itemId, dto, user.userId);
  }

  @Delete(':id/stages/:stageId/quote-comparison/items/:itemId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  deleteQuoteItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.quoteComparison.deleteItem(itemId, user.userId);
  }

  @Post(':id/stages/:stageId/quote-comparison/items/:itemId/reorder')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  reorderQuoteItem(
    @Param('itemId') itemId: string,
    @Body() dto: { direction: 'up' | 'down' },
    @CurrentUser() user: JwtUser,
  ) {
    return this.quoteComparison.reorderItem(itemId, dto.direction, user.userId);
  }

  @Post(':id/stages/:stageId/quote-comparison/:compId/suppliers')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  addQuoteSupplier(
    @Param('compId') compId: string,
    @Body()
    dto: {
      supplierName: string;
      country?: string;
      contactWechat?: string;
      paymentTerms?: string;
      leadTimeDays?: number;
      notes?: string;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.quoteComparison.addSupplier(compId, dto, user.userId);
  }

  @Patch(':id/stages/:stageId/quote-comparison/suppliers/:supplierId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateQuoteSupplier(
    @Param('supplierId') supplierId: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.quoteComparison.updateSupplier(
      supplierId,
      dto as Parameters<QuoteComparisonService['updateSupplier']>[1],
      user.userId,
    );
  }

  @Delete(':id/stages/:stageId/quote-comparison/suppliers/:supplierId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  removeQuoteSupplier(
    @Param('supplierId') supplierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.quoteComparison.removeSupplier(supplierId, user.userId);
  }

  @Patch(':id/stages/:stageId/quote-comparison/lines/:lineId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateQuoteLine(
    @Param('lineId') lineId: string,
    @Body()
    dto: {
      qty?: number;
      unitPrice?: number | null;
      included?: boolean;
      remark?: string | null;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.quoteComparison.updateLine(lineId, dto, user.userId);
  }

  @Post(':id/stages/:stageId/quote-comparison/:compId/select-final')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  selectFinalSupplier(
    @Param('compId') compId: string,
    @Body() dto: { supplierId: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.quoteComparison.selectFinalSupplier(
      compId,
      dto.supplierId,
      user.userId,
    );
  }

  // ─── Quote Image Upload ───

  @Post(':id/stages/:stageId/quote-comparison/:compId/image')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const dir = uploadsPath('quote-images');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadComparisonImage(
    @Param('compId') compId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const url = `/uploads/quote-images/${file.filename}`;
    await this.quoteComparison.setComparisonImage(compId, url);
    return { url };
  }

  @Delete(':id/stages/:stageId/quote-comparison/:compId/image')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  async deleteComparisonImage(@Param('compId') compId: string) {
    await this.quoteComparison.setComparisonImage(compId, null);
    return { ok: true };
  }

  @Post(':id/stages/:stageId/quote-comparison/items/:itemId/image')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const dir = uploadsPath('quote-images');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadItemImage(
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const url = `/uploads/quote-images/${file.filename}`;
    await this.quoteComparison.setItemImage(itemId, url);
    return { url };
  }

  @Delete(':id/stages/:stageId/quote-comparison/items/:itemId/image')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  async deleteItemImage(@Param('itemId') itemId: string) {
    await this.quoteComparison.setItemImage(itemId, null);
    return { ok: true };
  }

  // ─── Translation / Arabic Names ───

  @Post(':id/stages/:stageId/quote-comparison/translate')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  async translateAll(
    @Param('id') projectId: string,
    @Param('stageId') stageId: string,
  ) {
    return this.quoteComparison.translateAndSave(projectId, stageId);
  }

  @Patch(':id/stages/:stageId/quote-comparison/:compId/name-ar')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  async updateCapabilityNameAr(
    @Param('compId') compId: string,
    @Body('nameAr') nameAr: string,
  ) {
    return this.quoteComparison.updateCapabilityNameAr(compId, nameAr);
  }

  @Patch(':id/stages/:stageId/quote-comparison/items/:itemId/name-ar')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  async updateItemNameAr(
    @Param('itemId') itemId: string,
    @Body('nameAr') nameAr: string,
  ) {
    return this.quoteComparison.updateItemNameAr(itemId, nameAr);
  }

  @Patch(':id/stages/:stageId/quote-comparison/items/:itemId/description')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  async updateItemDescription(
    @Param('itemId') itemId: string,
    @Body('description') description: string,
  ) {
    return this.quoteComparison.updateItemDescription(itemId, description);
  }

  @Patch(':id/stages/:stageId/quote-comparison/:compId/profit-percent')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  async updateProfitPercent(
    @Param('compId') compId: string,
    @Body('profitPercent') profitPercent: number,
  ) {
    return this.quoteComparison.updateProfitPercent(compId, profitPercent);
  }

  @Patch(':id/stages/:stageId/quote-comparison/:compId/conditions')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  async updateConditions(
    @Param('compId') compId: string,
    @Body('conditions') conditions: string[],
  ) {
    return this.quoteComparison.updateConditions(compId, conditions);
  }

  // ─── Client Approval Workspace ───

  @Get(':id/client-approval')
  getClientApprovalWorkspace(@Param('id') id: string) {
    return this.clientApproval.getWorkspace(id);
  }

  @Patch(':id/client-approval/settings')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateQuotationSettings(
    @Param('id') id: string,
    @Body() body: { includeVat?: boolean; quoteCurrency?: string },
  ) {
    return this.clientApproval.updateQuotationSettings(id, body);
  }

  @Get(':id/client-approval/files')
  listClientApprovalFiles(@Param('id') id: string) {
    return this.clientApproval.listFiles(id);
  }

  @Post(':id/client-approval/files/upload')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const projectId = (req.params as { id: string }).id;
          const dest = uploadsPath('client-approval', projectId);
          if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
          cb(null, dest);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
          const ext = extname(file.originalname);
          cb(null, `${unique}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadClientApprovalFiles(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtUser,
  ) {
    const results = [];
    for (const file of files) {
      const filePath = `/uploads/client-approval/${id}/${file.filename}`;
      const ext = extname(file.originalname).toLowerCase();
      let fileType = 'OTHER';
      if (['.pdf'].includes(ext)) fileType = 'PDF';
      else if (['.xls', '.xlsx', '.csv'].includes(ext)) fileType = 'SPREADSHEET';
      else if (['.doc', '.docx'].includes(ext)) fileType = 'DOCUMENT';
      else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) fileType = 'IMAGE';

      const created = await this.clientApproval.createFile(
        id,
        { fileName: file.originalname, filePath, fileType, fileSize: file.size },
        user.userId,
      );
      results.push(created);
    }
    return results;
  }

  @Delete(':id/client-approval/files/:fileId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  deleteClientApprovalFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.clientApproval.deleteFile(fileId, user.userId);
  }

  @Get(':id/client-approval/pricing')
  listClientApprovalPricing(@Param('id') id: string) {
    return this.clientApproval.listPricing(id);
  }

  @Post(':id/client-approval/pricing')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  createClientApprovalPricing(
    @Param('id') id: string,
    @Body() dto: { itemName: string; amount: number; currency?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.clientApproval.createPricingItem(id, dto, user.userId);
  }

  @Patch(':id/client-approval/pricing/:itemId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateClientApprovalPricing(
    @Param('itemId') itemId: string,
    @Body() dto: { itemName?: string; amount?: number; currency?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.clientApproval.updatePricingItem(itemId, dto, user.userId);
  }

  @Delete(':id/client-approval/pricing/:itemId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  deleteClientApprovalPricing(
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.clientApproval.deletePricingItem(itemId, user.userId);
  }

  @Get(':id/client-approval/status')
  getClientApprovalStatus(@Param('id') id: string) {
    return this.clientApproval.getStatus(id);
  }

  @Patch(':id/client-approval/status')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  updateClientApprovalStatus(
    @Param('id') id: string,
    @Body() dto: { status: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.clientApproval.updateStatus(id, dto.status, user.userId);
  }

  @Get(':id/client-approval/notes')
  listClientApprovalNotes(@Param('id') id: string) {
    return this.clientApproval.listNotes(id);
  }

  @Post(':id/client-approval/notes')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  createClientApprovalNote(
    @Param('id') id: string,
    @Body() dto: { content: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.clientApproval.createNote(id, dto.content, user.userId);
  }

  @Delete(':id/client-approval/notes/:noteId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  deleteClientApprovalNote(
    @Param('noteId') noteId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.clientApproval.deleteNote(noteId, user.userId);
  }

  @Post(':id/client-approval/send-whatsapp')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_PROJECTS')
  @UseInterceptors(FileInterceptor('pdf'))
  sendWhatsApp(
    @Param('id') id: string,
    @Body() dto: { phone: string; fileName: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.clientApproval.sendWhatsApp(id, dto.phone, dto.fileName, file);
  }
}
