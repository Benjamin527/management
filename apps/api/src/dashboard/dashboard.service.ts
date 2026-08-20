import { Injectable } from '@nestjs/common';
import { IssueStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const openStatuses = [
  IssueStatus.PENDING,
  IssueStatus.IN_PROGRESS,
  IssueStatus.WAITING_CUSTOMER,
  IssueStatus.WAITING_INTERNAL,
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [
      customerCount,
      openIssueCount,
      overdueIssueCount,
      totalIssues,
      resolvedIssues,
      responseRows,
      statusGroups,
      consumption,
      topUsers,
      riskCustomers,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { deletedAt: null } }),
      this.prisma.serviceIssue.count({
        where: { deletedAt: null, status: { in: openStatuses } },
      }),
      this.prisma.serviceIssue.count({
        where: {
          deletedAt: null,
          status: { in: openStatuses },
          slaDueAt: { lt: now },
        },
      }),
      this.prisma.serviceIssue.count({ where: { deletedAt: null } }),
      this.prisma.serviceIssue.count({
        where: {
          deletedAt: null,
          status: { in: [IssueStatus.RESOLVED, IssueStatus.CLOSED] },
        },
      }),
      this.prisma.serviceIssue.findMany({
        where: { firstRespondedAt: { not: null }, deletedAt: null },
        select: { createdAt: true, firstRespondedAt: true },
      }),
      this.prisma.serviceIssue.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.consumptionDaily.aggregate({
        where: { date: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.user.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          _count: { select: { assignedIssues: true } },
        },
        take: 8,
      }),
      this.prisma.customer.findMany({
        where: { deletedAt: null, status: 'AT_RISK' },
        select: { id: true, name: true },
        take: 8,
      }),
    ]);

    const responseMinutes = responseRows
      .filter((row) => row.firstRespondedAt)
      .map(
        (row) =>
          (row.firstRespondedAt!.getTime() - row.createdAt.getTime()) / 60000,
      );
    const averageFirstResponseMinutes = responseMinutes.length
      ? Math.round(
          responseMinutes.reduce((sum, value) => sum + value, 0) /
            responseMinutes.length,
        )
      : null;
    const amount = consumption._sum.amount;

    return {
      kpis: {
        customerCount,
        openIssueCount,
        overdueIssueCount,
        resolutionRate: totalIssues
          ? Math.round((resolvedIssues / totalIssues) * 100)
          : 0,
        averageFirstResponseMinutes,
        currentConsumption: amount == null ? null : Number(amount),
        consumptionChangeRate: null,
      },
      issueStatusDistribution: statusGroups.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),
      topAssignees: topUsers.map((user) => ({
        userId: user.id,
        name: user.name,
        total: user._count.assignedIssues,
      })),
      riskCustomers: riskCustomers.map((customer) => ({
        ...customer,
        reason: '人工标记为风险客户',
      })),
    };
  }
}
