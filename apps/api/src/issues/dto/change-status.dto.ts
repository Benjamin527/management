import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IssueStatus } from '../../generated/prisma/enums';

export class ChangeStatusDto {
  @IsEnum(IssueStatus) status!: IssueStatus;
  @IsOptional() @IsString() comment?: string;
}
