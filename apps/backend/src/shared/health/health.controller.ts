import { Controller, Get } from '@nestjs/common';
import type { HealthIndicatorFunction } from '@nestjs/terminus';
import { DiskHealthIndicator, HealthCheck, HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheckResultDto } from './dto/health-check-result.dto.js';
import { AppConfig } from '../../util/config/app.config.js';

@Controller('health')
@ApiTags('misc')
export class HealthController {
    constructor(
        private config: AppConfig,
        private healthCheckService: HealthCheckService,
        private httpHealthIndicator: HttpHealthIndicator,
        // private typeOrmHealthIndicator: TypeOrmHealthIndicator,
        private diskHealthIndicator: DiskHealthIndicator,
    ) {}

    @Get()
    @HealthCheck()
    check(): Promise<HealthCheckResultDto> {
        const healthIndicators: HealthIndicatorFunction[] = [
            () => this.httpHealthIndicator.pingCheck('pingGoogle', 'https://google.com'),
            // () => this.typeOrmHealthIndicator.pingCheck('database', { timeout: 500 }),
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
