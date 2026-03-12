import { Module } from '@nestjs/common';
import { CapabilitiesService } from './capabilities.service';
import { CapabilitiesController } from './capabilities.controller';

@Module({
  controllers: [CapabilitiesController],
  providers: [CapabilitiesService],
  exports: [CapabilitiesService],
})
export class CapabilitiesModule {}
