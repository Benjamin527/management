import { Module } from '@nestjs/common';
import { FeishuModule } from '../feishu/feishu.module';
import { ServiceSyncService } from './service-sync.service';

@Module({
  imports: [FeishuModule],
  providers: [ServiceSyncService],
  exports: [ServiceSyncService],
})
export class ServiceSyncModule {}
