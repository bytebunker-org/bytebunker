import {
    Collection,
    Entity,
    Enum,
    ManyToMany,
    ManyToOne,
    PrimaryKey,
    PrimaryKeyProp,
    Property,
    type Ref,
    types,
} from '@mikro-orm/core';
import { ExtensionEntity } from '../../../../extension/entity/extension.entity.js';
import { TimestampEntity } from '../../../../database/util/timestamp.entity.js';
import { PIPELINE_MODULE_IDENTIFIER_LENGTH } from '../pipeline-module.constant.js';
import { JsonSchemaEntity } from '../../../../shared/json-schema/entity/json-schema.entity.js';
import { toDatabaseEnumName } from '../../../../database/util/database.util.js';
import { PipelineModuleTypeEnum } from '../type/pipeline-module-type.enum.js';
import { buildModuleIdentifier, deconstructPipelineModuleIdentifier } from '../util/pipeline-module-identifier.util.js';
import type { PipelineModuleIdentifier } from '../type/pipeline-module-identifier.type.js';
import type { PipelineModuleDto } from '../dto/pipeline-module.dto.js';
import { PipelineBlueprintEntity } from '../../blueprint/entity/pipeline-blueprint.entity.js';

@Entity()
export class PipelineModuleEntity extends TimestampEntity implements PipelineModuleDto {
    [PrimaryKeyProp]?: 'id';

    @ManyToOne(() => ExtensionEntity, {
        updateRule: 'cascade',
        deleteRule: 'cascade',
    })
    public extension!: Ref<ExtensionEntity>;

    @Property({
        length: 255,
    })
    public name!: string;

    @Property({
        type: types.smallint,
        unsigned: true,
    })
    public version!: number;

    @PrimaryKey({
        length: PIPELINE_MODULE_IDENTIFIER_LENGTH,
    })
    public id!: PipelineModuleIdentifier;

    @Enum({ items: () => PipelineModuleTypeEnum, nativeEnumName: toDatabaseEnumName('PipelineModuleTypeEnum') })
    public type = PipelineModuleTypeEnum.NORMAL;

    @ManyToOne(() => JsonSchemaEntity)
    public inputTypeSchema?: Ref<JsonSchemaEntity>;

    @ManyToOne(() => JsonSchemaEntity)
    public outputTypeSchema?: Ref<JsonSchemaEntity>;

    @ManyToMany({ entity: () => PipelineBlueprintEntity, mappedBy: (blueprint) => blueprint.usedModules })
    public containingBlueprints = new Collection<PipelineBlueprintEntity>(this);

    public get extensionName(): string {
        return this.id ? deconstructPipelineModuleIdentifier(this.id).extensionName : '';
    }
}
