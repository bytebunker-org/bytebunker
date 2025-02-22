import type { UserDto } from '../dto/user.dto.js';
import { TimestampEntity } from '../../database/util/timestamp.entity.js';
import type { DateTime } from 'luxon';
import {
    Collection,
    Entity,
    type Hidden,
    OneToMany,
    PrimaryKey,
    PrimaryKeyProp,
    Property,
    types,
} from '@mikro-orm/core';
import { StoredUserSessionEntity } from '../../auth/entity/stored-user-session.entity.js';
import { v7 as uuidV7 } from 'uuid';

@Entity()
export class UserEntity extends TimestampEntity implements UserDto {
    [PrimaryKeyProp]?: 'id';

    @PrimaryKey({ type: types.uuid })
    public id = uuidV7();

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

    @OneToMany(() => StoredUserSessionEntity, (storedUserSession) => storedUserSession.user)
    public storedUserSessions = new Collection<StoredUserSessionEntity>(this);
}
