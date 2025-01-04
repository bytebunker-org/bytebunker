import { generateJsonSchema } from 'ts-decorator-json-schema-generator';
import type { JSONSchema7 } from 'json-schema';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { SettingValueDto } from './dto/setting-value.dto.js';
import { SettingEntity } from './entity/setting.entity.js';
import { SettingTargetTypeEnum } from './type/setting-target-type.enum.js';
import { SettingValueEntity } from './entity/setting-value.entity.js';
import type { SettingCategoryConfig, SettingFieldConfig } from './type/setting-config.type.js';
import { SettingCategoryEntity } from './entity/setting-category.entity.js';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type {
    GetSettingsReturnType,
    GetSettingValuesReturnType,
    GlobalSettingKeys,
    GlobalSettingValues,
} from './type/setting-service-util.type.js';
import { setGlobalSettings } from './global-setting.constant.js';
import { toHeaderCase, toKebabCase, toTextCase } from 'js-convert-case';
import { UserService } from '../../user/user.service.js';
import type {
    ByteBunkerSettingCategoryKeys,
    ByteBunkerSettingConfig,
    ByteBunkerSettingKeys,
} from '../../util/setting/setting.constant.js';
import type { EntityManager } from '@mikro-orm/postgresql';
import { groupByKeySingle } from '../../util/util.js';
import { type ObjectQuery } from '@mikro-orm/core';
import { JsonSchemaService } from '../json-schema/json-schema.service.js';
import { JsonSchemaValidationService } from '../json-schema-validation/json-schema-validation.service.js';

type SettingConfig = ByteBunkerSettingConfig;
type CategoryKeys = ByteBunkerSettingCategoryKeys;
type SettingKeys = ByteBunkerSettingKeys;

@Injectable()
export class SettingService {
    private logger = new Logger(SettingService.name);

    constructor(
        private readonly jsonSchemaService: JsonSchemaService,
        private readonly jsonSchemaValidationService: JsonSchemaValidationService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
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
        const settingInfoList = await em.find(SettingEntity, {
            key: {
                $in: updatedSettingValues.map((entry) => entry.settingKey),
            },
        });
        console.log('settingInfoList', settingInfoList);
        const settingInfo = groupByKeySingle(settingInfoList, 'key');

        const updateData: SettingValueEntity[] = [];
        const nullUser = await this.userService.getNullUser(em);

        for (const { settingKey, value } of updatedSettingValues) {
            const setting = settingInfo[settingKey];

            if (!setting) {
                throw new BadRequestException(`Unknown setting key ${settingKey}`);
            }

            if (!setting.validationSchemaUri) {
                throw new Error(`Setting ${settingKey} has no validationSchemaUri`);
            }

            await this.jsonSchemaValidationService.validateOrThrow(em, setting.validationSchemaUri, value, settingKey);

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

        await em.upsertMany(SettingValueEntity, updateData, {
            onConflictAction: 'merge',
            onConflictMergeFields: ['value'],
        });

        /*await em
            .createQueryBuilder()
            .insert()
            .into(SettingValueEntity)
            // @ts-ignore
            .values(updateData)
            .orUpdate(['value'], SettingValueEntity.PRIMARY_KEY_CONSTRAINT_NAME)
            .execute();*/

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

    public async getSettings(em: EntityManager, categoryKey: string, userId?: number): Promise<GetSettingsReturnType> {
        const settings = await em.find(
            SettingEntity,
            {
                parentCategoryKey: categoryKey,
                hidden: false,
            },
            {
                populate: ['settingValues'],
                populateWhere: this.buildSettingValueFilters(userId),
            },
        );

        return groupByKeySingle(
            settings.map((s) => ({
                ...s,
                settingValue: s.settingValues?.[0],
            })),
            'key',
        ) as unknown as GetSettingsReturnType; // TODO: Fix type instead of converting to unknown
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

        const settingCacheMisses = await em.find(
            SettingEntity,
            {
                key: {
                    $in: settingKeyCacheMisses,
                },
            },
            {
                fields: ['key', 'defaultValue', 'settingValues.value'],
                populate: ['settingValues'],
                populateWhere: this.buildSettingValueFilters(userId),
            },
        );

        /*const settingCacheMisses = (await em
            .createQueryBuilder()
            .from(SettingEntity, 'setting')
            .select(['setting.key', 'setting.defaultValue', 'settingValue.value'])
            .leftJoin('setting.settingValues', 'settingValue', this.buildSettingValueFilters(userId))
            .whereInIds(settingKeyCacheMisses)
            .setParameters({
                userId,
            })
            .getMany()) as SettingEntity<SK>[];*/

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
                isPresent ? setting.settingValues![0].value : (setting.defaultValue ?? null)
            ) as GetSettingValuesReturnType<SK>[`${SK}Setting`];
        }

        return settingValueObject;
    }

    public async reloadCachedGlobalSettings(em: EntityManager): Promise<void> {
        const globalSettingEntities = await em.find(
            SettingEntity,
            {
                targetType: SettingTargetTypeEnum.GLOBAL,
            },
            {
                fields: ['key'],
            },
        );

        const globalSettingKeys = globalSettingEntities.map((s) => s.key as GlobalSettingKeys);

        setGlobalSettings((await this.getSettingValues(em, globalSettingKeys, undefined, true)) as GlobalSettingValues);

        // TODO: Notify on reloading global settings
        // this.eventEmitter.emit(ReloadGlobalSettingsEvent.TYPE, new ReloadGlobalSettingsEvent());
    }

    private buildCacheKey(settingKey: string, userId: number | undefined) {
        return 'setting-' + settingKey + (userId ? '-' + userId : '');
    }

    private buildSettingValueFilters(userId: number | undefined): ObjectQuery<SettingEntity> {
        return {
            $or: [
                {
                    targetType: SettingTargetTypeEnum.GLOBAL,
                },
                ...(userId
                    ? [
                          {
                              targetType: SettingTargetTypeEnum.USER,
                              settingValues: {
                                  targetUserId: userId,
                              },
                          },
                      ]
                    : []),
            ],
        };
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

        await em.upsertMany(SettingCategoryEntity, categoryValueList, {
            onConflictAction: 'merge',
            onConflictMergeFields: ['parentCategoryKey', 'icon', 'hidden'],
        });
    }

    private async applySettingConfigFields(
        em: EntityManager,
        settingFields: Record<string, SettingFieldConfig<CategoryKeys>>,
    ): Promise<void> {
        const validationSchemas: JSONSchema7[] = [];
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

            validationSchemaUriMap[settingKey] = validationSchema.$id;
            validationSchemas.push(validationSchema);
        }

        await this.jsonSchemaService.storeMultiple(em, {
            jsonSchemas: validationSchemas,
        });

        const settingFieldValues = Object.entries(settingFields).map(([settingKey, SettingDto]) =>
            this.buildSetting(settingKey as SettingKeys, SettingDto, validationSchemaUriMap[settingKey]),
        );

        if (!settingFieldValues.length) {
            return;
        }

        await em.upsertMany(SettingEntity, settingFieldValues, {
            onConflictAction: 'merge',
            onConflictMergeFields: [
                'type',
                'parentCategoryKey',
                'targetType',
                'validationSchemaUri',
                'defaultValue',
                'required',
                'hidden',
            ],
        });
    }

    private getValidationSchemaId(settingKey: string): string {
        return `/schema/setting/${toKebabCase(settingKey)}.schema.json`;
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
