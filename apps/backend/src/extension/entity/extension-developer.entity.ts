import { Collection, Entity, OneToMany, PrimaryKey, Property, types } from '@mikro-orm/core';
import { ExtensionEntity } from './extension.entity.js';
import { TimestampEntity } from '../../database/util/timestamp.entity.js';
import type { EntityProperties } from '../../database/type/entity-properties.type.js';

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

    constructor(data: EntityProperties<ExtensionDeveloperEntity>) {
        super();

        Object.assign(this, data);
    }
}
