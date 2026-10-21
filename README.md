# listing-length-checker

A small node module that counts the text fields of an online shop listing and reports which ones are too long, too short or repeated. It has no dependencies and makes no network calls.

This project is built and maintained by an automated agent system.

It is not affiliated with Etsy or Shopify.

## What it does

For Etsy listings it checks the title against 140 characters, the number of tags against 13, and the length of each tag against 20 characters. It also flags tags that appear twice (capital letters are ignored) and notes unused tag slots as information, not as a failure.

For Shopify listings it counts the meta title and the meta description against target lengths of 60 and 155 characters. These are target lengths, chosen so that search results are less likely to cut the text. They are not Shopify field limits, and the messages say so.

Characters are counted by code point, so an emoji counts as one character. Tags may be given as an array or as one string separated by commas or new lines. Bad input never throws: an unknown platform returns a single `unknown_platform` issue.

## Usage

```js
const { auditListing, auditMany, countText } = require('./checker.js');

const one = auditListing({ platform: 'etsy', title: 'Handmade ceramic mug', tags: ['mug'] });
const many = auditMany([{ platform: 'shopify', meta_title: 'Mug', meta_description: '' }]);
const counts = countText('hello world');
```

- `auditListing(listing)` returns `{ id, platform, ok, issues, counts }` for one listing.
- `auditMany(listings)` audits an array and keeps the order.
- `countText(text)` returns characters, characters without spaces, words and lines.

Each issue has `field`, `code`, `severity`, `message`, `actual`, `limit` and `limit_kind`.

## Example input

```json
{
  "id": "e1",
  "platform": "etsy",
  "title": "Handmade ceramic mug",
  "tags": [
    "ceramic mug",
    "handmade mug",
    "coffee cup",
    "stoneware",
    "gift for her",
    "kitchen decor",
    "tea cup",
    "pottery",
    "speckled glaze",
    "housewarming",
    "blue mug",
    "large mug",
    "handmade ceramic coffee mug"
  ]
}
```

## Example output

```json
{
  "id": "e1",
  "platform": "etsy",
  "ok": false,
  "issues": [
    {
      "field": "tags",
      "code": "tag_too_long",
      "severity": "error",
      "message": "Tag \"handmade ceramic coffee mug\" is 27 characters, spaces included, over the 20-character limit by 7.",
      "actual": 27,
      "limit": 20,
      "limit_kind": "platform_limit"
    }
  ],
  "counts": {
    "title_chars": 20,
    "tag_count": 13,
    "longest_tag_chars": 27,
    "meta_title_chars": 0,
    "meta_description_chars": 0
  }
}
```

## Tests

```
node tests/run_fixtures.js
```

The runner needs only node. It prints one line per case and exits with a non-zero code if any case fails. One case runs the example above and compares the result with the output shown in this file.

## Browser version

The same checks run in a browser page: https://augeo-listing-seo-bundle-for-online-sellers-8a73.pages.dev/

## Paid bundle

A paid listing SEO bundle for online sellers is sold on Gumroad. It costs money and is separate from this free module: https://autoaugeo.gumroad.com/l/augeo-pub-8da490ef

## License

MIT.
