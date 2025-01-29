import { Injectable } from '@nestjs/common';
import type { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { serialize } from '@mikro-orm/core';

@Injectable()
export class MikroOrmSerializationResponseInterceptor<T> implements NestInterceptor<T, T> {
    intercept(context: ExecutionContext, next: CallHandler): Observable<T> {
        return next.handle().pipe(map((data) => this.transformData(data)));
    }

    private transformData(data: unknown): any {
        if (typeof data === 'object' && data !== null) {
            return serialize(data);
        } else {
            return data;
        }
    }
}
