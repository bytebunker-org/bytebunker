import { Items, Optional, Required, Type as SType } from 'ts-decorator-json-schema-generator';
import { PipelineModuleJsonSchema } from '../decorator/pipeline-module-json-schema.decorator.js';
import { PipelineModule } from '../decorator/pipeline-module.decorator.js';
import type { IPipelineModule, PipelineModuleExecutionContext } from '../type/pipeline-module.interface.js';
import { CORE_EXTENSION_NAME } from '../../../../extension/extension.constant.js';
import { constants, createContext, Script } from 'node:vm';
import { hasOwn } from '../../../../util/util.js';
import { Injectable, Logger } from '@nestjs/common';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { transpile } from 'typescript';
import { AssetService } from '../../../asset/asset.service.js';
import { DateTime, Duration, IANAZone, Interval, Zone } from 'luxon';
import { PIPELINE_SCRIPT_EXTENSION_ID } from '../../../../extension/extensions/local-extension.constant.js';
import type { ASLink } from '@bytebunker/event-schema';

@PipelineModuleJsonSchema()
export class ExecuteCodeInput {
    @Required()
    public code!: string;

    @Optional()
    @SType('array')
    @Items('string')
    public customInputParameters?: string[];

    @Optional()
    @SType('array')
    @Items('string')
    public customOutputParameters?: string[];
}

@PipelineModuleJsonSchema()
export class ExecuteCodeOutput {}

@PipelineModule({
    extensionName: CORE_EXTENSION_NAME,
    inputType: ExecuteCodeInput,
    outputType: ExecuteCodeOutput,
})
@Injectable()
export class ExecuteCodePipelineModule implements IPipelineModule<ExecuteCodeInput, ExecuteCodeOutput> {
    constructor(
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
        private readonly activityStableKeyService: ActivityStableKeyService,
        private readonly assetService: AssetService,
    ) {}

    public async executeModule(
        executionContext: PipelineModuleExecutionContext<ExecuteCodeInput>,
    ): Promise<ExecuteCodeOutput> {
        const scriptLogger = new Logger(
            `Pipeline ${executionContext.pipelineExecution.id}/${executionContext.currentNode.id} Script`,
        );

        const { em } = executionContext;
        const [generatorExtensionObject, ownerActor] = await Promise.all([
            this.activityGraphNodeService.getExtension(em, PIPELINE_SCRIPT_EXTENSION_ID),
            this.activityGraphService.getOwnerActor(em),
        ]);

        const scriptExecutionContext = {
            logger: scriptLogger,
            activityGraphService: this.activityGraphService,
            activityGraphNodeService: this.activityGraphNodeService,
            activityStableKeyService: this.activityStableKeyService,
            assetService: this.assetService,
            generatorExtensionObject,
            ownerActor: { '@id': ownerActor.get('id') } as ASLink,
        };

        const scriptSandboxContext = {
            DateTime,
            Interval,
            Duration,
            Zone,
            IANAZone,
        };

        const transpiledCode = transpile(executionContext.inputData.code);
        const script = new Script(transpiledCode, {
            filename: `pipeline-blueprint-${executionContext.pipelineExecution.blueprint.id}-node-${executionContext.currentNode.id}-script.js`,
            importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
        });

        const scriptContext = createContext(scriptSandboxContext, {
            name: `Pipeline ${executionContext.pipelineExecution.id}, Node ${executionContext.currentNode.id} Script Context`,
        });
        script.runInContext(scriptContext);

        if (!hasOwn(scriptContext, 'executeModule') || typeof scriptContext.executeModule !== 'function') {
            throw new Error('Script did not define executeModule function');
        }

        return scriptContext.executeModule({
            ...scriptExecutionContext,
            ...executionContext,
        }) as ExecuteCodeOutput | Promise<ExecuteCodeOutput>;
    }
}
