import type { GlobalSettingValues } from './type/setting-service-util.type.js';

let globalSettings: GlobalSettingValues = {} as GlobalSettingValues;

export function getGlobalSettings(): GlobalSettingValues {
    return globalSettings;
}

export function setGlobalSettings(_globalSettings: GlobalSettingValues) {
    globalSettings = _globalSettings;
}
