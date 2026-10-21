// Listing audit core for the browser checker. Pure functions: no DOM, no
// network, no outside resources. Same logic and numbers as actor/src/checks.js.
// In a browser the functions hang off window.ListingChecker; in node they are
// also set on module.exports.
(function (root) {
  'use strict';

  // Etsy listing limits (title length, tag count, tag length).
  const ETSY_TITLE_MAX = 140;
  const ETSY_TAG_COUNT = 13;
  const ETSY_TAG_MAX = 20;

  // Shopify: recommended target lengths chosen to reduce truncation in search
  // results. They are not Shopify field limits.
  const META_TITLE_TARGET = 60;
  const META_DESC_TARGET = 155;

  const PLATFORM_LIMIT = 'platform_limit';
  const RECOMMENDED_TARGET = 'recommended_target';

  // Array.from splits by code point, so an emoji counts as one character.
  function countChars(text) {
    return Array.from(text).length;
  }

  function asText(value) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    return '';
  }

  // Accepts an array of tags or one comma/newline separated string.
  function normalizeTags(value) {
    let raw = [];
    if (Array.isArray(value)) raw = value;
    else if (typeof value === 'string') raw = value.split(/[,\n]/);
    return raw
      .map((tag) => asText(tag).replace(/\s+/g, ' '))
      .filter((tag) => tag.length > 0);
  }

  // First spelling of every tag that appears more than once, ignoring case.
  function findDuplicates(tags) {
    const seen = new Map();
    const reported = new Set();
    const duplicates = [];
    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, tag);
      } else if (!reported.has(key)) {
        reported.add(key);
        duplicates.push(seen.get(key));
      }
    }
    return duplicates;
  }

  function issue(field, code, severity, message, actual, limit, limitKind) {
    return { field, code, severity, message, actual, limit, limit_kind: limitKind };
  }

  function auditEtsy(title, tags, issues) {
    const titleChars = countChars(title);
    if (titleChars === 0) {
      issues.push(issue('title', 'missing', 'error',
        'Etsy title is empty.', 0, ETSY_TITLE_MAX, PLATFORM_LIMIT));
    } else if (titleChars > ETSY_TITLE_MAX) {
      issues.push(issue('title', 'over_limit', 'error',
        `Etsy title is ${titleChars} characters, over the ${ETSY_TITLE_MAX}-character limit by ${titleChars - ETSY_TITLE_MAX}.`,
        titleChars, ETSY_TITLE_MAX, PLATFORM_LIMIT));
    }

    if (tags.length > ETSY_TAG_COUNT) {
      issues.push(issue('tags', 'too_many_tags', 'error',
        `Listing has ${tags.length} tags, ${tags.length - ETSY_TAG_COUNT} more than the ${ETSY_TAG_COUNT} Etsy allows.`,
        tags.length, ETSY_TAG_COUNT, PLATFORM_LIMIT));
    } else if (tags.length < ETSY_TAG_COUNT) {
      issues.push(issue('tags', 'unused_tag_slots', 'info',
        `Listing has ${tags.length} tags; ${ETSY_TAG_COUNT - tags.length} of the ${ETSY_TAG_COUNT} tag slots are unused.`,
        tags.length, ETSY_TAG_COUNT, PLATFORM_LIMIT));
    }

    for (const tag of tags) {
      const n = countChars(tag);
      if (n > ETSY_TAG_MAX) {
        issues.push(issue('tags', 'tag_too_long', 'error',
          `Tag "${tag}" is ${n} characters, spaces included, over the ${ETSY_TAG_MAX}-character limit by ${n - ETSY_TAG_MAX}.`,
          n, ETSY_TAG_MAX, PLATFORM_LIMIT));
      }
    }

    for (const tag of findDuplicates(tags)) {
      issues.push(issue('tags', 'duplicate_tag', 'error',
        `Tag "${tag}" appears more than once (capital letters are ignored).`,
        tag, null, null));
    }
  }

  function auditTarget(field, name, text, target, issues) {
    const n = countChars(text);
    if (n === 0) {
      issues.push(issue(field, 'missing', 'error',
        `Shopify ${name} is empty.`, 0, target, RECOMMENDED_TARGET));
    } else if (n > target) {
      issues.push(issue(field, 'over_target_length', 'warning',
        `Shopify ${name} is ${n} characters, over the recommended ${target}-character target length by ${n - target}; search results may truncate it. This is a recommended length, not a Shopify field limit.`,
        n, target, RECOMMENDED_TARGET));
    }
  }

  function auditListing(listing) {
    const src = listing !== null && typeof listing === 'object' && !Array.isArray(listing) ? listing : {};
    const rawPlatform = asText(src.platform);
    const platform = rawPlatform.toLowerCase();
    const id = src.id === undefined || src.id === null ? null : src.id;

    const title = asText(src.title);
    const tags = normalizeTags(src.tags);
    const metaTitle = asText(src.meta_title);
    const metaDescription = asText(src.meta_description);

    const counts = {
      title_chars: countChars(title),
      tag_count: tags.length,
      longest_tag_chars: tags.reduce((max, tag) => Math.max(max, countChars(tag)), 0),
      meta_title_chars: countChars(metaTitle),
      meta_description_chars: countChars(metaDescription),
    };

    const issues = [];
    if (platform === 'etsy') {
      auditEtsy(title, tags, issues);
    } else if (platform === 'shopify') {
      auditTarget('meta_title', 'meta title', metaTitle, META_TITLE_TARGET, issues);
      auditTarget('meta_description', 'meta description', metaDescription, META_DESC_TARGET, issues);
    } else {
      issues.push(issue('platform', 'unknown_platform', 'error',
        'Platform must be "etsy" or "shopify"; no checks were run.',
        rawPlatform, null, null));
    }

    // Info notes (unused tag slots) do not fail a listing.
    const ok = issues.every((item) => item.severity === 'info');
    return { id, platform: platform || null, ok, issues, counts };
  }

  function auditMany(listings) {
    if (!Array.isArray(listings)) return [];
    return listings.map((listing) => auditListing(listing));
  }

  // Plain-text counts for the counter box. Characters use countChars, so an
  // emoji counts as one. Non-string input gives all zeros.
  function countText(text) {
    if (typeof text !== 'string' || text.length === 0) {
      return { characters: 0, characters_no_spaces: 0, words: 0, lines: 0 };
    }
    const words = text.match(/\S+/g);
    return {
      characters: countChars(text),
      characters_no_spaces: countChars(text.replace(/\s+/g, '')),
      words: words ? words.length : 0,
      lines: text.split(/\r\n|\r|\n/).length,
    };
  }

  const api = {
    auditListing,
    countText,
    auditMany,
    countChars,
    normalizeTags,
    findDuplicates,
    ETSY_TITLE_MAX,
    ETSY_TAG_COUNT,
    ETSY_TAG_MAX,
    META_TITLE_TARGET,
    META_DESC_TARGET,
  };

  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ListingChecker = api;
  }
}(typeof window !== 'undefined' ? window : null));
