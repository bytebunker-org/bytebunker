import { SettingTypeEnum } from '../../shared/setting/type/setting-type.enum.js';
import type { SettingConfigType } from '../../shared/setting/type/setting-config.type.js';

export const settingsConfig = {
    categories: {
        general: {},
        etl: {},
    },
    settings: {
        localTimezone: {
            type: SettingTypeEnum.STRING,
            targetType: 'global',
            validationSchema: {
                type: 'string',
            },
            validationSchemaObject: undefined,
            defaultValue: 'Europe/Berlin',
            required: true,
            parentCategoryKey: 'general',
        },
    },
} satisfies SettingConfigType<ByteBunkerSettingCategoryKeys>;

export type ByteBunkerSettingCategoryKeys = 'general' | 'etl';
export type ByteBunkerSettingConfig = typeof settingsConfig;
export type ByteBunkerSettingKeys = keyof ByteBunkerSettingConfig['settings'];
