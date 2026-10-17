import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

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
  return input
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#038;/g, '&')
    .replace(/&#58;/g, ':')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim()
  );
}

function extractOfficialSource(content: string, stateCode: string | null, scope: 'federal' | 'state'): {
  url: string | null;
  label: string | null;
} {
  const sourceMatch =
    content.match(/Source:\s*<a[^>]+href=["']([^"']+)["']/i) ||
    content.match(/href=["'](https?:\/\/[^"']+(?:\.gov|govdelivery\.com)[^"']*)["']/i) ||
    content.match(/(https?:\/\/[^\s<"'\]]+(?:\.gov|govdelivery\.com)[^\s<"'\]]*)/i) ||
    content.match(/Source:\s*(https?:\/\/[^\s<"'\]\)]+)/i);

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

function buildConciseSummary(title: string, rawContent: string, rawExcerpt: string, stateCode: string | null, scope: 'federal' | 'state'): string {
  const cleanContent = stripHtml(rawContent)
    .replace(/Source:\s*https?:\/\/\S+/gi, '')
    .replace(/\*\s*/g, '')
    .trim();

  const paragraphs = cleanContent
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 25 && !/^FOR IMMEDIATE RELEASE/i.test(p) && !/^Contact:/i.test(p) && !/^Office of Governor/i.test(p));

  const candidate = paragraphs[0] || stripHtml(rawExcerpt);
  const sentences = candidate.match(/[^.!?]+[.!?]+/g) || [candidate];
  const concise = sentences.slice(0, 2).join(' ').trim();

  if (concise.length > 240) {
    return concise.slice(0, 237).trim() + '...';
  }
  if (concise) {
    return concise;
  }

  const targetName = scope === 'federal' ? 'nationwide' : `in ${(stateCode && STATE_NAMES[stateCode]) || stateCode || 'this state'}`;
  return `Flags are ordered to half-staff ${targetName}: ${decodeHtmlEntities(title)}.`;
}

function normalizeHalfStaffPost(post: RawHalfStaffPost): NormalizedNotice {
  const cleanTitle = decodeHtmlEntities(post.title || 'Half-Staff Notice').trim();
  const stateCode = post.state && STATE_NAMES[post.state.toUpperCase()] ? post.state.toUpperCase() : null;
  const scope: 'federal' | 'state' = post.type === 'Federal' && !stateCode ? 'federal' : 'state';

  const rawEnd = (post.date_end || '').trim();
  const isOngoing = !rawEnd || rawEnd.toLowerCase() === 'undetermined';
  const dateEnd = isOngoing ? null : rawEnd;

  const official = extractOfficialSource(post.content || '', stateCode, scope);
  const halfStaffPermalink = post.permalink || 'https://halfstaff.org/';

  const sourceUrl = official.url || halfStaffPermalink;
  const sourceLabel = official.label || 'HalfStaff.org Notice';
  const secondaryUrl = official.url ? halfStaffPermalink : (stateCode && STATE_PORTAL_URLS[stateCode]?.url) || null;
  const secondaryLabel = official.url ? 'HalfStaff.org' : (stateCode && STATE_PORTAL_URLS[stateCode]?.label) || null;

  const summary = buildConciseSummary(cleanTitle, post.content || '', post.excerpt || '', stateCode, scope);
  const fullText = stripHtml(post.content || post.excerpt || '');

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

async function fetchHalfStaffOrgNotices(): Promise<{ notices: NormalizedNotice[]; ok: boolean; note?: string }> {
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
    const notices = rawPosts
      .filter((p) => p && p.date_start)
      .map(normalizeHalfStaffPost);
    return { notices, ok: true };
  } catch (err) {
    return {
      notices: [],
      ok: false,
      note: err instanceof Error ? err.message : 'Fetch failed',
    };
  }
}

async function fetchWhiteHouseProclamations(): Promise<{ notices: NormalizedNotice[]; ok: boolean; note?: string }> {
  try {
    const res = await fetch('https://www.whitehouse.gov/presidential-actions/proclamations/feed/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HalfStaffApp/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { notices: [], ok: false, note: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    const notices: NormalizedNotice[] = [];

    for (const item of items) {
      if (!/half-staff/i.test(item)) continue;
      const title = decodeHtmlEntities(((item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim());
      const link = ((item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim();
      const pubDateRaw = ((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '').trim();
      const contentEncoded = ((item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) || [])[1] || '');
      const description = ((item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || [])[1] || '');

      const pubDate = pubDateRaw ? new Date(pubDateRaw) : new Date();
      const pubIso = !isNaN(pubDate.getTime()) ? pubDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

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

      const plainBody = stripHtml(contentEncoded || description);
      const halfStaffPara =
        plainBody
          .split(/\n+/)
          .find((p) => /half-staff/i.test(p)) || plainBody.slice(0, 240);

      notices.push({
        id: `wh-${Buffer.from(link || title).toString('base64').slice(0, 12)}`,
        title,
        summary: halfStaffPara.length > 240 ? halfStaffPara.slice(0, 237) + '...' : halfStaffPara,
        fullText: plainBody,
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

async function fetchWisconsinDirectNotices(): Promise<{ notices: NormalizedNotice[]; ok: boolean }> {
  try {
    const res = await fetch('https://dma.wi.gov/wp-json/wp/v2/posts?search=half-staff&per_page=10', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HalfStaffApp/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
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

      const cleanTitle = rawTitle
        .replace(/^Executive Order #\d+\s*[–-]\s*Flags to Half-Staff\s*/i, 'Honoring ')
        .replace(/^Honoring in Honor of /i, 'Honoring ')
        .replace(/^Honoring of /i, 'Honoring ');
      const excerpt = stripHtml(p.excerpt?.rendered || '');
      const fullText = stripHtml(p.content?.rendered || p.excerpt?.rendered || '');

      let dateStart = (p.date || '').slice(0, 10);
      const dateMatch = excerpt.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z.]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
      if (dateMatch) {
        const parsed = new Date(`${dateMatch[1].replace(/Sept/i, 'Sep')} ${dateMatch[2]}, ${dateMatch[3]} 12:00:00 UTC`);
        if (!isNaN(parsed.getTime())) {
          dateStart = parsed.toISOString().slice(0, 10);
        }
      }

      notices.push({
        id: `wi-${p.id}`,
        title: cleanTitle || rawTitle,
        summary: excerpt ? `${rawTitle}. ${excerpt}.` : rawTitle,
        fullText: fullText || excerpt,
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

async function fetchMarylandDirectNotices(): Promise<{ notices: NormalizedNotice[]; ok: boolean }> {
  try {
    const res = await fetch('https://sos.maryland.gov/Pages/Services/PastFlagStatus.aspx', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HalfStaffApp/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { notices: [], ok: false };
    const html = await res.text();
    const rows = [
      ...html.matchAll(/<tr[^>]*>\s*<td class="ms-vb2"><nobr>([^<]+)<\/nobr><\/td><td class="ms-vb2">([\s\S]*?)<\/td><\/tr>/gi),
    ].slice(0, 8);

    const notices: NormalizedNotice[] = [];
    for (const r of rows) {
      const rawDate = r[1].trim();
      const bodyText = stripHtml(r[2]).replace(/^Flag Status Alert:\s*/i, '').trim();
      const parsedDate = new Date(`${rawDate} 12:00:00 UTC`);
      if (isNaN(parsedDate.getTime())) continue;
      const dateIso = parsedDate.toISOString().slice(0, 10);

      // Extract a clean title from the body text (allow initials like "Carolyn J.B. Howard")
      const honorMatch = bodyText.match(/for\s+(.+?)(?:,\s+who|\s+who\s+passed|\s+who\s+died|\.\s+This|\.\s+As|\.$)/i);
      const title = honorMatch
        ? `Honoring ${honorMatch[1].replace(/^former\s+/i, 'Former ').trim()}`
        : 'Maryland Flag Half-Staff Order';

      const summary = bodyText
        .replace(/^United States Flag and Maryland Flag (?:will be|are) at Half-Staff\s*/i, '')
        .replace(/^Maryland Flag (?:will be|is) at Half-Staff\s*/i, '')
        .trim();

      notices.push({
        id: `md-${dateIso}`,
        title,
        summary: summary.length > 240 ? summary.slice(0, 237) + '...' : summary,
        fullText: bodyText,
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

async function fetchIowaDirectNotices(): Promise<{ notices: NormalizedNotice[]; ok: boolean }> {
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
      const rawBody = stripHtml(item[3]).trim();
      if (!/half-staff/i.test(rawTitle + ' ' + rawBody)) continue;

      const urlDateMatch = relUrl.match(/\/press-release\/(\d{4}-\d{2}-\d{2})\//);
      let dateStart = urlDateMatch ? urlDateMatch[1] : new Date().toISOString().slice(0, 10);
      let dateEnd = dateStart;

      const rangeMatch = rawBody.match(/from\s+sunrise\s+on\s+(\d{1,2}\/\d{1,2}\/\d{4}),?\s+until\s+sunset\s+on\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (rangeMatch) {
        const d1 = new Date(`${rangeMatch[1]} 12:00:00 UTC`);
        const d2 = new Date(`${rangeMatch[2]} 12:00:00 UTC`);
        if (!isNaN(d1.getTime())) dateStart = d1.toISOString().slice(0, 10);
        if (!isNaN(d2.getTime())) dateEnd = d2.toISOString().slice(0, 10);
      }

      const honorMatch = rawTitle.match(/remembrance of\s+(.+)$/i) || rawTitle.match(/honor of\s+(.+)$/i);
      const cleanTitle = honorMatch ? `Honoring ${honorMatch[1]}` : rawTitle;

      notices.push({
        id: `ia-${dateStart}`,
        title: cleanTitle,
        summary: rawBody,
        fullText: `${rawTitle}\n\n${rawBody}`,
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
          (n.dateStart === wh.dateStart && n.title.toLowerCase().includes(wh.title.toLowerCase().slice(0, 15))))
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
        name: 'White House Presidential Proclamations (Live RSS)',
        url: 'https://www.whitehouse.gov/presidential-actions/proclamations/',
        status: whResult.ok ? 'ok' : 'degraded',
        note: whResult.note,
      },
      {
        name: 'HalfStaff.org (National & 50-State Aggregator)',
        url: 'https://halfstaff.org/',
        status: hsResult.ok ? 'ok' : 'degraded',
        note: hsResult.note,
      },
      {
        name: 'Minnesota Governor Tim Walz — Flag Status & GovDelivery',
        url: 'https://mn.gov/governor/newsroom/flag-status/',
        status: hsResult.ok ? 'ok' : 'degraded',
      },
      {
        name: 'Direct State Portals (WI DMA, MD SOS, IA Governor)',
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

export function flagApiPlugin(): Plugin {
  const attachMiddleware = (middlewares: {
    use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void;
  }) => {
    middlewares.use(async (req, res, next) => {
      if (!req.url || !req.url.startsWith('/api/flag-status')) {
        next();
        return;
      }
      try {
        const url = new URL(req.url, 'http://localhost');
        const forceRefresh = url.searchParams.get('refresh') === '1';
        const payload = await getFlagStatusPayload(forceRefresh);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(payload));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Internal Server Error',
          })
        );
      }
    });
  };

  return {
    name: 'flag-api-middleware',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}
