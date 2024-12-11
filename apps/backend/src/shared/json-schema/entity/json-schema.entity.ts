import type { JSONSchema7 } from 'json-schema';
import { JsonSchemaDto } from '../dto/json-schema.dto.js';
import { TimestampEntity } from '../../../database/util/timestamp.entity.js';

@Entity()
@Index(['addonId'])
export class JsonSchemaEntity extends TimestampEntity implements JsonSchemaDto {
    public static PRIMARY_KEY_CONSTRAINT_NAME = 'PK_2b7dbc861713c6196fa5e949b26';

    @PrimaryColumn('varchar', {
        primaryKeyConstraintName: JsonSchemaEntity.PRIMARY_KEY_CONSTRAINT_NAME,
    })
    public schemaUri!: string;

    @Column('varchar')
    public title!: string;

    @Column('varchar', {
        default: '',
    })
    public description!: string;

    @Column('jsonb')
    public jsonSchema!: JSONSchema7;

    constructor(data: EntityProperties<JsonSchemaEntity, 'description'>) {
        super();

        Object.assign(this, data);
    }
}
