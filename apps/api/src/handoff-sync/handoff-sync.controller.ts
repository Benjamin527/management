import {
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
import { JwtAuthGuard, type SessionUser } from '../auth/jwt-auth.guard';
import { HandoffSyncService } from './handoff-sync.service';

@Controller('handoff-sync')
@UseGuards(JwtAuthGuard)
export class HandoffSyncController {
  private readonly logger = new Logger(HandoffSyncController.name);

  constructor(private readonly sync: HandoffSyncService) {}

  @Get('status')
  status() {
    return this.sync.getStatus();
  }

  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  async run(@CurrentUser() user: SessionUser) {
    if (!['ADMIN', 'MANAGER'].includes(user.role)) {
      throw new ForbiddenException(
        'Only administrators and managers can synchronize handoffs',
      );
    }
    const ownerId = await this.sync.acquireLease();
    void this.sync.runWithLease(ownerId, user.sub).catch(() => {
      this.logger.error(
        'Manual handoff synchronization failed; inspect synchronization history',
      );
    });
    return { accepted: true };
  }
}
