import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: '请输入有效邮箱' })
  email!: string;

  @IsString()
  @MinLength(8, { message: '密码至少需要 8 个字符' })
  password!: string;
}
