import type { JSONSchema7 } from 'json-schema';
import { JsonSchemaDto } from '../dto/json-schema.dto.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';
import { Entity, ManyToOne, type Opt, PrimaryKey, PrimaryKeyProp, Property, type Ref, types } from '@mikro-orm/core';
import { ExtensionEntity } from '../../../extension/entity/extension.entity.js';

@Entity()
export class JsonSchemaEntity extends TimestampEntity implements JsonSchemaDto {
    [PrimaryKeyProp]?: 'schemaUri';

    @PrimaryKey()
    public schemaUri!: string;

    @Property()
    public title!: string;

    @Property()
    public description: string & Opt = '';

    @Property({ type: types.json })
    public jsonSchema!: JSONSchema7;

    @ManyToOne(() => ExtensionEntity, {
        updateRule: 'cascade',
        deleteRule: 'cascade',
    })
    public extension!: Ref<ExtensionEntity>;
}
