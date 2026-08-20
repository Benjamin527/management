import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { SlaService } from './sla.service';

@Module({
  imports: [AuthModule],
  controllers: [IssuesController],
  providers: [IssuesService, SlaService],
})
export class IssuesModule {}
