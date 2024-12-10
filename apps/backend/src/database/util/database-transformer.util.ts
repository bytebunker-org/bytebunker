import { DateTime } from 'luxon';
import { Logger } from '@nestjs/common';
import type { MetadataValueContainerType } from '../../entity-metadata/type/metadata-value.type.js';
import { parse as parseUuid, stringify as stringifyUuid, validate as validateUuid } from 'uuid';
import { FindOperator } from 'typeorm';
import type { UuidV1 } from '../../util/type/opaque.type.js';
import { hasOwnProperty } from '../../util/util.js';

const logger = new Logger('DataTransformer');

export interface DatabaseValueTransformer<ValueType, DatabaseType = string> {
    to(value: ValueType): DatabaseType;

    from(value: DatabaseType): ValueType;
}

export interface ValueTransformer<ValueType, DatabaseType = string> {
    to(value: ValueType): DatabaseType;

    from(value: DatabaseType): ValueType;
}

const arrayTransformer: <ValueType, DatabaseType>(
    singleValueTransformer: DatabaseValueTransformer<ValueType, DatabaseType>,
) => DatabaseValueTransformer<ValueType[], DatabaseType[]> = (transformer) => ({
    to: (values) => {
        return values.map((element) => transformer.to(element));
    },
    from: (values) => {
        return values.map((element) => transformer.from(element));
    },
});

export const buildNullableTransformer: <ValueType, DatabaseType>(
    singleValueTransformer: DatabaseValueTransformer<ValueType, DatabaseType>,
) => DatabaseValueTransformer<ValueType | undefined, DatabaseType | undefined> = (transformer) => ({
    to: (value) => {
        return value ? transformer.to(value) : undefined;
    },
    from: (value) => {
        return value ? transformer.from(value) : undefined;
    },
});

export const dateTimeTransformer: DatabaseValueTransformer<DateTime | undefined, string | Date | undefined> =
    buildNullableTransformer<DateTime, string | Date>({
        to: (value) => {
            return DateTime.isDateTime(value) ? value.toSQL()! : DateTime.fromJSDate(value).toSQL()!;
        },
        from: (value) => {
            const res =
                typeof value === 'string' ? DateTime.fromSQL(value) : DateTime.fromJSDate(value, { zone: 'utc' });
            return res;
        },
    });

export const dateTransformer: DatabaseValueTransformer<DateTime | undefined, string | Date | undefined> =
    buildNullableTransformer<DateTime, string | Date>({
        to: (value): string => {
            return DateTime.isDateTime(value) ? value.toSQLDate()! : DateTime.fromJSDate(value).toSQLDate()!;
        },
        from: (value) => {
            return typeof value === 'string' ? DateTime.fromSQL(value) : DateTime.fromJSDate(value);
        },
    });

export const timeTransformer: DatabaseValueTransformer<DateTime | undefined, string | Date | undefined> =
    buildNullableTransformer<DateTime, string | Date>({
        to: (value): string => {
            return DateTime.isDateTime(value) ? value.toSQLTime()! : DateTime.fromJSDate(value).toSQLTime()!;
        },
        from: (value) => {
            return typeof value === 'string' ? DateTime.fromSQL(value) : DateTime.fromJSDate(value);
        },
    });

export const numberTransformer: DatabaseValueTransformer<number> = {
    to: String,
    from: (value) => Number.parseInt(value, 10),
};

export const settingValueTransformer: DatabaseValueTransformer<any | undefined, any | undefined> = {
    to: (value) => {
        return JSON.stringify(value);
    },
    from: (value) => {
        if (typeof value !== 'string') {
            return value;
        }

        if (value === '') {
            return '';
        }

        // TODO: Fix json parsing not working when its done two times, by the mysql driver and then database
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    },
};

export const numberListTransformer = arrayTransformer(numberTransformer);

