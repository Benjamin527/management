import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

export type ConsumptionPeriod = 7 | 14;
export type ConsumptionSourceFilter = 'ALL' | 'DOMESTIC' | 'OVERSEAS';
export type ConsumptionAnomalyFilter =
  'ALL' | 'SILENT' | 'DROP' | 'RISE' | 'NORMAL';
export type ConsumptionDirectionFilter =
  'ALL' | 'UP' | 'DOWN' | 'FLAT' | 'UNCOMPARABLE';

export class ConsumptionQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsIn([7, 14])
  period: ConsumptionPeriod = 14;

  @IsOptional()
  @IsIn(['ALL', 'DOMESTIC', 'OVERSEAS'])
  source: ConsumptionSourceFilter = 'ALL';

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  product?: string;

  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsIn(['ALL', 'SILENT', 'DROP', 'RISE', 'NORMAL'])
  anomalyStatus: ConsumptionAnomalyFilter = 'ALL';

  @IsOptional()
  @IsIn(['ALL', 'UP', 'DOWN', 'FLAT', 'UNCOMPARABLE'])
  direction: ConsumptionDirectionFilter = 'ALL';
}
