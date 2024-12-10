import { EntityManager, In, Repository } from 'typeorm';
import { generateJsonSchema } from 'ts-decorator-json-schema-generator';
import type { JSONSchema7 } from 'json-schema';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { SettingValueDto } from './dto/setting-value.dto.js';
import { InjectRepository } from '@nestjs/typeorm';
import { SettingEntity } from './entity/setting.entity.js';
import { SettingTargetTypeEnum } from './type/setting-target-type.enum.js';
import { SettingValueEntity } from './entity/setting-value.entity.js';
import type { SettingCategoryConfig, SettingFieldConfig } from './type/setting-config.type.js';
import { SettingCategoryEntity } from './entity/setting-category.entity.js';
import { SchemaValidationService } from '../schema-validation/schema-validation.service.js';
import { groupByKeySingle } from '../../util/common.util.js';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type {
    GetSettingsReturnType,
    GetSettingValuesReturnType,
    GlobalSettingKeys,
    GlobalSettingValues,
} from './type/setting-service-util.type.js';
import { setGlobalSettings } from './global-setting.constant.js';
import type {
    WarehouseControllerSettingCategoryKeys,
    WarehouseControllerSettingConfig,
    WarehouseControllerSettingKeys,
} from '../../util/setting/setting.constant.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReloadGlobalSettingsEvent } from './event/reload-global-settings.event.js';
import { toHeaderCase, toKebabCase, toTextCase } from 'js-convert-case';
import { UserService } from '../../user/user.service.js';

type SettingConfig = WarehouseControllerSettingConfig;
type CategoryKeys = WarehouseControllerSettingCategoryKeys;
type SettingKeys = WarehouseControllerSettingKeys;

@Injectable()
export class SettingService {
    private logger = new Logger(SettingService.name);

    constructor(
        private readonly validationService: SchemaValidationService,
        @InjectRepository(SettingEntity) private readonly settingEntityRepository: Repository<SettingEntity>,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
        private readonly eventEmitter: EventEmitter2,
        private readonly userService: UserService,
    ) {}

    public async applySettingConfig(em: EntityManager, settingConfig: SettingConfig): Promise<void> {
        await this.applySettingConfigCategories(em, settingConfig.categories);

        await this.applySettingConfigFields(em, settingConfig.settings);

        this.logger.log(
            `Stored settings config, including ${Object.keys(settingConfig.categories).length} categories and ${
                Object.keys(settingConfig.settings).length
            } settings`,
        );
    }

    public async storeSettings(
        em: EntityManager,
        updatedSettingValues: Pick<SettingValueDto<SettingConfig>, 'settingKey' | 'value'>[],
        userId?: number,
    ): Promise<void> {
        // any-cast needed, as typescript has problems with infinite recursion
        const settingInfoList = await em.findBy(SettingEntity, {
            key: In(updatedSettingValues.map((entry) => entry.settingKey)),
        } as any);
        console.log('settingInfoList', settingInfoList);
        const settingInfo = groupByKeySingle(settingInfoList, 'key');

        const updateData: SettingValueEntity[] = [];
        const nullUser = await this.userService.getNullUser();

        for (const { settingKey, value } of updatedSettingValues) {
            const setting = settingInfo[settingKey];

            if (!setting) {
                throw new BadRequestException(`Unknown setting key ${settingKey}`);
            }

            if (!setting.validationSchemaUri) {
                throw new Error(`Setting ${settingKey} has no validationSchemaUri`);
            }

            await this.validationService.validateOrThrow(setting.validationSchemaUri, value, settingKey);

            const userRequired = setting.targetType === SettingTargetTypeEnum.USER;

            if (userRequired && userId === undefined) {
                throw new Error(`Can't store user targeted setting without userId`);
            }

            updateData.push(
                new SettingValueEntity({
                    settingKey,
                    targetUserId: userRequired ? userId! : nullUser.id,
                    value,
                }),
            );
        }

        await em
            .createQueryBuilder()
            .insert()
            .into(SettingValueEntity)
            // @ts-ignore
            .values(updateData)
            .orUpdate(['value'], SettingValueEntity.PRIMARY_KEY_CONSTRAINT_NAME)
            .execute();

        // Clear cached setting values which are now dirty
        await Promise.all(
            updateData
                .filter((setting) => !setting.targetUserId)
                .map((setting) => this.cacheManager.del('setting-' + setting.settingKey)),
        );

        const includesGlobalSetting = settingInfoList.some((s) => s.targetType === SettingTargetTypeEnum.GLOBAL);

        if (includesGlobalSetting) {
            await this.reloadCachedGlobalSettings(em);
        }
    }

