import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { TimestampEntity } from '../../../../database/util/timestamp.entity.js';

@Entity()
export class PipelineBlueprintTriggerEntity extends TimestampEntity {
    @PrimaryKey()
    public blueprintId!: number;

    @PrimaryKey()
    public triggerNodeId!: number;

    @Property()
    public triggerType!: string;
}
