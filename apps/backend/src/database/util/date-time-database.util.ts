import { Type, type EntityProperty, ValidationError } from '@mikro-orm/core';
import { DateTime } from 'luxon';

type Maybe<T> = T | null | undefined;

export type TimestampTypeOptions = {
    hasTimeZone: boolean;
};

export class DateTimeDatabaseType extends Type<Maybe<DateTime>, Maybe<string | Date>> {
    public override convertToDatabaseValue(value: unknown): Maybe<string> {
        if (value === undefined || value === null) {
            return value;
        }

        // TODO: we shouldn't need this, as we're not serializing `Date`s to strings.
        // but, it's necessary for the returning clause...
        // also, despite returning this as a string, MikroORM loads it as a Date. What?
        if (value instanceof Date) {
            return DateTime.fromJSDate(value).toSQL();
        } else if (value instanceof DateTime) {
            return value.toUTC().toSQL();
        } else if (typeof value === 'string') {
            return DateTime.fromISO(value).toSQL();
        }

        throw ValidationError.invalidType(DateTimeDatabaseType, value, 'JS');
    }

    public override convertToJSValue(value: unknown): Maybe<DateTime> {
        if (value === undefined || value === null || DateTime.isDateTime(value)) {
            return value;
        }

        if (typeof value === 'string' || value instanceof Date) {
            const dateTime = typeof value === 'string' ? DateTime.fromSQL(value) : DateTime.fromJSDate(value);

            if (!dateTime.isValid) {
                throw ValidationError.invalidType(DateTimeDatabaseType, value, 'database');
            }

            return dateTime.toUTC();
        }

        throw ValidationError.invalidType(DateTimeDatabaseType, value, 'database');
    }

    public override getColumnType({ length }: EntityProperty): string {
        return `timestamptz${length ? `(${length})` : ''}`;
    }
}
