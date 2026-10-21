'use strict';

// Fixtures for checker.js. Plain node: `node tests/run_fixtures.js`.
// Prints one line per case and exits non-zero on any failure.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CHECKER_PATH = path.join(__dirname, '..', 'checker.js');
const README_PATH = path.join(__dirname, '..', 'README.md');
const checker = require('../checker.js');
const { auditListing, auditMany, normalizeTags, countChars } = checker;

const THIRTEEN_TAGS = [
  'ceramic mug', 'handmade mug', 'coffee cup', 'stoneware', 'gift for her',
  'kitchen decor', 'tea cup', 'pottery', 'speckled glaze', 'housewarming',
  'blue mug', 'large mug', 'rustic',
];

function etsy(overrides) {
  return Object.assign(
    { platform: 'etsy', id: 'e1', title: 'Handmade ceramic mug', tags: THIRTEEN_TAGS.slice() },
    overrides,
  );
}

function shopify(overrides) {
  return Object.assign(
    {
      platform: 'shopify',
      id: 's1',
      title: 'Handmade ceramic mug',
      meta_title: 'Handmade Ceramic Mug | Speckled Stoneware',
      meta_description: 'Speckled stoneware mug, thrown and glazed by hand. Holds 12 oz.',
    },
    overrides,
  );
}

function codes(result) {
  return result.issues.map((item) => item.code);
}

function find(result, code) {
  return result.issues.find((item) => item.code === code);
}

// First ```json block after a heading line in the README.
function readmeJson(heading) {
  const text = fs.readFileSync(README_PATH, 'utf8');
  const at = text.indexOf(`\n${heading}\n`);
  assert.ok(at >= 0, `heading ${heading} not found`);
  const open = text.indexOf('```json', at);
  assert.ok(open >= 0, `no json block after ${heading}`);
  const start = text.indexOf('\n', open) + 1;
  const end = text.indexOf('```', start);
  assert.ok(end > start, `unterminated json block after ${heading}`);
  return JSON.parse(text.slice(start, end));
}

