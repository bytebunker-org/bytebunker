import { HealthIndicatorStatusEnum } from '../enum/health-indicator-status.enum.js';
import { IsEnum } from 'class-validator';

export class HealthIndicatorStatusDto {
    /**
     * The status if the given health indicator was successful or not
     */
    @IsEnum(HealthIndicatorStatusEnum)
    public status!: HealthIndicatorStatusEnum;

    /**
     * Optional settings of the health indicator result
     */
    [optionalKeys: string]: any;
}
