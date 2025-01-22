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
    type Opt,
    PrimaryKey,
    PrimaryKeyProp,
    Property,
    type Ref,
    t,
    types,
} from '@mikro-orm/core';
import { toDatabaseEnumName } from '../../../database/util/database.util.js';
import { JsonSchemaEntity } from '../../json-schema/entity/json-schema.entity.js';

@Entity()
export class SettingEntity<SK extends ByteBunkerSettingKeys = ByteBunkerSettingKeys>
    extends TimestampEntity
    implements SettingDto<SK>
{
    [PrimaryKeyProp]?: 'key';

    @PrimaryKey({
        type: t.string,
        length: 128,
        unique: true,
    })
    public key!: SK;

    @Enum({ items: () => SettingTypeEnum, nativeEnumName: toDatabaseEnumName('SettingTypeEnum') })
    public type!: SettingTypeEnum;

    @ManyToOne(() => SettingCategoryEntity, {
        length: 64,
        index: true,
    })
    public parentCategory!: Ref<SettingCategoryEntity>;

    @Enum({
        items: () => SettingTargetTypeEnum,
        nativeEnumName: toDatabaseEnumName('SettingTargetTypeEnum'),
    })
    public targetType!: SettingTargetTypeEnum;

    @ManyToOne(() => JsonSchemaEntity)
    public validationSchema!: Ref<JsonSchemaEntity>;

    @Property({ type: types.json })
    public defaultValue?: NonNullable<JSONSchema7Type> | undefined;

    @Property()
    public required: boolean & Opt = true;

    @Property()
    public hidden: boolean & Opt = false;

    @OneToMany(() => SettingValueEntity, (settingValue) => settingValue.setting)
    public settingValues = new Collection<SettingValueEntity>(this);
}
