import { BaseEntity, type Opt, Property, types } from '@mikro-orm/core';
import { DateTime } from 'luxon';

export abstract class TimestampEntity extends BaseEntity {
    @Property({
        type: types.datetime,
        defaultRaw: 'NOW()',
    })
    public createdAt: DateTime & Opt = DateTime.now();

    @Property({
        type: types.datetime,
        defaultRaw: 'NOW()',
        onUpdate: () => DateTime.now(),
    })
    public updatedAt: DateTime & Opt = DateTime.now();
}
