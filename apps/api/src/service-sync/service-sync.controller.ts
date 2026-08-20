import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { SessionUser } from '../auth/jwt-auth.guard';
import { ServiceSyncMode } from '../generated/prisma/enums';
import { RunServiceSyncDto } from './dto/run-service-sync.dto';
import { ServiceSyncService } from './service-sync.service';

@Controller('service-sync')
@UseGuards(JwtAuthGuard)
export class ServiceSyncController {
  private readonly logger = new Logger(ServiceSyncController.name);

  constructor(private readonly sync: ServiceSyncService) {}

  @Get('status')
  status() {
    return this.sync.getStatus();
  }

  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  run(@Body() input: RunServiceSyncDto, @CurrentUser() user: SessionUser) {
    if (!['ADMIN', 'MANAGER'].includes(user.role)) {
      throw new ForbiddenException('Only administrators and managers can sync');
    }
    if (this.sync.isRunning) {
      throw new ConflictException(
        'A service synchronization is already running',
      );
    }

    const mode =
      input.mode === 'full-year'
        ? ServiceSyncMode.FULL_YEAR
        : ServiceSyncMode.RECENT;
    void this.sync.run(mode, user.sub).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Manual Feishu sync failed: ${message}`);
    });
    return { accepted: true, mode: input.mode };
  }
}
