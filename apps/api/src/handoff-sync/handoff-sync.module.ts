import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FeishuModule } from '../feishu/feishu.module';
import { HandoffSecretService } from './handoff-secret.service';
import { HandoffSyncController } from './handoff-sync.controller';
import { HandoffSyncService } from './handoff-sync.service';

@Module({
  imports: [AuthModule, FeishuModule],
  controllers: [HandoffSyncController],
  providers: [HandoffSyncService, HandoffSecretService],
  exports: [HandoffSyncService, HandoffSecretService],
})
export class HandoffSyncModule {}
