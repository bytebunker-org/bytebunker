import { Entity, ManyToOne, PrimaryKey, Property, type Ref, types } from '@mikro-orm/core';
import { buildModuleIdentifier, type PipelineModuleIdentifier } from '../../type/pipeline-module-identifier.type.js';
import { ExtensionEntity } from '../../../../extension/entity/extension.entity.js';
import type { EntityProperties } from '../../../../database/type/entity-properties.type.js';
import { TimestampEntity } from '../../../../database/util/timestamp.entity.js';
import { PIPELINE_MODULE_IDENTIFIER_LENGTH } from '../pipeline-module.constant.js';

@Entity()
export class PipelineModuleEntity extends TimestampEntity {
    @PrimaryKey({
        length: PIPELINE_MODULE_IDENTIFIER_LENGTH,
    })
    public id!: PipelineModuleIdentifier;

    @Property({
        type: types.uuid,
    })
    public extensionId!: string;

    @ManyToOne(() => ExtensionEntity, {
        joinColumn: 'extensionId',
        updateRule: 'cascade',
        deleteRule: 'cascade',
    })
    public extension?: Ref<ExtensionEntity>;

    @Property({
        length: 255,
    })
    public name!: string;

    @Property({
        type: types.smallint,
        unsigned: true,
    })
    public version!: number;

    constructor(data: EntityProperties<PipelineModuleEntity> & { extensionName: string }) {
        super();

        Object.assign(this, data);

        this.id = buildModuleIdentifier(data.extensionName, data.name, data.version);
    }
}
