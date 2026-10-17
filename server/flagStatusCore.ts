export interface RawHalfStaffPost {
  id: number;
  title: string;
  content: string;
  permalink: string;
  date_start: string;
  date_end: string;
  type: 'Federal' | 'Local' | string;
  state: string;
  thumbnail: string;
  excerpt: string;
}

export interface NormalizedNotice {
  id: string;
  title: string;
  summary: string;
  fullText: string;
  dateStart: string;
  dateEnd: string | null;
  isOngoing: boolean;
  scope: 'federal' | 'state';
  stateCode: string | null;
  stateName: string | null;
  sourceUrl: string;
  sourceLabel: string;
  secondaryUrl: string | null;
  secondaryLabel: string | null;
  thumbnail?: string;
}

export interface FlagStatusPayload {
  fetchedAt: string;
  referenceDate: string;
  latestDatasetDate: string;
  sources: {
    name: string;
    url: string;
    status: 'ok' | 'degraded';
    note?: string;
  }[];
  notices: NormalizedNotice[];
}

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  AS: 'American Samoa',
  GU: 'Guam',
  MP: 'Northern Mariana Islands',
  PR: 'Puerto Rico',
  VI: 'U.S. Virgin Islands',
};

const STATE_PORTAL_URLS: Record<string, { label: string; url: string }> = {
  MN: {
    label: 'MN Governor Flag Status',
    url: 'https://mn.gov/governor/newsroom/flag-status/',
  },
  WI: {
    label: 'WI Dept. of Military Affairs Flag Orders',
    url: 'https://dma.wi.gov/flag-lowering-orders/',
  },
  MD: {
    label: 'MD Secretary of State Flag Status',
    url: 'https://sos.maryland.gov/Pages/Services/Flag-Status.aspx',
  },
  IA: {
    label: 'IA Governor Newsroom & Flag Orders',
    url: 'https://governor.iowa.gov/newsroom',
  },
};

