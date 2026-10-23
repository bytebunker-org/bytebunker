import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { listZipEntries, readZipEntry, readZipEntryHead } from './zipReader.js';

interface FixtureEntry {
	path: string;
	data: string;
	method: 0 | 8;
	/** Write sizes/offset as 0xFFFFFFFF with a zip64 extra field, as zip64 writers do for big entries. */
	zip64?: boolean;
}

/** Builds a zip in memory (CRCs left at 0, the reader does not check them). */
function buildZip(entries: FixtureEntry[]): Blob {
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = new TextEncoder().encode(entry.path);
		const raw = new TextEncoder().encode(entry.data);
		const data = entry.method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;

		const local = new DataView(new ArrayBuffer(30));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(8, entry.method, true);
		local.setUint32(18, data.length, true);
		local.setUint32(22, raw.length, true);
		local.setUint16(26, name.length, true);
		parts.push(new Uint8Array(local.buffer), name, data);

		const extra = new DataView(new ArrayBuffer(entry.zip64 ? 28 : 0));
		if (entry.zip64) {
			extra.setUint16(0, 0x0001, true);
			extra.setUint16(2, 24, true);
			extra.setUint32(4, raw.length, true);
			extra.setUint32(12, data.length, true);
			extra.setUint32(20, offset, true);
		}
		const header = new DataView(new ArrayBuffer(46));
		header.setUint32(0, 0x02014b50, true);
		header.setUint16(8, 0x0800, true);
		header.setUint16(10, entry.method, true);
		header.setUint32(20, entry.zip64 ? 0xffffffff : data.length, true);
		header.setUint32(24, entry.zip64 ? 0xffffffff : raw.length, true);
		header.setUint16(28, name.length, true);
		header.setUint16(30, extra.byteLength, true);
		header.setUint32(42, entry.zip64 ? 0xffffffff : offset, true);
		central.push(new Uint8Array(header.buffer), name, new Uint8Array(extra.buffer));

		offset += 30 + name.length + data.length;
	}

	const directorySize = central.reduce((sum, part) => sum + part.length, 0);
	const eocd = new DataView(new ArrayBuffer(22));
	eocd.setUint32(0, 0x06054b50, true);
	eocd.setUint16(8, entries.length, true);
	eocd.setUint16(10, entries.length, true);
	eocd.setUint32(12, directorySize, true);
	eocd.setUint32(16, offset, true);

	return new Blob([...parts, ...central, new Uint8Array(eocd.buffer)] as BlobPart[]);
}

describe('zipReader', () => {
	const zip = buildZip([
		{ path: 'Takeout/', data: '', method: 0 },
		{ path: 'Takeout/Zeitachse.json', data: '{"semanticSegments":[]}'.repeat(100), method: 8 },
		{ path: 'Takeout/notes.txt', data: 'hello', method: 0 },
		{ path: 'Takeout/big.json', data: 'x'.repeat(5000), method: 8, zip64: true }
	]);

	it('lists file entries and skips directories', async () => {
		const entries = await listZipEntries(zip);

		expect(entries.map((entry) => [entry.path, entry.size, entry.method])).toEqual([
			['Takeout/Zeitachse.json', 2300, 8],
			['Takeout/notes.txt', 5, 0],
			['Takeout/big.json', 5000, 8]
		]);
	});

	it('reads whole entries, stored and deflated, including zip64 ones', async () => {
		const [timeline, notes, big] = await listZipEntries(zip);

		expect(await (await readZipEntry(zip, notes)).text()).toBe('hello');
		expect((await readZipEntry(zip, timeline)).size).toBe(2300);
		expect(await (await readZipEntry(zip, big)).text()).toBe('x'.repeat(5000));
	});

	it('reads only the head of an entry', async () => {
		const [timeline] = await listZipEntries(zip);

		expect(await (await readZipEntryHead(zip, timeline, 20)).text()).toBe('{"semanticSegments":');
	});

	it('rejects files that are not zips', async () => {
		await expect(listZipEntries(new Blob(['not a zip']))).rejects.toThrow(
			'Kein gültiges ZIP-Archiv'
		);
	});
});

describe('zipReader edge cases', () => {
	it('returns empty content for empty deflate entries', async () => {
		const zip = buildZip([{ path: 'empty.json', data: '', method: 8 }]);
		const [entry] = await listZipEntries(zip);
		const empty = { ...entry, compressedSize: 0, size: 0 };
		expect((await readZipEntry(zip, empty)).size).toBe(0);
		expect((await readZipEntryHead(zip, empty, 100)).size).toBe(0);
	});

	it('refuses entries that inflate beyond their declared size', async () => {
		const zip = buildZip([{ path: 'big.json', data: 'x'.repeat(1000), method: 8 }]);
		const [entry] = await listZipEntries(zip);
		await expect(readZipEntry(zip, { ...entry, size: 10 })).rejects.toThrow(/größer/);
	});
});
