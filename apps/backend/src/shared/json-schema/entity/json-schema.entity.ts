import type { JSONSchema7 } from 'json-schema';
import { JsonSchemaDto } from '../dto/json-schema.dto.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { Entity, PrimaryKey, Property, types } from '@mikro-orm/core';
import type { EntityProperties } from '../../../database/type/entity-properties.type.js';

@Entity()
export class JsonSchemaEntity extends TimestampEntity implements JsonSchemaDto {
    @PrimaryKey()
    public schemaUri!: string;

    @Property()
    public title!: string;

    @Property()
    public description: string = '';

    @Property({ type: types.json })
    public jsonSchema!: JSONSchema7;

    constructor(data: EntityProperties<JsonSchemaEntity, 'description'>) {
        super();

        Object.assign(this, data);
    }
}
