import { HealthIndicatorStatusDto } from './health-indicator-status.dto.js';
import { IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';

export class HealthIndicatorResultDto {
    @Type(() => HealthIndicatorStatusDto)
    @IsObject()
    @ValidateNested()
    public pingGoogle!: HealthIndicatorStatusDto;

    @Type(() => HealthIndicatorStatusDto)
    @IsObject()
    @ValidateNested()
    public database!: HealthIndicatorStatusDto;

    @Type(() => HealthIndicatorStatusDto)
    @IsObject()
    @ValidateNested()
    public redis!: HealthIndicatorStatusDto;

    @IsOptional()
    @Type(() => HealthIndicatorStatusDto)
    @IsObject()
    @ValidateNested()
    public storage?: HealthIndicatorStatusDto;

    /**
     * The key of the health indicator which should be unique
     */
    [key: string]: HealthIndicatorStatusDto | undefined;
}

export class PartialHealthIndicatorResultDto extends PartialType(HealthIndicatorResultDto) {}