function decodeHtmlEntities(input: string): string {
  const namedEntities: Record<string, string> = {
    '&rsquo;': '’',
    '&lsquo;': '‘',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&ndash;': '–',
    '&mdash;': '—',
    '&bull;': '•',
    '&hellip;': '…',
    '&apos;': "'",
    '&quot;': '"',
    '&amp;': '&',
    '&nbsp;': ' ',
    '&sect;': '§',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&deg;': '°',
    '&lt;': '<',
    '&gt;': '>',
  };

  return input
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&[a-zA-Z]+;/g, (entity) => namedEntities[entity.toLowerCase()] ?? entity)
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function stripHtml(html: string): string {
  const withoutChrome = html
    .replace(/<div[^>]*wp-block-whitehouse-topper[\s\S]*?<\/nav>\s*<\/div>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<select[\s\S]*?<\/select>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<p>\s*The post\s+[\s\S]*?appeared first on[\s\S]*?<\/p>/gi, '');

  const decoded = decodeHtmlEntities(withoutChrome);

  const withoutTags = decoded
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|section|article|blockquote|layout)>/gi, '\n\n')
    .replace(/<\/?(?:a|strong|b|em|i|span|u|small|sup|sub)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  return withoutTags
    .replace(/\*/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    // Remove space before punctuation
    .replace(/\s+([,.;:!?])/g, '$1')
    // Add missing space after commas outside URLs
    .replace(/(?<!https?:\/\/\S*),([A-Za-z])/g, ', $1')
    // Add missing space after closing quote when followed immediately by a word or opening quote
    .replace(/([.!?]["”’'])([A-Za-z"“‘])/g, '$1 $2')
    // Add missing space after sentence punctuation before opening quote
    .replace(/([a-z0-9][.!?])(["“‘][A-Z])/g, '$1 $2')
    // Add missing space after period/exclamation/question mark before a capitalized word (outside URLs/initials)
    .replace(/(?<!https?:\/\/\S*)(?<!\b[A-Z])([.!?])([A-Z][a-z])/g, '$1 $2')
    // Add missing space before parenthetical years/ranges like Mondale(1977-1981)
    .replace(/([a-z]{2,})\((\d)/g, '$1 ($2)')
    // Add missing space after closing parenthesis before a letter
    .replace(/\)([A-Za-z])/g, ') $1')
    // Normalize cramped time strings like 6:00pm -> 6:00 p.m.
    .replace(/\b(\d{1,2}:\d{2})\s*pm\b/gi, '$1 p.m.')
    .replace(/\b(\d{1,2}:\d{2})\s*am\b/gi, '$1 a.m.')
    // Fix known upstream typos / merged words
    .replace(/\bourNation\b/g, 'our Nation')
    .replace(/\boflife\b/g, 'of life')
    .replace(/\bPlaceat\b/g, 'Place at')
    // Separate concatenated press release headers and datelines
    .replace(/(OFFICE OF THE GOVERNOR)([A-Z])/g, '$1\n$2')
    .replace(/([^\n])(FOR IMMEDIATE RELEASE:?)/gi, '$1\n$2')
    .replace(/(For Immediate Release)([A-Z])/g, '$1\n$2')
    .replace(
      /([a-z0-9.!?])\s*([A-Z]{3,}(?:[\s,]+(?:[A-Z.]+|Wyo\.|Ky\.|S\.D\.|N\.D\.|Pa\.|Va\.|Mass\.|Conn\.|Fla\.|Ill\.|Ind\.|Minn\.|Miss\.|Mo\.|Mont\.|Neb\.|Nev\.|Okla\.|Ore\.|Tenn\.|Tex\.|Vt\.|Wash\.|Wis\.))*\s*(?:\([^)]+\)\s*)?[—–-])/g,
      '$1\n\n$2'
    )
    .replace(/(\([A-Z][A-Za-z\s,.]+\))\s*[—–-]\s*([A-Z])/g, '$1 — $2')
    .replace(/\b([A-Z]{2,}(?:\s+[A-Z]{2,})*)—\s*/g, '$1 — ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripDatelinePrefix(text: string): string {
  return text
    .replace(/^20\d{2}-\d{2}-\d{2}\s+/, '')
    .replace(/^[([][A-Z][A-Za-z\s.,]+[)\]]\s*[—–-]+\s*/, '')
    .replace(
      /^(?:[A-Z]{3,}(?:\s+[A-Z]{2,})*(?:,\s*(?:[A-Z.]+|Wyo\.|Ky\.|S\.D\.|N\.D\.|Pa\.|Va\.|Mass\.|Conn\.|Fla\.|Ill\.|Ind\.|Minn\.|Miss\.|Mo\.|Mont\.|Neb\.|Nev\.|Okla\.|Ore\.|Tenn\.|Tex\.|Vt\.|Wash\.|Wis\.|Ohio|Iowa|Idaho|Maine|Utah|Texas|Alaska|Hawaii))?|Madison|Frankfort|Indianapolis|Topeka|Cheyenne|Pierre|Santa Fe|Richmond|Des Moines|Columbus|Hartford|Boston|Austin|Lansing|Raleigh|Nashville|Atlanta|Tallahassee|Harrisburg|Sacramento|Olympia|Salem|Juneau|Honolulu|Boise|Helena|Bismarck|Lincoln|Oklahoma City|Baton Rouge|Jackson|Montgomery|Little Rock|Jefferson City|Charleston|Annapolis|Dover|Trenton|Albany|Montpelier|Concord|Augusta|Providence|Carson City|Phoenix|Salt Lake City|Denver|Springfield)(?:\s*\([^)]+\))?\s*(?:[—–]+|\s-\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z.]*\s+\d{1,2},?\s+\d{4}\s*[—–-]+\s*)?)\s*/,
      ''
    )
    .trim();
}

function cleanProclamationFullText(rawHtmlOrText: string): string {
  let cleaned = stripHtml(rawHtmlOrText);

  // If the text contains the official presidential header preceded by White House RSS navigation chrome, strip the chrome
  const presHeaderIdx = cleaned.indexOf('BY THE PRESIDENT OF THE UNITED STATES OF AMERICA');
  if (presHeaderIdx > 0) {
    const prefix = cleaned.slice(0, presHeaderIdx);
    if (/Presidential Actions|Select Category|Nominations & Appointments/i.test(prefix)) {
      cleaned = cleaned.slice(presHeaderIdx);
    }
  }

  cleaned = cleaned
    // Strip bracketed or parenthesized raw URLs
    .replace(/\[\s*https?:\/\/[^\s\]]+\s*\]/gi, '')
    .replace(/\(\s*https?:\/\/[^\s)]+\s*\)/gi, '')
    // Strip press release end markers and everything following them
    .replace(/\n*(?:#\s*#\s*#|###)[\s\S]*$/i, '')
    .replace(/\n*Stay (?:Updated|Connected) with the Office of (?:the )?Governor[\s\S]*$/i, '')
    .replace(/\n*SUBSCRIBER SERVICES[\s\S]*$/i, '')
    .replace(/\n*Manage Subscriptions[\s\S]*$/i, '')
    .replace(/\n*This email was sent to[\s\S]*$/i, '')
    .replace(/\n*The post\s+[\s\S]*?appeared first on\s+The White House[\s\S]*$/i, '')
    // Strip Massachusetts / Governor office administrative email sign-off blocks
    .replace(/\n*Thank you,\s*\n+Alex Powell[\s\S]*$/i, '')
    // Strip trailing Connecticut State Capitol mailing address block
    .replace(/\n*State Capitol\s*\n+210 Capitol Avenue\s*\n+Hartford,\s*CT\s*06106[\s\S]*$/i, '')
    // Strip dead anchor-text sentences left behind when HTML links are stripped
    .replace(
      /(?:A copy of the |The )?Governor['’]s proclamation can be found here\s*\./gi,
      ''
    )
    .replace(/An online version of this release is available here\s*\./gi, '')
    .replace(
      /When posted the Presidential Proclamation can be found here,?\s*(?:see the Governor['’]s Status of the Flag here\.?)?/gi,
      ''
    )
    .replace(/Flag status information is available at\s+[^\n]+/gi, '')
    .replace(
      /To receive email alerts anytime the governor orders flags to half[-‑]staff,?\s*visit\s+[^\n]+/gi,
      ''
    )
    .replace(/\n*Read on CT\.gov[^\n]*/gi, '')
    // Strip bare inline URLs and trailing Source references embedded inside paragraphs
    .replace(/\bhttps?:\/\/\S+/gi, '')
    .replace(/\s*(?:See\s+source\s+for\s+full\s+text\.?\s*)?\bSource:\s*[^\n]*/gi, '')
    .replace(/\bSee\s+source\s+for\s+full\s+text\.?/gi, '')
    // Strip leading ISO date on SC notices
    .replace(/^20\d{2}-\d{2}-\d{2}\s+/gm, '')
    // Fix punctuation spacing left after stripping bracketed URLs
    .replace(/\s+([,.;:!?])/g, '$1')
    // Join lines broken immediately after a colon (e.g. Illinois notices "in honor of:\n\nGovernor...")
    .replace(/:\n+(?=[A-Z])/g, ': ')
    // Add clean paragraph breaks before formal proclamation clauses when run together
    .replace(/;\s*(?:and\s+)?(?=WHEREAS\b)/g, ';\n\n')
    .replace(/[.;]\s*(?=NOW,\s*THEREFORE\b)/g, '.\n\n');

  // Filter out line-level press-release metadata, newsletter headers, and Source lines
  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/Unsubscribe\s*\|\s*Constant Contact Data Notice/i.test(line)) return false;
      if (/^OFFICE OF THE GOVERNOR/i.test(line)) return false;
      if (/★/.test(line) && /Governor/i.test(line)) return false;
      if (/^FOR IMMEDIATE RELEASE:?$/i.test(line)) return false;
      if (/^FOR IMMEDIATE RELEASE:/i.test(line) && line.length < 80) return false;
      if (/^(?:MEDIA )?CONTACT:/i.test(line)) return false;
      if (/^Source:\s*/i.test(line)) return false;
      if (/^Official Document:\s*/i.test(line)) return false;
      if (/^https?:\/\/\S+$/i.test(line)) return false;
      if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(line)) return false;
      if (/^\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}$/.test(line)) return false;
      if (
        /^Proclamations\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}$/i.test(
          line
        )
      ) {
        return false;
      }
      if (
        /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z.]*\s+\d{1,2}(?:st|nd|rd|th)?,?(?:\s+\d{4})?\s+through\s+(?:\(to be determined\)|sunset[^\n]*)\.?$/i.test(
          line
        )
      ) {
        return false;
      }
      return true;
    });

  // Drop leading standalone date, contact name, or redundant press-release headline lines
  while (lines.length > 1) {
    const first = lines[0];
    const isStandaloneDate =
      /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z.]*\s+\d{1,2},?\s+\d{4}$/i.test(
        first
      );
    const isContactLine = /^Contact\b/i.test(first) && first.length < 60;
    const isRedundantHeadline =
      first.length < 130 &&
      !/[.!?”"']$/.test(first) &&
      !/^BY THE PRESIDENT/i.test(first) &&
      !/^A PROCLAMATION/i.test(first) &&
      !/^WHEREAS/i.test(first) &&
      /orders?\s+flags|flags\s+(?:at|to|lowered|flown|fly)|flag\s+lowering|flag\s+order|in\s+honor\s+of|to\s+mourn|directs\s+flags|fallen\s+governor/i.test(
        first
      );

    if (isStandaloneDate || isContactLine || isRedundantHeadline) {
      lines.shift();
    } else {
      break;
    }
  }

  if (lines.length > 0) {
    lines[0] = stripDatelinePrefix(lines[0]);
  }

  return lines.join('\n\n').trim();
}

