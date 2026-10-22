import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CoverageService } from './coverage.service.js';
import type { CoverageGroupBy } from './dto/coverage.dto.js';
import { CoverageResponseDto } from './dto/coverage.dto.js';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(name: string, value?: string): string | undefined {
    if (!value) {
        return undefined;
    }
    if (!DAY_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        throw new BadRequestException(`${name} must be YYYY-MM-DD`);
    }
    return value;
}

@Controller('activities/coverage')
export class CoverageController {
    constructor(private readonly coverageService: CoverageService) {}

    @Get()
    @ApiOperation({
        summary:
            'Activity counts per day, grouped by generating source (extension) or activity type, plus runs of ' +
            'days without data inside each series.',
    })
    @ApiResponse({ status: 200, type: CoverageResponseDto })
    public async coverage(
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('groupBy') groupBy: CoverageGroupBy = 'source',
        @Query('minGapDays') minGapDaysParam?: string,
    ): Promise<CoverageResponseDto> {
        if (groupBy !== 'source' && groupBy !== 'type') {
            throw new BadRequestException('groupBy must be source or type');
        }
        const minGapDays = minGapDaysParam === undefined ? 14 : Number(minGapDaysParam);
        if (!Number.isInteger(minGapDays) || minGapDays < 1) {
            throw new BadRequestException('minGapDays must be a positive integer');
        }

        return this.coverageService.getCoverage({
            from: parseDay('from', from),
            to: parseDay('to', to),
            groupBy,
            minGapDays,
        });
    }
}
