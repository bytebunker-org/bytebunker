import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthIndicatorFunction } from '@nestjs/terminus';
import {
    DiskHealthIndicator,
    HealthCheck,
    HealthCheckService,
    HttpHealthIndicator,
    TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheckResultDto } from './dto/health-check-result.dto.js';
import { RedisHealthIndicator } from '@liaoliaots/nestjs-redis-health';
import type { AppConfig } from '../../util/config/app.config.js';
import { REDIS_PROVIDER } from '../redis/redis.constant.js';

@Controller('health')
@ApiTags('misc')
export class HealthController {
    constructor(
        private config: AppConfig,
        private healthCheckService: HealthCheckService,
        private httpHealthIndicator: HttpHealthIndicator,
        private typeOrmHealthIndicator: TypeOrmHealthIndicator,
        private diskHealthIndicator: DiskHealthIndicator,
        private redisHealthIndicator: RedisHealthIndicator,
        @Inject(REDIS_PROVIDER)
        private redis: any,
    ) {}

    @Get()
    @HealthCheck()
    check(): Promise<HealthCheckResultDto> {
        const healthIndicators: HealthIndicatorFunction[] = [
            () => this.httpHealthIndicator.pingCheck('pingGoogle', 'https://google.com'),
            () => this.typeOrmHealthIndicator.pingCheck('database', { timeout: 500 }),
            () => this.redisHealthIndicator.checkHealth('redis', { type: 'redis', client: this.redis, timeout: 500 }),
        ];

        /*const developmentHealthIndicators: HealthIndicatorFunction[] = [];
        const productionHealthIndicators: HealthIndicatorFunction[] = [
            () => this.diskHealthIndicator.checkStorage('storage', { path: '/', thresholdPercent: 0.8 })
        ];*/

        return this.healthCheckService.check([
            ...healthIndicators,
            // ...(this.config.nodeEnv === 'development' ? developmentHealthIndicators : productionHealthIndicators)
        ]) as Promise<HealthCheckResultDto>;
    }
}
