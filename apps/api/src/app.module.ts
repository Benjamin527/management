import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { IssuesModule } from './issues/issues.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ConsumptionModule } from './consumption/consumption.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ServiceSyncModule } from './service-sync/service-sync.module';
import { ServiceAnalysisModule } from './service-analysis/service-analysis.module';
import { ServiceRecordsModule } from './service-records/service-records.module';
import { HandoffSyncModule } from './handoff-sync/handoff-sync.module';
import { HandoffProfilesModule } from './handoff-profiles/handoff-profiles.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    CustomersModule,
    IssuesModule,
    DashboardModule,
    ConsumptionModule,
    ServiceSyncModule,
    ServiceAnalysisModule,
    ServiceRecordsModule,
    HandoffSyncModule,
    HandoffProfilesModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
