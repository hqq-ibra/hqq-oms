import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CapabilitiesService } from './capabilities.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('api/v1/capabilities')
@UseGuards(JwtAuthGuard)
export class CapabilitiesController {
  constructor(private readonly service: CapabilitiesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body('name') name: string) {
    return this.service.create(name);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
