import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IssueActivityType, IssueStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { canTransition } from './issue-state-machine';
import { SlaService } from './sla.service';

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sla: SlaService,
  ) {}

  list(query: {
    status?: IssueStatus;
    customerId?: string;
    assigneeId?: string;
    keyword?: string;
  }) {
    return this.prisma.serviceIssue.findMany({
      where: {
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
        ...(query.keyword
          ? {
              OR: [
                { title: { contains: query.keyword } },
                { serviceNo: { contains: query.keyword } },
              ],
            }
          : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(input: CreateIssueDto, actorId: string) {
    const priority = input.priority ?? 'MEDIUM';
    try {
      return await this.prisma.$transaction(async (tx) => {
        const issue = await tx.serviceIssue.create({
          data: { ...input, priority, slaDueAt: this.sla.dueAt(priority) },
          include: { customer: { select: { id: true, name: true } } },
        });
        await tx.issueActivity.create({
          data: { issueId: issue.id, actorId, type: IssueActivityType.CREATED },
        });
        return issue;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('服务编号已经存在');
      if ((error as { code?: string }).code === 'P2003')
        throw new BadRequestException('客户或负责人不存在');
      throw error;
    }
  }

  async findOne(id: string) {
    const issue = await this.prisma.serviceIssue.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        activities: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!issue) throw new NotFoundException('服务问题不存在');
    return issue;
  }

  async assign(id: string, assigneeId: string, actorId: string) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const issue = await tx.serviceIssue.update({
        where: { id },
        data: { assigneeId },
      });
      await tx.issueActivity.create({
        data: {
          issueId: id,
          actorId,
          type: IssueActivityType.ASSIGNED,
          metadata: { assigneeId },
        },
      });
      return issue;
    });
  }

  async changeStatus(
    id: string,
    next: IssueStatus,
    actorId: string,
    comment?: string,
  ) {
    const current = await this.findOne(id);
    if (!canTransition(current.status, next)) {
      throw new BadRequestException(`不能从 ${current.status} 变更为 ${next}`);
    }
    const now = new Date();
    const timestamps = {
      ...(next === IssueStatus.IN_PROGRESS && !current.firstRespondedAt
        ? { firstRespondedAt: now }
        : {}),
      ...(next === IssueStatus.RESOLVED ? { resolvedAt: now } : {}),
      ...(next === IssueStatus.CLOSED ? { closedAt: now } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const issue = await tx.serviceIssue.update({
        where: { id },
        data: { status: next, ...timestamps },
      });
      await tx.issueActivity.create({
        data: {
          issueId: id,
          actorId,
          type: IssueActivityType.STATUS_CHANGED,
          content: comment,
          metadata: { from: current.status, to: next },
        },
      });
      return issue;
    });
  }
}
