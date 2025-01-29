import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ExtensionEntity } from './entity/extension.entity.js';
import { ExtensionDeveloperEntity } from './entity/extension-developer.entity.js';
import {
    CORE_EXTENSION_DEVELOPER_ID,
    CORE_EXTENSION_DEVELOPER_NAME,
    CORE_EXTENSION_ID,
    CORE_EXTENSION_NAME,
} from './extension.constant.js';
import { ExtensionService } from './extension.service.js';
import { ExtensionController } from './extension.controller.js';
import { ExtensionDeveloperController } from './extension-developer.controller.js';

@Module({
    controllers: [ExtensionController, ExtensionDeveloperController],
    providers: [ExtensionService],
    exports: [ExtensionService],
})
export class ExtensionModule implements OnModuleInit {
    private readonly logger = new Logger(ExtensionModule.name);

    constructor(private readonly em: EntityManager) {}

    public onModuleInit(): Promise<void> {
        return this.em.transactional(async (em) => {
            const coreExtensionDeveloper = await em.upsert(ExtensionDeveloperEntity, {
                id: CORE_EXTENSION_DEVELOPER_ID,
                name: CORE_EXTENSION_DEVELOPER_NAME,
            });

            await em.upsert(ExtensionEntity, {
                id: CORE_EXTENSION_ID,
                name: CORE_EXTENSION_NAME,
                developer: coreExtensionDeveloper,
            });

            this.logger.log('Created core extension and extension developer entity');
        });
    }
}
