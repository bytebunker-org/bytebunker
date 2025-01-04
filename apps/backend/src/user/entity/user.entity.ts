import type { UserDto } from '../dto/user.dto.js';
import { TimestampEntity } from '../../database/util/timestamp.entity.js';
import type { DateTime } from 'luxon';
import { Entity, type Hidden, PrimaryKey, Property } from '@mikro-orm/core';
import type { EntityProperties } from '../../database/type/entity-properties.type.js';

@Entity()
export class UserEntity extends TimestampEntity implements UserDto {
    @PrimaryKey({ autoincrement: true })
    public id!: number;

    @Property({ unique: true })
    public username!: string;

    @Property({
        hidden: true,
    })
    public password?: string & Hidden;

    @Property()
    public deletedAt?: DateTime;

    constructor(data: EntityProperties<UserEntity>) {
        super();

        Object.assign(this, data);
    }
}
