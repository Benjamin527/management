import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IssueChannel, IssuePriority } from '../../generated/prisma/enums';

export class CreateIssueDto {
  @IsString() serviceNo!: string;
  @IsString() customerId!: string;
  @IsString() @MinLength(2) @MaxLength(150) title!: string;
  @IsString() @MinLength(2) description!: string;
  @IsEnum(IssueChannel) channel!: IssueChannel;
  @IsOptional() @IsEnum(IssuePriority) priority?: IssuePriority;
  @IsOptional() @IsString() assigneeId?: string;
}
