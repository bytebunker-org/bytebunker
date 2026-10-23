/**
 * Files the import never looks into: media and OS metadata. Keeps a whole-takeout zip fast. Browser-safe (no node
 * imports) because the upload UI applies the same rules before sending anything.
 */
export const IGNORED_IMPORT_EXTENSIONS: ReadonlySet<string> = new Set([
    'jpg',
    'jpeg',
    'png',
    'gif',
    'heic',
    'webp',
    'mp4',
    'mov',
    'mp3',
    'm4a',
    'wav',
    'avi',
    'mkv',
    'pdf',
]);

export function isIgnoredImportPath(relativePath: string): boolean {
    const parts = relativePath.replaceAll('\\', '/').split('/');
    const fileName = parts[parts.length - 1];
    const dot = fileName.lastIndexOf('.');
    const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';

    return (
        parts.some((part) => part === '__MACOSX' || part.startsWith('.')) ||
        fileName === 'Thumbs.db' ||
        IGNORED_IMPORT_EXTENSIONS.has(extension)
    );
}
