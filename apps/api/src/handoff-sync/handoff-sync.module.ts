import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AppEnvironment } from '../config/env.validation';
import { FeishuModule } from '../feishu/feishu.module';
import { HandoffSecretService } from './handoff-secret.service';
import { HandoffSyncController } from './handoff-sync.controller';
import { HandoffSyncService } from './handoff-sync.service';

export function createHandoffSecretProvider(
  config: ConfigService<AppEnvironment, true>,
): HandoffSecretService {
  if (config.get<boolean>('FEISHU_HANDOFF_SYNC_ENABLED') === true) {
    return new HandoffSecretService(config);
  }
  return {
    encrypt: () => {
      throw new Error('Feishu handoff synchronization is disabled');
    },
  } as unknown as HandoffSecretService;
}

@Module({
  imports: [AuthModule, FeishuModule],
  controllers: [HandoffSyncController],
  providers: [
    HandoffSyncService,
    {
      provide: HandoffSecretService,
      inject: [ConfigService],
      useFactory: createHandoffSecretProvider,
    },
  ],
  exports: [HandoffSyncService],
})
export class HandoffSyncModule {}
