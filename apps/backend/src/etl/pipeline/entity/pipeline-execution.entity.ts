import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';

@Entity()
export class PipelineExecutionEntity extends TimestampEntity {
    @PrimaryKey()
    public id!: number;

    public blueprintId!: number;
}
