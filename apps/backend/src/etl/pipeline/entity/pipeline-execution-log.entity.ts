import { Entity, ManyToOne, type Opt, PrimaryKey, Property, type Ref, types } from '@mikro-orm/core';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { PipelineExecutionEntity } from './pipeline-execution.entity.js';
import type { PipelineExecutionLogDataDto } from '../dto/pipeline-execution-log-data.dto.js';
import type { PipelineExecutionLogDto } from '../dto/pipeline-execution-log.dto.js';

@Entity()
export class PipelineExecutionLogEntity extends TimestampEntity implements PipelineExecutionLogDto {
    @PrimaryKey()
    public id!: number;

    @Property()
    public pipelineExecutionId!: number & Opt;

    @ManyToOne(() => PipelineExecutionEntity, {
        joinColumn: 'pipelineExecutionId',
        deleteRule: 'cascade',
        updateRule: 'cascade',
    })
    public pipelineExecution!: Ref<PipelineExecutionEntity>;

    @Property({
        type: types.smallint,
        unsigned: true,
    })
    public nodeId!: number;

    @Property({
        length: 255,
    })
    public message?: string;

    @Property({
        type: types.json,
    })
    public data?: Omit<PipelineExecutionLogDataDto, 'message'>;
}
