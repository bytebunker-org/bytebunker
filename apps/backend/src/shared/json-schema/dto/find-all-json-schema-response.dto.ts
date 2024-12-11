import { PickType } from '@nestjs/swagger';
import { JsonSchemaDto } from './json-schema.dto.js';

export class FindAllJsonSchemaResponseDto extends PickType(JsonSchemaDto, [
    'schemaUri',
    'title',
    'description',
] as const) {}
