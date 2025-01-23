import type { UserDto } from '../dto/user.dto.js';
import { TimestampEntity } from '../../database/util/timestamp.entity.js';
import type { DateTime } from 'luxon';
import { Entity, type Hidden, PrimaryKey, PrimaryKeyProp, Property, types } from '@mikro-orm/core';

@Entity()
export class UserEntity extends TimestampEntity implements UserDto {
    [PrimaryKeyProp]?: 'id';

    @PrimaryKey({ autoincrement: true })
    public id!: number;

    @Property({ unique: true })
    public username!: string;

    @Property({
        hidden: true,
        lazy: true,
    })
    public password?: string & Hidden;

    @Property({
        type: types.datetime,
    })
    public deletedAt?: DateTime;
}
