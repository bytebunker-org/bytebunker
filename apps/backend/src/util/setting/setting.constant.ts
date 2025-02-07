import { SettingTypeEnum } from '../../shared/setting/type/setting-type.enum.js';
import type { SettingConfigType } from '../../shared/setting/type/setting-config.type.js';

export const settingsConfig = {
    categories: {
        general: {},
        etl: {},
    },
    settings: {
        localTimezone: {
            parentCategoryKey: 'general',
            type: SettingTypeEnum.STRING,
            targetType: 'global',
            validationSchema: {
                type: 'string',
            },
            validationSchemaObject: undefined,
            defaultValue: 'Europe/Berlin',
            required: true,
        },
        enableLocalFileTrigger: {
            parentCategoryKey: 'etl',
            type: SettingTypeEnum.BOOLEAN,
            targetType: 'global',
            validationSchema: {
                type: 'boolean',
            },
            validationSchemaObject: undefined,
            defaultValue: true,
            required: true,
        },
        localFileTriggerImportFolder: {
            parentCategoryKey: 'etl',
            type: SettingTypeEnum.STRING,
            targetType: 'global',
            validationSchema: {
                type: 'string',
            },
            validationSchemaObject: undefined,
            defaultValue: './data/import',
            required: true,
        },
        localFileTriggerImportFinishedFolder: {
            parentCategoryKey: 'etl',
            type: SettingTypeEnum.STRING,
            targetType: 'global',
            validationSchema: {
                type: 'string',
            },
            validationSchemaObject: undefined,
            defaultValue: './data/import-finished',
            required: true,
        },
        localFileTriggerImportFailedFolder: {
            parentCategoryKey: 'etl',
            type: SettingTypeEnum.STRING,
            targetType: 'global',
            validationSchema: {
                type: 'string',
            },
            validationSchemaObject: undefined,
            defaultValue: './data/import-failed',
            required: true,
        },
    },
} satisfies SettingConfigType<ByteBunkerSettingCategoryKeys>;

export type ByteBunkerSettingCategoryKeys = 'general' | 'etl';
export type ByteBunkerSettingConfig = typeof settingsConfig;
export type ByteBunkerSettingKeys = keyof ByteBunkerSettingConfig['settings'];
