import { IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export enum MikroOrmLogLevel {
    QUERY = 'query',
    QUERY_PARAMS = 'query-params',
    SCHEMA = 'schema',
    DISCOVERY = 'discovery',
    INFO = 'info',
    DEPRECATED = 'deprecated',
}

export class MikroOrmConfig {
    @IsString()
    @IsNotEmpty()
    public readonly host!: string;

    @IsInt()
    @Min(1)
    @Max(65_536)
    public readonly port!: number;

    @IsString()
    @IsNotEmpty()
    public readonly user!: string;

    @IsString()
    @IsNotEmpty()
    public readonly password!: string;

    @IsString()
    @IsNotEmpty()
    public readonly database!: string;

    @IsOptional()
    @IsArray()
    @IsEnum(MikroOrmLogLevel, { each: true })
    public readonly logging!: MikroOrmLogLevel[];

    @IsArray()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    public readonly entities!: string[];

    @IsArray()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    public readonly entitiesTs!: string[];
}
