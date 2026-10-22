import { Items, Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import type { ASObject } from '@bytebunker/event-schema';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { MY_HUB_EXTENSION } from '../../local-extension.constant.js';
import { MyHubClientService } from '../my-hub-client.service.js';
import { myHubPersonToObject } from '../util/my-hub-person.util.js';

@PipelineModuleJsonSchema()
export class SyncPersonsInput {
    /** Also sync my-hub's nameless relationship-graph placeholders. Off by default. */
    @Optional()
    @Type('boolean')
    public includePlaceholders?: boolean;

    /** Sync persons hidden in my-hub's lists. On by default: hidden people still appear in history. */
    @Optional()
    @Type('boolean')
    public includeHidden?: boolean;

    /**
     * Only persons changed at or after this instant (ISO 8601). Email/phone edits alone do not count as a change in
     * my-hub, so keep a full sync now and then.
     */
    @Optional()
    @Type('string')
    public updatedSince?: string;

    /** Country code for phone numbers without one. Defaults to 49. */
    @Optional()
    @Type('string')
    public defaultCountryCode?: string;
}

@PipelineModuleJsonSchema()
export class SyncPersonsOutput {
    /** Person + MyHubPerson objects for `bytebunker-core:store-objects`. */
    @Required()
    @Items('object')
    public objects!: ASObject[];
}

/**
 * Fetches all persons from my-hub (the source of truth for people) and turns them into Person + MyHubPerson objects
 * whose stable keys cover the my-hub id, every email, phone number and messenger handle. Stored with
 * store-objects, they become the node every importer's Person with a matching handle links to.
 */
@PipelineModule({
    extensionName: MY_HUB_EXTENSION,
    inputType: SyncPersonsInput,
    outputType: SyncPersonsOutput,
})
export class SyncPersonsPipelineModule implements IPipelineModule<SyncPersonsInput, SyncPersonsOutput> {
    private readonly logger = new Logger(SyncPersonsPipelineModule.name);

    constructor(private readonly myHubClient: MyHubClientService) {}

    public async executeModule({
        inputData,
        progress,
    }: PipelineModuleExecutionContext<SyncPersonsInput>): Promise<SyncPersonsOutput> {
        progress.message('Fetching persons from my-hub');
        const persons = await this.myHubClient.fetchPersons({
            updatedSince: inputData.updatedSince,
            includePlaceholders: inputData.includePlaceholders,
        });

        const includeHidden = inputData.includeHidden ?? true;
        const includePlaceholders = inputData.includePlaceholders ?? false;
        let skippedCount = 0;
        const objects: ASObject[] = [];

        for (const person of persons) {
            if ((!includePlaceholders && person.isPlaceholder) || (!includeHidden && person.isHidden)) {
                skippedCount++;
                continue;
            }

            objects.push(myHubPersonToObject(person, inputData.defaultCountryCode));
        }

        const keyCount = objects.reduce((sum, object) => sum + (object.stableKeys?.length ?? 0), 0);
        this.logger.log(
            `Mapped ${objects.length} my-hub persons with ${keyCount} stable keys (${skippedCount} skipped)`,
        );
        progress.message(`${objects.length.toLocaleString('en-US')} persons from my-hub`);

        return { objects };
    }
}
