import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface SessionUser {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const token = request.cookies?.access_token as string | undefined;
    if (!token) throw new UnauthorizedException('请先登录');

    try {
      request.user = await this.jwt.verifyAsync<SessionUser>(token);
      return true;
    } catch {
      throw new UnauthorizedException('登录状态已过期');
    }
  }
}
