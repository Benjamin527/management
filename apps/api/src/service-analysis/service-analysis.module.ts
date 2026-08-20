import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ServiceAnalysisController } from './service-analysis.controller';
import { ServiceAnalysisService } from './service-analysis.service';

@Module({
  imports: [AuthModule],
  controllers: [ServiceAnalysisController],
  providers: [ServiceAnalysisService],
  exports: [ServiceAnalysisService],
})
export class ServiceAnalysisModule {}
