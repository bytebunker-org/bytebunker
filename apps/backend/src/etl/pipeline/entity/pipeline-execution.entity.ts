import { Collection, Entity, Enum, ManyToOne, OneToMany, PrimaryKey, Property, type Ref, types } from '@mikro-orm/core';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { PipelineBlueprintEntity } from '../blueprint/entity/pipeline-blueprint.entity.js';
import type { EntityProperties } from '../../../database/type/entity-properties.type.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import { SettingTypeEnum } from '../../../shared/setting/type/setting-type.enum.js';
import { toDatabaseEnumName } from '../../../database/util/database.util.js';
import { PipelineExecutionLogEntity } from './pipeline-execution-log.entity.js';
import { PipelineExecutionDataEntity } from './pipeline-execution-data.entity.js';
import type { PipelineExecutionLogDataDto } from '../dto/pipeline-execution-log-data.dto.js';

@Entity()
export class PipelineExecutionEntity extends TimestampEntity {
    @PrimaryKey()
    public id!: number;

    @Property()
    public blueprintId!: number;

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
    public executionStatus!:
        | PipelineExecutionStatusEnum.WAITING
        | PipelineExecutionStatusEnum.SUCCESS
        | PipelineExecutionStatusEnum.FAILED
        | PipelineExecutionStatusEnum.ABORTED;

    @Property({
        type: types.tinyint,
        unsigned: true,
    })
    public errorRetryCount = 0;

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
    public pipelineExecutions = new Collection<PipelineExecutionEntity>(this);

    constructor(data: EntityProperties<PipelineExecutionEntity>) {
        super();

        Object.assign(this, data);
    }
}
