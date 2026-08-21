import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HandoffLinkSource,
  type HandoffLinkSource as HandoffLinkSourceType,
  UserRole,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { HandoffSecretService } from '../handoff-sync/handoff-secret.service';
import { PrismaService } from '../prisma/prisma.service';

interface LinkResultRecord {
  id: string;
  customerId: string | null;
  linkSource: HandoffLinkSourceType | null;
  linkedAt: Date | null;
}

function toLinkResult(profile: LinkResultRecord) {
  return {
    profileId: profile.id,
    customerId: profile.customerId,
    linkSource: profile.linkSource,
    linkedAt: profile.linkedAt,
  };
}

@Injectable()
export class HandoffProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: HandoffSecretService,
  ) {}

  async listUnmatched() {
    const profiles = await this.prisma.feishuHandoffProfile.findMany({
      where: { deletedAt: null, customerId: null },
      orderBy: [{ handoffAt: 'desc' }, { sourceUpdatedAt: 'desc' }],
      select: {
        id: true,
        externalRecordId: true,
        customerName: true,
        deploymentType: true,
        handoffPeople: true,
        handoffAt: true,
        handoffStatus: true,
        sourceUpdatedAt: true,
      },
    });
    return profiles.map(({ id, ...profile }) => ({
      profileId: id,
      ...profile,
    }));
  }

  async link(profileId: string, customerId: string, userId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM \`FeishuHandoffProfile\` WHERE id = ${profileId} FOR UPDATE`,
        );
        const profile = await transaction.feishuHandoffProfile.findFirst({
          where: { id: profileId, deletedAt: null },
          select: {
            id: true,
            customerId: true,
            linkSource: true,
            linkedAt: true,
            linkedById: true,
          },
        });
        if (!profile) throw new NotFoundException('交接档案不存在');

        const customer = await transaction.customer.findFirst({
          where: { id: customerId, deletedAt: null },
          select: { id: true },
        });
        if (!customer) throw new NotFoundException('客户不存在');
        if (
          profile.customerId === customerId &&
          profile.linkSource === HandoffLinkSource.MANUAL
        ) {
          return toLinkResult(profile);
        }
        const canCreateManualLink =
          (profile.customerId === null && profile.linkSource === null) ||
          (profile.customerId === customerId &&
            profile.linkSource === HandoffLinkSource.AUTO);
        if (!canCreateManualLink) {
          throw new ConflictException('交接档案已关联其他客户或状态异常');
        }

        const occupied = await transaction.feishuHandoffProfile.findFirst({
          where: {
            customerId,
            deletedAt: null,
            id: { not: profileId },
          },
          select: { id: true },
        });
        if (occupied) throw new ConflictException('该客户已关联交接档案');

        const linkedAt = new Date();
        const updated = await transaction.feishuHandoffProfile.updateMany({
          where: {
            id: profileId,
            deletedAt: null,
            customerId: profile.customerId,
            linkSource: profile.linkSource,
          },
          data: {
            customerId,
            linkSource: HandoffLinkSource.MANUAL,
            linkedAt,
            linkedById: userId,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('交接档案关联状态已发生变化');
        }
        return {
          profileId,
          customerId,
          linkSource: HandoffLinkSource.MANUAL,
          linkedAt,
        };
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('该客户已关联交接档案');
      }
      throw error;
    }
  }

  async reveal(
    profileId: string,
    fieldName: string,
    userId: string,
    ipAddress: string | null,
  ) {
    if (fieldName !== 'deploymentChecklist') {
      throw new BadRequestException('不支持查看该受保护字段');
    }
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, active: true, role: true },
    });
    if (
      !currentUser ||
      !currentUser.active ||
      currentUser.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('当前账户无权查看受保护字段');
    }
    const profile = await this.prisma.feishuHandoffProfile.findFirst({
      where: { id: profileId, deletedAt: null },
      select: {
        id: true,
        externalRecordId: true,
        customerId: true,
        customerName: true,
        secrets: {
          where: { fieldName },
          select: {
            formatVersion: true,
            keyId: true,
            ciphertext: true,
            iv: true,
            authTag: true,
          },
          take: 1,
        },
      },
    });
    if (!profile) throw new NotFoundException('交接档案不存在');
    if (!profile.secrets[0]) {
      throw new NotFoundException('受保护字段不存在');
    }

    const value = this.secrets.decrypt(
      { externalRecordId: profile.externalRecordId, fieldName },
      profile.secrets[0],
    );
    await this.prisma.sensitiveAccessAudit.create({
      data: {
        userId,
        profileId: profile.id,
        fieldName,
        ipAddress,
        customerIdSnapshot: profile.customerId,
        customerNameSnapshot: profile.customerName,
        externalRecordIdSnapshot: profile.externalRecordId,
      },
    });

    return { field: fieldName, value };
  }
}
