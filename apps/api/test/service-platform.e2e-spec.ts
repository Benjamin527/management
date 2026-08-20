import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { ServiceRecordStatus } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { ServiceAnalysisController } from '../src/service-analysis/service-analysis.controller';
import { ServiceAnalysisService } from '../src/service-analysis/service-analysis.service';
import { ServiceRecordsController } from '../src/service-records/service-records.controller';
import { ServiceRecordsService } from '../src/service-records/service-records.service';
import { ServiceSyncController } from '../src/service-sync/service-sync.controller';
import { ServiceSyncService } from '../src/service-sync/service-sync.service';

describe('2026 service platform routes (e2e)', () => {
  let app: INestApplication<App>;
  let findMany: jest.Mock;
  let syncRun: jest.Mock;
  let lastRecordsQuery:
    | { select?: Record<string, boolean>; where?: Record<string, unknown> }
    | undefined;

  const analysisRecords = [
    {
      startDate: new Date('2026-01-05T01:00:00.000Z'),
      customerName: '太保',
      normalizedStatus: ServiceRecordStatus.RESOLVED,
      feedbackTypeNormalized: 'bug',
      issueTypeNormalized: '告警配置',
      sourceType: '钉钉',
      deploymentType: 'SaaS',
      firstLineEngineer: '王雨轩',
      thirdLineEngineer: null,
      satisfaction: null,
      ticketId: '4096',
      keyIssue: false,
      rawFields: { 重点问题: false },
      syncedAt: new Date('2026-08-20T01:00:00.000Z'),
    },
    {
      startDate: new Date('2026-02-05T01:00:00.000Z'),
      customerName: '太保',
      normalizedStatus: ServiceRecordStatus.IN_PROGRESS,
      feedbackTypeNormalized: '咨询',
      issueTypeNormalized: '使用问题',
      sourceType: '飞书',
      deploymentType: 'SaaS',
      firstLineEngineer: '王雨轩',
      thirdLineEngineer: '三线工程师',
      satisfaction: null,
      ticketId: null,
      keyIssue: true,
      rawFields: { 重点问题: true },
      syncedAt: new Date('2026-08-20T01:00:00.000Z'),
    },
  ];

  beforeAll(async () => {
    findMany = jest.fn(
      (input: {
        select?: Record<string, boolean>;
        where?: Record<string, unknown>;
      }) => {
        if (input.select?.externalRecordId) {
          lastRecordsQuery = input;
          return Promise.resolve([
            {
              id: 'service-1',
              externalRecordId: 'rec-1',
              serviceRecordNo: '4096',
              startDate: new Date('2026-01-05T01:00:00.000Z'),
              endDate: null,
              customerId: 'customer-1',
              customerName: '太保',
              summary: '调整告警通知对象',
              sourceType: '钉钉',
              feedbackTypeNormalized: 'bug',
              issueTypeNormalized: '告警配置',
              deploymentType: 'SaaS',
              normalizedStatus: ServiceRecordStatus.RESOLVED,
              sourceStatus: '已解决',
              firstLineEngineer: '王雨轩',
              thirdLineEngineer: null,
              ticketId: '4096',
              keyIssue: false,
              syncedAt: new Date('2026-08-20T01:00:00.000Z'),
            },
          ]);
        }
        return Promise.resolve(analysisRecords);
      },
    );
    syncRun = jest.fn().mockResolvedValue({ status: 'SUCCESS' });

    const authGuard = {
      canActivate(context: ExecutionContext) {
        const requestWithUser = context
          .switchToHttp()
          .getRequest<{ headers: Record<string, string>; user?: unknown }>();
        const role = requestWithUser.headers['x-test-role'];
        if (!role) throw new UnauthorizedException('请先登录');
        requestWithUser.user = {
          sub: 'test-user',
          email: 'test@example.com',
          role,
        };
        return true;
      },
    };
    const prisma = {
      feishuServiceRecord: {
        findMany,
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'FEISHU_SERVICE_BASE_URL'
          ? 'https://example.feishu.cn/wiki/source'
          : undefined,
      ),
    };
    const sync = {
      isRunning: false,
      getStatus: jest.fn().mockResolvedValue({
        enabled: true,
        running: false,
        lastSuccessfulRun: null,
        lastRun: null,
      }),
      run: syncRun,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        ServiceAnalysisController,
        ServiceRecordsController,
        ServiceSyncController,
      ],
      providers: [
        ServiceAnalysisService,
        ServiceRecordsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: ServiceSyncService, useValue: sync },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication for service data', async () => {
    await request(app.getHttpServer())
      .get('/api/service-analysis/summary')
      .expect(401);
  });

  it('returns a 2026 summary and rejects other analysis years', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/service-analysis/summary?year=2026')
      .set('x-test-role', 'AGENT')
      .expect(200);
    const body = response.body as unknown as Record<string, unknown>;
    expect(body).toMatchObject({
      total: 2,
      inProgress: 1,
      resolvedOrClosedRate: 50,
      customerCount: 1,
    });

    await request(app.getHttpServer())
      .get('/api/service-analysis/summary?year=2025')
      .set('x-test-role', 'AGENT')
      .expect(400);
  });

  it('clamps record queries to 2026 and preserves the customer filter', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/service-records?dateFrom=2025-01-01&dateTo=2027-01-01&customerId=customer-1',
      )
      .set('x-test-role', 'AGENT')
      .expect(200);
    const body = response.body as unknown as {
      total: number;
      page: number;
      pageSize: number;
      items: Array<Record<string, unknown>>;
    };
    expect(body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(body.items[0]).toMatchObject({
      serviceRecordNo: '4096',
      customerName: '太保',
    });

    expect(lastRecordsQuery?.where).toMatchObject({
      customerId: 'customer-1',
      startDate: {
        gte: new Date('2025-12-31T16:00:00.000Z'),
        lt: new Date('2026-12-31T16:00:00.000Z'),
      },
    });
  });

  it('allows managers to sync but forbids agents', async () => {
    await request(app.getHttpServer())
      .post('/api/service-sync/run')
      .set('x-test-role', 'AGENT')
      .send({ mode: 'recent' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/service-sync/run')
      .set('x-test-role', 'MANAGER')
      .send({ mode: 'recent' })
      .expect(202)
      .expect({ accepted: true, mode: 'recent' });

    expect(syncRun).toHaveBeenCalledWith('RECENT', 'test-user');
  });

  it('rejects unsupported sync modes at the HTTP boundary', async () => {
    await request(app.getHttpServer())
      .post('/api/service-sync/run')
      .set('x-test-role', 'ADMIN')
      .send({ mode: 'all-data' })
      .expect(400);
  });
});
