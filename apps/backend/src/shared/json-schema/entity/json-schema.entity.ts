import type { JSONSchema7 } from 'json-schema';
import { JsonSchemaDto } from '../dto/json-schema.dto.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { Entity, ManyToOne, PrimaryKey, Property, type Ref, types } from '@mikro-orm/core';
import { ExtensionEntity } from '../../../extension/entity/extension.entity.js';

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

    @Property({
        type: types.uuid,
    })
    public extensionId!: string;

    @ManyToOne(() => ExtensionEntity, {
        joinColumn: 'extensionId',
        updateRule: 'cascade',
        deleteRule: 'cascade',
    })
    public extension?: Ref<ExtensionEntity>;
}
