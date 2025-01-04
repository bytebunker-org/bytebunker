import { SettingEntity } from './setting.entity.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { Collection, Entity, ManyToOne, OneToMany, PrimaryKey, Property, type Ref } from '@mikro-orm/core';
import type { EntityProperties } from '../../../database/type/entity-properties.type.js';
import type { DtoToEntityType } from '../../../util/type/dto-to-entity.type.js';
import type { SettingCategoryDto } from '../dto/setting-category.dto.js';

@Entity()
export class SettingCategoryEntity
    extends TimestampEntity
    implements DtoToEntityType<SettingCategoryDto, 'parentCategory' | 'subCategories' | 'settings'>
{
    @PrimaryKey({
        length: 64,
        unique: true,
    })
    public key!: string;

    @Property({
        length: 64,
    })
    public parentCategoryKey!: string;

    @ManyToOne(() => SettingCategoryEntity, {
        joinColumn: 'parentCategoryKey',
    })
    public parentCategory!: Ref<SettingCategoryEntity>;

    @Property({
        length: 32,
    })
    public icon?: string;

    @Property()
    public hidden: boolean = false;

    @OneToMany(() => SettingCategoryEntity, (category) => category.parentCategory)
    public subCategories = new Collection<SettingCategoryEntity>(this);

    @OneToMany(() => SettingEntity, (setting) => setting.parentCategory)
    public settings = new Collection<SettingEntity>(this);

    constructor(data: EntityProperties<SettingCategoryEntity>) {
        super();

        Object.assign(this, data);
    }
}