export function cleanNoticeTitle(rawTitle: string): string {
  let title = decodeHtmlEntities(rawTitle || 'Half-Staff Notice')
    .replace(/\s+/g, ' ')
    .replace(/\s*[—–-]\s*See Source for Full Text$/i, '')
    .trim();

  title = title
    .replace(
      /^Presidential Order\s*[–—-]\s*Flags to Half[- ]Staff\s*(?:as a mark of respect for the memory of\s*|Honoring the Memory of\s*)?/i,
      'Honoring '
    )
    .replace(
      /^Executive Order #\d+\s*[–—-]\s*Flags to Half[- ]Staff\s*(?:in Honor of\s*)?/i,
      'Honoring '
    )
    .replace(
      /^(?:Fly the\s+)?(?:US|U\.S\.|United States)\s+Flags?\s+(?:Flown\s+|Fly\s+)?(?:to|at)\s+Half[- ]Staff(?:\s+for\s+Thirty\s+Days)?(?:\s+on\s+[A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})?\s*(?:[–—-]\s*)?/i,
      ''
    )
    .replace(
      /^Flags?\s+(?:Flown\s+|Fly\s+|Lowered\s+)?(?:to|at)\s+Half[- ]Staff(?:\s+at\s+State\s+Capitol)?(?:\s+on\s+[A-Za-z]+\s+\d{1,2},\s+\d{4},?)?\s*(?:[–—-]\s*)?/i,
      ''
    )
    .replace(/^Half[- ]Staff\s*(?:[–—-]\s*)?/i, '')
    .replace(/:\s*Flags?\s+(?:Lowered\s+to\s+|at\s+)?Half[- ]Staff.*$/i, '')
    .replace(/^Honoring\s+in\s+Honor\s+of\s+/i, 'Honoring ')
    .replace(/^Honoring\s+of\s+/i, 'Honoring ')
    .replace(/^(?:in\s+Honor\s+of|for)\s+/i, 'Honoring ')
    .replace(/^from\s+Until\s+Noon/i, 'Sunrise Until Noon')
    .replace(/^from\s+Sunrise\s+Until\s+Noon/i, 'Sunrise Until Noon')
    .trim();

  if (title) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  return title || 'Half-Staff Notice';
}

