import { IsInt, Min } from 'class-validator';

export class HoldExecutionDto {
    @IsInt()
    @Min(0)
    public executionId!: number;

    @IsString()
    @Required()
    public moduleId!: ModuleIdentifier;

    @IsNumber()
    @Required()
    public nodeId!: number;

    @IsBoolean()
    @Required()
    public isAbort!: boolean;

    @IsBoolean()
    @Required()
    public isUnexpectedError!: boolean;

    @Type(() => BlueprintExecutionLog)
    @SchemaType(BlueprintExecutionLog)
    @IsObject()
    @ValidateNested()
    @IsOptional()
    @Optional()
    public executionLog!: BlueprintExecutionLog;
}
