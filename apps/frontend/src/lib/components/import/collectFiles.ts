import type { ImportUploadEntry } from '$lib/api/ImportApi.js';

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
	// readEntries returns at most ~100 entries per call, so loop until it is empty
	return new Promise((resolve, reject) => {
		const all: FileSystemEntry[] = [];
		const next = () =>
			reader.readEntries((batch) => {
				if (batch.length === 0) {
					resolve(all);
				} else {
					all.push(...batch);
					next();
				}
			}, reject);
		next();
	});
}

function entryToFile(entry: FileSystemFileEntry): Promise<File> {
	return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: FileSystemEntry, out: ImportUploadEntry[]): Promise<void> {
	if (entry.isFile) {
		const file = await entryToFile(entry as FileSystemFileEntry);
		out.push({ file, path: entry.fullPath.replace(/^\/+/, '') });
	} else if (entry.isDirectory) {
		const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
		for (const child of children) {
			await walk(child, out);
		}
	}
}

/** Recursively collects files (with relative paths) from a drop event's DataTransfer. */
export async function collectFromDataTransfer(
	dataTransfer: DataTransfer
): Promise<ImportUploadEntry[]> {
	const out: ImportUploadEntry[] = [];
	// Entries must be grabbed synchronously, the DataTransfer is cleared after the event handler returns
	const entries = Array.from(dataTransfer.items)
		.filter((item) => item.kind === 'file')
		.map((item) => ({ entry: item.webkitGetAsEntry?.() ?? null, file: item.getAsFile() }));

	for (const { entry, file } of entries) {
		if (entry) {
			await walk(entry, out);
		} else if (file) {
			out.push({ file, path: file.name });
		}
	}
	return out;
}

/** Files from an `<input type="file">`, using webkitRelativePath for folder picks. */
export function collectFromFileList(files: FileList | null): ImportUploadEntry[] {
	return Array.from(files ?? []).map((file) => ({
		file,
		path: file.webkitRelativePath || file.name
	}));
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
