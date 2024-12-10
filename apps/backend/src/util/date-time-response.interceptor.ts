import { Injectable } from '@nestjs/common';
import type { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DateTime } from 'luxon';

@Injectable()
export class DateTimeResponseInterceptor<T> implements NestInterceptor<T, T> {
    intercept(context: ExecutionContext, next: CallHandler): Observable<T> {
        return next.handle().pipe(map((data) => this.transformData(data)));
    }

    private transformData(data: any): any {
        if (Array.isArray(data)) {
            return data.map((item) => this.transformData(item));
        }

        if (typeof data === 'object' && data !== null) {
            for (const key in data) {
                const value = data[key];
                if (DateTime.isDateTime(value)) {
                    data[key] = value.toISO();
                } else {
                    data[key] = this.transformData(data[key]);
                }
            }
        }

        return data;
    }
}
