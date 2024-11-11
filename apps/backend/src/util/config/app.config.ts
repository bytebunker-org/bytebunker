import { MikroOrmConfig } from './mikro-orm.config.js';
import { CorsConfig } from './cors.config.js';
import { SwaggerConfig } from './swagger.config.js';
import { tags } from 'typia';
import { RedisConfig } from './redis.config.js';
import { Type } from 'class-transformer';

export enum NodeEnvironment {
    DEVELOPMENT = 'development',
    STAGING = 'staging',
    PRODUCTION = 'production',
}

export class AppConfig {
    public readonly hostName!: string;

    public readonly port!: number & tags.Type<'uint32'> & tags.Minimum<1> & tags.Maximum<65_535>;

    public readonly nodeEnv: NodeEnvironment = (process.env['NODE_ENV'] ?? 'development') as NodeEnvironment;

    @Type(() => CorsConfig)
    public readonly cors!: CorsConfig;

    @Type(() => MikroOrmConfig)
    public readonly mikroOrm!: MikroOrmConfig;

    @Type(() => RedisConfig)
    public readonly redis!: RedisConfig;

    @Type(() => SwaggerConfig)
    public readonly swagger?: SwaggerConfig;
}
