import type { JSONSchema7Type } from 'json-schema';
import { SettingValueEntity } from './setting-value.entity.js';
import { SettingCategoryEntity } from './setting-category.entity.js';
import { SettingDto } from '../dto/setting.dto.js';
import { SettingTypeEnum } from '../type/setting-type.enum.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { SettingTargetTypeEnum } from '../type/setting-target-type.enum.js';
import type { ByteBunkerSettingKeys } from '../../../util/setting/setting.constant.js';
import {
    Collection,
    Entity,
    Enum,
    ManyToOne,
    OneToMany,
    PrimaryKey,
    Property,
    type Ref,
    t,
    types,
} from '@mikro-orm/core';
import { toDatabaseEnumName } from '../../../database/util/database.util.js';
import type { DtoToEntityType } from '../../../util/type/dto-to-entity.type.js';
import type { EntityProperties } from '../../../database/type/entity-properties.type.js';

@Entity()
export class SettingEntity<SK extends ByteBunkerSettingKeys = ByteBunkerSettingKeys>
    extends TimestampEntity
    implements DtoToEntityType<SettingDto<SK>, 'parentCategory' | 'settingValues'>
{
    @PrimaryKey({
        type: t.string,
        length: 128,
        unique: true,
    })
    public key!: SK;

    @Enum({ items: () => SettingTypeEnum, nativeEnumName: toDatabaseEnumName('SettingTypeEnum') })
    public type!: SettingTypeEnum;

    @Property({
        length: 64,
        index: true,
    })
    public parentCategoryKey!: string;

    @ManyToOne(() => SettingCategoryEntity, {
        joinColumn: 'parentCategoryKey',
    })
    public parentCategory!: Ref<SettingCategoryEntity>;

    @Enum({
        items: () => SettingTargetTypeEnum,
        nativeEnumName: toDatabaseEnumName('SettingTargetTypeEnum'),
    })
    public targetType!: SettingTargetTypeEnum;

    @Property()
    public validationSchemaUri?: string;

    @Property({ type: types.json })
    public defaultValue?: NonNullable<JSONSchema7Type> | undefined;

    @Property()
    public required: boolean = true;

    @Property()
    public hidden: boolean = false;

    @OneToMany(() => SettingValueEntity, (settingValue) => settingValue.setting)
    public settingValues = new Collection<SettingValueEntity>(this);

    constructor(data: EntityProperties<SettingEntity, 'required' | 'hidden'>) {
        super();

        Object.assign(this, data);
    }
}
