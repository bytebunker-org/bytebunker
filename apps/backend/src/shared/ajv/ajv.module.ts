import { Module } from '@nestjs/common';
import { ajvProvider } from './ajv.provider.js';
import { AJV_PROVIDER } from './ajv.constant.js';
import { JsonSchemaModule } from '../../json-schema/json-schema.module.js';

@Module({
    imports: [JsonSchemaModule],
    providers: [ajvProvider],
    exports: [AJV_PROVIDER],
})
export class AjvModule {}
