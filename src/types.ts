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

export interface StateOption {
  code: string;
  name: string;
  group: 'state' | 'territory';
}

export const US_STATES: StateOption[] = [
  { code: 'AL', name: 'Alabama', group: 'state' },
  { code: 'AK', name: 'Alaska', group: 'state' },
  { code: 'AZ', name: 'Arizona', group: 'state' },
  { code: 'AR', name: 'Arkansas', group: 'state' },
  { code: 'CA', name: 'California', group: 'state' },
  { code: 'CO', name: 'Colorado', group: 'state' },
  { code: 'CT', name: 'Connecticut', group: 'state' },
  { code: 'DE', name: 'Delaware', group: 'state' },
  { code: 'FL', name: 'Florida', group: 'state' },
  { code: 'GA', name: 'Georgia', group: 'state' },
  { code: 'HI', name: 'Hawaii', group: 'state' },
  { code: 'ID', name: 'Idaho', group: 'state' },
  { code: 'IL', name: 'Illinois', group: 'state' },
  { code: 'IN', name: 'Indiana', group: 'state' },
  { code: 'IA', name: 'Iowa', group: 'state' },
  { code: 'KS', name: 'Kansas', group: 'state' },
  { code: 'KY', name: 'Kentucky', group: 'state' },
  { code: 'LA', name: 'Louisiana', group: 'state' },
  { code: 'ME', name: 'Maine', group: 'state' },
  { code: 'MD', name: 'Maryland', group: 'state' },
  { code: 'MA', name: 'Massachusetts', group: 'state' },
  { code: 'MI', name: 'Michigan', group: 'state' },
  { code: 'MN', name: 'Minnesota', group: 'state' },
  { code: 'MS', name: 'Mississippi', group: 'state' },
  { code: 'MO', name: 'Missouri', group: 'state' },
  { code: 'MT', name: 'Montana', group: 'state' },
  { code: 'NE', name: 'Nebraska', group: 'state' },
  { code: 'NV', name: 'Nevada', group: 'state' },
  { code: 'NH', name: 'New Hampshire', group: 'state' },
  { code: 'NJ', name: 'New Jersey', group: 'state' },
  { code: 'NM', name: 'New Mexico', group: 'state' },
  { code: 'NY', name: 'New York', group: 'state' },
  { code: 'NC', name: 'North Carolina', group: 'state' },
  { code: 'ND', name: 'North Dakota', group: 'state' },
  { code: 'OH', name: 'Ohio', group: 'state' },
  { code: 'OK', name: 'Oklahoma', group: 'state' },
  { code: 'OR', name: 'Oregon', group: 'state' },
  { code: 'PA', name: 'Pennsylvania', group: 'state' },
  { code: 'RI', name: 'Rhode Island', group: 'state' },
  { code: 'SC', name: 'South Carolina', group: 'state' },
  { code: 'SD', name: 'South Dakota', group: 'state' },
  { code: 'TN', name: 'Tennessee', group: 'state' },
  { code: 'TX', name: 'Texas', group: 'state' },
  { code: 'UT', name: 'Utah', group: 'state' },
  { code: 'VT', name: 'Vermont', group: 'state' },
  { code: 'VA', name: 'Virginia', group: 'state' },
  { code: 'WA', name: 'Washington', group: 'state' },
  { code: 'WV', name: 'West Virginia', group: 'state' },
  { code: 'WI', name: 'Wisconsin', group: 'state' },
  { code: 'WY', name: 'Wyoming', group: 'state' },
  { code: 'DC', name: 'District of Columbia', group: 'territory' },
  { code: 'PR', name: 'Puerto Rico', group: 'territory' },
  { code: 'GU', name: 'Guam', group: 'territory' },
  { code: 'VI', name: 'U.S. Virgin Islands', group: 'territory' },
  { code: 'AS', name: 'American Samoa', group: 'territory' },
  { code: 'MP', name: 'Northern Mariana Islands', group: 'territory' },
];

export const US_STATES_ONLY = US_STATES.filter((s) => s.group === 'state');
export const US_TERRITORIES_AND_DC = US_STATES.filter((s) => s.group === 'territory');

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
 * Returns the user's local calendar date in YYYY-MM-DD format so evening hours
 * in U.S. timezones do not prematurely roll over to tomorrow's UTC date.
 */
export function getLocalDateIso(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into a readable local display string
 * (e.g., "Sat, Oct 17, 2026").
 */
export function formatDisplayDate(dateIso: string): string {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return '';
  const d = new Date(dateIso + 'T12:00:00');
  if (isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats a fetchedAt timestamp into a compact human-readable freshness string.
 */
export function formatRelativeTime(isoTimestamp: string | null | undefined, nowMs = Date.now()): string {
  if (!isoTimestamp) return '';
  const ts = new Date(isoTimestamp).getTime();
  if (isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 45) return 'Updated just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Updated ${diffHr}h ago`;
  return `Updated ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Computes the next statutory U.S. Flag Code annual half-staff observance from a given YYYY-MM-DD date.
 */
export function getUpcomingFederalObservance(targetDateIso: string): {
  name: string;
  dateIso: string;
  formattedDate: string;
  note: string;
} {
  const baseYear = Number.parseInt(targetDateIso.slice(0, 4), 10) || new Date().getFullYear();

  const buildYearObservances = (yr: number) => {
    // Memorial Day: last Monday in May
    const may31 = new Date(Date.UTC(yr, 4, 31, 12, 0, 0));
    const memorialDayNum = 31 - ((may31.getUTCDay() + 6) % 7);
    const memorialIso = `${yr}-05-${String(memorialDayNum).padStart(2, '0')}`;

    // National Fallen Firefighters Memorial Service: first Sunday in October
    const oct1 = new Date(Date.UTC(yr, 9, 1, 12, 0, 0));
    const firstSunOctNum = 1 + ((7 - oct1.getUTCDay()) % 7);
    const firefightersIso = `${yr}-10-${String(firstSunOctNum).padStart(2, '0')}`;

    return [
      {
        name: 'Peace Officers Memorial Day',
        dateIso: `${yr}-05-15`,
        note: 'Sunrise to sunset',
      },
      {
        name: 'Memorial Day',
        dateIso: memorialIso,
        note: 'Sunrise until noon',
      },
      {
        name: 'Patriot Day',
        dateIso: `${yr}-09-11`,
        note: 'Sunrise to sunset',
      },
      {
        name: 'Fallen Firefighters Memorial Day',
        dateIso: firefightersIso,
        note: 'Sunrise to sunset',
      },
      {
        name: 'Pearl Harbor Remembrance Day',
        dateIso: `${yr}-12-07`,
        note: 'Sunrise to sunset',
      },
    ].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  };

  const candidates = [...buildYearObservances(baseYear), ...buildYearObservances(baseYear + 1)];
  const next = candidates.find((c) => c.dateIso > targetDateIso) || candidates[0];
  const d = new Date(next.dateIso + 'T12:00:00');
  const formattedDate = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: next.dateIso.slice(0, 4) !== targetDateIso.slice(0, 4) ? 'numeric' : undefined,
  });

  return {
    ...next,
    formattedDate,
  };
}

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
