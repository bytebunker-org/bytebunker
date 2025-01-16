import { Collection, Entity, OneToMany, PrimaryKey, Property, types } from '@mikro-orm/core';
import type { EntityProperties } from '../../database/type/entity-properties.type.js';
import { TimestampEntity } from '../../database/util/timestamp.entity.js';
import { PipelineModuleEntity } from '../../etl/pipeline/pipeline-module/entity/pipeline-module.entity.js';
import { EXTENSION_NAME_LENGTH } from '../extension.constant.js';

@Entity()
export class ExtensionEntity extends TimestampEntity {
    @PrimaryKey({ type: types.uuid })
    public id!: string;

    @Property({
        length: EXTENSION_NAME_LENGTH,
        unique: true,
    })
    public name!: string;

    @OneToMany(() => PipelineModuleEntity, (module) => module.extension)
    public modules = new Collection<PipelineModuleEntity>(this);

    constructor(data: EntityProperties<ExtensionEntity>) {
        super();

        Object.assign(this, data);
    }
}
