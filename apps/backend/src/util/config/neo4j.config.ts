import { Allow, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { LogLevelOption } from '@bytebunker/neode/logger';

export class Neo4jConfig {
    @IsString()
    @IsNotEmpty()
    public readonly connectionString!: string;

    @IsOptional()
    @IsString()
    public readonly username?: string;

    @IsOptional()
    @IsString()
    public readonly password?: string;

    @IsOptional()
    @IsBoolean()
    public readonly isEnterprise?: boolean;

    @IsOptional()
    @IsString()
    public readonly database?: string;

    @IsOptional()
    @Allow()
    public logging?: LogLevelOption;
}
