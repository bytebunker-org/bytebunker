import { Entity, Enum, ManyToOne, type Opt, PrimaryKey, Property, type Ref, types } from '@mikro-orm/core';
import { PipelineExecutionEntity } from './pipeline-execution.entity.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import { toDatabaseEnumName } from '../../../database/util/database.util.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import type { PipelineExecutionDataDto } from '../dto/pipeline-execution-data.dto.js';

@Entity()
export class PipelineExecutionDataEntity extends TimestampEntity implements PipelineExecutionDataDto {
    @PrimaryKey()
    public pipelineExecutionId!: number & Opt;

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
    public executionStatus: PipelineExecutionStatusEnum & Opt = PipelineExecutionStatusEnum.WAITING;

    @Property({
        type: types.json,
    })
    public data?: Record<string, unknown>;
}
