import { Entity, Enum, ManyToOne, PrimaryKey, Property, type Ref, types } from '@mikro-orm/core';
import { PipelineExecutionEntity } from './pipeline-execution.entity.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import { toDatabaseEnumName } from '../../../database/util/database.util.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';

@Entity()
export class PipelineExecutionDataEntity extends TimestampEntity {
    @PrimaryKey()
    public pipelineExecutionId!: number;

    @ManyToOne(() => PipelineExecutionEntity, {
        joinColumn: 'pipelineExecutionId',
        deleteRule: 'cascade',
        updateRule: 'cascade',
    })
    public pipelineExecution!: Ref<PipelineExecutionEntity>;

    @PrimaryKey({
        type: types.smallint,
        unsigned: true,
    })
    public nodeId!: number;

    @Enum({
        items: () => PipelineExecutionStatusEnum,
        nativeEnumName: toDatabaseEnumName('PipelineNodeExecutionStatusEnum'),
    })
    public executionStatus!: PipelineExecutionStatusEnum;

    @Property({
        type: types.json,
    })
    public data?: Record<string, unknown>;
}
