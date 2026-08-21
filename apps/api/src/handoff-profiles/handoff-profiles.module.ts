import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HandoffSyncModule } from '../handoff-sync/handoff-sync.module';
import { HandoffProfilesController } from './handoff-profiles.controller';
import { HandoffProfilesService } from './handoff-profiles.service';

@Module({
  imports: [AuthModule, HandoffSyncModule],
  controllers: [HandoffProfilesController],
  providers: [HandoffProfilesService],
})
export class HandoffProfilesModule {}
