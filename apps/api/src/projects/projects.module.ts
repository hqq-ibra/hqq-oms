import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { StageWorkspaceService } from './stage-workspace.service';
import { CandidateSupplierService } from './candidate-supplier.service';
import { QuotationWorkspaceService } from './quotation-workspace.service';
import { ClientApprovalService } from './client-approval.service';
import { QuoteComparisonService } from './quote-comparison.service';
import { ProjectsController } from './projects.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WsModule } from '../ws/ws.module';

@Module({
  imports: [PrismaModule, WsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, StageWorkspaceService, CandidateSupplierService, QuotationWorkspaceService, ClientApprovalService, QuoteComparisonService],
  exports: [ProjectsService, StageWorkspaceService, CandidateSupplierService, QuotationWorkspaceService, ClientApprovalService, QuoteComparisonService],
})
export class ProjectsModule {}
