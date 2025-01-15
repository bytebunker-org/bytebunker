import type { Constructable } from '../../../util/type/constructable.interface.js';

export abstract class AbstractPipelineModule<Input, Output> {
    protected readonly name: string;
    protected readonly version: number;

    protected constructor(name: string, version: number) {
        this.name = name;
        this.version = version;
    }

    public abstract get inputType(): Constructable<Input> | undefined;

    public abstract get outputType(): Constructable<Output> | undefined;

    public get identifier(): ModuleIdentifier {
        return `${ModuleService.INTERNAL_ADDON_NAME}:${this.name}@${this.version}`;
    }

    public abstract executeModule(
        inputData: Input,
        em: EntityManager,
        workspace: MBlueprintWorkspace,
        blueprintData: Blueprint,
        currentNode: Node,
    ):
        | Output
        | (Output | AddonCallbackHoldExecutionEvent)
        | Promise<Output>
        | Promise<Output | AddonCallbackHoldExecutionEvent>;

    public getName(): string {
        return this.name;
    }

    public getVersion(): number {
        return this.version;
    }

    protected holdExecution() {
        return new HoldExecutionBuilder();
    }
}
