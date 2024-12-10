import type { JSONSchema7Type } from 'json-schema';
import { SettingValueEntity } from './setting-value.entity.js';
import { SettingCategoryEntity } from './setting-category.entity.js';
import { SettingDto } from '../dto/setting.dto.js';
import { SettingTypeEnum } from '../type/setting-type.enum.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { SettingTargetTypeEnum } from '../type/setting-target-type.enum.js';
import type { ByteBunkerSettingKeys } from '../../../util/setting/setting.constant.js';
import { Entity, type EntityProperty, Enum, PrimaryKey, Property, t } from '@mikro-orm/core';
import { settingValueTransformer } from '../../../database/util/database-transformer.util.js';

@Entity()
export class SettingEntity<SK extends ByteBunkerSettingKeys = ByteBunkerSettingKeys>
    extends TimestampEntity
    implements SettingDto<SK>
{
    public static PRIMARY_KEY_CONSTRAINT_NAME = 'PK_1c4c95d773004250c157a744d6e';

    @PrimaryKey({
        type: t.string,
        length: 128,
        unique: true,
    })
    public key!: SK;

    @Property({})
    @Enum()
    public type!: SettingTypeEnum;

    @Index()
    @Column('varchar', {
        length: 64,
    })
    public parentCategoryKey!: string;

    @ManyToOne(() => SettingCategoryEntity, (category) => category.settings)
    @JoinColumn({
        name: 'parentCategoryKey',
    })
    public parentCategory?: Relation<SettingCategoryEntity>;

    @Column('enum', {
        enum: SettingTargetTypeEnum,
    })
    public targetType!: SettingTargetTypeEnum;

    @Column('varchar', {
        nullable: true,
    })
    public validationSchemaUri?: string;

    @Column('text', {
        transformer: settingValueTransformer,
        nullable: true,
    })
    public defaultValue?: NonNullable<JSONSchema7Type> | undefined;

    @Column('boolean', {
        default: true,
    })
    public required!: boolean;

    @Column('boolean', {
        default: false,
    })
    public hidden!: boolean;

    @OneToMany(() => SettingValueEntity, (settingValue) => settingValue.setting)
    public settingValues?: SettingValueEntity[];

    constructor(data: EntityProperty<SettingEntity, 'required' | 'hidden'>) {
        super();

        Object.assign(this, data);
    }
}
