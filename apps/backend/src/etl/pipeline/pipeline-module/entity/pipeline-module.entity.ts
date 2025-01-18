import { Entity, Enum, ManyToOne, type Opt, PrimaryKey, Property, type Ref, types } from '@mikro-orm/core';
import { ExtensionEntity } from '../../../../extension/entity/extension.entity.js';
import { TimestampEntity } from '../../../../database/util/timestamp.entity.js';
import { PIPELINE_MODULE_IDENTIFIER_LENGTH } from '../pipeline-module.constant.js';
import { JsonSchemaEntity } from '../../../../shared/json-schema/entity/json-schema.entity.js';
import { toDatabaseEnumName } from '../../../../database/util/database.util.js';
import { PipelineModuleTypeEnum } from '../type/pipeline-module-type.enum.js';
import { buildModuleIdentifier, deconstructPipelineModuleIdentifier } from '../pipeline-module-identifier.util.js';
import type { PipelineModuleIdentifier } from '../type/pipeline-module-identifier.type.js';
import type { PipelineModuleDto } from '../dto/pipeline-module.dto.js';

@Entity()
export class PipelineModuleEntity extends TimestampEntity implements PipelineModuleDto {
    @Property({
        type: types.uuid,
    })
    public extensionId!: string & Opt;

    @ManyToOne(() => ExtensionEntity, {
        joinColumn: 'extensionId',
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
    public id: PipelineModuleIdentifier = buildModuleIdentifier(this.extensionName, this.name, this.version);

    @Enum({ items: () => PipelineModuleTypeEnum, nativeEnumName: toDatabaseEnumName('PipelineModuleTypeEnum') })
    public type = PipelineModuleTypeEnum.NORMAL;

    @Property()
    public inputTypeSchemaUri?: string;

    @Property()
    public outputTypeSchemaUri?: string;

    @ManyToOne(() => JsonSchemaEntity, {
        joinColumn: 'inputTypeSchemaUri',
    })
    public inputTypeSchema?: Ref<JsonSchemaEntity>;

    @ManyToOne(() => JsonSchemaEntity, {
        joinColumn: 'outputTypeSchemaUri',
    })
    public outputTypeSchema?: Ref<JsonSchemaEntity>;

    public get extensionName(): string {
        return deconstructPipelineModuleIdentifier(this.id).extensionName;
    }
}
