import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { SettingEntity } from './setting.entity.js';
import { SettingValueDto } from '../dto/setting-value.dto.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { UserEntity } from '../../../user/entity/user.entity.js';
import { settingValueTransformer } from '../../../database/util/database-transformer.util.js';
import type { EntityProperties } from '../../../database/util/entity-properties.type.js';
import type { SettingValueType } from '../type/setting-config.type.js';

@Entity()
export class SettingValueEntity extends TimestampEntity implements SettingValueDto {
    public static PRIMARY_KEY_CONSTRAINT_NAME = 'PK_5b8edd68f0a64338a2784dc7c5e';

    @PrimaryColumn('varchar', {
        length: 128,
        primaryKeyConstraintName: SettingValueEntity.PRIMARY_KEY_CONSTRAINT_NAME,
    })
    public settingKey!: string;

    @ManyToOne(() => SettingEntity, (setting) => setting.settingValues, {
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
    })
    @JoinColumn({
        name: 'settingKey',
    })
    public setting?: Relation<SettingEntity>;

    @PrimaryColumn({
        primaryKeyConstraintName: SettingValueEntity.PRIMARY_KEY_CONSTRAINT_NAME,
    })
    public targetUserId!: number;

    @ManyToOne(() => UserEntity, (user) => user.userSettingValues, {
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
    })
    @JoinColumn({
        name: 'targetUserId',
    })
    public targetUser?: Relation<UserEntity>;

    @Column('text', {
        transformer: settingValueTransformer,
        nullable: true,
    })
    public value!: SettingValueType;

    constructor(data: EntityProperties<SettingValueEntity>) {
        super();

        Object.assign(this, data);
    }
}
