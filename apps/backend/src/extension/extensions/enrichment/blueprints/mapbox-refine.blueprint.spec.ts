import { describe, expect, it } from 'vitest';
import { PipelineBlueprintValidationService } from '../../../../etl/pipeline/blueprint/pipeline-blueprint-validation.service.js';
import { PipelineModuleTypeEnum } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module-type.enum.js';
import type { Constructable } from '../../../../util/type/constructable.interface.js';
import { ScheduleTriggerPipelineModule } from '../../common-pipeline-triggers/pipeline-module/schedule-trigger.pipeline-module.js';
import { toDesiredSchedule } from '../../common-pipeline-triggers/schedule-trigger.util.js';
import { RefinePlacesMapboxPipelineModule } from '../pipeline-module/refine-places-mapbox.pipeline-module.js';
import { edgeModules, loadBlueprint, moduleEntityManager, moduleRow } from './blueprint-spec.util.js';

const modules = [ScheduleTriggerPipelineModule, RefinePlacesMapboxPipelineModule].map((moduleClass) =>
    moduleRow(moduleClass as Constructable<unknown>),
);

const FILE = 'mapbox-refine.blueprint.json';

describe('enrichment/mapbox-refine blueprint', () => {
    it('uses the modules under their discovered ids', () => {
        expect(modules.map((module) => [module.id, module.type])).toEqual([
            ['common-pipeline-triggers:schedule-trigger@1', PipelineModuleTypeEnum.TRIGGER],
            ['enrichment:refine-places-mapbox@1', PipelineModuleTypeEnum.NORMAL],
        ]);
    });

    it('passes blueprint validation without issues', async () => {
        const { data } = await loadBlueprint(FILE);
        const result = await new PipelineBlueprintValidationService().validate(moduleEntityManager(modules), data);

        expect(result.issues).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('runs the refinement after the trigger', async () => {
        const { data } = await loadBlueprint(FILE);

        expect(edgeModules(data)).toEqual([
            [
                'common-pipeline-triggers:schedule-trigger@1',
                'success',
                'enrichment:refine-places-mapbox@1',
                'dependentModules',
            ],
        ]);
    });

    it('triggers hourly at a quarter to', async () => {
        const { data } = await loadBlueprint(FILE);
        const trigger = data.nodes.find((node) =>
            node.moduleId.startsWith('common-pipeline-triggers:schedule-trigger'),
        )!;

        expect(toDesiredSchedule(1, trigger.id, trigger.constantInputData)).toMatchObject({
            pattern: '45 * * * *',
            tz: 'Europe/Berlin',
        });
    });
});
