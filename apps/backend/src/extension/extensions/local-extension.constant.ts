import { CORE_EXTENSION_ID, CORE_EXTENSION_NAME } from '../extension.constant.js';

export const COMMON_PIPELINE_TRIGGERS_EXTENSION_ID = '24c626a1-5559-4f43-ad7f-d4528cb0aa34';
export const COMMON_PIPELINE_TRIGGERS_EXTENSION = 'common-pipeline-triggers';
export const GOOGLE_EXTENSION_ID = 'e6cf66b7-67a1-48e1-ba1c-ed1a16f09185';
export const GOOGLE_EXTENSION = 'google';
export const PIPELINE_SCRIPT_EXTENSION_ID = '01953755-3baa-7041-88da-d646546e8549';
export const PIPELINE_SCRIPT_EXTENSION = 'pipeline-script';
export const ICS_CALENDAR_EXTENSION_ID = '01958c1b-0a4f-7f12-9a6c-7a4c2dbb31ea';
export const ICS_CALENDAR_EXTENSION = 'ics-calendar';
export const YOUTUBE_EXTENSION_ID = '019df6f5-dae3-7099-a14f-22b5d7ddd19e';
export const YOUTUBE_EXTENSION = 'youtube';
export const AIRBNB_EXTENSION_ID = '01a163be-3d69-7179-9cd7-d9867999848a';
export const AIRBNB_EXTENSION = 'airbnb';
export const SPOTIFY_EXTENSION_ID = '01a163c8-c151-737e-a06a-271de119db95';
export const SPOTIFY_EXTENSION = 'spotify';
export const WHATSAPP_EXTENSION_ID = '01a163c8-c173-76cd-8a82-5d0a97928500';
export const WHATSAPP_EXTENSION = 'whatsapp';
export const BROWSER_HISTORY_EXTENSION_ID = '01a163c8-c191-7548-94ff-1e727b3aa54c';
export const BROWSER_HISTORY_EXTENSION = 'browser-history';
export const MY_HUB_EXTENSION_ID = '01a163c8-c1af-73dc-816d-53c911877f99';
export const MY_HUB_EXTENSION = 'my-hub';

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
    {
        id: ICS_CALENDAR_EXTENSION_ID,
        name: ICS_CALENDAR_EXTENSION,
    } as const,
    {
        id: YOUTUBE_EXTENSION_ID,
        name: YOUTUBE_EXTENSION,
    } as const,
    {
        id: AIRBNB_EXTENSION_ID,
        name: AIRBNB_EXTENSION,
    } as const,
    {
        id: SPOTIFY_EXTENSION_ID,
        name: SPOTIFY_EXTENSION,
    } as const,
    {
        id: WHATSAPP_EXTENSION_ID,
        name: WHATSAPP_EXTENSION,
    } as const,
    {
        id: BROWSER_HISTORY_EXTENSION_ID,
        name: BROWSER_HISTORY_EXTENSION,
    } as const,
    {
        id: MY_HUB_EXTENSION_ID,
        name: MY_HUB_EXTENSION,
    } as const,
] satisfies { id: string; name: string }[];

export type LocalExtensionId = (typeof localExtensions)[number]['id'];
export type LocalExtensionName = (typeof localExtensions)[number]['name'];
export const localExtensionName = localExtensions.map((e) => e.name);
