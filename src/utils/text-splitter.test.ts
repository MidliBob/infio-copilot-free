import { RecursiveCharacterTextSplitter } from './text-splitter';

// Golden expectations recorded from langchain 0.3.37
// (@langchain/textsplitters 0.1.0) createDocuments() output. The port was
// additionally verified identical over a 98-case differential matrix
// (14 texts x 7 configurations) covering CJK separators, zero-width
// spaces, overlap edges, unsplittable runs, surrogate pairs, CRLF and
// metadata.loc.lines bookkeeping.

// separators used by VectorManager for vault indexing
const VM_SEPARATORS = [
	"\n\n",
	"\n",
	".",
	",",
	" ",
	"\u200b", // Zero-width space
	"\uff0c", // Fullwidth comma
	"\u3001", // Ideographic comma
	"\uff0e", // Fullwidth full stop
	"\u3002", // Ideographic full stop
	"",
];

function fnv1a(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return (h >>> 0).toString(16);
}

function digest(docs: { pageContent: string }[]) {
	return {
		count: docs.length,
		totalLen: docs.reduce((a, d) => a + d.pageContent.length, 0),
		hash: fnv1a(docs.map((d) => d.pageContent).join('\u0000')),
	};
}

describe('RecursiveCharacterTextSplitter (local port)', () => {
	it('splits paragraphs on blank lines and tracks loc.lines', async () => {
		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: 25,
			chunkOverlap: 5,
			separators: VM_SEPARATORS,
		});
		const docs = await splitter.createDocuments([
			'Alpha bravo charlie.\n\nDelta echo foxtrot.\n\nGolf hotel india.',
		]);
		expect(docs.map((d) => ({ p: d.pageContent, l: d.metadata.loc?.lines }))).toEqual([
			{ p: 'Alpha bravo charlie.', l: { from: 1, to: 1 } },
			{ p: 'Delta echo foxtrot.', l: { from: 3, to: 3 } },
			{ p: 'Golf hotel india.', l: { from: 5, to: 5 } },
		]);
	});

	it('splits CJK punctuation with the vector-manager separators', async () => {
		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: 12,
			chunkOverlap: 2,
			separators: VM_SEPARATORS,
		});
		const docs = await splitter.createDocuments([
			'这是第一句话。这是第二句话，还有第三句话、最后。',
		]);
		expect(docs.map((d) => d.pageContent)).toEqual([
			'这是第一句话',
			'。这是第二句话',
			'，还有第三句话、最后。',
		]);
	});

	it('falls back to character splits for unsplittable runs', async () => {
		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: 10,
			chunkOverlap: 0,
			separators: [''],
		});
		const docs = await splitter.createDocuments(['x'.repeat(25)]);
		expect(docs.map((d) => d.pageContent)).toEqual([
			'xxxxxxxxxx',
			'xxxxxxxxxx',
			'xxxxx',
		]);
	});

	it('returns no documents for empty input', async () => {
		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: 500,
			chunkOverlap: 75,
			separators: VM_SEPARATORS,
		});
		await expect(splitter.createDocuments([''])).resolves.toEqual([]);
	});

	it('tracks line numbers across newline-separated chunks', async () => {
		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: 8,
			chunkOverlap: 1,
			separators: VM_SEPARATORS,
		});
		const docs = await splitter.createDocuments(['L1\nL2\n\nL3\nL4\nL5']);
		expect(docs.map((d) => ({ p: d.pageContent, l: d.metadata.loc?.lines }))).toEqual([
			{ p: 'L1\nL2', l: { from: 1, to: 2 } },
			{ p: 'L3\nL4', l: { from: 4, to: 5 } },
			{ p: 'L5', l: { from: 6, to: 6 } },
		]);
	});

	it('matches the recorded digest: realistic note @ 500/75 with VM separators', async () => {
		const text =
			'# Note\n\n' +
			'Semantic search splits notes into chunks. '.repeat(40) +
			'\n\n' +
			'Второй абзац на русском языке, с запятыми и точками. '.repeat(20) +
			'\n\n' +
			'End.';
		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: 500,
			chunkOverlap: 75,
			separators: VM_SEPARATORS,
		});
		const docs = await splitter.createDocuments([text]);
		expect(digest(docs)).toEqual({ count: 9, totalLen: 2980, hash: '6a4e7979' });
	});

	it('matches the recorded digest: repeated words @ 100/15 with default separators', async () => {
		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: 100,
			chunkOverlap: 15,
		});
		const docs = await splitter.createDocuments(['word '.repeat(300)]);
		expect(digest(docs)).toEqual({ count: 18, totalLen: 1737, hash: '88b2b459' });
	});

	it('keeps every chunk within chunkSize when separators end with ""', async () => {
		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: 500,
			chunkOverlap: 75,
			separators: VM_SEPARATORS,
		});
		const docs = await splitter.createDocuments([
			'short ' + 'y'.repeat(700) + ' tail ' + 'z '.repeat(900),
		]);
		for (const d of docs) {
			expect(d.pageContent.length).toBeLessThanOrEqual(500);
		}
	});

	it('rejects chunkOverlap >= chunkSize like langchain does', () => {
		expect(
			() => new RecursiveCharacterTextSplitter({ chunkSize: 10, chunkOverlap: 10 })
		).toThrow('Cannot have chunkOverlap >= chunkSize');
	});
});
