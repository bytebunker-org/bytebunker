import { BaseEntity, type Opt, Property } from '@mikro-orm/core';
import { DateTime } from 'luxon';
import { DateTimeDatabaseType } from './date-time-database.type.js';

export abstract class TimestampEntity extends BaseEntity {
    @Property({
        type: DateTimeDatabaseType,
        columnType: 'timestamptz',
        defaultRaw: 'NOW()',
        serializer: (value: DateTime) => value?.toISO(),
    })
    public createdAt: DateTime & Opt = DateTime.now();

    @Property({
        type: DateTimeDatabaseType,
        columnType: 'timestamptz',
        defaultRaw: 'NOW()',
        onUpdate: () => DateTime.now(),
        serializer: (value: DateTime) => value?.toISO(),
    })
    public updatedAt: DateTime & Opt = DateTime.now();
}
