import { IsNotEmpty, IsString } from 'class-validator';

export class LinkHandoffProfileDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;
}
