import type { IPipelineModule } from './type/pipeline-module.interface.js';
import { NotImplementedError } from '../../../util/rest-error.js';

// Don't remove the type parameters, they are used by the pipeline-trigger.service
export abstract class AbstractTriggerPipelineModule<Input, Output> implements IPipelineModule<Input, never> {
    private get isTriggerPipelineModule() {
        return true;
    }

    public static isTriggerPipelineModule<Input, Output>(
        module: unknown,
    ): module is AbstractTriggerPipelineModule<Input, Output> {
        return Boolean(
            module &&
                typeof module === 'object' &&
                // @ts-expect-error
                typeof module.isTriggerPipelineModule === 'boolean' &&
                // @ts-expect-error
                Boolean(module.isTriggerPipelineModule),
        );
    }

    public executeModule(): never {
        throw new NotImplementedError(
            'Trigger pipeline modules are not supposed to be executed. Instead they should have their output data prefilled by the trigger service.',
        );
    }
}
