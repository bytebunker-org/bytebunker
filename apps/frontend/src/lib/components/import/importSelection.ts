import {
	FILE_SAMPLE_HEAD_BYTES,
	isIgnoredImportPath,
	type FileImportPreviewDto
} from '@bytebunker/backend';
import type { ImportUploadEntry } from '$lib/api/ImportApi.js';
import { isReadableZipEntry, listZipEntries, readZipEntry, readZipEntryHead } from './zipReader.js';

/**
 * Cloudflare rejects request bodies over 100 MB (decimal). A single file must fit into one request with some room
 * for the multipart framing; batches stay a bit further below.
 */
export const MAX_UPLOAD_FILE_BYTES = 95_000_000;
export const UPLOAD_BATCH_BYTES = 90_000_000;
/** Heads are small; batches keep each preview request quick and let a few run in parallel. */
export const PREVIEW_BATCH_BYTES = 8 * 1024 * 1024;
export const PREVIEW_BATCH_FILES = 400;

/**
 * One file to import: a dropped file or an entry inside a dropped zip. Nothing is read when it is created; the
 * browser only holds the `File` handle and reads slices on demand.
 */
export interface ImportSource {
	/** Unique within the selection: archive name + path. */
	key: string;
	/** Path the server routes by (inside the zip for archive entries), `/` separators. */
	path: string;
	size: number;
	/** Name of the zip archive the file comes from. */
	archive?: string;
	readHead: () => Promise<Blob>;
	read: () => Promise<Blob>;
}

export type ImportItemStatus = 'pending' | 'analysing' | 'done' | 'error';

export interface ImportItem {
	source: ImportSource;
	status: ImportItemStatus;
	/** Media / system file: never sent to the server. */
	ignored: boolean;
	tooLarge: boolean;
	/** Another item already has this path; uploading both would import the same path twice. */
	duplicate: boolean;
	preview?: FileImportPreviewDto;
	error?: string;
	/** Excluded by the user. */
	excluded: boolean;
}

export type ImportItemCategory = 'importable' | 'unmatched' | 'ignored' | 'pending' | 'error';

export function categorize(item: ImportItem): ImportItemCategory {
	if (item.ignored) return 'ignored';
	if (item.status === 'error') return 'error';
	if (item.status !== 'done' || !item.preview) return 'pending';
	return item.preview.matches.length > 0 ? 'importable' : 'unmatched';
}

export function hasConflict(item: ImportItem): boolean {
	return (
		categorize(item) === 'importable' &&
		(item.tooLarge || item.duplicate || item.preview?.conflict === true)
	);
}

/** Uploaded on "Import starten": importable, not excluded, fits into a request, not a duplicate path. */
export function isUploadable(item: ImportItem): boolean {
	return categorize(item) === 'importable' && !item.excluded && !item.tooLarge && !item.duplicate;
}

function fileSource(entry: ImportUploadEntry): ImportSource {
	return {
		key: entry.path,
		path: entry.path,
		size: entry.file.size,
		readHead: () => Promise.resolve(entry.file.slice(0, FILE_SAMPLE_HEAD_BYTES)),
		read: () => Promise.resolve(entry.file)
	};
}

/** Expands zip archives into their entries (central directory only) and wraps plain files. */
export async function toSources(
	entries: ImportUploadEntry[]
): Promise<{ sources: ImportSource[]; errors: string[] }> {
	const sources: ImportSource[] = [];
	const errors: string[] = [];

	for (const entry of entries) {
		if (!/\.zip$/i.test(entry.path)) {
			sources.push(fileSource(entry));
			continue;
		}
		try {
			for (const zipEntry of await listZipEntries(entry.file)) {
				if (!isReadableZipEntry(zipEntry)) {
					errors.push(`${entry.path}: ${zipEntry.path} ist verschlüsselt oder nicht lesbar`);
					continue;
				}
				sources.push({
					key: `${entry.path}\u0000${zipEntry.path}`,
					// Same as the server's zip handling: paths relative to the archive root
					path: zipEntry.path,
					size: zipEntry.size,
					archive: entry.path,
					readHead: () => readZipEntryHead(entry.file, zipEntry, FILE_SAMPLE_HEAD_BYTES),
					read: () => readZipEntry(entry.file, zipEntry)
				});
			}
		} catch (error) {
			errors.push(`${entry.path}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	return { sources, errors };
}

/** Re-flags duplicate paths after items left the list (e.g. uploaded originals); the first of each path wins. */
export function refreshDuplicates(items: ImportItem[]): void {
	const paths = new Set<string>();
	for (const item of items) {
		item.duplicate = !item.ignored && paths.has(item.source.path);
		if (!item.ignored) paths.add(item.source.path);
	}
}

/** New items for `sources`, skipping keys already selected and flagging paths already taken. */
export function createItems(sources: ImportSource[], existing: ImportItem[]): ImportItem[] {
	const keys = new Set(existing.map((item) => item.source.key));
	const paths = new Set(existing.filter((item) => !item.ignored).map((item) => item.source.path));
	const items: ImportItem[] = [];

	for (const source of sources) {
		if (keys.has(source.key)) continue;
		keys.add(source.key);
		const ignored = isIgnoredImportPath(source.path);
		const duplicate = !ignored && paths.has(source.path);
		if (!ignored) paths.add(source.path);
		items.push({
			source,
			status: ignored ? 'done' : 'pending',
			ignored,
			tooLarge: source.size > MAX_UPLOAD_FILE_BYTES,
			duplicate,
			excluded: false
		});
	}

	return items;
}

/** Splits into consecutive batches of at most `maxBytes` / `maxCount`; an item over the budget gets its own. */
export function batchBySize<T>(
	items: T[],
	sizeOf: (item: T) => number,
	maxBytes: number,
	maxCount = Infinity
): T[][] {
	const batches: T[][] = [];
	let current: T[] = [];
	let bytes = 0;

	for (const item of items) {
		const size = sizeOf(item);
		if (current.length > 0 && (bytes + size > maxBytes || current.length >= maxCount)) {
			batches.push(current);
			current = [];
			bytes = 0;
		}
		current.push(item);
		bytes += size;
	}
	if (current.length > 0) batches.push(current);

	return batches;
}

/** Bytes of the head the preview sends for a file. */
export function headSize(source: ImportSource): number {
	return Math.min(source.size, FILE_SAMPLE_HEAD_BYTES);
}