const cases = [
  ['etsy: clean listing with 13 tags has no issues', () => {
    const r = auditListing(etsy());
    assert.deepStrictEqual(r.issues, []);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.id, 'e1');
    assert.strictEqual(r.platform, 'etsy');
    assert.deepStrictEqual(r.counts, {
      title_chars: 20, tag_count: 13, longest_tag_chars: 14, meta_title_chars: 0, meta_description_chars: 0,
    });
  }],
  ['etsy: 141-character title is over_limit', () => {
    const r = auditListing(etsy({ title: 'a'.repeat(141) }));
    const hit = find(r, 'over_limit');
    assert.ok(hit, 'expected over_limit');
    assert.strictEqual(hit.field, 'title');
    assert.strictEqual(hit.actual, 141);
    assert.strictEqual(hit.limit, 140);
    assert.strictEqual(hit.severity, 'error');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.counts.title_chars, 141);
  }],
  ['etsy: 140-character title passes', () => {
    const r = auditListing(etsy({ title: 'a'.repeat(140) }));
    assert.deepStrictEqual(r.issues, []);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.counts.title_chars, 140);
  }],
  ['etsy: empty title is missing', () => {
    const r = auditListing(etsy({ title: '   ' }));
    const hit = find(r, 'missing');
    assert.ok(hit, 'expected missing');
    assert.strictEqual(hit.field, 'title');
    assert.strictEqual(r.ok, false);
  }],
  ['etsy: 14 tags is too_many_tags', () => {
    const r = auditListing(etsy({ tags: THIRTEEN_TAGS.concat(['extra tag']) }));
    const hit = find(r, 'too_many_tags');
    assert.ok(hit, 'expected too_many_tags');
    assert.strictEqual(hit.actual, 14);
    assert.strictEqual(hit.limit, 13);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.counts.tag_count, 14);
  }],
  ['etsy: 21-character tag is tag_too_long', () => {
    const tags = THIRTEEN_TAGS.slice(0, 12).concat(['b'.repeat(21)]);
    const r = auditListing(etsy({ tags }));
    const hit = find(r, 'tag_too_long');
    assert.ok(hit, 'expected tag_too_long');
    assert.strictEqual(hit.actual, 21);
    assert.strictEqual(hit.limit, 20);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.counts.longest_tag_chars, 21);
  }],
  ['etsy: 20-character tag passes', () => {
    const tags = THIRTEEN_TAGS.slice(0, 12).concat(['b'.repeat(20)]);
    const r = auditListing(etsy({ tags }));
    assert.deepStrictEqual(r.issues, []);
    assert.strictEqual(r.counts.longest_tag_chars, 20);
  }],
  ['etsy: duplicate tags are flagged ignoring case', () => {
    const tags = THIRTEEN_TAGS.slice(0, 12).concat(['Ceramic Mug']);
    const r = auditListing(etsy({ tags }));
    const dupes = r.issues.filter((item) => item.code === 'duplicate_tag');
    assert.strictEqual(dupes.length, 1);
    assert.strictEqual(dupes[0].actual, 'ceramic mug');
    assert.strictEqual(r.ok, false);
  }],
  ['etsy: fewer than 13 tags is unused_tag_slots, severity info, still ok', () => {
    const r = auditListing(etsy({ tags: THIRTEEN_TAGS.slice(0, 10) }));
    assert.deepStrictEqual(codes(r), ['unused_tag_slots']);
    const hit = find(r, 'unused_tag_slots');
    assert.strictEqual(hit.severity, 'info');
    assert.strictEqual(hit.actual, 10);
    assert.strictEqual(hit.limit, 13);
    assert.strictEqual(r.ok, true);
  }],
  ['etsy: missing tags field counts as zero tags and does not throw', () => {
    const r = auditListing({ platform: 'etsy', title: 'Handmade ceramic mug' });
    assert.deepStrictEqual(codes(r), ['unused_tag_slots']);
    assert.strictEqual(r.counts.tag_count, 0);
    assert.strictEqual(r.counts.longest_tag_chars, 0);
    assert.strictEqual(r.id, null);
  }],
  ['etsy: an emoji counts as one character', () => {
    const r = auditListing(etsy({ title: 'a'.repeat(139) + '\u{1F600}' }));
    assert.strictEqual(r.counts.title_chars, 140);
    assert.deepStrictEqual(r.issues, []);
  }],
  ['shopify: clean listing has no issues', () => {
    const r = auditListing(shopify());
    assert.deepStrictEqual(r.issues, []);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.platform, 'shopify');
  }],
  ['shopify: 61-character meta title is over_target_length', () => {
    const r = auditListing(shopify({ meta_title: 'm'.repeat(61) }));
    const hit = find(r, 'over_target_length');
    assert.ok(hit, 'expected over_target_length');
    assert.strictEqual(hit.field, 'meta_title');
    assert.strictEqual(hit.actual, 61);
    assert.strictEqual(hit.limit, 60);
    assert.strictEqual(hit.limit_kind, 'recommended_target');
    assert.match(hit.message, /search results may truncate/);
    assert.strictEqual(r.ok, false);
  }],
  ['shopify: 60-character meta title passes', () => {
    const r = auditListing(shopify({ meta_title: 'm'.repeat(60) }));
    assert.deepStrictEqual(r.issues, []);
    assert.strictEqual(r.counts.meta_title_chars, 60);
  }],
  ['shopify: 155-character meta description passes', () => {
    const r = auditListing(shopify({ meta_description: 'd'.repeat(155) }));
    assert.deepStrictEqual(r.issues, []);
    assert.strictEqual(r.counts.meta_description_chars, 155);
  }],
  ['shopify: 156-character meta description is over_target_length', () => {
    const r = auditListing(shopify({ meta_description: 'd'.repeat(156) }));
    const hit = find(r, 'over_target_length');
    assert.ok(hit, 'expected over_target_length');
    assert.strictEqual(hit.field, 'meta_description');
    assert.strictEqual(hit.actual, 156);
    assert.strictEqual(hit.limit, 155);
    assert.match(hit.message, /search results may truncate/);
  }],
  ['shopify: empty meta title and description are missing', () => {
    const r = auditListing({ platform: 'shopify', id: 7, title: 'Mug' });
    assert.deepStrictEqual(codes(r), ['missing', 'missing']);
    assert.deepStrictEqual(r.issues.map((item) => item.field), ['meta_title', 'meta_description']);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.id, 7);
  }],
  ['shopify: no message calls 60 or 155 a platform limit', () => {
    const r = auditListing(shopify({ meta_title: 'm'.repeat(80), meta_description: 'd'.repeat(200) }));
    assert.strictEqual(r.issues.length, 2);
    for (const item of r.issues) {
      assert.strictEqual(item.limit_kind, 'recommended_target');
      assert.match(item.message, /recommended/);
      assert.match(item.message, /not a Shopify field limit/);
      assert.doesNotMatch(item.message, /platform limit|maximum|exceeds|not allowed/i);
    }
  }],
  ['unknown platform returns one unknown_platform issue', () => {
    const r = auditListing({ platform: 'amazon', id: 'x', title: 'Mug' });
    assert.deepStrictEqual(codes(r), ['unknown_platform']);
    assert.strictEqual(r.issues[0].field, 'platform');
    assert.strictEqual(r.issues[0].actual, 'amazon');
    assert.strictEqual(r.ok, false);
  }],
  ['bad input (null, string, missing platform) never throws', () => {
    for (const bad of [null, undefined, 'etsy', 42, [], {}]) {
      const r = auditListing(bad);
      assert.deepStrictEqual(codes(r), ['unknown_platform']);
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.counts.title_chars, 0);
    }
  }],
  ['platform name is case-insensitive', () => {
    const r = auditListing(etsy({ platform: ' Etsy ' }));
    assert.strictEqual(r.platform, 'etsy');
    assert.deepStrictEqual(r.issues, []);
  }],
  ['auditMany: empty array returns empty array', () => {
    assert.deepStrictEqual(auditMany([]), []);
    assert.deepStrictEqual(auditMany(null), []);
  }],
  ['auditMany: keeps order and audits each listing', () => {
    const out = auditMany([etsy(), shopify({ meta_title: '' }), { platform: 'ebay' }]);
    assert.strictEqual(out.length, 3);
    assert.deepStrictEqual(out.map((r) => r.ok), [true, false, false]);
    assert.deepStrictEqual(out.map((r) => r.platform), ['etsy', 'shopify', 'ebay']);
  }],
  ['etsy: tags pasted as one comma or newline separated string are split and trimmed', () => {
    assert.deepStrictEqual(
      normalizeTags(' ceramic mug, handmade   mug\ncoffee cup,, '),
      ['ceramic mug', 'handmade mug', 'coffee cup'],
    );
    const r = auditListing(etsy({ tags: THIRTEEN_TAGS.join(', ') }));
    assert.deepStrictEqual(r.issues, []);
    assert.strictEqual(r.counts.tag_count, 13);
    assert.strictEqual(countChars('\u{1F600}'), 1);
  }],
  ['exports: constants are 140, 13, 20, 60 and 155', () => {
    assert.strictEqual(checker.ETSY_TITLE_MAX, 140);
    assert.strictEqual(checker.ETSY_TAG_COUNT, 13);
    assert.strictEqual(checker.ETSY_TAG_MAX, 20);
    assert.strictEqual(checker.META_TITLE_TARGET, 60);
    assert.strictEqual(checker.META_DESC_TARGET, 155);
  }],
  ['browser: with a window object the functions attach to window.ListingChecker', () => {
    const resolved = require.resolve('../checker.js');
    const cached = require.cache[resolved];
    const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
    const previous = globalThis.window;
    globalThis.window = {};
    try {
      delete require.cache[resolved];
      require('../checker.js');
      const attached = globalThis.window.ListingChecker;
      assert.ok(attached, 'expected window.ListingChecker');
      assert.strictEqual(typeof attached.auditListing, 'function');
      assert.strictEqual(typeof attached.auditMany, 'function');
      assert.deepStrictEqual(attached.auditListing(etsy()).issues, []);
      assert.strictEqual(typeof attached.countText, 'function');
    } finally {
      if (hadWindow) globalThis.window = previous;
      else delete globalThis.window;
      require.cache[resolved] = cached;
    }
  }],
  ['countText: empty string gives all zeros', () => {
    assert.deepStrictEqual(checker.countText(''),
      { characters: 0, characters_no_spaces: 0, words: 0, lines: 0 });
  }],
  ['countText: "hello world" is 11 / 10 / 2 / 1', () => {
    assert.deepStrictEqual(checker.countText('hello world'),
      { characters: 11, characters_no_spaces: 10, words: 2, lines: 1 });
  }],
  ['countText: an emoji counts as one character', () => {
    const r = checker.countText('a\u{1F600}b');
    assert.strictEqual(r.characters, 3);
    assert.strictEqual(r.characters, countChars('a\u{1F600}b'));
    assert.strictEqual(r.characters_no_spaces, 3);
  }],
  ['countText: a 140-character string returns 140', () => {
    assert.strictEqual(checker.countText('x'.repeat(140)).characters, 140);
  }],
  ['countText: two lines separated by a newline give lines 2', () => {
    const r = checker.countText('one\ntwo');
    assert.strictEqual(r.lines, 2);
    assert.strictEqual(r.words, 2);
  }],
  ['countText: null, undefined and a number give zeros without throwing', () => {
    const zeros = { characters: 0, characters_no_spaces: 0, words: 0, lines: 0 };
    assert.deepStrictEqual(checker.countText(null), zeros);
    assert.deepStrictEqual(checker.countText(undefined), zeros);
    assert.deepStrictEqual(checker.countText(42), zeros);
  }],
  ['source: checker.js has no network calls, module loading or outside URLs', () => {
    const source = fs.readFileSync(CHECKER_PATH, 'utf8');
    assert.doesNotMatch(source, /\bfetch\b|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    assert.doesNotMatch(source, /\bimport\b|\brequire\s*\(/);
    assert.doesNotMatch(source, /https?:|\/\/[a-z0-9-]+\.[a-z]{2,}/i);
    assert.doesNotMatch(source, /\bdocument\b|\beval\b|new Function/);
  }],
  ['readme: the usage example output matches the code', () => {
    const input = readmeJson('## Example input');
    const expected = readmeJson('## Example output');
    assert.deepStrictEqual(auditListing(input), expected);
  }],
  ['readme: no old seller URL, has the agent sentence, only the two allowed URLs', () => {
    const text = fs.readFileSync(README_PATH, 'utf8');
    const allowed = [
      'https://autoaugeo.gumroad.com/l/augeo-pub-8da490ef',
      'https://augeo-listing-seo-bundle-for-online-sellers-8a73.pages.dev/',
    ];
    assert.ok(!text.includes('matiaseg'));
    assert.ok(text.includes('This project is built and maintained by an automated agent system.'));
    const urls = text.match(/https?:\/\/[^\s)<>"'`]+/g) || [];
    assert.ok(urls.length > 0);
    for (const url of urls) {
      assert.ok(allowed.includes(url), `unexpected URL: ${url}`);
    }
  }],
];

let failed = 0;
for (const [name, run] of cases) {
  try {
    run();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${name}: ${err.message}`);
  }
}
console.log(`${cases.length - failed}/${cases.length} cases passed`);
process.exit(failed ? 1 : 0);
