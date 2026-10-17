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

export const US_STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'GU', name: 'Guam' },
  { code: 'VI', name: 'U.S. Virgin Islands' },
];

export const VALID_STATE_CODES = new Set(US_STATES.map((s) => s.code));

export const STATE_OFFICIAL_LINKS: Record<string, { label: string; url: string }> = {
  MN: {
    label: 'MN Governor Flag Status',
    url: 'https://mn.gov/governor/newsroom/flag-status/',
  },
  WI: {
    label: 'WI DMA Flag Orders',
    url: 'https://dma.wi.gov/flag-lowering-orders/',
  },
  MD: {
    label: 'MD Secretary of State Flag Status',
    url: 'https://sos.maryland.gov/Pages/Services/Flag-Status.aspx',
  },
  IA: {
    label: 'IA Governor Newsroom',
    url: 'https://governor.iowa.gov/newsroom',
  },
};

/**
 * Ensures any external URL rendered into an href or calendar file uses http: or https:.
 */
export function toSafeHttpUrl(
  rawUrl: string | null | undefined,
  fallback = 'https://halfstaff.org/'
): string {
  if (!rawUrl || typeof rawUrl !== 'string') return fallback;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return fallback;
    }
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return fallback;
  }
}

export function isNoticeActiveOnDate(notice: NormalizedNotice, targetDateIso: string): boolean {
  if (!notice.dateStart) return false;
  if (notice.dateEnd) {
    return targetDateIso >= notice.dateStart && targetDateIso <= notice.dateEnd;
  }
  const target = new Date(targetDateIso + 'T00:00:00Z');
  const start = new Date(notice.dateStart + 'T00:00:00Z');
  if (isNaN(target.getTime()) || isNaN(start.getTime())) return false;
  const diffDays = (target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 30;
}

export function formatDateRange(dateStart: string, dateEnd: string | null, isOngoing: boolean): string {
  if (!dateStart) return '';
  const start = new Date(dateStart + 'T12:00:00');
  const startFmt = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: !dateEnd || dateStart.slice(0, 4) !== dateEnd.slice(0, 4) ? 'numeric' : undefined,
  });

  if (isOngoing || !dateEnd) {
    return `${startFmt} – Ongoing`;
  }

  if (dateStart === dateEnd) {
    return start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  const end = new Date(dateEnd + 'T12:00:00');
  const endFmt = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startFmt} – ${endFmt}`;
}

export function getGoogleCalendarUrl(notice: NormalizedNotice): string {
  const startClean = notice.dateStart.replace(/[^0-9]/g, '').slice(0, 8);
  // For all-day Google Calendar events, end date is exclusive (day after dateEnd)
  const endBase = notice.dateEnd
    ? new Date(notice.dateEnd + 'T12:00:00Z')
    : new Date(notice.dateStart + 'T12:00:00Z');
  endBase.setUTCDate(endBase.getUTCDate() + 1);
  const endClean = endBase.toISOString().slice(0, 10).replace(/-/g, '');

  const scopePrefix =
    notice.scope === 'federal'
      ? 'U.S. Flag Half-Staff'
      : `${notice.stateName || notice.stateCode || 'State'} Flag Half-Staff`;

  const safeSourceUrl = toSafeHttpUrl(notice.sourceUrl);
  const title = `${scopePrefix}: ${notice.title}`;
  const details = `${notice.summary}\n\nOfficial Source: ${safeSourceUrl}`;
  const location = notice.scope === 'federal' ? 'United States' : notice.stateName || notice.stateCode || '';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startClean}/${endClean}`,
    details,
    location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadNoticeIcs(notice: NormalizedNotice): void {
  const startClean = notice.dateStart.replace(/[^0-9]/g, '').slice(0, 8);
  // For all-day ICS events, DTEND is exclusive (day after dateEnd)
  const endBase = notice.dateEnd ? new Date(notice.dateEnd + 'T12:00:00Z') : new Date(notice.dateStart + 'T12:00:00Z');
  endBase.setUTCDate(endBase.getUTCDate() + 1);
  const endClean = endBase.toISOString().slice(0, 10).replace(/-/g, '');

  const escapeIcs = (str: string) =>
    str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');

  const safeUid = notice.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeSourceUrl = toSafeHttpUrl(notice.sourceUrl).replace(/[\r\n]/g, '');
  const scopePrefix = notice.scope === 'federal' ? 'U.S. Flag Half-Staff' : `${notice.stateCode || 'State'} Flag Half-Staff`;
  const summary = escapeIcs(`${scopePrefix}: ${notice.title}`);
  const description = escapeIcs(`${notice.summary}\n\nOfficial Source: ${safeSourceUrl}`);

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HalfStaffApp//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${safeUid}@halfstaff.local`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`,
    `DTSTART;VALUE=DATE:${startClean}`,
    `DTEND;VALUE=DATE:${endClean}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `URL:${safeSourceUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const safeDateSlug = notice.dateStart.replace(/[^0-9-]/g, '').slice(0, 10) || 'event';
  const blob = new Blob([icsLines], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `half-staff-${safeDateSlug}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
