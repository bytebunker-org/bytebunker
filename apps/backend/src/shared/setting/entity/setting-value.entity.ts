import { SettingEntity } from './setting.entity.js';
import { SettingValueDto } from '../dto/setting-value.dto.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { UserEntity } from '../../../user/entity/user.entity.js';
import type { SettingValueType } from '../type/setting-config.type.js';
import { Entity, ManyToOne, PrimaryKey, Property, type Ref } from '@mikro-orm/core';
import type { EntityProperties } from '../../../database/type/entity-properties.type.js';
import type { DtoToEntityType } from '../../../util/type/dto-to-entity.type.js';

@Entity()
export class SettingValueEntity
    extends TimestampEntity
    implements DtoToEntityType<SettingValueDto, 'setting' | 'targetUser'>
{
    @PrimaryKey({
        length: 128,
    })
    public settingKey!: string;

    @ManyToOne<SettingEntity, SettingValueEntity>(() => SettingEntity, {
        updateRule: 'cascade',
        deleteRule: 'cascade',
        joinColumn: 'settingKey',
    })
    public setting!: Ref<SettingEntity>;

    @PrimaryKey()
    public targetUserId?: number;

    @ManyToOne(() => UserEntity, {
        updateRule: 'cascade',
        deleteRule: 'cascade',
        joinColumn: 'targetUserId',
    })
    public targetUser?: Ref<UserEntity>;

    @Property({ type: 'json' })
    public value!: SettingValueType;
}
