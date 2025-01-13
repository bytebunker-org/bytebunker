import { Entity, PrimaryKey, Property, types } from '@mikro-orm/core';
import { TimestampEntity } from '../../../../database/util/timestamp.entity.js';
import { BlueprintDataDto } from '../dto/blueprint-data.dto.js';

@Entity()
export class PipelineBlueprintEntity extends TimestampEntity {
    @PrimaryKey()
    public id!: number;

    @Property({ length: 255 })
    public title!: string;

    @Property()
    public description?: string;

    @Property({ type: types.json })
    public data!: BlueprintDataDto;
}
