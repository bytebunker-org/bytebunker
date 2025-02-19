import { Module } from '@nestjs/common';
import { TransformSemanticLocationHistoryPipelineModule } from './pipeline-module/transform-semantic-location-history.pipeline-module.js';
import { AssetModule } from '../../../etl/asset/asset.module.js';
import { EntityManager } from '@mikro-orm/postgresql';
import { JsonSchemaService } from '../../../shared/json-schema/json-schema.service.js';
import { JsonSchemaModule } from '../../../shared/json-schema/json-schema.module.js';
import { JsonSchemaValidationModule } from '../../../shared/json-schema-validation/json-schema-validation.module.js';
import { ActivityModule } from '../../../activity/activity.module.js';
import { ActivityGraphModule } from '../../../activity-graph/activity-graph.module.js';

@Module({
    imports: [AssetModule, JsonSchemaModule, JsonSchemaValidationModule, ActivityModule, ActivityGraphModule],
    controllers: [],
    providers: [TransformSemanticLocationHistoryPipelineModule],
})
export class GoogleExtensionModule {
    constructor(
        private readonly em: EntityManager,
        private readonly jsonSchemaService: JsonSchemaService,
    ) {}

    // TODO: Use json schemas to ensure that the input data actually has the expected structure
    /*public onApplicationBootstrap(): Promise<void> {
        return this.em.transactional(async (em) => {
            await this.jsonSchemaService.storeMultiple(em, {
                extensionId: GOOGLE_EXTENSION_ID,
                jsonSchemas: [
                    RecordsJsonSchema as JSONSchema7,
                    SemanticJsonSchema as unknown as JSONSchema7,
                    SettingsJsonSchema as JSONSchema7,
                    TimelineEditsJsonSchema as JSONSchema7,
                ],
            });
        });
    }*/
}
