import { Entity, PrimaryKey, PrimaryKeyProp, Property } from '@mikro-orm/core';
import { TimestampEntity } from '../../../../database/util/timestamp.entity.js';

@Entity()
export class PipelineBlueprintTriggerEntity extends TimestampEntity {
    [PrimaryKeyProp]?: ['blueprintId', 'triggerNodeId'];

    @PrimaryKey()
    public blueprintId!: number;

    @PrimaryKey()
    public triggerNodeId!: number;

    @Property()
    public triggerType!: string;
}
