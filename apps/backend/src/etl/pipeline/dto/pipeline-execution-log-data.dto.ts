import { Transform } from 'class-transformer';
import { IsObject, IsOptional, Max, MaxLength, Min } from 'class-validator';

export class PipelineExecutionLogDataDto {
    @Min(100)
    @Max(999)
    public statusCode!: number;

    @IsOptional()
    @Transform(
        ({ value }: { value: unknown }) =>
            value && typeof value === 'string' && value.length > 255 ? value.slice(0, 252) + '...' : value,
        { toClassOnly: true },
    )
    @MaxLength(255)
    public message?: string;

    @IsOptional()
    @IsObject()
    public data?: Record<string, unknown>;

    // TODO: Use error object from serialize-error utility package
    @IsOptional()
    @IsObject()
    public error?: Error;
}
