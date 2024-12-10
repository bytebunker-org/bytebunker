import { Global, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { SettingService } from './setting.service.js';
import { SettingController } from './setting.controller.js';
import { SettingEntity } from './entity/setting.entity.js';
import { SettingCategoryEntity } from './entity/setting-category.entity.js';
import { SettingValueEntity } from './entity/setting-value.entity.js';
import { CacheModule } from '@nestjs/cache-manager';
import { settingsConfig } from '../../util/setting/setting.constant.js';

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([SettingEntity, SettingCategoryEntity, SettingValueEntity]),
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
        private readonly dataSource: DataSource,
    ) {}

    onApplicationBootstrap(): Promise<void> {
        return this.dataSource.transaction(async (em) => {
            await this.settingService.applySettingConfig(em, settingsConfig);

            await this.settingService.reloadCachedGlobalSettings(em);

            this.logger.log('Loaded global settings into cache');
        });
    }
}
