export const defaultLocale = 'en';
const _supportedLocales = ['en', 'de'] as const;
export type SupportedLocale = (typeof _supportedLocales)[number];
// @ts-ignore
export const supportedLocales: SupportedLocale[] = _supportedLocales.sort();
