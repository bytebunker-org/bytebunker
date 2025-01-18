import { Collection, Entity, OneToMany, PrimaryKey, Property, types } from '@mikro-orm/core';
import { TimestampEntity } from '../../../../database/util/timestamp.entity.js';
import { BlueprintDataDto } from '../dto/blueprint-data.dto.js';
import { PipelineExecutionEntity } from '../../entity/pipeline-execution.entity.js';
import { PipelineBlueprintDto } from '../dto/pipeline-blueprint.dto.js';

@Entity()
export class PipelineBlueprintEntity extends TimestampEntity implements PipelineBlueprintDto {
    @PrimaryKey()
    public id!: number;

    @Property({ length: 255 })
    public title!: string;

    @Property()
    public description?: string;

    @Property({ type: types.json })
    public data!: BlueprintDataDto;

    @OneToMany(() => PipelineExecutionEntity, (execution) => execution.blueprint)
    public pipelineExecutions = new Collection<PipelineExecutionEntity>(this);
}
