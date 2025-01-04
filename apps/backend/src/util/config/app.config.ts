import { MikroOrmConfig } from './mikro-orm.config.js';
import { CorsConfig } from './cors.config.js';
import { SwaggerConfig } from './swagger.config.js';
import { Type } from 'class-transformer';
import { SessionConfig } from './session.config.js';
import { IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export enum NodeEnvironment {
    DEVELOPMENT = 'development',
    STAGING = 'staging',
    PRODUCTION = 'production',
}

export class AppConfig {
    @IsString()
    @IsNotEmpty()
    public readonly hostName!: string;

    @IsInt()
    @Min(1)
    @Max(65_535)
    public readonly port!: number;

    @IsEnum(NodeEnvironment)
    @IsNotEmpty()
    public readonly nodeEnv!: NodeEnvironment;

    @IsString()
    @IsNotEmpty()
    public readonly frontendUrl!: string;

    @IsObject()
    @Type(() => CorsConfig)
    @ValidateNested()
    public readonly cors!: CorsConfig;

    @Type(() => MikroOrmConfig)
    @IsObject()
    @ValidateNested()
    public readonly mikroOrm!: MikroOrmConfig;

    @Type(() => SessionConfig)
    @IsObject()
    @ValidateNested()
    public readonly session!: SessionConfig;

    @Type(() => SwaggerConfig)
    @IsOptional()
    @IsObject()
    @ValidateNested()
    public readonly swagger?: SwaggerConfig;
}
