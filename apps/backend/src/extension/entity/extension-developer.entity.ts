import { Collection, Entity, OneToMany, PrimaryKey, PrimaryKeyProp, Property, types } from '@mikro-orm/core';
import { ExtensionEntity } from './extension.entity.js';
import { TimestampEntity } from '../../database/util/timestamp.entity.js';
import type { ExtensionDeveloperDto } from '../dto/extension-developer.dto.js';

@Entity()
export class ExtensionDeveloperEntity extends TimestampEntity implements ExtensionDeveloperDto {
    [PrimaryKeyProp]?: 'id';

    @PrimaryKey({
        type: types.uuid,
    })
    public id!: string;

    @Property({
        length: 255,
        unique: true,
    })
    public name!: string;

    @OneToMany(() => ExtensionEntity, (extension) => extension.developer)
    public extensions = new Collection<ExtensionEntity>(this);
}
