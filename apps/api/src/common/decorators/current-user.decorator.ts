import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from '../../auth/jwt.strategy';

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext): JwtUser | unknown => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
