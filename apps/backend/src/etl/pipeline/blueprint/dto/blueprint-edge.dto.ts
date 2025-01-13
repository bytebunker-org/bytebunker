import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class BlueprintEdgeDto<EdgeData extends Record<string, unknown> = Record<string, unknown>> {
    /** Unique id of an edge */
    @IsInt()
    @Min(0)
    public id!: number;

    /** Id of source node */
    @IsInt()
    @Min(0)
    public source!: number;

    /** Id of target node */
    @IsInt()
    @Min(0)
    public target!: number;

    /** Id of source handle
     * only needed if there are multiple handles per node
     */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public sourceHandle?: string;

    /** Id of target handle
     * only needed if there are multiple handles per node
     */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public targetHandle?: string;

    @IsOptional()
    @IsObject()
    public data?: EdgeData;
}
