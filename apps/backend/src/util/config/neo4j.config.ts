import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum Neo4jLogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}

export class Neo4jConfig {
    @IsString()
    @IsNotEmpty()
    public readonly url!: string;

    @IsString()
    @IsNotEmpty()
    public readonly user!: string;

    @IsString()
    @IsNotEmpty()
    public readonly password!: string;

    @IsString()
    @IsNotEmpty()
    public readonly database!: string;

    @IsEnum(Neo4jLogLevel)
    public logLevel!: Neo4jLogLevel;
}