export const isoDateTimeTransformer: DatabaseValueTransformer<DateTime | undefined, string | Date | undefined> =
    buildNullableTransformer<DateTime, string | Date>({
        to: (value) => {
            return DateTime.isDateTime(value) ? value.toISO()! : DateTime.fromJSDate(value).toISO()!;
        },
        from: (value) => {
            return typeof value === 'string' ? DateTime.fromISO(value) : DateTime.fromJSDate(value);
        },
    });

const isoDateFormat = /^\d{4}-[01]\d-[0-3]\dT[0-2](?:\d:[0-5]){2}\d\.\d+([+-][0-2]\d:[0-5]\d|Z)$/;

export const metadataValueTransformer: DatabaseValueTransformer<MetadataValueContainerType> = {
    to: (value) => {
        if (DateTime.isDateTime(value)) {
            const dateTimeString = value.toISO();

            return JSON.stringify(dateTimeString);
        } else {
            return JSON.stringify(value);
        }
    },
    from: (value) => {
        // TODO: Fix json parsing not working when its done two times, by the mysql driver and then database
        try {
            const parsedValue = JSON.parse(value);

            if (typeof parsedValue === 'string' && isoDateFormat.test(value)) {
                return DateTime.fromISO(parsedValue);
            }

            return parsedValue as MetadataValueContainerType;
        } catch {
            return value;
        }
    },
};

export const uuidTransformer: ValueTransformer<
    UuidV1 | FindOperator<UuidV1 | UuidV1[]> | undefined,
    FindOperator<Buffer | Buffer[]> | Buffer | undefined
> = {
    to: (value) => {
        if (!value) {
            return;
        }

        if (typeof value === 'object' && typeof value.type === 'string') {
            if (value.type === 'in') {
                return new FindOperator<Buffer | Buffer[]>(
                    value.type,
                    Array.isArray(value.value)
                        ? value.value.map((value) => uuidTransformer.to(value) as Buffer)
                        : uuidTransformer.to(value)!,
                    value.useParameter,
                    value.multipleParameters,
                );
            } else {
                throw new Error('Uuid used in unimplemented find operator');
            }
        } else {
            try {
                const uuidBytes = parseUuid(value as UuidV1) as Uint8Array;
                const shiftedBytes = new Uint8Array(uuidBytes);

                shiftedBytes[0] = uuidBytes[6];
                shiftedBytes[1] = uuidBytes[7];
                shiftedBytes[2] = uuidBytes[4];
                shiftedBytes[3] = uuidBytes[5];
                shiftedBytes[4] = uuidBytes[0];
                shiftedBytes[5] = uuidBytes[1];
                shiftedBytes[6] = uuidBytes[2];
                shiftedBytes[7] = uuidBytes[3];

                return Buffer.from(shiftedBytes);
            } catch (error) {
                logger.error(`Can't parse uuid`, value, error);

                return;
            }
        }
    },
    from: (shiftedBytes) => {
        if (!shiftedBytes) {
            return;
        }

        if (shiftedBytes instanceof FindOperator) {
            return;
        }

        if (
            typeof shiftedBytes === 'object' &&
            hasOwnProperty(shiftedBytes, 'type') &&
            shiftedBytes.type === 'Buffer' &&
            hasOwnProperty(shiftedBytes, 'data')
        ) {
            shiftedBytes = Buffer.from(shiftedBytes.data as number[]);
        }

        if (typeof shiftedBytes === 'string') {
            if (validateUuid(shiftedBytes)) {
                return shiftedBytes;
            } else {
                throw new Error('Transforming from sql received invalid uuid string input: ' + shiftedBytes);
            }
        } else {
            const uuidBytes = new Uint8Array(shiftedBytes);

            uuidBytes[0] = shiftedBytes[4];
            uuidBytes[1] = shiftedBytes[5];
            uuidBytes[2] = shiftedBytes[6];
            uuidBytes[3] = shiftedBytes[7];
            uuidBytes[4] = shiftedBytes[2];
            uuidBytes[5] = shiftedBytes[3];
            uuidBytes[6] = shiftedBytes[0];
            uuidBytes[7] = shiftedBytes[1];

            return stringifyUuid(uuidBytes) as UuidV1;
        }
    },
};
