import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListServiceRecordsDto } from './dto/list-service-records.dto';
import { ServiceRecordsService } from './service-records.service';

@Controller('service-records')
@UseGuards(JwtAuthGuard)
export class ServiceRecordsController {
  constructor(private readonly records: ServiceRecordsService) {}

  @Get()
  list(@Query() query: ListServiceRecordsDto) {
    return this.records.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.records.findOne(id);
  }
}
