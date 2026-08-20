import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FEISHU_FETCH, FeishuClientService } from './feishu-client.service';

@Module({
  imports: [ConfigModule],
  providers: [
    FeishuClientService,
    { provide: FEISHU_FETCH, useValue: globalThis.fetch.bind(globalThis) },
  ],
  exports: [FeishuClientService],
})
export class FeishuModule {}
