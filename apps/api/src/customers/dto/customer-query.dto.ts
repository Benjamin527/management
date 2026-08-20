import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CustomerStatus } from '../../generated/prisma/enums';

export class CustomerQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsEnum(CustomerStatus) status?: CustomerStatus;
}
