import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SessionUser } from './jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser =>
    context.switchToHttp().getRequest<{ user: SessionUser }>().user,
);
