import { SettingEntity } from './setting.entity.js';
import { SettingValueDto } from '../dto/setting-value.dto.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { UserEntity } from '../../../user/entity/user.entity.js';
import type { SettingValueType } from '../type/setting-config.type.js';
import { Entity, ManyToOne, PrimaryKeyProp, Property, type Ref } from '@mikro-orm/core';

@Entity()
export class SettingValueEntity extends TimestampEntity implements SettingValueDto {
    [PrimaryKeyProp]?: ['setting', 'targetUser'];

    @ManyToOne(() => SettingEntity, {
        primary: true,
        length: 128,
        updateRule: 'cascade',
        deleteRule: 'cascade',
    })
    public setting!: Ref<SettingEntity>;

    @ManyToOne(() => UserEntity, {
        primary: true,
        nullable: true,
        updateRule: 'cascade',
        deleteRule: 'cascade',
    })
    public targetUser?: Ref<UserEntity>;

    @Property({ type: 'json' })
    public value!: SettingValueType;
}
