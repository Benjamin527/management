import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ServiceRecordStatus } from '../../generated/prisma/enums';

export class ListServiceRecordsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() customer?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsEnum(ServiceRecordStatus) status?: ServiceRecordStatus;
  @IsOptional() @IsString() feedbackType?: string;
  @IsOptional() @IsString() issueType?: string;
  @IsOptional() @IsString() sourceType?: string;
  @IsOptional() @IsString() deploymentType?: string;
  @IsOptional() @IsString() engineer?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
