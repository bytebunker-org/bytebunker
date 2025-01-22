import { Global, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { SettingService } from './setting.service.js';
import { SettingController } from './setting.controller.js';
import { CacheModule } from '@nestjs/cache-manager';
import { settingsConfig } from '../../util/setting/setting.constant.js';
import { UserModule } from '../../user/user.module.js';
import { EntityManager } from '@mikro-orm/postgresql';
import { CORE_EXTENSION_ID } from '../../extension/extension.constant.js';
import { ExtensionModule } from '../../extension/extension.module.js';
import { JsonSchemaModule } from '../json-schema/json-schema.module.js';
import { JsonSchemaValidationModule } from '../json-schema-validation/json-schema-validation.module.js';

@Global()
@Module({
    imports: [
        CacheModule.register({
            ttl: 1000 * 60 * 10,
        }),
        UserModule,
        // initialize first so the core extension entity is available
        ExtensionModule,
        JsonSchemaModule,
        JsonSchemaValidationModule,
    ],
    providers: [SettingService],
    controllers: [SettingController],
    exports: [SettingService],
})
export class SettingModule implements OnModuleInit {
    private readonly logger = new Logger(SettingModule.name);

    constructor(
        private readonly settingService: SettingService,
        private readonly em: EntityManager,
    ) {}

    onModuleInit(): Promise<void> {
        return this.em.transactional(async (em) => {
            await this.settingService.applySettingConfig(em, CORE_EXTENSION_ID, settingsConfig);

            this.logger.log('Applied core settings config');

            await this.settingService.reloadCachedGlobalSettings(em);

            this.logger.log('Loaded global settings into cache');
        });
    }
}
