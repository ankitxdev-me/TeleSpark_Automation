import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Tenant } from '@prisma/client';

export const CurrentTenant = createParamDecorator(
  (data: keyof Tenant | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const tenant: any =
      request.tenant || (request.tenantId ? { id: request.tenantId } : null);

    if (!tenant) {
      return null;
    }

    return data ? tenant[data] : tenant;
  },
);
