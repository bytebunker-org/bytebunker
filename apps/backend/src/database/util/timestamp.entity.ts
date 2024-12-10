import { type Opt, Property } from '@mikro-orm/core';
import { DateTime } from 'luxon';

export abstract class TimestampEntity {
    @Property()
    public createdAt: DateTime & Opt = DateTime.now();

    @Property({ onUpdate: () => DateTime.now() })
    public updatedAt: DateTime & Opt = DateTime.now();
}