/**
 * Web-standard deterministic hash (no Node Buffer required)
 */
function hashId(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function extractOfficialSource(
  content: string,
  stateCode: string | null,
  scope: 'federal' | 'state'
): {
  url: string | null;
  label: string | null;
} {
  const sourceMatch =
    content.match(/Source:\s*<a[^>]+href=["']([^"']+)["']/i) ||
    content.match(/href=["'](https?:\/\/[^"']+(?:\.gov|govdelivery\.com)[^"']*)["']/i) ||
    content.match(/(https?:\/\/[^\s<"'\]]+(?:\.gov|govdelivery\.com)[^\s<"'\]]*)/i) ||
    content.match(/Source:\s*(https?:\/\/[^\s<"'\])]+)/i);

  if (sourceMatch && sourceMatch[1]) {
    const rawUrl = sourceMatch[1].replace(/[.,;\]]+$/, '');
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.replace(/^www\./, '');
      if (host.includes('whitehouse.gov')) {
        return { url: rawUrl, label: 'White House Proclamation' };
      }
      if (host.includes('mn.gov') || rawUrl.includes('MNGOV')) {
        return { url: rawUrl, label: 'MN Governor Proclamation' };
      }
      if (host.includes('govdelivery.com')) {
        return { url: rawUrl, label: `${stateCode || 'Official'} Governor Proclamation` };
      }
      return { url: rawUrl, label: `Official Source (${host})` };
    } catch {
      // ignore invalid URL
    }
  }

  if (stateCode && STATE_PORTAL_URLS[stateCode]) {
    return STATE_PORTAL_URLS[stateCode];
  }

  if (scope === 'federal') {
    return {
      url: 'https://www.whitehouse.gov/presidential-actions/proclamations/',
      label: 'White House Proclamations',
    };
  }

  return { url: null, label: null };
}

function isMetadataLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 35) return true;
  if (/^https?:\/\/\S+$/i.test(t)) return true;
  if (/^FOR IMMEDIATE RELEASE/i.test(t)) return true;
  if (/^(?:MEDIA )?CONTACT:/i.test(t)) return true;
  if (/^Office of (?:the )?Governor/i.test(t)) return true;
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t)) return true;
  if (/^\d{3}[-.]\d{3}[-.]\d{4}$/.test(t)) return true;
  // Filter out headline/header lines that do not end with sentence punctuation
  if (t.length < 140 && !/[.!?”"']$/.test(t)) return true;
  return false;
}

function buildConciseSummary(
  title: string,
  rawContent: string,
  rawExcerpt: string,
  stateCode: string | null,
  scope: 'federal' | 'state'
): string {
  const cleanContent = cleanProclamationFullText(rawContent);

  const paragraphs = cleanContent
    .split(/\n+/)
    .map((p) => stripDatelinePrefix(p))
    .filter((p) => !isMetadataLine(p));

  const candidate = stripDatelinePrefix(
    (
      paragraphs.find((p) => /half[-‑]staff|lowered|honor|proclaim/i.test(p)) ||
      paragraphs[0] ||
      cleanProclamationFullText(rawExcerpt)
    ).trim()
  );

  if (candidate && candidate.length <= 460) {
    return candidate;
  }

  // Protect common titles, initials, and abbreviations before splitting long paragraphs into sentences
  const protectedCandidate = candidate
    .replace(
      /\b(Gov|Rep|Sen|Rev|Dr|Mr|Mrs|Ms|Jr|Sr|St|Ft|Mt|Lt|Gen|Col|Maj|Capt|Sgt|Cpl|Pfc|Spc|Hon|Dept|No|Jan|Feb|Mar|Apr|Aug|Sept|Oct|Nov|Dec|Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)\.\s+/gi,
      '$1.__DOT__'
    )
    .replace(/\b([A-Z])\.\s+/g, '$1.__DOT__')
    .replace(/\b(U\.S|a\.m|p\.m)\.\s+/gi, '$1.__DOT__');

  const rawSentences = protectedCandidate.split(/(?<=[.!?])\s+(?=[A-Z"“])/);
  const sentences = rawSentences.map((s) => s.replace(/\.__DOT__/g, '. ').trim()).filter(Boolean);

  const firstOne = sentences[0] || '';
  const firstTwo = sentences.slice(0, 2).join(' ').trim();

  if (firstTwo && firstTwo.length <= 460) {
    return firstTwo;
  }
  if (firstOne) {
    return firstOne;
  }

  const targetName =
    scope === 'federal'
      ? 'nationwide'
      : `in ${(stateCode && STATE_NAMES[stateCode]) || stateCode || 'this state'}`;
  return `Flags are ordered to half-staff ${targetName}: ${title}.`;
}

function normalizeHalfStaffPost(post: RawHalfStaffPost): NormalizedNotice {
  const cleanTitle = cleanNoticeTitle(post.title || 'Half-Staff Notice');
  const stateCode =
    post.state && STATE_NAMES[post.state.toUpperCase()] ? post.state.toUpperCase() : null;
  const scope: 'federal' | 'state' =
    post.type === 'Federal' && !stateCode ? 'federal' : 'state';

  const rawEnd = (post.date_end || '').trim();
  const isOngoing = !rawEnd || rawEnd.toLowerCase() === 'undetermined';
  const dateEnd = isOngoing ? null : rawEnd;

  const official = extractOfficialSource(post.content || '', stateCode, scope);
  const halfStaffPermalink = post.permalink || 'https://halfstaff.org/';

  const sourceUrl = official.url || halfStaffPermalink;
  const sourceLabel = official.label || 'HalfStaff.org Notice';
  const secondaryUrl = official.url
    ? halfStaffPermalink
    : (stateCode && STATE_PORTAL_URLS[stateCode]?.url) || null;
  const secondaryLabel = official.url
    ? 'HalfStaff.org'
    : (stateCode && STATE_PORTAL_URLS[stateCode]?.label) || null;

  const summary = buildConciseSummary(
    cleanTitle,
    post.content || '',
    post.excerpt || '',
    stateCode,
    scope
  );
  const cleanedFullText = cleanProclamationFullText(post.content || post.excerpt || '');
  const fullText = cleanedFullText || summary;

  return {
    id: `hs-${post.id}`,
    title: cleanTitle,
    summary,
    fullText,
    dateStart: post.date_start,
    dateEnd,
    isOngoing,
    scope,
    stateCode,
    stateName: stateCode ? STATE_NAMES[stateCode] || stateCode : null,
    sourceUrl,
    sourceLabel,
    secondaryUrl,
    secondaryLabel,
    thumbnail: post.thumbnail || undefined,
  };
}

async function fetchHalfStaffOrgNotices(): Promise<{
  notices: NormalizedNotice[];
  ok: boolean;
  note?: string;
}> {
  try {
    const res = await fetch('https://halfstaff.org/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HalfStaffApp/1.0; +https://halfstaff.org)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { notices: [], ok: false, note: `HTTP ${res.status}` };
    }
    const html = await res.text();
    const match = html.match(/var\s+posts\s*=\s*(\[\{"id"[\s\S]*?\}\]);/);
    if (!match || !match[1]) {
      return { notices: [], ok: false, note: 'Embedded posts payload not found' };
    }
    const rawPosts: RawHalfStaffPost[] = JSON.parse(match[1]);
    const notices = rawPosts.filter((p) => p && p.date_start).map(normalizeHalfStaffPost);
    return { notices, ok: true };
  } catch (err) {
    return {
      notices: [],
      ok: false,
      note: err instanceof Error ? err.message : 'Fetch failed',
    };
  }
}

async function fetchWhiteHouseProclamations(): Promise<{
  notices: NormalizedNotice[];
  ok: boolean;
  note?: string;
}> {
  try {
    const res = await fetch(
      'https://www.whitehouse.gov/presidential-actions/proclamations/feed/',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HalfStaffApp/1.0)',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) {
      return { notices: [], ok: false, note: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    const notices: NormalizedNotice[] = [];

    for (const item of items) {
      if (!/half-staff/i.test(item)) continue;
      const title = cleanNoticeTitle(((item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim());
      const link = ((item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim();
      const pubDateRaw = ((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '').trim();
      const contentEncoded =
        (item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) ||
          [])[1] || '';
      const description =
        (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || [])[1] || '';

      const pubDate = pubDateRaw ? new Date(pubDateRaw) : new Date();
      const pubIso = !isNaN(pubDate.getTime())
        ? pubDate.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      let dateStart = pubIso;
      let dateEnd = pubIso;
      if (/Patriot Day/i.test(title)) {
        const year = pubIso.slice(0, 4);
        dateStart = `${year}-09-11`;
        dateEnd = `${year}-09-11`;
      } else if (/Pearl Harbor/i.test(title)) {
        const year = pubIso.slice(0, 4);
        dateStart = `${year}-12-07`;
        dateEnd = `${year}-12-07`;
      } else if (/Peace Officers/i.test(title)) {
        const year = pubIso.slice(0, 4);
        dateStart = `${year}-05-15`;
        dateEnd = `${year}-05-15`;
      }

      const plainBody = cleanProclamationFullText(contentEncoded || description);
      const halfStaffPara =
        plainBody.split(/\n+/).find((p) => /half-staff/i.test(p)) || plainBody;

      notices.push({
        id: `wh-${hashId(link || title)}`,
        title,
        summary: halfStaffPara,
        fullText: plainBody || halfStaffPara,
        dateStart,
        dateEnd,
        isOngoing: false,
        scope: 'federal',
        stateCode: null,
        stateName: null,
        sourceUrl: link || 'https://www.whitehouse.gov/presidential-actions/proclamations/',
        sourceLabel: 'White House Proclamation',
        secondaryUrl: 'https://halfstaff.org/',
        secondaryLabel: 'HalfStaff.org',
      });
    }

    return { notices, ok: true };
  } catch (err) {
    return {
      notices: [],
      ok: false,
      note: err instanceof Error ? err.message : 'Fetch failed',
    };
  }
}

async function fetchWisconsinDirectNotices(): Promise<{
  notices: NormalizedNotice[];
  ok: boolean;
}> {
  try {
    const res = await fetch(
      'https://dma.wi.gov/wp-json/wp/v2/posts?search=half-staff&per_page=10',
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HalfStaffApp/1.0)' },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return { notices: [], ok: false };
    const posts: Array<{
      id: number;
      date: string;
      link: string;
      title?: { rendered?: string };
      excerpt?: { rendered?: string };
      content?: { rendered?: string };
    }> = await res.json();

    const notices: NormalizedNotice[] = [];
    for (const p of posts) {
      const rawTitle = decodeHtmlEntities(p.title?.rendered || '').trim();
      if (!/half-staff/i.test(rawTitle)) continue;

      const cleanTitle = cleanNoticeTitle(rawTitle);
      const excerpt = cleanProclamationFullText(p.excerpt?.rendered || '').replace(/\.+$/, '');
      const bodyContent = cleanProclamationFullText(p.content?.rendered || '');
      const summary = excerpt
        ? `${rawTitle.replace(/\.+$/, '')}. ${excerpt}.`
        : `${rawTitle.replace(/\.+$/, '')}.`;
      const fullText = bodyContent ? `${rawTitle}\n\n${bodyContent}` : summary;

      let dateStart = (p.date || '').slice(0, 10);
      const dateMatch = excerpt.match(
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z.]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i
      );
      if (dateMatch) {
        const parsed = new Date(
          `${dateMatch[1].replace(/Sept/i, 'Sep')} ${dateMatch[2]}, ${dateMatch[3]} 12:00:00 UTC`
        );
        if (!isNaN(parsed.getTime())) {
          dateStart = parsed.toISOString().slice(0, 10);
        }
      }

      notices.push({
        id: `wi-${p.id}`,
        title: cleanTitle || rawTitle,
        summary,
        fullText,
        dateStart,
        dateEnd: dateStart,
        isOngoing: false,
        scope: 'state',
        stateCode: 'WI',
        stateName: 'Wisconsin',
        sourceUrl: p.link || 'https://dma.wi.gov/flag-lowering-orders/',
        sourceLabel: 'WI Executive Order',
        secondaryUrl: 'https://dma.wi.gov/flag-lowering-orders/',
        secondaryLabel: 'WI DMA Portal',
      });
    }
    return { notices, ok: true };
  } catch {
    return { notices: [], ok: false };
  }
}

async function fetchMarylandDirectNotices(): Promise<{
  notices: NormalizedNotice[];
  ok: boolean;
}> {
  try {
    const res = await fetch('https://sos.maryland.gov/Pages/Services/PastFlagStatus.aspx', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HalfStaffApp/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { notices: [], ok: false };
    const html = await res.text();
    const rows = [
      ...html.matchAll(
        /<tr[^>]*>\s*<td class="ms-vb2"><nobr>([^<]+)<\/nobr><\/td><td class="ms-vb2">([\s\S]*?)<\/td><\/tr>/gi
      ),
    ].slice(0, 8);

    const notices: NormalizedNotice[] = [];
    for (const r of rows) {
      const rawDate = r[1].trim();
      const bodyText = cleanProclamationFullText(r[2])
        .replace(/^Flag Status Alert:\s*/i, '')
        .replace(
          /^United States Flag and Maryland Flag (?:will be|are) at Half-Staff\s*\n*/i,
          ''
        )
        .replace(/^Maryland Flag (?:will be|is) at Half-Staff\s*\n*/i, '')
        .trim();
      const parsedDate = new Date(`${rawDate} 12:00:00 UTC`);
      if (isNaN(parsedDate.getTime())) continue;
      const dateIso = parsedDate.toISOString().slice(0, 10);

      const honorMatch = bodyText.match(
        /(?:in\s+honor\s+and\s+remembrance\s+of|in\s+honor\s+of|for)\s+((?:former\s+)?[A-Z][^.,;]+?)(?:,\s+who|\s+who\s+passed|\s+who\s+died|\.\s+This|\.\s+As|\.$)/i
      );
      const title = honorMatch
        ? `Honoring ${honorMatch[1].replace(/^former\s+/i, 'Former ').trim()}`
        : 'Maryland Flag Half-Staff Order';

      const summary = bodyText.replace(/\n+/g, ' ').trim();

      notices.push({
        id: `md-${dateIso}`,
        title,
        summary,
        fullText: bodyText || summary,
        dateStart: dateIso,
        dateEnd: dateIso,
        isOngoing: false,
        scope: 'state',
        stateCode: 'MD',
        stateName: 'Maryland',
        sourceUrl: 'https://sos.maryland.gov/Pages/Services/PastFlagStatus.aspx',
        sourceLabel: 'MD Secretary of State',
        secondaryUrl: 'https://sos.maryland.gov/Pages/Services/Flag-Status.aspx',
        secondaryLabel: 'MD Flag Status',
      });
    }
    return { notices, ok: true };
  } catch {
    return { notices: [], ok: false };
  }
}

async function fetchIowaDirectNotices(): Promise<{
  notices: NormalizedNotice[];
  ok: boolean;
}> {
  try {
    const res = await fetch('https://governor.iowa.gov/newsroom', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HalfStaffApp/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { notices: [], ok: false };
    const html = await res.text();
    const items = [
      ...html.matchAll(
        /<a href="(\/press-release\/[^"]+)"[^>]*><span[^>]*>([^<]+)<\/span>\s*<\/a>[\s\S]*?<p class="content-teaser-content--body">\s*([\s\S]*?)\s*<\/p>/gi
      ),
    ];

    const notices: NormalizedNotice[] = [];
    for (const item of items) {
      const relUrl = item[1];
      const rawTitle = decodeHtmlEntities(item[2]).trim();
      const rawBody = cleanProclamationFullText(item[3]).trim();
      if (!/half-staff/i.test(rawTitle + ' ' + rawBody)) continue;

      const urlDateMatch = relUrl.match(/\/press-release\/(\d{4}-\d{2}-\d{2})\//);
      let dateStart = urlDateMatch ? urlDateMatch[1] : new Date().toISOString().slice(0, 10);
      let dateEnd = dateStart;

      const rangeMatch = rawBody.match(
        /from\s+sunrise\s+on\s+(\d{1,2}\/\d{1,2}\/\d{4}),?\s+until\s+sunset\s+on\s+(\d{1,2}\/\d{1,2}\/\d{4})/i
      );
      if (rangeMatch) {
        const d1 = new Date(`${rangeMatch[1]} 12:00:00 UTC`);
        const d2 = new Date(`${rangeMatch[2]} 12:00:00 UTC`);
        if (!isNaN(d1.getTime())) dateStart = d1.toISOString().slice(0, 10);
        if (!isNaN(d2.getTime())) dateEnd = d2.toISOString().slice(0, 10);
      }

      const honorMatch =
        rawTitle.match(/remembrance of\s+(.+)$/i) || rawTitle.match(/honor of\s+(.+)$/i);
      const cleanTitle = honorMatch ? `Honoring ${honorMatch[1]}` : cleanNoticeTitle(rawTitle);

      notices.push({
        id: `ia-${dateStart}`,
        title: cleanTitle,
        summary: rawBody,
        fullText: rawBody || rawTitle,
        dateStart,
        dateEnd,
        isOngoing: false,
        scope: 'state',
        stateCode: 'IA',
        stateName: 'Iowa',
        sourceUrl: `https://governor.iowa.gov${relUrl}`,
        sourceLabel: 'IA Governor Press Release',
        secondaryUrl: 'https://governor.iowa.gov/newsroom',
        secondaryLabel: 'IA Governor Newsroom',
      });
    }
    return { notices, ok: true };
  } catch {
    return { notices: [], ok: false };
  }
}

let cachedPayload: { data: FlagStatusPayload; expiresAt: number } | null = null;

export async function getFlagStatusPayload(forceRefresh = false): Promise<FlagStatusPayload> {
  const now = Date.now();
  if (!forceRefresh && cachedPayload && cachedPayload.expiresAt > now) {
    return cachedPayload.data;
  }

  const [hsResult, whResult, wiResult, mdResult, iaResult] = await Promise.all([
    fetchHalfStaffOrgNotices(),
    fetchWhiteHouseProclamations(),
    fetchWisconsinDirectNotices(),
    fetchMarylandDirectNotices(),
    fetchIowaDirectNotices(),
  ]);

  const merged: NormalizedNotice[] = [...hsResult.notices];

  for (const wh of whResult.notices) {
    const exists = merged.some(
      (n) =>
        n.scope === 'federal' &&
        (n.sourceUrl === wh.sourceUrl ||
          n.title.toLowerCase() === wh.title.toLowerCase() ||
          (n.dateStart === wh.dateStart &&
            n.title.toLowerCase().includes(wh.title.toLowerCase().slice(0, 15))))
    );
    if (!exists) {
      merged.push(wh);
    }
  }

  for (const directNotice of [...wiResult.notices, ...mdResult.notices, ...iaResult.notices]) {
    const exists = merged.some(
      (n) =>
        n.stateCode === directNotice.stateCode &&
        Math.abs(
          new Date(n.dateStart + 'T00:00:00Z').getTime() -
            new Date(directNotice.dateStart + 'T00:00:00Z').getTime()
        ) <=
          2 * 86400_000
    );
    if (!exists) {
      merged.push(directNotice);
    }
  }

  merged.sort((a, b) => {
    const startCmp = (b.dateStart || '').localeCompare(a.dateStart || '');
    if (startCmp !== 0) return startCmp;
    return (b.dateEnd || '').localeCompare(a.dateEnd || '');
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const latestDatasetDate =
    merged.reduce((max, n) => (n.dateStart > max ? n.dateStart : max), '') || todayIso;

  const payload: FlagStatusPayload = {
    fetchedAt: new Date().toISOString(),
    referenceDate: todayIso,
    latestDatasetDate,
    sources: [
      {
        name: 'White House Presidential Proclamations',
        url: 'https://www.whitehouse.gov/presidential-actions/proclamations/',
        status: whResult.ok ? 'ok' : 'degraded',
        note: whResult.note,
      },
      {
        name: 'HalfStaff.org (50-State Aggregator)',
        url: 'https://halfstaff.org/',
        status: hsResult.ok ? 'ok' : 'degraded',
        note: hsResult.note,
      },
      {
        name: 'MN Governor Flag Status & GovDelivery',
        url: 'https://mn.gov/governor/newsroom/flag-status/',
        status: hsResult.ok ? 'ok' : 'degraded',
      },
      {
        name: 'Direct State Portals (WI, MD, IA)',
        url: 'https://dma.wi.gov/flag-lowering-orders/',
        status: wiResult.ok || mdResult.ok || iaResult.ok ? 'ok' : 'degraded',
      },
    ],
    notices: merged,
  };

  cachedPayload = {
    data: payload,
    expiresAt: now + 60_000,
  };

  return payload;
}
