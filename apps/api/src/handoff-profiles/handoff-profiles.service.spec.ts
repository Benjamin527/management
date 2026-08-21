import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { HandoffProfilesService } from './handoff-profiles.service';

function prismaWithTransaction<T extends object>(transaction: T) {
  return {
    $transaction: jest.fn((work: (value: T) => unknown) => work(transaction)),
  };
}

describe('HandoffProfilesService', () => {
  it('lists only safe fields from active unmatched profiles in source order', async () => {
    const profiles = [
      {
        id: 'profile-1',
        externalRecordId: 'record-1',
        customerName: '示例客户',
      },
    ];
    const prisma = {
      feishuHandoffProfile: {
        findMany: jest.fn().mockResolvedValue(profiles),
      },
    };
    const service = new HandoffProfilesService(prisma as never, {} as never);

    await expect(service.listUnmatched()).resolves.toEqual([
      {
        profileId: 'profile-1',
        externalRecordId: 'record-1',
        customerName: '示例客户',
      },
    ]);
    expect(prisma.feishuHandoffProfile.findMany).toHaveBeenCalledWith({
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
  });

  it('does not link a missing or deleted profile', async () => {
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma = prismaWithTransaction(transaction);
    const service = new HandoffProfilesService(prisma as never, {} as never);

    await expect(
      service.link('profile-1', 'customer-1', 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.feishuHandoffProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'profile-1', deletedAt: null },
      select: {
        id: true,
        customerId: true,
        linkSource: true,
        linkedAt: true,
        linkedById: true,
      },
    });
  });

  it('does not link a missing or deleted customer', async () => {
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'profile-1', customerId: null }),
      },
      customer: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = prismaWithTransaction(transaction);
    const service = new HandoffProfilesService(prisma as never, {} as never);

    await expect(
      service.link('profile-1', 'customer-1', 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-1', deletedAt: null },
      select: { id: true },
    });
  });

  it('rejects a customer already occupied by another active profile without leaking it', async () => {
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'profile-1', customerId: null })
          .mockResolvedValueOnce({ id: 'secret-other-profile' }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
    };
    const prisma = prismaWithTransaction(transaction);
    const service = new HandoffProfilesService(prisma as never, {} as never);

    const result = service.link('profile-1', 'customer-1', 'admin-1');

    await expect(result).rejects.toBeInstanceOf(ConflictException);
    await expect(result).rejects.not.toThrow(/secret-other-profile/);
    expect(transaction.feishuHandoffProfile.findFirst).toHaveBeenLastCalledWith(
      {
        where: {
          customerId: 'customer-1',
          deletedAt: null,
          id: { not: 'profile-1' },
        },
        select: { id: true },
      },
    );
  });

  it('returns an existing manual link unchanged when retried for the same customer', async () => {
    const linked = {
      id: 'profile-1',
      customerId: 'customer-1',
      linkSource: 'MANUAL',
      linkedAt: new Date('2026-08-20T00:00:00.000Z'),
      linkedById: 'original-admin',
    };
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest.fn().mockResolvedValue(linked),
        update: jest.fn().mockResolvedValue(linked),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
    };
    const prisma = prismaWithTransaction(transaction);
    const service = new HandoffProfilesService(prisma as never, {} as never);

    await expect(
      service.link('profile-1', 'customer-1', 'admin-1'),
    ).resolves.toEqual(linked);
    expect(transaction.feishuHandoffProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'profile-1', deletedAt: null },
      select: {
        id: true,
        customerId: true,
        linkSource: true,
        linkedAt: true,
        linkedById: true,
      },
    });
    expect(transaction.customer.findFirst).not.toHaveBeenCalled();
    expect(transaction.feishuHandoffProfile.update).not.toHaveBeenCalled();
  });

  it('converts an auto link to manual once and leaves a retry unchanged', async () => {
    const autoLinked = {
      id: 'profile-1',
      customerId: 'customer-1',
      linkSource: 'AUTO',
      linkedAt: new Date('2026-08-19T00:00:00.000Z'),
      linkedById: null,
    };
    const manuallyLinked = {
      ...autoLinked,
      linkSource: 'MANUAL',
      linkedAt: new Date('2026-08-20T00:00:00.000Z'),
      linkedById: 'admin-1',
    };
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(autoLinked)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(manuallyLinked),
        update: jest.fn().mockResolvedValue(manuallyLinked),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
    };
    const prisma = prismaWithTransaction(transaction);
    const service = new HandoffProfilesService(prisma as never, {} as never);

    await expect(
      service.link('profile-1', 'customer-1', 'admin-1'),
    ).resolves.toEqual(manuallyLinked);
    await expect(
      service.link('profile-1', 'customer-1', 'admin-2'),
    ).resolves.toEqual(manuallyLinked);

    expect(transaction.feishuHandoffProfile.update).toHaveBeenCalledTimes(1);
    expect(transaction.feishuHandoffProfile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: {
        customerId: 'customer-1',
        linkSource: 'MANUAL',
        linkedAt: expect.any(Date) as Date,
        linkedById: 'admin-1',
      },
    });
    expect(transaction.customer.findFirst).toHaveBeenCalledTimes(1);
  });

  it('turns a concurrent unique collision into the same safe conflict', async () => {
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'profile-1', customerId: null })
          .mockResolvedValueOnce(null),
        update: jest.fn().mockRejectedValue({
          code: 'P2002',
          meta: { target: 'customerId', sensitive: 'do-not-return' },
        }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
    };
    const prisma = prismaWithTransaction(transaction);
    const service = new HandoffProfilesService(prisma as never, {} as never);

    const result = service.link('profile-1', 'customer-1', 'admin-1');

    await expect(result).rejects.toBeInstanceOf(ConflictException);
    await expect(result).rejects.not.toThrow(/do-not-return|customerId/);
  });

  it('rejects protected fields outside the explicit reveal allowlist', async () => {
    const prisma = { feishuHandoffProfile: { findFirst: jest.fn() } };
    const secrets = { decrypt: jest.fn() };
    const service = new HandoffProfilesService(
      prisma as never,
      secrets as never,
    );

    await expect(
      service.reveal('profile-1', 'contactInfo', 'admin-1', '127.0.0.1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.feishuHandoffProfile.findFirst).not.toHaveBeenCalled();
    expect(secrets.decrypt).not.toHaveBeenCalled();
  });

  it('does not reveal from a missing or deleted profile', async () => {
    const prisma = {
      feishuHandoffProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const secrets = { decrypt: jest.fn() };
    const service = new HandoffProfilesService(
      prisma as never,
      secrets as never,
    );

    await expect(
      service.reveal('profile-1', 'deploymentChecklist', 'admin-1', null),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.feishuHandoffProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'profile-1', deletedAt: null },
      select: {
        id: true,
        externalRecordId: true,
        customerId: true,
        customerName: true,
        secrets: {
          where: { fieldName: 'deploymentChecklist' },
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
    expect(secrets.decrypt).not.toHaveBeenCalled();
  });

  it('does not reveal when the corresponding secret is missing', async () => {
    const prisma = {
      feishuHandoffProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-1',
          externalRecordId: 'record-1',
          customerId: null,
          customerName: '示例客户',
          secrets: [],
        }),
      },
    };
    const secrets = { decrypt: jest.fn() };
    const service = new HandoffProfilesService(
      prisma as never,
      secrets as never,
    );

    await expect(
      service.reveal('profile-1', 'deploymentChecklist', 'admin-1', null),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(secrets.decrypt).not.toHaveBeenCalled();
  });

  it('decrypts with record context and returns only after writing snapshot audit data', async () => {
    const envelope = {
      formatVersion: 1,
      keyId: 'key-1',
      ciphertext: 'ciphertext',
      iv: 'iv',
      authTag: 'tag',
    };
    const prisma = {
      feishuHandoffProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-1',
          externalRecordId: 'record-1',
          customerId: null,
          customerName: '示例客户',
          secrets: [envelope],
        }),
      },
      sensitiveAccessAudit: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    const secrets = { decrypt: jest.fn().mockReturnValue('部署清单明文') };
    const service = new HandoffProfilesService(
      prisma as never,
      secrets as never,
    );

    await expect(
      service.reveal(
        'profile-1',
        'deploymentChecklist',
        'admin-1',
        '203.0.113.9',
      ),
    ).resolves.toEqual({
      field: 'deploymentChecklist',
      value: '部署清单明文',
    });
    expect(secrets.decrypt).toHaveBeenCalledWith(
      {
        externalRecordId: 'record-1',
        fieldName: 'deploymentChecklist',
      },
      envelope,
    );
    expect(prisma.sensitiveAccessAudit.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        profileId: 'profile-1',
        fieldName: 'deploymentChecklist',
        ipAddress: '203.0.113.9',
        customerIdSnapshot: null,
        customerNameSnapshot: '示例客户',
        externalRecordIdSnapshot: 'record-1',
      },
    });
    expect(secrets.decrypt.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.sensitiveAccessAudit.create.mock.invocationCallOrder[0],
    );
  });

  it('does not return decrypted data when the audit write fails', async () => {
    const prisma = {
      feishuHandoffProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-1',
          externalRecordId: 'record-1',
          customerId: 'customer-1',
          customerName: '示例客户',
          secrets: [
            {
              formatVersion: 1,
              keyId: 'key-1',
              ciphertext: 'ciphertext',
              iv: 'iv',
              authTag: 'tag',
            },
          ],
        }),
      },
      sensitiveAccessAudit: {
        create: jest.fn().mockRejectedValue(new Error('audit unavailable')),
      },
    };
    const secrets = { decrypt: jest.fn().mockReturnValue('不得返回的明文') };
    const service = new HandoffProfilesService(
      prisma as never,
      secrets as never,
    );

    await expect(
      service.reveal('profile-1', 'deploymentChecklist', 'admin-1', null),
    ).rejects.toThrow('audit unavailable');
  });

  it('does not audit when decryption fails', async () => {
    const prisma = {
      feishuHandoffProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-1',
          externalRecordId: 'record-1',
          customerId: null,
          customerName: '示例客户',
          secrets: [
            {
              formatVersion: 1,
              keyId: 'key-1',
              ciphertext: 'ciphertext',
              iv: 'iv',
              authTag: 'tag',
            },
          ],
        }),
      },
      sensitiveAccessAudit: { create: jest.fn() },
    };
    const secrets = {
      decrypt: jest.fn(() => {
        throw new Error('Unable to decrypt protected handoff field');
      }),
    };
    const service = new HandoffProfilesService(
      prisma as never,
      secrets as never,
    );

    await expect(
      service.reveal('profile-1', 'deploymentChecklist', 'admin-1', null),
    ).rejects.toThrow('Unable to decrypt protected handoff field');
    expect(prisma.sensitiveAccessAudit.create).not.toHaveBeenCalled();
  });
});
