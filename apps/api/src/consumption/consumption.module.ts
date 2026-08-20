import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConsumptionController } from './consumption.controller';
import { ConsumptionService } from './consumption.service';

@Module({
  imports: [AuthModule],
  controllers: [ConsumptionController],
  providers: [ConsumptionService],
})
export class ConsumptionModule {}
