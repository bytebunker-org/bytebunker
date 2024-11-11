import { Property } from '@mikro-orm/core';

export abstract class TimestampEntity {
    // TODO: Use custom DateTime type!
    @Property()
    public createdAt!: Date;

    @Property()
    public updatedAt!: Date;
}
