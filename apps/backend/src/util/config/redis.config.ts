import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class RedisConfig {
    @IsString()
    @IsNotEmpty()
    public readonly host!: string;

    @IsInt()
    @Min(1)
    @Max(65_536)
    public readonly port!: number;

    @IsOptional()
    @IsString()
    public readonly username?: string;

    @IsOptional()
    @IsString()
    public readonly password?: string;
}
