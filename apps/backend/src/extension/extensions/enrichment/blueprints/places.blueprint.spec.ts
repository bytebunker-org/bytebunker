import { describe, expect, it } from 'vitest';
import { PipelineBlueprintValidationService } from '../../../../etl/pipeline/blueprint/pipeline-blueprint-validation.service.js';
import { PipelineModuleTypeEnum } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module-type.enum.js';
import type { Constructable } from '../../../../util/type/constructable.interface.js';
import { ScheduleTriggerPipelineModule } from '../../common-pipeline-triggers/pipeline-module/schedule-trigger.pipeline-module.js';
import { toDesiredSchedule } from '../../common-pipeline-triggers/schedule-trigger.util.js';
import { ConsolidatePlacesPipelineModule } from '../pipeline-module/consolidate-places.pipeline-module.js';
import { GeocodePlacesOfflinePipelineModule } from '../pipeline-module/geocode-places-offline.pipeline-module.js';
import { DeriveHomeWorkPipelineModule } from '../pipeline-module/derive-home-work.pipeline-module.js';
import { DeriveTripsPipelineModule } from '../pipeline-module/derive-trips.pipeline-module.js';
import { LinkListensToMovesPipelineModule } from '../pipeline-module/link-listens-to-moves.pipeline-module.js';
import { ConfirmEventsPipelineModule } from '../pipeline-module/confirm-events.pipeline-module.js';
import { DailySummaryPipelineModule } from '../pipeline-module/daily-summary.pipeline-module.js';
import { edgeModules, loadBlueprint, moduleEntityManager, moduleRow } from './blueprint-spec.util.js';

const modules = [
    ScheduleTriggerPipelineModule,
    ConsolidatePlacesPipelineModule,
    GeocodePlacesOfflinePipelineModule,
    DeriveHomeWorkPipelineModule,
    DeriveTripsPipelineModule,
    LinkListensToMovesPipelineModule,
    ConfirmEventsPipelineModule,
    DailySummaryPipelineModule,
].map((moduleClass) => moduleRow(moduleClass as Constructable<unknown>));

const FILE = 'places.blueprint.json';

describe('enrichment/places blueprint', () => {
    it('uses the modules under their discovered ids', () => {
        expect(modules.map((module) => [module.id, module.type])).toEqual([
            ['common-pipeline-triggers:schedule-trigger@1', PipelineModuleTypeEnum.TRIGGER],
            ['enrichment:consolidate-places@1', PipelineModuleTypeEnum.NORMAL],
            ['enrichment:geocode-places-offline@1', PipelineModuleTypeEnum.NORMAL],
            ['enrichment:derive-home-work@1', PipelineModuleTypeEnum.NORMAL],
            ['enrichment:derive-trips@1', PipelineModuleTypeEnum.NORMAL],
            ['enrichment:link-listens-to-moves@1', PipelineModuleTypeEnum.NORMAL],
            ['enrichment:confirm-events@1', PipelineModuleTypeEnum.NORMAL],
            ['enrichment:daily-summary@1', PipelineModuleTypeEnum.NORMAL],
        ]);
    });

    it('passes blueprint validation without issues', async () => {
        const { data } = await loadBlueprint(FILE);
        const result = await new PipelineBlueprintValidationService().validate(moduleEntityManager(modules), data);

        expect(result.issues).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('chains places, geocoding, home/work, trips, listens on moves, events and daily summaries', async () => {
        const { data } = await loadBlueprint(FILE);

        expect(edgeModules(data)).toEqual([
            [
                'common-pipeline-triggers:schedule-trigger@1',
                'success',
                'enrichment:consolidate-places@1',
                'dependentModules',
            ],
            ['enrichment:consolidate-places@1', 'success', 'enrichment:geocode-places-offline@1', 'dependentModules'],
            ['enrichment:geocode-places-offline@1', 'success', 'enrichment:derive-home-work@1', 'dependentModules'],
            ['enrichment:derive-home-work@1', 'success', 'enrichment:derive-trips@1', 'dependentModules'],
            ['enrichment:derive-trips@1', 'success', 'enrichment:link-listens-to-moves@1', 'dependentModules'],
            ['enrichment:link-listens-to-moves@1', 'success', 'enrichment:confirm-events@1', 'dependentModules'],
            ['enrichment:confirm-events@1', 'success', 'enrichment:daily-summary@1', 'dependentModules'],
        ]);
    });

    it('has a schedule the trigger accepts', async () => {
        const { data } = await loadBlueprint(FILE);
        const trigger = data.nodes.find((node) =>
            node.moduleId.startsWith('common-pipeline-triggers:schedule-trigger'),
        )!;

        expect(toDesiredSchedule(1, trigger.id, trigger.constantInputData)).toMatchObject({
            pattern: '30 3 * * *',
            tz: 'Europe/Berlin',
        });
    });
});
