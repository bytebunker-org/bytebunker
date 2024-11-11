import type { UserDto } from '../dto/user.dto.js';
import { TimestampEntity } from '../../database/util/timestamp.entity.js';
import type { DateTime } from 'luxon';
import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class UserEntity extends TimestampEntity implements UserDto {
    @PrimaryKey({ autoincrement: true })
    public id!: number;

    @Property({ unique: true })
    public username!: string;

    @Property()
    public password?: string;

    @Property()
    public deletedAt?: DateTime;
}
