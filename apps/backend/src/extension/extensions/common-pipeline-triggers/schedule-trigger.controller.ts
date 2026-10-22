import { Controller, NotFoundException, Param, ParseBoolPipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ScheduleTriggerService } from './schedule-trigger.service.js';
import { ScheduleRunResultDto } from './dto/schedule-run-result.dto.js';

@Controller('pipelines-blueprints')
export class ScheduleTriggerController {
    constructor(private readonly scheduleTriggerService: ScheduleTriggerService) {}

    @Post(':id/run')
    @ApiOperation({
        summary:
            'Start a scheduled blueprint now, as if its schedule-trigger fired. Skipped while an execution of the ' +
            'blueprint is still running. With dryRun every module runs but nothing is written.',
    })
    @ApiQuery({ name: 'dryRun', required: false, type: Boolean })
    @ApiResponse({ status: 201, type: ScheduleRunResultDto })
    @ApiResponse({ status: 404, description: 'The blueprint does not exist or has no schedule-trigger node' })
    public async run(
        @Param('id', ParseIntPipe) id: number,
        @Query('dryRun', new ParseBoolPipe({ optional: true })) dryRun?: boolean,
    ): Promise<ScheduleRunResultDto> {
        const result = await this.scheduleTriggerService.fire(id, { dryRun: dryRun ?? false });

        if (result.outcome === 'not-found') {
            throw new NotFoundException(result.reason);
        }

        return { ...result, outcome: result.outcome };
    }
}
