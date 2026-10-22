import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class RedisConfig {
    @IsString()
    @IsNotEmpty()
    public readonly host!: string;

    @IsInt()
    @Min(1)
    @Max(65_535)
    public readonly port!: number;

    @IsOptional()
    @IsString()
    public readonly username?: string;

    @IsOptional()
    @IsString()
    public readonly password?: string;

    /**
     * Logical database index. Git worktrees use their own index so their BullMQ workers never pick
     * up the main checkout's jobs.
     */
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(15)
    public readonly db?: number;
}
