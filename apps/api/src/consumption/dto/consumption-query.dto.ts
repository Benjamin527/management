import { IsIn, IsOptional, IsString } from 'class-validator';

export class ConsumptionQueryDto {
  @IsOptional()
  @IsIn(['ALL', 'DOMESTIC', 'OVERSEAS'])
  source: 'ALL' | 'DOMESTIC' | 'OVERSEAS' = 'ALL';

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  product?: string;
}
