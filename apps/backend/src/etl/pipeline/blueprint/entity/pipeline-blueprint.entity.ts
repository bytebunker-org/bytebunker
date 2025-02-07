import {
    Cascade,
    Collection,
    Entity,
    ManyToMany,
    OneToMany,
    PrimaryKey,
    PrimaryKeyProp,
    Property,
    types,
} from '@mikro-orm/core';
import { TimestampEntity } from '../../../../database/util/timestamp.entity.js';
import { BlueprintDataDto } from '../dto/blueprint-data.dto.js';
import { PipelineExecutionEntity } from '../../entity/pipeline-execution.entity.js';
import { PipelineBlueprintDto } from '../dto/pipeline-blueprint.dto.js';
import { PipelineModuleEntity } from '../../pipeline-module/entity/pipeline-module.entity.js';

@Entity()
export class PipelineBlueprintEntity extends TimestampEntity implements PipelineBlueprintDto {
    [PrimaryKeyProp]?: 'id';

    @PrimaryKey()
    public id!: number;

    @Property({ length: 255 })
    public title!: string;

    @Property()
    public description?: string;

    @Property({ type: types.json })
    public data!: BlueprintDataDto;

    @ManyToMany({
        entity: () => PipelineModuleEntity,
        owner: true,
        cascade: [Cascade.ALL],
        updateRule: 'cascade',
        deleteRule: 'cascade',
    })
    public usedModules = new Collection<PipelineModuleEntity>(this);

    @OneToMany(() => PipelineExecutionEntity, (execution) => execution.blueprint)
    public pipelineExecutions = new Collection<PipelineExecutionEntity>(this);
}
