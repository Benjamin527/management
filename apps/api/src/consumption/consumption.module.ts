import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool } from 'mariadb';
import { AuthModule } from '../auth/auth.module';
import { AppEnvironment } from '../config/env.validation';
import { parseMySqlUrl } from '../prisma/mysql-url';
import { ConsumptionController } from './consumption.controller';
import { ConsumptionService } from './consumption.service';
import {
  CONSUMPTION_SOURCE_POOL,
  ConsumptionSourceClient,
} from './consumption-source.client';
import { ConsumptionSyncService } from './consumption-sync.service';

@Module({
  imports: [AuthModule],
  controllers: [ConsumptionController],
  providers: [
    ConsumptionService,
    ConsumptionSourceClient,
    ConsumptionSyncService,
    {
      provide: CONSUMPTION_SOURCE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) => {
        if (!config.get<boolean>('CONSUMPTION_SYNC_ENABLED')) return null;
        const source = config.getOrThrow<string>(
          'CONSUMPTION_SOURCE_DATABASE_URL',
        );
        return createPool({
          ...parseMySqlUrl(source),
          connectionLimit: 2,
          acquireTimeout: 10_000,
        });
      },
    },
  ],
})
export class ConsumptionModule {}
