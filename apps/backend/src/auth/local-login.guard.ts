import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalLoginGuard extends AuthGuard('local') implements CanActivate {
    private readonly logger = new Logger(LocalLoginGuard.name);

    override async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
            const result = (await super.canActivate(context)) as boolean;
            await super.logIn(context.switchToHttp().getRequest());

            return result;
        } catch (error) {
            this.logger.error("Couldn't login user", error);

            return false;
        }
    }
}
