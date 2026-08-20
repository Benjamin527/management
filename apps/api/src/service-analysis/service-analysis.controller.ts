import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  type AnalysisDimension,
  ServiceAnalysisService,
} from './service-analysis.service';

const dimensions = new Set<AnalysisDimension>([
  'status',
  'feedbackType',
  'issueType',
  'sourceType',
  'deploymentType',
  'engineer',
]);

@Controller('service-analysis')
@UseGuards(JwtAuthGuard)
export class ServiceAnalysisController {
  constructor(private readonly analysis: ServiceAnalysisService) {}

  @Get('summary')
  summary(@Query('year') year = '2026') {
    return this.analysis.summary(Number(year));
  }

  @Get('trend')
  trend(
    @Query('year') year = '2026',
    @Query('dimension') dimension = 'status',
  ) {
    if (dimension !== 'status') {
      throw new BadRequestException('Trend dimension must be status');
    }
    return this.analysis.trend(Number(year));
  }

  @Get('distribution')
  distribution(
    @Query('year') year = '2026',
    @Query('dimension') dimension = 'issueType',
  ) {
    if (!dimensions.has(dimension as AnalysisDimension)) {
      throw new BadRequestException('Unsupported analysis dimension');
    }
    return this.analysis.distribution(
      Number(year),
      dimension as AnalysisDimension,
    );
  }

  @Get('customers')
  customers(@Query('year') year = '2026', @Query('limit') limit = '10') {
    return this.analysis.customers(Number(year), Number(limit));
  }
}
