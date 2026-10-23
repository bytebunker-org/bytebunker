import { describe, expect, it } from 'vitest';
import {
	batchBySize,
	categorize,
	createItems,
	isUploadable,
	MAX_UPLOAD_FILE_BYTES,
	refreshDuplicates,
	type ImportSource
} from './importSelection.js';

function source(path: string, size = 10, archive?: string): ImportSource {
	return {
		key: archive ? `${archive}\u0000${path}` : path,
		path,
		size,
		archive,
		readHead: () => Promise.resolve(new Blob()),
		read: () => Promise.resolve(new Blob())
	};
}

describe('createItems', () => {
	it('flags media, oversized files and duplicate paths without reading anything', () => {
		const items = createItems(
			[
				source('Takeout/Fotos/IMG_1.jpg'),
				source('Takeout/Records.json', MAX_UPLOAD_FILE_BYTES + 1),
				source('Takeout/Zeitachse.json', 10, 'a.zip'),
				source('Takeout/Zeitachse.json', 10, 'b.zip')
			],
			[]
		);

		expect(items.map((item) => [item.ignored, item.tooLarge, item.duplicate, item.status])).toEqual(
			[
				[true, false, false, 'done'],
				[false, true, false, 'pending'],
				[false, false, false, 'pending'],
				[false, false, true, 'pending']
			]
		);
		expect(categorize(items[0])).toBe('ignored');
	});

	it('skips sources that are already selected', () => {
		const existing = createItems([source('a.json')], []);

		expect(createItems([source('a.json'), source('b.json')], existing)).toHaveLength(1);
	});
});

describe('isUploadable', () => {
	it('uploads only matched files that fit into a request', () => {
		const [matched, unmatched, big] = createItems(
			[source('a.json'), source('b.json'), source('c.json', MAX_UPLOAD_FILE_BYTES + 1)],
			[]
		);
		const preview = (matches: number) => ({
			relativePath: '',
			size: 0,
			conflict: false,
			previousImports: [],
			matches: Array.from({ length: matches }, () => ({
				blueprintId: 1,
				blueprintTitle: 'Timeline',
				matchedBy: 'glob' as const
			}))
		});
		Object.assign(matched, { status: 'done', preview: preview(1) });
		Object.assign(unmatched, { status: 'done', preview: preview(0) });
		Object.assign(big, { status: 'done', preview: preview(1) });

		expect([matched, unmatched, big].map(isUploadable)).toEqual([true, false, false]);
		expect(isUploadable({ ...matched, excluded: true })).toBe(false);
	});
});

describe('batchBySize', () => {
	it('packs items up to the byte and count budget', () => {
		expect(batchBySize([5, 5, 5, 20, 1], (n) => n, 10)).toEqual([[5, 5], [5], [20], [1]]);
		expect(batchBySize([1, 1, 1], (n) => n, 10, 2)).toEqual([[1, 1], [1]]);
	});
});

describe('refreshDuplicates', () => {
	it('frees a duplicate path once the first item with that path is gone', () => {
		const items = createItems(
			[source('a.json', 10, 'one.zip'), source('a.json', 10, 'two.zip')],
			[]
		);
		expect(items.map((item) => item.duplicate)).toEqual([false, true]);

		const rest = items.slice(1);
		refreshDuplicates(rest);
		expect(rest[0].duplicate).toBe(false);
	});
});
