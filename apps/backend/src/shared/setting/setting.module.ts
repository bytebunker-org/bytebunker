import { Global, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { SettingService } from './setting.service.js';
import { SettingController } from './setting.controller.js';
import { CacheModule } from '@nestjs/cache-manager';
import { settingsConfig } from '../../util/setting/setting.constant.js';
import { UserModule } from '../../user/user.module.js';
import type { EntityManager } from '@mikro-orm/postgresql';

@Global()
@Module({
    imports: [
        CacheModule.register({
            ttl: 1000 * 60 * 10,
        }),
        UserModule,
    ],
    providers: [SettingService],
    controllers: [SettingController],
    exports: [SettingService],
})
export class SettingModule implements OnApplicationBootstrap {
    private readonly logger = new Logger(SettingModule.name);

    constructor(
        private readonly settingService: SettingService,
        private readonly em: EntityManager,
    ) {}

    onApplicationBootstrap(): Promise<void> {
        return this.em.transactional(async (em) => {
            await this.settingService.applySettingConfig(em, settingsConfig);

            await this.settingService.reloadCachedGlobalSettings(em);

            this.logger.log('Loaded global settings into cache');
        });
    }
}
