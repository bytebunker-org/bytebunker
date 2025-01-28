import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { PUBLIC_DECORATOR_KEY } from './decorator/public.decorator.js';

@Injectable()
export class LocalUserGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_DECORATOR_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        return context.switchToHttp().getRequest<Request>().isAuthenticated();
    }
}
