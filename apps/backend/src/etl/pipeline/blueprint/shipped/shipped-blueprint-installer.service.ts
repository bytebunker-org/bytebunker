import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PipelineBlueprintEntity } from '../entity/pipeline-blueprint.entity.js';
import { PipelineBlueprintValidationService } from '../pipeline-blueprint-validation.service.js';
import { PipelineModuleService } from '../../pipeline-module/pipeline-module.service.js';
import { PipelineModuleEntity } from '../../pipeline-module/entity/pipeline-module.entity.js';
import type { BlueprintValidationResultDto } from '../dto/blueprint-validation-result.dto.js';
import {
    decideShippedBlueprintAction,
    loadShippedBlueprints,
    type ShippedBlueprint,
} from './shipped-blueprint.util.js';

/** Where extensions keep their `blueprints/` folders; the Nest build copies the JSON files next to the compiled code. */
const EXTENSIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../extension/extensions');

/**
 * Installs the blueprints extensions ship as JSON files. A blueprint is only overwritten by a newer shipped version
 * while the stored copy is still the one we installed; edited blueprints are left alone.
 */
@Injectable()
export class ShippedBlueprintInstallerService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ShippedBlueprintInstallerService.name);

    constructor(
        private readonly em: EntityManager,
        private readonly pipelineModuleService: PipelineModuleService,
        private readonly validationService: PipelineBlueprintValidationService,
    ) {}

    public onApplicationBootstrap(): void {
        // Not awaited: waiting for module discovery must not block (or deadlock) application startup.
        void this.installAll().catch((error: Error) =>
            this.logger.error(`Installing shipped blueprints failed: ${error.message}`, error.stack),
        );
    }

    public async installAll(extensionsDir = EXTENSIONS_DIR): Promise<void> {
        await this.pipelineModuleService.whenModulesReady();

        const shipped = await loadShippedBlueprints(extensionsDir, (file, error) =>
            this.logger.error(`Ignoring shipped blueprint ${file}: ${error.message}`),
        );

        for (const blueprint of shipped) {
            try {
                await this.em.fork().transactional((em) => this.installOne(em, blueprint));
            } catch (error) {
                this.logger.error(`Could not install shipped blueprint ${blueprint.key}: ${(error as Error).message}`);
            }
        }
    }

    private async installOne(em: EntityManager, shipped: ShippedBlueprint): Promise<void> {
        const stored = await em.findOne(PipelineBlueprintEntity, { key: shipped.key });
        const action = decideShippedBlueprintAction(stored ?? undefined, shipped.hash);

        switch (action) {
            case 'unchanged':
                return;
            case 'user-modified':
                this.logger.warn(
                    `Shipped blueprint ${shipped.key} has a newer version, but the stored copy (#${stored?.id}) was edited and is left as is.`,
                );
                return;
            case 'adopt-hash':
                stored!.shippedHash = shipped.hash;
                return;
            case 'install':
            case 'update': {
                const validation = await this.validate(em, shipped);

                if (!validation.valid) {
                    this.logger.error(
                        `Refusing to ${action} shipped blueprint ${shipped.key}, it is invalid:\n` +
                            validation.issues.map((issue) => `  [${issue.code}] ${issue.message}`).join('\n'),
                    );
                    return;
                }

                const blueprint =
                    stored ??
                    em.create(PipelineBlueprintEntity, {
                        key: shipped.key,
                        title: shipped.title,
                        data: shipped.data,
                    });

                blueprint.title = shipped.title;
                blueprint.description = shipped.description;
                blueprint.data = shipped.data;
                blueprint.shippedHash = shipped.hash;
                blueprint.usedModules.set(
                    [...new Set(shipped.data.nodes.map((n) => n.moduleId))].map((id) =>
                        em.getReference(PipelineModuleEntity, id),
                    ),
                );
                this.logger.log(`${action === 'install' ? 'Installed' : 'Updated'} shipped blueprint ${shipped.key}`);
            }
        }
    }

    /**
     * Module discovery marks modules ready before its transaction commits, so a module can briefly be unknown to
     * the validator. Retry a few times before treating "unknown-module" as real.
     */
    private async validate(em: EntityManager, shipped: ShippedBlueprint): Promise<BlueprintValidationResultDto> {
        let result = await this.validationService.validate(em, shipped.data);

        for (let attempt = 0; attempt < 10 && result.issues.some((i) => i.code === 'unknown-module'); attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            result = await this.validationService.validate(em.fork(), shipped.data);
        }

        return result;
    }
}
