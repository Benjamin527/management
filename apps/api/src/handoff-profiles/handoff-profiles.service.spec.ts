import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../config/env.validation';
import { HandoffSecretService } from '../handoff-sync/handoff-secret.service';
import { HandoffProfilesService } from './handoff-profiles.service';

function prismaWithTransaction<T extends object>(transaction: T) {
  const profileDelegate = (
    transaction as {
      feishuHandoffProfile?: { updateMany?: jest.Mock };
    }
  ).feishuHandoffProfile;
  if (profileDelegate && !profileDelegate.updateMany) {
    profileDelegate.updateMany = jest.fn().mockResolvedValue({ count: 1 });
  }
  const transactionClient = Object.assign(transaction, {
    $queryRaw: jest.fn().mockResolvedValue([]),
  });
  return {
    transactionClient,
    $transaction: jest.fn(
      (work: (value: typeof transactionClient) => unknown) =>
        work(transactionClient),
    ),
  };
}

describe('HandoffProfilesService', () => {
  const activeAdmin = { id: 'admin-1', active: true, role: 'ADMIN' };

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

  it('locks the target profile row before reading its link state', async () => {
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

    expect(prisma.transactionClient.$queryRaw).toHaveBeenCalledTimes(1);
    const lockCalls = prisma.transactionClient.$queryRaw.mock
      .calls as unknown[][];
    const lockQuery = lockCalls[0][0] as {
      strings: string[];
      values: unknown[];
    };
    expect(lockQuery.strings.join('?')).toBe(
      'SELECT id FROM `FeishuHandoffProfile` WHERE id = ? FOR UPDATE',
    );
    expect(lockQuery.values).toEqual(['profile-1']);
    expect(
      prisma.transactionClient.$queryRaw.mock.invocationCallOrder[0],
    ).toBeLessThan(
      transaction.feishuHandoffProfile.findFirst.mock.invocationCallOrder[0],
    );
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
          .mockResolvedValueOnce({
            id: 'profile-1',
            customerId: null,
            linkSource: null,
            linkedAt: null,
            linkedById: null,
          })
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

  it('returns only explicit public link fields after creating a manual link', async () => {
    const linkedAt = new Date('2026-08-21T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(linkedAt);
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'profile-1',
            customerId: null,
            linkSource: null,
            linkedAt: null,
            linkedById: null,
          })
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({
          id: 'profile-1',
          customerId: 'customer-1',
          linkSource: 'MANUAL',
          linkedAt,
          linkedById: 'admin-1',
          rawFieldsMasked: { password: 'masked' },
          contactInfo: 'private-contact',
          importantIssues: 'internal-notes',
        }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
    };
    const prisma = prismaWithTransaction(transaction);
    const service = new HandoffProfilesService(prisma as never, {} as never);

    try {
      await expect(
        service.link('profile-1', 'customer-1', 'admin-1'),
      ).resolves.toEqual({
        profileId: 'profile-1',
        customerId: 'customer-1',
        linkSource: 'MANUAL',
        linkedAt,
      });
      expect(transaction.feishuHandoffProfile.update).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses a compare-and-set update for the expected unlinked state', async () => {
    const linkedAt = new Date('2026-08-21T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(linkedAt);
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'profile-1',
            customerId: null,
            linkSource: null,
            linkedAt: null,
            linkedById: null,
          })
          .mockResolvedValueOnce(null),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
    };
    const prisma = prismaWithTransaction(transaction);
    const service = new HandoffProfilesService(prisma as never, {} as never);

    try {
      await expect(
        service.link('profile-1', 'customer-1', 'admin-1'),
      ).resolves.toEqual({
        profileId: 'profile-1',
        customerId: 'customer-1',
        linkSource: 'MANUAL',
        linkedAt,
      });
      expect(transaction.feishuHandoffProfile.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'profile-1',
          deletedAt: null,
          customerId: null,
          linkSource: null,
        },
        data: {
          customerId: 'customer-1',
          linkSource: 'MANUAL',
          linkedAt,
          linkedById: 'admin-1',
        },
      });
      expect(transaction.feishuHandoffProfile.update).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects when another transaction changes the profile before compare-and-set', async () => {
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'profile-1',
            customerId: null,
            linkSource: null,
            linkedAt: null,
            linkedById: null,
          })
          .mockResolvedValueOnce(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
    };
    const prisma = prismaWithTransaction(transaction);
    const service = new HandoffProfilesService(prisma as never, {} as never);

    await expect(
      service.link('profile-1', 'customer-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.feishuHandoffProfile.updateMany).toHaveBeenCalledTimes(
      1,
    );
  });

  it('makes a second transaction read the first committed link after waiting for the row lock', async () => {
    const state: {
      customerId: string | null;
      linkSource: string | null;
      linkedAt: Date | null;
      linkedById: string | null;
    } = {
      customerId: null,
      linkSource: null,
      linkedAt: null,
      linkedById: null,
    };
    const events: string[] = [];
    let lockTail = Promise.resolve();
    const prisma = {
      $transaction: jest.fn(
        async (
          work: (transaction: {
            $queryRaw: (query: unknown) => Promise<unknown[]>;
            customer: { findFirst: () => Promise<{ id: string }> };
            feishuHandoffProfile: {
              findFirst: () => Promise<Record<string, unknown> | null>;
              updateMany: (input: {
                where: { customerId: string | null; linkSource: string | null };
                data: {
                  customerId: string;
                  linkSource: string;
                  linkedAt: Date;
                  linkedById: string;
                };
              }) => Promise<{ count: number }>;
            };
          }) => Promise<unknown>,
        ) => {
          const waitForLock = lockTail;
          let releaseLock = () => undefined;
          lockTail = new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
          let profileRead = false;
          const transaction = {
            $queryRaw: (query: unknown) => {
              void query;
              return waitForLock.then(() => {
                events.push('lock');
                return [];
              });
            },
            customer: {
              findFirst: () => Promise.resolve({ id: 'active-customer' }),
            },
            feishuHandoffProfile: {
              findFirst: () => {
                if (profileRead) return Promise.resolve(null);
                profileRead = true;
                events.push(`read:${state.customerId ?? 'null'}`);
                return Promise.resolve({ id: 'profile-1', ...state });
              },
              updateMany: (input: {
                where: { customerId: string | null; linkSource: string | null };
                data: {
                  customerId: string;
                  linkSource: string;
                  linkedAt: Date;
                  linkedById: string;
                };
              }) => {
                if (
                  state.customerId !== input.where.customerId ||
                  state.linkSource !== input.where.linkSource
                ) {
                  return Promise.resolve({ count: 0 });
                }
                Object.assign(state, input.data);
                events.push(`write:${state.customerId}`);
                return Promise.resolve({ count: 1 });
              },
            },
          };
          try {
            return await work(transaction);
          } finally {
            releaseLock();
          }
        },
      ),
    };
    const service = new HandoffProfilesService(prisma as never, {} as never);

    const attempts = await Promise.allSettled([
      service.link('profile-1', 'customer-a', 'admin-a'),
      service.link('profile-1', 'customer-b', 'admin-b'),
    ]);

    expect(
      attempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(events).toEqual([
      'lock',
      'read:null',
      'write:customer-a',
      'lock',
      'read:customer-a',
    ]);
    expect(state).toMatchObject({
      customerId: 'customer-a',
      linkSource: 'MANUAL',
      linkedById: 'admin-a',
    });
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
    ).resolves.toEqual({
      profileId: 'profile-1',
      customerId: 'customer-1',
      linkSource: 'MANUAL',
      linkedAt: linked.linkedAt,
    });
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
    expect(transaction.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-1', deletedAt: null },
      select: { id: true },
    });
    expect(transaction.feishuHandoffProfile.update).not.toHaveBeenCalled();
  });

  it('rejects an existing manual link when its target customer is soft-deleted', async () => {
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-1',
          customerId: 'customer-1',
          linkSource: 'MANUAL',
          linkedAt: new Date('2026-08-20T00:00:00.000Z'),
          linkedById: 'original-admin',
        }),
        update: jest.fn(),
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
    expect(transaction.feishuHandoffProfile.update).not.toHaveBeenCalled();
  });

  it.each(['AUTO', 'MANUAL'])(
    'rejects changing an existing %s link to another customer',
    async (linkSource) => {
      const transaction = {
        feishuHandoffProfile: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'profile-1',
              customerId: 'original-customer',
              linkSource,
              linkedAt: new Date('2026-08-20T00:00:00.000Z'),
              linkedById: linkSource === 'MANUAL' ? 'admin-1' : null,
            })
            .mockResolvedValueOnce(null),
          update: jest.fn(),
        },
        customer: {
          findFirst: jest.fn().mockResolvedValue({ id: 'new-customer' }),
        },
      };
      const prisma = prismaWithTransaction(transaction);
      const service = new HandoffProfilesService(prisma as never, {} as never);

      await expect(
        service.link('profile-1', 'new-customer', 'admin-2'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(transaction.feishuHandoffProfile.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    { customerId: null, linkSource: 'AUTO' },
    { customerId: 'customer-1', linkSource: null },
  ])('rejects an inconsistent existing link state', async (profileState) => {
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'profile-1',
            linkedAt: null,
            linkedById: null,
            ...profileState,
          })
          .mockResolvedValueOnce(null),
        updateMany: jest.fn(),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
    };
    const prisma = prismaWithTransaction(transaction);
    const service = new HandoffProfilesService(prisma as never, {} as never);

    await expect(
      service.link('profile-1', 'customer-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.feishuHandoffProfile.updateMany).not.toHaveBeenCalled();
  });

  it('converts an auto link to manual once and leaves a retry unchanged', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T00:00:00.000Z'));
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

    try {
      await expect(
        service.link('profile-1', 'customer-1', 'admin-1'),
      ).resolves.toEqual({
        profileId: 'profile-1',
        customerId: 'customer-1',
        linkSource: 'MANUAL',
        linkedAt: manuallyLinked.linkedAt,
      });
      await expect(
        service.link('profile-1', 'customer-1', 'admin-2'),
      ).resolves.toEqual({
        profileId: 'profile-1',
        customerId: 'customer-1',
        linkSource: 'MANUAL',
        linkedAt: manuallyLinked.linkedAt,
      });

      expect(transaction.feishuHandoffProfile.updateMany).toHaveBeenCalledTimes(
        1,
      );
      expect(transaction.feishuHandoffProfile.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'profile-1',
          deletedAt: null,
          customerId: 'customer-1',
          linkSource: 'AUTO',
        },
        data: {
          customerId: 'customer-1',
          linkSource: 'MANUAL',
          linkedAt: manuallyLinked.linkedAt,
          linkedById: 'admin-1',
        },
      });
      expect(transaction.feishuHandoffProfile.update).not.toHaveBeenCalled();
      expect(transaction.customer.findFirst).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('turns a concurrent unique collision into the same safe conflict', async () => {
    const transaction = {
      feishuHandoffProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'profile-1',
            customerId: null,
            linkSource: null,
            linkedAt: null,
            linkedById: null,
          })
          .mockResolvedValueOnce(null),
        updateMany: jest.fn().mockRejectedValue({
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

  it.each([
    [{ id: 'admin-1', active: false, role: 'ADMIN' }],
    [{ id: 'admin-1', active: true, role: 'MANAGER' }],
    [null],
  ])(
    'rechecks the current database user before decrypting protected data',
    async (databaseUser) => {
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(databaseUser) },
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
      const secrets = { decrypt: jest.fn().mockReturnValue('secret') };
      const service = new HandoffProfilesService(
        prisma as never,
        secrets as never,
      );

      await expect(
        service.reveal('profile-1', 'deploymentChecklist', 'admin-1', null),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        select: { id: true, active: true, role: true },
      });
      expect(secrets.decrypt).not.toHaveBeenCalled();
      expect(prisma.sensitiveAccessAudit.create).not.toHaveBeenCalled();
    },
  );

  it('does not reveal from a missing or deleted profile', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(activeAdmin) },
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
      user: { findUnique: jest.fn().mockResolvedValue(activeAdmin) },
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
      user: { findUnique: jest.fn().mockResolvedValue(activeAdmin) },
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
      user: { findUnique: jest.fn().mockResolvedValue(activeAdmin) },
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
      user: { findUnique: jest.fn().mockResolvedValue(activeAdmin) },
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

  it('returns a stable 503 instead of a type error when no secret key is configured', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(activeAdmin) },
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
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService<AppEnvironment, true>;
    const service = new HandoffProfilesService(
      prisma as never,
      new HandoffSecretService(config),
    );

    await expect(
      service.reveal('profile-1', 'deploymentChecklist', 'admin-1', null),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.sensitiveAccessAudit.create).not.toHaveBeenCalled();
  });
});
