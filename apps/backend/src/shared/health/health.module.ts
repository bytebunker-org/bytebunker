import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { RedisHealthModule } from '@liaoliaots/nestjs-redis-health';
import { RedisModule } from '../redis/redis.module.js';

@Module({
    imports: [TerminusModule, HttpModule, RedisHealthModule, RedisModule],
    controllers: [HealthController],
})
export class HealthModule {}
