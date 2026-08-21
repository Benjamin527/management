import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type SessionUser } from '../auth/jwt-auth.guard';
import { LinkHandoffProfileDto } from './dto/link-handoff-profile.dto';
import { HandoffProfilesService } from './handoff-profiles.service';

function requireRole(user: SessionUser, allowedRoles: string[]) {
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenException('当前角色无权执行此操作');
  }
}

function requestIp(request: Request): string | null {
  const ip = request.ip || request.socket?.remoteAddress;
  return ip ? ip.slice(0, 64) : null;
}

@Controller('handoff-profiles')
@UseGuards(JwtAuthGuard)
export class HandoffProfilesController {
  constructor(private readonly profiles: HandoffProfilesService) {}

  @Get('unmatched')
  listUnmatched(@CurrentUser() user: SessionUser) {
    requireRole(user, ['ADMIN', 'MANAGER']);
    return this.profiles.listUnmatched();
  }

  @Patch(':id/link')
  link(
    @Param('id') id: string,
    @Body() input: LinkHandoffProfileDto,
    @CurrentUser() user: SessionUser,
  ) {
    requireRole(user, ['ADMIN', 'MANAGER']);
    return this.profiles.link(id, input.customerId, user.sub);
  }

  @Post(':id/secrets/:field/reveal')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  reveal(
    @Param('id') id: string,
    @Param('field') field: string,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ) {
    requireRole(user, ['ADMIN']);
    return this.profiles.reveal(id, field, user.sub, requestIp(request));
  }
}
