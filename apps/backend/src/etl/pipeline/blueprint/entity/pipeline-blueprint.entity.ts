import {
    Cascade,
    Collection,
    Entity,
    ManyToMany,
    OneToMany,
    OptionalProps,
    PrimaryKey,
    PrimaryKeyProp,
    Property,
    Unique,
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
    [OptionalProps]?: 'managed';

    @PrimaryKey()
    public id!: number;

    @Property({ length: 255 })
    public title!: string;

    @Property()
    public description?: string;

    @Property({ type: types.json })
    public data!: BlueprintDataDto;

    /** Set for blueprints shipped by an extension, e.g. `google/timeline`. Null for user-created blueprints. */
    @Unique()
    @Property({ type: 'string', length: 255, nullable: true })
    public key?: string;

    /** Content hash of the shipped definition last installed; compared with the stored data to detect user edits. */
    @Property({ type: 'string', length: 64, nullable: true })
    public shippedHash?: string;

    /** True for blueprints installed from an extension. */
    @Property({ persist: false })
    public get managed(): boolean {
        return this.key != null;
    }

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
