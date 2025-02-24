import { CORE_EXTENSION_ID, CORE_EXTENSION_NAME } from '../extension.constant.js';

export const COMMON_PIPELINE_TRIGGERS_EXTENSION_ID = '24c626a1-5559-4f43-ad7f-d4528cb0aa34';
export const COMMON_PIPELINE_TRIGGERS_EXTENSION = 'common-pipeline-triggers';
export const GOOGLE_EXTENSION_ID = 'e6cf66b7-67a1-48e1-ba1c-ed1a16f09185';
export const GOOGLE_EXTENSION = 'google';
export const PIPELINE_SCRIPT_EXTENSION_ID = '01953755-3baa-7041-88da-d646546e8549';
export const PIPELINE_SCRIPT_EXTENSION = 'pipeline-script';

export const localExtensions = [
    {
        id: CORE_EXTENSION_ID,
        name: CORE_EXTENSION_NAME,
    } as const,
    {
        id: COMMON_PIPELINE_TRIGGERS_EXTENSION_ID,
        name: COMMON_PIPELINE_TRIGGERS_EXTENSION,
    } as const,
    {
        id: GOOGLE_EXTENSION_ID,
        name: GOOGLE_EXTENSION,
    } as const,
    {
        id: PIPELINE_SCRIPT_EXTENSION_ID,
        name: PIPELINE_SCRIPT_EXTENSION,
    } as const,
] satisfies { id: string; name: string }[];

export type LocalExtensionId = (typeof localExtensions)[number]['id'];
export type LocalExtensionName = (typeof localExtensions)[number]['name'];
export const localExtensionName = localExtensions.map((e) => e.name);
