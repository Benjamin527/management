import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard, type SessionUser } from '../auth/jwt-auth.guard';
import { configureTrustProxy } from '../main';
import { HandoffProfilesController } from './handoff-profiles.controller';
import { HandoffProfilesService } from './handoff-profiles.service';

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: SessionUser }>();
    const role = request.get('x-test-role') ?? '';
    request.user = {
      sub: 'user-1',
      email: 'user@example.com',
      role,
    };
    return true;
  }
}

interface ProfilesMock {
  listUnmatched: jest.MockedFunction<() => Promise<Array<{ id: string }>>>;
  link: jest.MockedFunction<
    (
      profileId: string,
      customerId: string,
      userId: string,
    ) => Promise<{
      id: string;
    }>
  >;
  reveal: jest.MockedFunction<
    (
      profileId: string,
      field: string,
      userId: string,
      ipAddress: string | null,
    ) => Promise<{ field: string; value: string }>
  >;
}

describe('HandoffProfilesController', () => {
  let app: INestApplication<App>;
  let controller: HandoffProfilesController;
  let profiles: ProfilesMock;

  beforeEach(async () => {
    profiles = {
      listUnmatched: jest.fn().mockResolvedValue([{ id: 'profile-1' }]),
      link: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      reveal: jest.fn().mockResolvedValue({
        field: 'deploymentChecklist',
        value: 'secret',
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [HandoffProfilesController],
      providers: [{ provide: HandoffProfilesService, useValue: profiles }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .compile();

    app = module.createNestApplication();
    configureTrustProxy(app);
    controller = module.get(HandoffProfilesController);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => app?.close());

  it.each([
    ['ADMIN', 200, true],
    ['MANAGER', 200, true],
    ['AGENT', 403, false],
    ['SALES', 403, false],
  ])('enforces unmatched list access for %s', async (role, status, allowed) => {
    await request(app.getHttpServer())
      .get('/handoff-profiles/unmatched')
      .set('x-test-role', role)
      .expect(status);
    expect(profiles.listUnmatched).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });

  it.each([
    ['ADMIN', 200, true],
    ['MANAGER', 200, true],
    ['AGENT', 403, false],
    ['SALES', 403, false],
  ])('enforces manual link access for %s', async (role, status, allowed) => {
    await request(app.getHttpServer())
      .patch('/handoff-profiles/profile-1/link')
      .set('x-test-role', role)
      .send({ customerId: 'customer-1' })
      .expect(status);
    expect(profiles.link).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (allowed) {
      expect(profiles.link).toHaveBeenCalledWith(
        'profile-1',
        'customer-1',
        'user-1',
      );
    }
  });

  it.each([{ customerId: '' }, { customerId: 42 }, {}])(
    'validates a non-empty string customerId for linking',
    async (body) => {
      await request(app.getHttpServer())
        .patch('/handoff-profiles/profile-1/link')
        .set('x-test-role', 'ADMIN')
        .send(body)
        .expect(400);
      expect(profiles.link).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['ADMIN', 200, true],
    ['MANAGER', 403, false],
    ['AGENT', 403, false],
    ['SALES', 403, false],
  ])(
    'enforces protected reveal access for %s',
    async (role, status, allowed) => {
      const response = await request(app.getHttpServer())
        .post('/handoff-profiles/profile-1/secrets/deploymentChecklist/reveal')
        .set('x-test-role', role)
        .set('x-forwarded-for', '198.51.100.77')
        .expect(status);

      expect(profiles.reveal).toHaveBeenCalledTimes(allowed ? 1 : 0);
      if (allowed) {
        expect(response.get('cache-control')).toBe('no-store, private');
        expect(response.get('pragma')).toBe('no-cache');
        expect(response.get('expires')).toBe('0');
        expect(profiles.reveal).toHaveBeenCalledWith(
          'profile-1',
          'deploymentChecklist',
          'user-1',
          '198.51.100.77',
        );
      }
    },
  );

  it('bounds the remote address stored with reveal audits', async () => {
    await controller.reveal(
      'profile-1',
      'deploymentChecklist',
      { sub: 'user-1', email: 'user@example.com', role: 'ADMIN' },
      {
        ip: 'x'.repeat(200),
        socket: { remoteAddress: '198.51.100.10' },
      } as never,
    );

    expect(profiles.reveal).toHaveBeenCalledWith(
      'profile-1',
      'deploymentChecklist',
      'user-1',
      'x'.repeat(64),
    );
  });

  it('ignores forwarded-for from a non-loopback direct connection', async () => {
    const expressApp = app.getHttpAdapter().getInstance() as {
      request: Request;
      get(setting: string): unknown;
    };
    expect(expressApp.get('trust proxy')).toBe('loopback');
    const untrustedRequest = Object.create(expressApp.request) as Request;
    Object.defineProperty(untrustedRequest, 'headers', {
      value: { 'x-forwarded-for': '198.51.100.77' },
    });
    Object.defineProperty(untrustedRequest, 'socket', {
      value: { remoteAddress: '203.0.113.10' },
    });

    await controller.reveal(
      'profile-1',
      'deploymentChecklist',
      { sub: 'user-1', email: 'user@example.com', role: 'ADMIN' },
      untrustedRequest,
    );

    expect(untrustedRequest.ip).toBe('203.0.113.10');
    expect(profiles.reveal).toHaveBeenCalledWith(
      'profile-1',
      'deploymentChecklist',
      'user-1',
      '203.0.113.10',
    );
  });
});
