import {
    Collection,
    Entity,
    Enum,
    ManyToOne,
    OneToMany,
    type Opt,
    PrimaryKey,
    Property,
    type Ref,
    types,
} from '@mikro-orm/core';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { PipelineBlueprintEntity } from '../blueprint/entity/pipeline-blueprint.entity.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import { toDatabaseEnumName } from '../../../database/util/database.util.js';
import { PipelineExecutionLogEntity } from './pipeline-execution-log.entity.js';
import { PipelineExecutionDataEntity } from './pipeline-execution-data.entity.js';
import type { PipelineExecutionLogDataDto } from '../dto/pipeline-execution-log-data.dto.js';
import type { PipelineExecutionDto } from '../dto/pipeline-execution.dto.js';

@Entity()
export class PipelineExecutionEntity extends TimestampEntity implements PipelineExecutionDto {
    @PrimaryKey()
    public id!: number;

    @Property()
    public blueprintId!: number & Opt;

    @ManyToOne(() => PipelineBlueprintEntity, {
        joinColumn: 'blueprintId',
        deleteRule: 'cascade',
        updateRule: 'cascade',
    })
    public blueprint!: Ref<PipelineBlueprintEntity>;

    @Enum({
        items: [
            PipelineExecutionStatusEnum.WAITING,
            PipelineExecutionStatusEnum.SUCCESS,
            PipelineExecutionStatusEnum.FAILED,
            PipelineExecutionStatusEnum.ABORTED,
        ],
        nativeEnumName: toDatabaseEnumName('PipelineExecutionStatusEnum'),
    })
    public executionStatus: (
        | PipelineExecutionStatusEnum.WAITING
        | PipelineExecutionStatusEnum.SUCCESS
        | PipelineExecutionStatusEnum.FAILED
        | PipelineExecutionStatusEnum.ABORTED
    ) &
        Opt = PipelineExecutionStatusEnum.WAITING;

    @Property({
        type: types.tinyint,
        unsigned: true,
    })
    public errorRetryCount: number & Opt = 0;

    @Property({
        type: types.smallint,
        unsigned: true,
    })
    public latestErrorNodeId?: number;

    @Enum({
        items: [PipelineExecutionStatusEnum.ABORTED, PipelineExecutionStatusEnum.FAILED],
        nativeEnumName: toDatabaseEnumName('PipelineErrorStatusEnum'),
    })
    public latestErrorStatus?: PipelineExecutionStatusEnum.ABORTED | PipelineExecutionStatusEnum.FAILED;

    @Property({
        length: 255,
    })
    public latestErrorMessage?: string;

    @Property({ type: types.json })
    public latestErrorData?: Omit<PipelineExecutionLogDataDto, 'message'>;

    @OneToMany(() => PipelineExecutionDataEntity, (executionData) => executionData.pipelineExecution)
    public executionData = new Collection<PipelineExecutionDataEntity>(this);

    @OneToMany(() => PipelineExecutionLogEntity, (executionLog) => executionLog.pipelineExecution)
    public executionLogs = new Collection<PipelineExecutionLogEntity>(this);
}