    public async getSettings(categoryKey: string, userId?: number): Promise<GetSettingsReturnType> {
        const settings = (await this.settingEntityRepository
            .createQueryBuilder('setting')
            .leftJoinAndSelect('setting.settingValues', 'settingValue', this.buildSettingValueFilters(userId))
            .where({
                parentCategoryKey: categoryKey,
                hidden: false,
            })
            .setParameters({
                userId,
            })
            .getMany()) as (SettingEntity & { settingValue?: SettingValueEntity })[];

        for (const setting of settings) {
            if (setting.settingValues?.length) {
                setting.settingValue = setting.settingValues[0];
                delete setting.settingValues;
            }
        }

        return groupByKeySingle(settings, 'key') as GetSettingsReturnType;
    }

    public async getSettingValues<SK extends SettingKeys>(
        em: EntityManager,
        settingKeys: SK[],
        userId?: number,
        ignoreCache = false,
    ): Promise<GetSettingValuesReturnType<SK>> {
        let cachedSettings: SettingEntity<SK>[] = [];

        if (!ignoreCache) {
            try {
                const cacheResults = await Promise.all(
                    settingKeys.map((key) => this.cacheManager.get<SettingEntity>(this.buildCacheKey(key, userId))),
                );
                cachedSettings = cacheResults.filter(Boolean) as SettingEntity<SK>[];
            } catch (error) {
                console.warn('Retrieving cached settings failed', error);
            }
        }

        const settingKeyCacheMisses = settingKeys.filter(
            (key) => !cachedSettings.some((cachedSetting) => cachedSetting.key === key),
        );
        const settingCacheMisses = (await em
            .createQueryBuilder()
            .from(SettingEntity, 'setting')
            .select(['setting.key', 'setting.defaultValue', 'settingValue.value'])
            .leftJoin('setting.settingValues', 'settingValue', this.buildSettingValueFilters(userId))
            .whereInIds(settingKeyCacheMisses)
            .setParameters({
                userId,
            })
            .getMany()) as SettingEntity<SK>[];

        try {
            await Promise.all(
                settingCacheMisses.map((setting) =>
                    this.cacheManager.set(this.buildCacheKey(setting.key, userId), setting),
                ),
            );
        } catch (error) {
            console.warn('Retrieving cached settings failed', error);
        }

        const settings = [...cachedSettings, ...settingCacheMisses];
        const settingValueObject = {} as GetSettingValuesReturnType<SK>;

        for (const setting of settings) {
            const isPresent =
                setting.settingValues !== undefined &&
                Array.isArray(setting.settingValues) &&
                !!setting.settingValues.length;

            settingValueObject[(setting.key + 'Setting') as `${SK}Setting`] = (
                isPresent ? setting.settingValues![0].value : setting.defaultValue ?? null
            ) as GetSettingValuesReturnType<SK>[`${SK}Setting`];
        }

        return settingValueObject;
    }

    public async reloadCachedGlobalSettings(em: EntityManager): Promise<void> {
        const globalSettingEntities = await em.find(SettingEntity, {
            select: ['key'],
        });

        const globalSettingKeys = globalSettingEntities.map((s) => s.key as GlobalSettingKeys);

        setGlobalSettings((await this.getSettingValues(em, globalSettingKeys, undefined, true)) as GlobalSettingValues);

        this.eventEmitter.emit(ReloadGlobalSettingsEvent.TYPE, new ReloadGlobalSettingsEvent());
    }

