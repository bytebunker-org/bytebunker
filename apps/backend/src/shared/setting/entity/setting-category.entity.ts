import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { SettingEntity } from './setting.entity.js';
import { SettingCategoryDto } from '../dto/setting-category.dto.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import type { EntityProperties } from '../../../database/util/entity-properties.type.js';

@Entity()
export class SettingCategoryEntity extends TimestampEntity implements SettingCategoryDto {
    public static PRIMARY_KEY_CONSTRAINT_NAME = 'PK_7af30ba1419f022d5ff0567beff';

    @PrimaryColumn('varchar', {
        length: 64,
        unique: true,
        primaryKeyConstraintName: SettingCategoryEntity.PRIMARY_KEY_CONSTRAINT_NAME,
    })
    public key!: string;

    @Column('varchar', {
        length: 64,
        nullable: true,
    })
    public parentCategoryKey?: string;

    @ManyToOne(() => SettingCategoryEntity, (category) => category.subCategories)
    @JoinColumn({
        name: 'parentCategoryKey',
    })
    public parentCategory?: Relation<SettingCategoryEntity>;

    @Column('varchar', {
        length: 32,
        nullable: true,
    })
    public icon?: string;

    @Column('boolean', {
        default: false,
    })
    public hidden!: boolean;

    @OneToMany(() => SettingCategoryEntity, (category) => category.parentCategory)
    public subCategories?: Relation<SettingCategoryEntity[]>;

    @OneToMany(() => SettingEntity, (setting) => setting.parentCategory)
    public settings?: Relation<SettingEntity[]>;

    constructor(data: EntityProperties<SettingCategoryEntity>) {
        super();

        Object.assign(this, data);
    }
}
