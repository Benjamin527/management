import {
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { SessionUser } from '../auth/jwt-auth.guard';
import { ConsumptionService } from './consumption.service';
import { ConsumptionSyncService } from './consumption-sync.service';
import { ConsumptionQueryDto } from './dto/consumption-query.dto';

@Controller('consumption')
@UseGuards(JwtAuthGuard)
export class ConsumptionController {
  constructor(
    private readonly consumption: ConsumptionService,
    private readonly sync: ConsumptionSyncService,
  ) {}

  @Get('analysis')
  analysis(@Query() query: ConsumptionQueryDto) {
    return this.consumption.analysis(query);
  }

  @Get('sync/status')
  syncStatus() {
    return this.sync.getStatus();
  }

  @Post('sync/run')
  @HttpCode(HttpStatus.ACCEPTED)
  runSync(@CurrentUser() user: SessionUser) {
    if (!['ADMIN', 'MANAGER'].includes(user.role)) {
      throw new ForbiddenException('Only administrators and managers can sync');
    }
    if (!this.sync.enabled) {
      throw new ConflictException('Consumption synchronization is disabled');
    }
    if (this.sync.isRunning) {
      throw new ConflictException(
        'A consumption synchronization is already running',
      );
    }
    void this.sync.run().catch(() => undefined);
    return { accepted: true };
  }
}
