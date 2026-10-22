import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Neode } from '@bytebunker/neode';
import { NEODE_PROVIDER } from '../graph-database/neode.constant.js';
import { NodeLabelEnum } from '../node-label.enum.js';
import { ImportProvenanceSummaryDto } from './dto/import-provenance-summary.dto.js';

@Controller('activities/provenance')
export class ImportProvenanceController {
    constructor(@Inject(NEODE_PROVIDER) private readonly neode: Neode) {}

    @Get()
    @ApiOperation({
        summary:
            'What an import created: node counts by label and the activity time range, for a pipeline execution ' +
            '(executionId) or an imported file (assetId). Nodes record this on create only.',
    })
    @ApiResponse({ status: 200, type: ImportProvenanceSummaryDto })
    public async summary(
        @Query('executionId') executionIdParam?: string,
        @Query('assetId') assetId?: string,
    ): Promise<ImportProvenanceSummaryDto> {
        const executionId = executionIdParam ? Number(executionIdParam) : undefined;

        if ((executionId === undefined || !Number.isInteger(executionId)) && !assetId) {
            throw new BadRequestException('Pass executionId or assetId');
        }

        const where = executionId !== undefined ? 'n.importExecutionId = $executionId' : 'n.importAssetId = $assetId';
        const params = { executionId: executionId ?? null, assetId: assetId ?? null };

        const labels = await this.neode.readCypher<{ label: string; count: number }>(
            `MATCH (n:${NodeLabelEnum.AS_OBJECT}) WHERE ${where}
             UNWIND labels(n) AS label
             RETURN label, count(*) AS count`,
            params,
        );
        const activities = await this.neode.readCypher<{ first: string | null; last: string | null }>(
            `MATCH (n:${NodeLabelEnum.ACTIVITY}) WHERE ${where}
             RETURN min(n.startTime) AS first, max(n.startTime) AS last`,
            params,
        );

        const nodeCounts = Object.fromEntries(
            labels.records.map((record) => [record.get('label'), Number(record.get('count'))]),
        );
        const activityCount = nodeCounts[NodeLabelEnum.ACTIVITY] ?? 0;
        const first = activities.records[0]?.get('first');
        const last = activities.records[0]?.get('last');

        return {
            executionId,
            assetId,
            nodeCounts,
            activityCount,
            objectCount: (nodeCounts[NodeLabelEnum.AS_OBJECT] ?? 0) - activityCount,
            firstActivityAt: first ? String(first) : undefined,
            lastActivityAt: last ? String(last) : undefined,
        };
    }
}
