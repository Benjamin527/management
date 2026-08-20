import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FeishuModule } from '../feishu/feishu.module';
import { ServiceSyncController } from './service-sync.controller';
import { ServiceSyncService } from './service-sync.service';

@Module({
  imports: [AuthModule, FeishuModule],
  controllers: [ServiceSyncController],
  providers: [ServiceSyncService],
  exports: [ServiceSyncService],
})
export class ServiceSyncModule {}
