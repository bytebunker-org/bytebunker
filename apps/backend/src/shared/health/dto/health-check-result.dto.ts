import { HealthCheckStatusEnum } from '../enum/health-check-status.enum.js';
import { IsEnum, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { HealthIndicatorResultDto, PartialHealthIndicatorResultDto } from './health-indicator-result.dto.js';

/**
 * The result of a health check
 * @publicApi
 */
export class HealthCheckResultDto {
    /**
     * The overall status of the Health Check
     */
    @IsEnum(HealthCheckStatusEnum)
    public status!: HealthCheckStatusEnum;

    /**
     * The info object contains information of each health indicator
     * which is of status "up"
     */
    @Type(() => HealthIndicatorResultDto)
    @IsOptional()
    @IsObject()
    @ValidateNested()
    public info?: PartialHealthIndicatorResultDto;

    /**
     * The error object contains information of each health indicator
     * which is of status "down"
     */
    @Type(() => HealthIndicatorResultDto)
    @IsOptional()
    @IsObject()
    @ValidateNested()
    public error?: PartialHealthIndicatorResultDto;

    /**
     * The details object contains information of every health indicator.
     */
    @Type(() => HealthIndicatorResultDto)
    @IsObject()
    @ValidateNested()
    public details!: HealthIndicatorResultDto;
}
