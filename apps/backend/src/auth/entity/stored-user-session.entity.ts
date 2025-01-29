import { Entity, ManyToOne, PrimaryKey, PrimaryKeyProp, Property, type Ref, types } from '@mikro-orm/core';
import type { SessionData } from 'express-session';
import type { DateTime } from 'luxon';
import { TimestampEntity } from '../../database/util/timestamp.entity.js';
import { StoredUserSessionDto } from '../dto/stored-user-session.dto.js';
import { UserEntity } from '../../user/entity/user.entity.js';

@Entity()
export class StoredUserSessionEntity extends TimestampEntity implements StoredUserSessionDto {
    [PrimaryKeyProp]?: 'sessionId';

    @PrimaryKey()
    public sessionId!: string;

    @Property({
        type: types.json,
    })
    public data!: SessionData;

    @Property({
        type: types.datetime,
    })
    public expiresAt!: DateTime;

    @ManyToOne(() => UserEntity, {
        nullable: true,
        updateRule: 'cascade',
        deleteRule: 'cascade',
    })
    public user?: Ref<UserEntity>;
}
