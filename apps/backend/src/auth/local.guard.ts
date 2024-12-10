import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';

@Injectable()
export class LocalGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        if (!context.switchToHttp().getRequest<Request>().isAuthenticated()) {
            return false;
        }

        // const user = context.switchToHttp().getRequest<Request>().user! as SerializedUserDto;

        return true;
    }
}
