/**
 * Minimal zip reader on top of `Blob.slice`, so a (multi-GB) archive is never loaded as a whole: only the central
 * directory is read up front, entry data on demand. Supports zip64, stored and deflated entries; deflate goes
 * through the browser's DecompressionStream('deflate-raw').
 */

export interface ZipEntry {
	/** Path inside the archive, `/` separators. */
	path: string;
	compressedSize: number;
	size: number;
	/** 0 = stored, 8 = deflate; anything else cannot be read. */
	method: number;
	encrypted: boolean;
	/** Offset of the entry's local file header. */
	localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** EOCD record (22 bytes) plus the longest possible archive comment. */
const EOCD_SEARCH_BYTES = 22 + 0xffff;
const MAX_32 = 0xffffffff;
const MAX_16 = 0xffff;

export class ZipFormatError extends Error {}

async function readView(blob: Blob, start: number, end: number): Promise<DataView> {
	return new DataView(await blob.slice(start, end).arrayBuffer());
}

/** zip offsets/sizes can exceed 2^32 (zip64); JS numbers are exact up to 2^53. */
function getUint64(view: DataView, offset: number): number {
	return view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 2 ** 32;
}

const utf8 = new TextDecoder('utf-8');

export async function listZipEntries(blob: Blob): Promise<ZipEntry[]> {
	const tailStart = Math.max(0, blob.size - EOCD_SEARCH_BYTES);
	const tail = await readView(blob, tailStart, blob.size);

	let eocd = -1;
	for (let i = tail.byteLength - 22; i >= 0; i--) {
		if (tail.getUint32(i, true) === EOCD_SIGNATURE) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) {
		throw new ZipFormatError('Kein gültiges ZIP-Archiv');
	}

	let entryCount = tail.getUint16(eocd + 10, true);
	let directorySize = tail.getUint32(eocd + 12, true);
	let directoryOffset = tail.getUint32(eocd + 16, true);

	if (entryCount === MAX_16 || directorySize === MAX_32 || directoryOffset === MAX_32) {
		const locator = eocd - 20;
		// Without a locator the maximum values are real (e.g. exactly 65535 entries), not zip64 markers.
		if (locator >= 0 && tail.getUint32(locator, true) === ZIP64_LOCATOR_SIGNATURE) {
			const zip64Offset = getUint64(tail, locator + 8);
			const record = await readView(blob, zip64Offset, zip64Offset + 56);
			if (record.getUint32(0, true) !== ZIP64_EOCD_SIGNATURE) {
				throw new ZipFormatError('Ungültiges ZIP64-Verzeichnis');
			}
			entryCount = getUint64(record, 32);
			directorySize = getUint64(record, 40);
			directoryOffset = getUint64(record, 48);
		}
	}

	const directory = await readView(blob, directoryOffset, directoryOffset + directorySize);
	const entries: ZipEntry[] = [];
	let pos = 0;

	for (let i = 0; i < entryCount && pos + 46 <= directory.byteLength; i++) {
		if (directory.getUint32(pos, true) !== CENTRAL_SIGNATURE) {
			throw new ZipFormatError('Beschädigtes ZIP-Verzeichnis');
		}
		const flags = directory.getUint16(pos + 8, true);
		const method = directory.getUint16(pos + 10, true);
		let compressedSize = directory.getUint32(pos + 20, true);
		let size = directory.getUint32(pos + 24, true);
		const nameLength = directory.getUint16(pos + 28, true);
		const extraLength = directory.getUint16(pos + 30, true);
		const commentLength = directory.getUint16(pos + 32, true);
		let localHeaderOffset = directory.getUint32(pos + 42, true);

		const nameBytes = new Uint8Array(directory.buffer, directory.byteOffset + pos + 46, nameLength);
		// Non-UTF-8 names (flag bit 11 unset, CP437) only differ for non-ASCII characters; decoded as UTF-8 anyway.
		const path = utf8.decode(nameBytes).replaceAll('\\', '/');

		// Zip64 extended information: only the fields that are 0xFFFFFFFF in the header, in this order.
		let extra = pos + 46 + nameLength;
		const extraEnd = extra + extraLength;
		while (extra + 4 <= extraEnd) {
			const id = directory.getUint16(extra, true);
			const length = directory.getUint16(extra + 2, true);
			if (id === 0x0001) {
				let field = extra + 4;
				if (size === MAX_32) {
					size = getUint64(directory, field);
					field += 8;
				}
				if (compressedSize === MAX_32) {
					compressedSize = getUint64(directory, field);
					field += 8;
				}
				if (localHeaderOffset === MAX_32) {
					localHeaderOffset = getUint64(directory, field);
				}
			}
			extra += 4 + length;
		}

		if (!path.endsWith('/')) {
			entries.push({
				path,
				compressedSize,
				size,
				method,
				encrypted: (flags & 1) === 1,
				localHeaderOffset
			});
		}
		pos += 46 + nameLength + extraLength + commentLength;
	}

	return entries;
}

export function isReadableZipEntry(entry: ZipEntry): boolean {
	return !entry.encrypted && (entry.method === 0 || entry.method === 8);
}

/** The entry's decompressed bytes as a stream. Only the compressed range of the archive is read. */
export async function openZipEntry(
	blob: Blob,
	entry: ZipEntry
): Promise<ReadableStream<Uint8Array>> {
	if (!isReadableZipEntry(entry)) {
		throw new ZipFormatError(
			`${entry.path}: verschlüsselt oder nicht unterstütztes Kompressionsverfahren`
		);
	}
	// The local header's name/extra lengths may differ from the central directory's.
	const header = await readView(blob, entry.localHeaderOffset, entry.localHeaderOffset + 30);
	if (header.getUint32(0, true) !== LOCAL_SIGNATURE) {
		throw new ZipFormatError(`${entry.path}: beschädigter Eintrag`);
	}
	const dataStart =
		entry.localHeaderOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
	if (entry.compressedSize === 0 || entry.size === 0) {
		// Some writers store empty files as deflate with no data; inflating zero bytes throws.
		return new Blob([]).stream();
	}
	const raw = blob.slice(dataStart, dataStart + entry.compressedSize).stream();

	return entry.method === 0 ? raw : raw.pipeThrough(new DecompressionStream('deflate-raw'));
}

/** The first `maxBytes` decompressed bytes; stops inflating as soon as enough is there. */
export async function readZipEntryHead(
	blob: Blob,
	entry: ZipEntry,
	maxBytes: number
): Promise<Blob> {
	const reader = (await openZipEntry(blob, entry)).getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;

	try {
		while (length < maxBytes) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = value.subarray(0, maxBytes - length);
			chunks.push(chunk);
			length += chunk.byteLength;
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}

	return new Blob(chunks as BlobPart[]);
}

/**
 * The whole decompressed entry. Refuses to inflate past the size declared in the central directory, which upload
 * batching relies on (and which guards against zip bombs).
 */
export async function readZipEntry(blob: Blob, entry: ZipEntry): Promise<Blob> {
	const reader = (await openZipEntry(blob, entry)).getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > entry.size) {
				throw new ZipFormatError(`${entry.path}: größer als im ZIP-Verzeichnis angegeben`);
			}
			chunks.push(value);
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}

	return new Blob(chunks as BlobPart[]);
}
