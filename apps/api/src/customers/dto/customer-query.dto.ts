import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CustomerStatus } from '../../generated/prisma/enums';

export enum HandoffState {
  ALL = 'ALL',
  HANDED_OVER = 'HANDED_OVER',
  PENDING = 'PENDING',
}

export class CustomerQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsEnum(CustomerStatus) status?: CustomerStatus;
  @IsOptional() @IsEnum(HandoffState) handoffState?: HandoffState;
  @IsOptional() @IsString() handoffStatus?: string;
  @IsOptional() @IsString() deploymentType?: string;
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown => {
    const input = value as unknown;
    if (input === 'true') return true;
    if (input === 'false') return false;
    return input;
  })
  @IsBoolean()
  hasLegacyIssues?: boolean;
}
