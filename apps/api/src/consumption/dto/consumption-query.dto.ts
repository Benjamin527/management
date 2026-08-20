import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ConsumptionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 30, 60])
  days: 7 | 30 | 60 = 30;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  product?: string;
}
