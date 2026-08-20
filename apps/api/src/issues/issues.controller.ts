import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { SessionUser } from '../auth/jwt-auth.guard';
import { IssueStatus } from '../generated/prisma/enums';
import { AssignIssueDto } from './dto/assign-issue.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateIssueDto } from './dto/create-issue.dto';
import { IssuesService } from './issues.service';

@Controller('issues')
@UseGuards(JwtAuthGuard)
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}
  @Get() list(@Query() query: { status?: IssueStatus; customerId?: string; assigneeId?: string; keyword?: string }) { return this.issues.list(query); }
  @Post() create(@Body() input: CreateIssueDto, @CurrentUser() user: SessionUser) { return this.issues.create(input, user.sub); }
  @Get(':id') findOne(@Param('id') id: string) { return this.issues.findOne(id); }
  @Post(':id/assign') assign(@Param('id') id: string, @Body() input: AssignIssueDto, @CurrentUser() user: SessionUser) { return this.issues.assign(id, input.assigneeId, user.sub); }
  @Post(':id/status') status(@Param('id') id: string, @Body() input: ChangeStatusDto, @CurrentUser() user: SessionUser) { return this.issues.changeStatus(id, input.status, user.sub, input.comment); }
}
