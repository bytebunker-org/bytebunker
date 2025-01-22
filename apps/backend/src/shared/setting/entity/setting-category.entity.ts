import { SettingEntity } from './setting.entity.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import {
    Collection,
    Entity,
    ManyToOne,
    OneToMany,
    type Opt,
    PrimaryKey,
    PrimaryKeyProp,
    Property,
    type Ref,
} from '@mikro-orm/core';
import type { SettingCategoryDto } from '../dto/setting-category.dto.js';

@Entity()
export class SettingCategoryEntity extends TimestampEntity implements SettingCategoryDto {
    [PrimaryKeyProp]?: 'key';

    @PrimaryKey({
        length: 64,
        unique: true,
    })
    public key!: string;

    @ManyToOne(() => SettingCategoryEntity, {
        nullable: true,
    })
    public parentCategory?: Ref<SettingCategoryEntity>;

    @Property({
        length: 32,
    })
    public icon?: string;

    @Property()
    public hidden: boolean & Opt = false;

    @OneToMany(() => SettingCategoryEntity, (category) => category.parentCategory)
    public subCategories = new Collection<SettingCategoryEntity>(this);

    @OneToMany(() => SettingEntity, (setting) => setting.parentCategory)
    public settings = new Collection<SettingEntity>(this);
}
