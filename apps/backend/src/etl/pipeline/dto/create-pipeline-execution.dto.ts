import { IsInt, IsObject } from 'class-validator';

export class CreatePipelineExecutionDto {
    @IsInt()
    public blueprintId!: number;

    @IsInt()
    public triggerNodeId!: number;

    @IsObject()
    public triggerNodeInputData!: Record<string, unknown>;
}
