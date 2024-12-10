import { SettingDto } from '../dto/setting.dto.js';
import { SettingValueDto } from '../dto/setting-value.dto.js';
import type { GetSettingValueType } from './setting-config.type.js';
import type {
    WarehouseControllerSettingConfig,
    WarehouseControllerSettingKeys,
} from '../../../util/setting/setting.constant.js';

type SettingConfig = WarehouseControllerSettingConfig;
type SettingKeys = WarehouseControllerSettingKeys;

export type GetSettingsReturnType = {
    [P in SettingKeys]:
        | (SettingDto<P> & {
              settingValue?: SettingValueDto<SettingConfig, GetSettingValueType<SettingConfig['settings'][P]['type']>>;
          })
        | undefined;
};

export type GetSettingValuesReturnType<SK extends SettingKeys> = {
    [P in SK as `${SK}Setting`]: SettingConfig['settings'][P]['defaultValue'] extends undefined
        ? GetSettingValueType<
              SettingConfig['settings'][P]['type'],
              SettingConfig['settings'][P]['validationSchemaObject']
          > | null
        : GetSettingValueType<
              SettingConfig['settings'][P]['type'],
              SettingConfig['settings'][P]['validationSchemaObject']
          >;
};

type OnlyGlobalSettingKey<SK extends SettingKeys> = SettingConfig['settings'][SK]['targetType'] extends 'global'
    ? SK
    : never;

export type GlobalSettingValues = {
    [SK in SettingKeys as OnlyGlobalSettingKey<SK> extends never
        ? never
        : `${SK}Setting`]: SettingConfig['settings'][SK]['defaultValue'] extends undefined
        ? GetSettingValueType<
              SettingConfig['settings'][SK]['type'],
              SettingConfig['settings'][SK]['validationSchemaObject']
          > | null
        : GetSettingValueType<
              SettingConfig['settings'][SK]['type'],
              SettingConfig['settings'][SK]['validationSchemaObject']
          >;
};

export type GlobalSettingKeys = OnlyGlobalSettingKey<SettingKeys>;
export type GlobalSettingKeysWithSuffix = keyof GlobalSettingValues;