    private buildCacheKey(settingKey: string, userId: number | undefined) {
        return 'setting-' + settingKey + (userId ? '-' + userId : '');
    }

    private buildSettingValueFilters(userId: number | undefined): string {
        const settingValueFilters = [`setting.targetType = 'global'`];

        if (userId !== undefined) {
            settingValueFilters.push(`(setting.targetType = 'user' AND settingValue.targetUserId = :userId)`);
        }

        return `(${settingValueFilters.join(' OR ')})`;
    }

    private async applySettingConfigCategories(
        em: EntityManager,
        categories: Record<string, SettingCategoryConfig<CategoryKeys>>,
    ): Promise<void> {
        const categoryValueList = Object.entries(categories).map(([categoryKey, categoryData]) => ({
            key: categoryKey,
            parentCategoryKey: categoryData.parentCategory,
            icon: categoryData.icon,
            hidden: categoryData.hidden ?? false,
        }));

        if (!categoryValueList.length) {
            return;
        }

        await em
            .createQueryBuilder()
            .insert()
            .into(SettingCategoryEntity)
            .values(categoryValueList)
            .orUpdate(['parentCategoryKey', 'icon', 'hidden'], SettingCategoryEntity.PRIMARY_KEY_CONSTRAINT_NAME)
            .execute();
    }

    private async applySettingConfigFields(
        em: EntityManager,
        settingFields: Record<string, SettingFieldConfig<CategoryKeys>>,
    ): Promise<void> {
        const validationSchemaUriMap: Record<string, string> = {};

        for (const [settingKey, data] of Object.entries(settingFields)) {
            if (!data.validationSchema && !data.validationSchemaObject) {
                throw new Error(`Setting is missing information on how to validate its setting values`);
            }

            const validationSchema: JSONSchema7 = data.validationSchemaObject
                ? generateJsonSchema(data.validationSchemaObject, {
                      includeSubschemas: ($id) => ($id ? 'reference' : 'anonymously'),
                  })
                : data.validationSchema!;
            validationSchema.$id = this.getValidationSchemaId(settingKey);
            validationSchema.$schema = 'http://json-schema.org/draft-07/schema';
            validationSchema.title = `${toHeaderCase(settingKey)} Setting`;
            validationSchema.description ??= `The ${toTextCase(settingKey)} ${
                data.targetType
            } setting for the warehouse controller`;

            validationSchemaUriMap[settingKey] = await this.validationService.registerSchema(validationSchema);
        }

        const settingFieldValues = Object.entries(settingFields).map(([settingKey, SettingDto]) =>
            this.buildSetting(settingKey as SettingKeys, SettingDto, validationSchemaUriMap[settingKey]),
        );

        if (!settingFieldValues.length) {
            return;
        }

        await em
            .createQueryBuilder()
            .insert()
            .into(SettingEntity)
            // @ts-ignore
            .values(settingFieldValues)
            .orUpdate(
                [
                    'type',
                    'parentCategoryKey',
                    'targetType',
                    'validationSchemaUri',
                    'defaultValue',
                    'required',
                    'hidden',
                ],
                SettingEntity.PRIMARY_KEY_CONSTRAINT_NAME,
            )
            .execute();
    }

    private getValidationSchemaId(settingKey: string): string {
        return `${SchemaValidationService.SCHEMA_BASE_URI}setting/${toKebabCase(settingKey)}.schema.json`;
    }

    private buildSetting(
        settingKey: SettingKeys,
        data: SettingFieldConfig<CategoryKeys>,
        validationSchemaUri: string,
    ): SettingEntity {
        return new SettingEntity({
            key: settingKey,
            type: data.type,
            parentCategoryKey: data.parentCategoryKey,
            targetType: data.targetType as SettingTargetTypeEnum,
            validationSchemaUri,
            defaultValue: data.defaultValue,
            required: data.required,
            hidden: data.hidden,
        });
    }
}
