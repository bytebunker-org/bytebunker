import type { JSONSchema7, JSONSchema7Type } from 'json-schema';
import type { SettingTypeEnum } from './setting-type.enum.js';
import type { Constructable } from '../../../util/type/constructable.interface.js';
import type { DateTime } from 'luxon';

export type DefaultCategoryKeys = 'general' | 'user' | 'user.notification';

export interface SettingCategoryConfig<SettingCategoryKeys extends string> {
    parentCategory?: SettingCategoryKeys;
    icon?: string;
    hidden?: boolean;
}

export interface SettingFieldConfig<SettingCategoryKeys extends string> {
    parentCategoryKey: SettingCategoryKeys;
    type: SettingTypeEnum;
    // Can't use the actual enum here, as typescript doesn't correctly preserve the actual enum value when using "as const"
    targetType: 'global' | 'user';
    defaultValue: NonNullable<JSONSchema7Type> | undefined;
    validationSchema?: Omit<JSONSchema7, '$id' | '$schema' | 'title'>;
    validationSchemaObject: Constructable<unknown> | undefined;
    required?: boolean;
    hidden?: boolean;
}

export interface SettingConfigType<SettingCategoryKeys extends string = string> {
    categories: Record<SettingCategoryKeys, SettingCategoryConfig<SettingCategoryKeys>>;
    settings: Record<string, SettingFieldConfig<SettingCategoryKeys>>;
}

export type SettingValueType =
    | string
    | number
    | boolean
    | DateTime
    | [DateTime, DateTime]
    | string[]
    | number[]
    | Record<string, unknown>;

export type GetSettingValueType<
    T extends SettingTypeEnum,
    // eslint-ignore-next-line @typescript-eslint/ban-types
    CustomType extends {} | undefined = undefined,
> = T extends SettingTypeEnum.STRING
    ? string
    : T extends SettingTypeEnum.TEXTBLOCK
    ? string
    : T extends SettingTypeEnum.NUMBER
    ? number
    : T extends SettingTypeEnum.BOOLEAN
    ? boolean
    : T extends SettingTypeEnum.DATE
    ? DateTime
    : T extends SettingTypeEnum.DATE_RANGE
    ? [DateTime, DateTime]
    : T extends SettingTypeEnum.EMAIL
    ? string
    : T extends SettingTypeEnum.FILE
    ? string
    : T extends SettingTypeEnum.TIME
    ? DateTime
    : T extends SettingTypeEnum.COLOR
    ? string
    : T extends SettingTypeEnum.STRING
    ? string[]
    : T extends SettingTypeEnum.NUMBER_ARRAY
    ? number[]
    : T extends SettingTypeEnum.CUSTOM
    ? CustomType extends undefined
        ? Record<string, unknown>
        : // @ts-ignore
          CustomType['prototype']
    : unknown;
