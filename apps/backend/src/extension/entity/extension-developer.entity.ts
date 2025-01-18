import { Collection, Entity, OneToMany, PrimaryKey, Property, types } from '@mikro-orm/core';
import { ExtensionEntity } from './extension.entity.js';
import { TimestampEntity } from '../../database/util/timestamp.entity.js';

@Entity()
export class ExtensionDeveloperEntity extends TimestampEntity {
    @PrimaryKey({
        type: types.uuid,
    })
    public id!: string;

    @Property({
        length: 255,
        unique: true,
    })
    public name!: string;

    @OneToMany(() => ExtensionEntity, (extension) => extension)
    public extensions = new Collection<ExtensionEntity>(this);
}
