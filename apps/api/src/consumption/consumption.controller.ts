import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConsumptionService } from './consumption.service';
import { ConsumptionQueryDto } from './dto/consumption-query.dto';

@Controller('consumption')
@UseGuards(JwtAuthGuard)
export class ConsumptionController {
  constructor(private readonly consumption: ConsumptionService) {}

  @Get('analysis')
  analysis(@Query() query: ConsumptionQueryDto) {
    return this.consumption.analysis(query);
  }
}
