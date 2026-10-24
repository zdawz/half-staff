import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  MapPin,
  RefreshCw,
  ExternalLink,
  Calendar,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Bell,
  BellRing,
  Download,
  Compass,
  Sun,
  Moon,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { FlagpoleGraphic } from './components/FlagpoleGraphic';
import {
  type FlagStatusPayload,
  type NormalizedNotice,
  US_STATES,
  US_STATES_ONLY,
  US_TERRITORIES_AND_DC,
  VALID_STATE_CODES,
  STATE_OFFICIAL_LINKS,
  toSafeHttpUrl,
  isNoticeActiveOnDate,
  formatDateRange,
  getLocalDateIso,
  getGoogleCalendarUrl,
  downloadNoticeIcs,
} from './types';

const STORAGE_STATE_KEY = 'halfstaff_selected_state';
const STORAGE_ALERT_KEY = 'halfstaff_alerts_enabled';
const STORAGE_THEME_KEY = 'halfstaff_theme_preference';
const STORAGE_LAST_NOTIFIED_KEY = 'halfstaff_last_notified_id';
const INITIAL_HISTORY_LIMIT = 8;

/**
 * Fetches JSON with a strict client-side timeout so requests can never hang
 * indefinitely in mobile browsers or Service Workers.
 */
async function fetchJsonWithTimeout<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 5000
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('Request timed out'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      (async () => {
        const res = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as T;
      })(),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function renderFormattedFullText(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return <p>{text}</p>;

  return (
    <div className="space-y-3">
      {paragraphs.map((para, idx) => {
        const isHeaderOrClause =
          /^(?:BY THE PRESIDENT|A PROCLAMATION|EXECUTIVE ORDER)/i.test(para) ||
          /^(?:WHEREAS|NOW,\s*THEREFORE|IN WITNESS WHEREOF)\b/i.test(para);

        if (/^(?:BY THE PRESIDENT|A PROCLAMATION|EXECUTIVE ORDER)/i.test(para) && para.length < 120) {
          return (
            <p
              key={idx}
              className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100"
            >
              {para}
            </p>
          );
        }

        if (isHeaderOrClause) {
          const match = para.match(/^(WHEREAS|NOW,\s*THEREFORE|IN WITNESS WHEREOF)(,?[\s\S]*)$/i);
          if (match) {
            return (
              <p key={idx} className="leading-relaxed">
                <span className="font-semibold tracking-wide text-amber-900 dark:text-amber-300">
                  {match[1]}
                </span>
                {match[2]}
              </p>
            );
          }
        }

        return (
          <p key={idx} className="leading-relaxed">
            {para}
          </p>
        );
      })}
    </div>
  );
}

export function App() {
  const [selectedState, setSelectedState] = useState<string>(() => {
    try {
      const saved = (localStorage.getItem(STORAGE_STATE_KEY) || '').toUpperCase();
      return VALID_STATE_CODES.has(saved) ? saved : 'MN';
    } catch {
      return 'MN';
    }
  });

  const supportsNotifications =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    typeof window.Notification?.requestPermission === 'function';

  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification?.permission === 'granted' &&
        localStorage.getItem(STORAGE_ALERT_KEY) === 'true'
      );
    } catch {
      return false;
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      localStorage.removeItem('halfstaff_theme');
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch {
      // ignore
    }
    return 'light';
  });

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    // Update every theme-color meta (including media-scoped ones) so an explicit
    // in-app theme choice overrides the system preference in Safari's status bar
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute('content', isDark ? '#020617' : '#f8fafc');
    });
  }, [theme]);

  // Follow device dark mode changes automatically unless the user explicitly toggled a preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      try {
        const saved = localStorage.getItem(STORAGE_THEME_KEY);
        if (saved !== 'light' && saved !== 'dark') {
          setTheme(e.matches ? 'dark' : 'light');
        }
      } catch {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_THEME_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  const [payload, setPayload] = useState<FlagStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Progressive disclosure & multi-order states
  const [activePrimaryIndex, setActivePrimaryIndex] = useState<number>(0);
  const [showHeroFullText, setShowHeroFullText] = useState<boolean>(false);
  const [showMoreDrawer, setShowMoreDrawer] = useState<boolean>(false);
  const [drawerFilter, setDrawerFilter] = useState<'all' | 'state' | 'federal'>('all');
  const [visibleHistoryCount, setVisibleHistoryCount] = useState<number>(INITIAL_HISTORY_LIMIT);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const lastNotifiedIdRef = useRef<string | null>(
    (() => {
      try {
        return localStorage.getItem(STORAGE_LAST_NOTIFIED_KEY);
      } catch {
        return null;
      }
    })()
  );
  const inFlightStatusRef = useRef<boolean>(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3500);
  }, []);

  const handleStateChange = useCallback((code: string) => {
    const cleanCode = code.toUpperCase();
    if (!VALID_STATE_CODES.has(cleanCode)) return;
    setSelectedState(cleanCode);
    setActivePrimaryIndex(0);
    setShowHeroFullText(false);
    setVisibleHistoryCount(INITIAL_HISTORY_LIMIT);
    setExpandedHistoryId(null);
    try {
      localStorage.setItem(STORAGE_STATE_KEY, cleanCode);
    } catch {
      // ignore
    }
  }, []);

  const fetchStatus = useCallback(
    async (force = false) => {
      // Skip background polls while another request is pending (forced refreshes always run)
      if (!force && inFlightStatusRef.current) return;
      inFlightStatusRef.current = true;
      const startMs = Date.now();
      if (force) setRefreshing(true);
      let ok = false;
      try {
        const endpoint = force
          ? `/api/flag-status?fresh=1&t=${startMs}`
          : '/api/flag-status';
        const data = await fetchJsonWithTimeout<FlagStatusPayload>(
          endpoint,
          force ? { cache: 'no-store' } : {},
          force ? 4500 : 6000
        );
        setPayload(data);
        setFetchError(false);
        setNowTick(Date.now());
        ok = true;
      } catch {
        setFetchError(true);
      } finally {
        inFlightStatusRef.current = false;
        if (force) {
          const elapsed = Date.now() - startMs;
          if (elapsed < 400) {
            await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
          }
          setRefreshing(false);
          showToast(
            ok
              ? 'Live flag status updated'
              : 'Could not refresh live feeds — showing last known status'
          );
        }
        setLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    fetchStatus(false);
    const interval = setInterval(() => {
      setNowTick(Date.now());
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        fetchStatus(false);
      }
    }, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setNowTick(Date.now());
        fetchStatus(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchStatus]);

  const detectUserState = async () => {
    const startMs = Date.now();
    setLocating(true);
    let detectedCode: string | null = null;

    const extractValidCode = (raw: unknown): string | null => {
      if (typeof raw !== 'string') return null;
      const trimmed = raw.trim().toUpperCase();
      const isoMatch = trimmed.match(/^US-([A-Z]{2})$/);
      const code = isoMatch ? isoMatch[1] : trimmed;
      return VALID_STATE_CODES.has(code) ? code : null;
    };

    const getBrowserCoordinates = (timeoutMs: number): Promise<{ lat: number; lon: number } | null> => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        const safetyTimer = setTimeout(() => resolve(null), timeoutMs + 250);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(safetyTimer);
            // Round to ~1 km before it leaves the device; enough to resolve a state
            resolve({
              lat: Math.round(pos.coords.latitude * 100) / 100,
              lon: Math.round(pos.coords.longitude * 100) / 100,
            });
          },
          () => {
            clearTimeout(safetyTimer);
            resolve(null);
          },
          {
            enableHighAccuracy: false,
            timeout: timeoutMs,
            maximumAge: 300_000,
          }
        );
      });
    };

    try {
      let coords: { lat: number; lon: number } | null = null;
      let geoPermissionState: PermissionState | 'unknown' = 'unknown';
      try {
        if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
          const perm = await navigator.permissions.query({ name: 'geolocation' });
          geoPermissionState = perm.state;
          if (perm.state === 'granted') {
            coords = await getBrowserCoordinates(2500);
          }
        }
      } catch {
        // ignore permissions API errors on unsupported browsers
      }

      try {
        const params = new URLSearchParams({ t: String(Date.now()) });
        if (coords) {
          params.set('lat', String(coords.lat));
          params.set('lon', String(coords.lon));
        }
        const data = await fetchJsonWithTimeout<{ stateCode?: string }>(
          `/api/locate?${params.toString()}`,
          { cache: 'no-store' },
          3500
        );
        detectedCode = extractValidCode(data?.stateCode);
      } catch {
        // fall through to client-side lookup
      }

      if (!detectedCode) {
        try {
          const geoUrl = coords
            ? `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(
                String(coords.lat)
              )}&longitude=${encodeURIComponent(String(coords.lon))}&localityLanguage=en`
            : 'https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en';
          const geo = await fetchJsonWithTimeout<{
            principalSubdivisionCode?: string;
            countryCode?: string;
          }>(
            geoUrl,
            {
              credentials: 'omit',
              cache: 'no-store',
            },
            3500
          );
          detectedCode =
            extractValidCode(geo?.principalSubdivisionCode) ||
            extractValidCode(geo?.countryCode);
        } catch {
          // fall through
        }
      }

      if (!detectedCode && !coords && geoPermissionState !== 'denied') {
        const promptCoords = await getBrowserCoordinates(3500);
        if (promptCoords) {
          try {
            const params = new URLSearchParams({
              lat: String(promptCoords.lat),
              lon: String(promptCoords.lon),
              t: String(Date.now()),
            });
            const data = await fetchJsonWithTimeout<{ stateCode?: string }>(
              `/api/locate?${params.toString()}`,
              { cache: 'no-store' },
              3500
            );
            detectedCode = extractValidCode(data?.stateCode);
          } catch {
            // ignore
          }
        }
      }
    } finally {
      const elapsed = Date.now() - startMs;
      if (elapsed < 400) {
        await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
      }
      setLocating(false);

      if (detectedCode) {
        const stateObj = US_STATES.find((s) => s.code === detectedCode);
        const stateLabel = stateObj ? `${stateObj.name} (${detectedCode})` : detectedCode;
        handleStateChange(detectedCode);
        showToast(`Location set to ${stateLabel}`);
      } else {
        showToast('Could not auto-detect location — please select your state');
      }
    }
  };

  const toggleAlerts = async () => {
    if (!supportsNotifications) return;

    if (alertsEnabled) {
      setAlertsEnabled(false);
      try {
        localStorage.setItem(STORAGE_ALERT_KEY, 'false');
      } catch {
        // ignore
      }
      showToast('Half-staff browser alerts paused');
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setAlertsEnabled(true);
        localStorage.setItem(STORAGE_ALERT_KEY, 'true');
        showToast(`Alerts enabled for ${selectedStateName} & U.S. orders`);
      } else {
        setAlertsEnabled(false);
        localStorage.setItem(STORAGE_ALERT_KEY, 'false');
        showToast('Notifications blocked in browser settings');
      }
    } catch {
      showToast('Notifications unavailable on this browser');
    }
  };

  const selectedStateName = useMemo(() => {
    return US_STATES.find((s) => s.code === selectedState)?.name || selectedState;
  }, [selectedState]);

  // Always evaluate orders against the viewer's local calendar date. The server's
  // referenceDate is computed in a fixed timezone and would be wrong for viewers elsewhere.
  const todayDate = useMemo(() => getLocalDateIso(new Date(nowTick)), [nowTick]);

  const relevantNotices = useMemo(() => {
    if (!payload) return [];
    return payload.notices.filter(
      (n) => n.scope === 'federal' || (n.scope === 'state' && n.stateCode === selectedState)
    );
  }, [payload, selectedState]);

  const activeNoticesForState = useMemo(() => {
    return relevantNotices.filter((n) => isNoticeActiveOnDate(n, todayDate));
  }, [relevantNotices, todayDate]);

  const allHistoryNotices = useMemo(() => {
    const activeIds = new Set(activeNoticesForState.map((n) => n.id));
    return relevantNotices.filter((n) => !activeIds.has(n.id));
  }, [relevantNotices, activeNoticesForState]);

  const filteredHistoryNotices = useMemo(() => {
    if (drawerFilter === 'state') {
      return allHistoryNotices.filter((n) => n.scope === 'state');
    }
    if (drawerFilter === 'federal') {
      return allHistoryNotices.filter((n) => n.scope === 'federal');
    }
    return allHistoryNotices;
  }, [allHistoryNotices, drawerFilter]);

  const recentNoticesForState = useMemo(() => {
    return filteredHistoryNotices.slice(0, visibleHistoryCount);
  }, [filteredHistoryNotices, visibleHistoryCount]);

  const stateHistoryCount = useMemo(
    () => allHistoryNotices.filter((n) => n.scope === 'state').length,
    [allHistoryNotices]
  );
  const federalHistoryCount = useMemo(
    () => allHistoryNotices.filter((n) => n.scope === 'federal').length,
    [allHistoryNotices]
  );

  const hasInitialError = !loading && !payload && fetchError;
  const isHalfStaff = !loading && Boolean(payload) && activeNoticesForState.length > 0;
  const safePrimaryIdx =
    activePrimaryIndex < activeNoticesForState.length ? activePrimaryIndex : 0;
  const primaryNotice: NormalizedNotice | null = activeNoticesForState[safePrimaryIdx] || null;
  const coActiveNotices = useMemo(
    () => activeNoticesForState.filter((_, idx) => idx !== safePrimaryIdx),
    [activeNoticesForState, safePrimaryIdx]
  );

  // Trigger browser notification if alerts are enabled and an active half-staff notice is present
  useEffect(() => {
    if (!alertsEnabled || !primaryNotice || !supportsNotifications) return;
    if (lastNotifiedIdRef.current === primaryNotice.id) return;
    lastNotifiedIdRef.current = primaryNotice.id;
    try {
      localStorage.setItem(STORAGE_LAST_NOTIFIED_KEY, primaryNotice.id);
    } catch {
      // ignore
    }

    if (Notification.permission === 'granted') {
      try {
        new Notification(`Half-Staff Active: ${primaryNotice.title}`, {
          body: primaryNotice.summary,
          icon: '/favicon.svg',
        });
      } catch {
        // ignore
      }
    }
  }, [alertsEnabled, primaryNotice, supportsNotifications]);

  const activeScope = useMemo<'federal' | 'state' | 'both' | 'none'>(() => {
    if (!isHalfStaff) return 'none';
    const hasFed = activeNoticesForState.some((n) => n.scope === 'federal');
    const hasState = activeNoticesForState.some((n) => n.scope === 'state');
    if (hasFed && hasState) return 'both';
    return hasFed ? 'federal' : 'state';
  }, [isHalfStaff, activeNoticesForState]);

  const statePortalLink = STATE_OFFICIAL_LINKS[selectedState] || {
    label: `${selectedStateName} on HalfStaff.org`,
    url: `https://halfstaff.org/state/${selectedState.toLowerCase()}/`,
  };

  return (
    <div className="relative min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col justify-between overflow-x-hidden transition-colors duration-300">
      {/* Skip to Main Content Link for Keyboard & Screen Reader Users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-amber-600 focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Subtle ambient background glow — stays neutral during loading/error */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-96 opacity-40 dark:opacity-35 blur-3xl transition-colors duration-700 ${
          loading || hasInitialError
            ? 'bg-gradient-to-b from-slate-300/30 via-indigo-200/15 to-transparent dark:from-slate-800/30 dark:via-indigo-950/15'
            : isHalfStaff
              ? 'bg-gradient-to-b from-amber-300/35 via-rose-200/15 to-transparent dark:from-amber-600/25 dark:via-rose-900/10'
              : 'bg-gradient-to-b from-emerald-300/30 via-sky-200/15 to-transparent dark:from-emerald-600/20 dark:via-sky-900/10'
        }`}
      />

      {/* Minimal Top Bar — Sized so iPhone 15 Pro (393px) and smaller screens never overflow */}
      <header className="relative z-20 mx-auto flex w-full max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl items-center justify-between gap-2 px-4 sm:px-6 pt-3.5 pb-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="relative flex min-w-0 max-w-[156px] flex-1 items-center sm:max-w-[210px]">
            <MapPin
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-400"
            />
            <select
              aria-label="Select State or Territory"
              value={selectedState}
              onChange={(e) => handleStateChange(e.target.value)}
              className="h-9 w-full min-w-0 truncate appearance-none rounded-full border border-slate-300 bg-white/95 pl-7 pr-6 text-xs font-medium text-slate-800 shadow-xs transition hover:border-slate-400 focus:border-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-slate-700 dark:focus:border-slate-500"
            >
              <optgroup label="U.S. States">
                {US_STATES_ONLY.map((st) => (
                  <option
                    key={st.code}
                    value={st.code}
                    className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {st.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="D.C. & Territories">
                {US_TERRITORIES_AND_DC.map((st) => (
                  <option
                    key={st.code}
                    value={st.code}
                    className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {st.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-2 h-3 w-3 shrink-0 text-slate-600 dark:text-slate-400"
            />
          </div>

          <button
            type="button"
            onClick={detectUserState}
            disabled={locating}
            title="Auto-detect my state"
            aria-label="Auto-detect my state"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-700 shadow-xs transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white"
          >
            <Compass
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 ${locating ? 'animate-spin text-amber-600 dark:text-amber-400' : ''}`}
            />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {supportsNotifications && (
            <button
              type="button"
              onClick={toggleAlerts}
              aria-pressed={alertsEnabled}
              title={alertsEnabled ? 'Half-staff alerts enabled' : 'Enable half-staff alerts'}
              aria-label={alertsEnabled ? 'Half-staff alerts enabled' : 'Enable half-staff alerts'}
              className={`flex h-9 min-w-9 shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 sm:px-3 text-xs font-medium whitespace-nowrap shadow-xs transition ${
                alertsEnabled
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'border-slate-300 bg-white/95 text-slate-700 hover:border-slate-400 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white'
              }`}
            >
              {alertsEnabled ? (
                <BellRing
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400"
                />
              ) : (
                <Bell aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="hidden text-[11px] sm:inline">
                {alertsEnabled ? 'Alerts On' : 'Alerts'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-700 shadow-xs transition hover:border-slate-400 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white"
          >
            {theme === 'dark' ? (
              <Sun aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : (
              <Moon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-700" />
            )}
          </button>

          <button
            type="button"
            onClick={() => fetchStatus(true)}
            disabled={refreshing}
            title="Refresh live flag status"
            aria-label="Refresh live flag status"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-700 shadow-xs transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white"
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 ${refreshing ? 'animate-spin text-amber-600 dark:text-amber-400' : ''}`}
            />
          </button>
        </div>
      </header>

      {/* Live Toast Region for Screen Readers & Visual Feedback */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed top-16 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2"
      >
        {toastMessage && (
          <div className="rounded-2xl border border-slate-300 bg-white/95 px-4 py-1.5 text-center text-xs font-medium text-balance text-slate-800 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200">
            {toastMessage}
          </div>
        )}
      </div>

      {/* Main Focal Point: Simple At-A-Glance View */}
      <main
        id="main-content"
        aria-busy={loading}
        className="relative z-10 mx-auto flex w-full max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl flex-1 flex-col items-center justify-center px-5 sm:px-8 py-4 text-center"
      >
        {/* Animated 50-Star, 13-Stripe Flagpole Icon */}
        <FlagpoleGraphic
          isHalfStaff={isHalfStaff}
          scope={activeScope}
          stateCode={selectedState}
          loading={loading}
          hasError={hasInitialError}
        />

        {loading ? (
          <div
            role="status"
            aria-label="Loading live flag status"
            className="mt-4 w-full max-w-md animate-pulse space-y-2.5"
          >
            <div className="mx-auto h-7 w-40 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="mx-auto h-4 w-64 rounded bg-slate-200/70 dark:bg-slate-800/70" />
            <span className="sr-only">Loading current flag status...</span>
          </div>
        ) : hasInitialError ? (
          <div className="mt-3 w-full max-w-md rounded-2xl border border-amber-300/80 bg-white/95 p-5 shadow-xs dark:border-amber-500/30 dark:bg-slate-900/80">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-amber-800 dark:text-amber-300">
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span>Connection Unavailable</span>
            </div>
            <h1 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              Unable to Verify Live Flag Status
            </h1>
            <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              We couldn&apos;t reach the live proclamation feeds right now. Check your connection or
              verify directly with{' '}
              <a
                href={toSafeHttpUrl(statePortalLink.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline decoration-slate-400 underline-offset-4 hover:text-amber-800 dark:hover:text-amber-300"
              >
                {statePortalLink.label}
              </a>
              .
            </p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetchStatus(true);
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              <span>Retry Live Feeds</span>
            </button>
          </div>
        ) : isHalfStaff && primaryNotice ? (
          <div className="mt-3 w-full max-w-2xl">
            {/* Simple Single-Line Status Label */}
            <div className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-amber-800 dark:text-amber-300">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400 animate-pulse"
              />
              <span>
                Half-Staff &middot;{' '}
                {activeScope === 'both'
                  ? `U.S. & ${selectedStateName} Orders`
                  : primaryNotice.scope === 'federal'
                    ? 'U.S. Presidential Order'
                    : `${selectedStateName} Order`}
              </span>
            </div>

            {/* Headline */}
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl md:text-4xl">
              {primaryNotice.title}
            </h1>

            {/* 1–2 Sentence Reason with Inline Source Links */}
            <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 sm:text-base break-words">
              {primaryNotice.summary}{' '}
              <a
                href={toSafeHttpUrl(primaryNotice.sourceUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-medium whitespace-nowrap text-amber-800 underline decoration-amber-700/50 underline-offset-4 transition hover:text-amber-950 hover:decoration-amber-800 dark:text-amber-300 dark:decoration-amber-400/40 dark:hover:text-amber-200 dark:hover:decoration-amber-300"
              >
                <span>{primaryNotice.sourceLabel}</span>
                <span className="sr-only"> (opens in new tab)</span>
                <ExternalLink aria-hidden="true" className="ml-0.5 h-3 w-3 shrink-0" />
              </a>
              {primaryNotice.secondaryUrl && (
                <>
                  <span aria-hidden="true">{' · '}</span>
                  <a
                    href={toSafeHttpUrl(primaryNotice.secondaryUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap text-slate-600 underline decoration-slate-400 underline-offset-4 transition hover:text-slate-900 dark:text-slate-400 dark:decoration-slate-600 dark:hover:text-slate-200"
                  >
                    <span>{primaryNotice.secondaryLabel}</span>
                    <span className="sr-only"> (opens in new tab)</span>
                    <ExternalLink aria-hidden="true" className="ml-0.5 h-2.5 w-2.5 shrink-0" />
                  </a>
                </>
              )}
            </p>

            {/* Subtle Secondary Actions: Date Range, Full Text, Google Calendar & .ics */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2.5 sm:gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <Calendar
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400"
                />
                {formatDateRange(
                  primaryNotice.dateStart,
                  primaryNotice.dateEnd,
                  primaryNotice.isOngoing
                )}
              </span>

              <span aria-hidden="true">&middot;</span>

              <button
                type="button"
                aria-expanded={showHeroFullText}
                aria-controls="hero-full-text"
                onClick={() => setShowHeroFullText((v) => !v)}
                className="inline-flex items-center gap-0.5 py-0.5 font-medium whitespace-nowrap text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
              >
                <span>{showHeroFullText ? 'Hide full text' : 'Full text'}</span>
                {showHeroFullText ? (
                  <ChevronUp aria-hidden="true" className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
                )}
              </button>

              <span aria-hidden="true">&middot;</span>

              <a
                href={getGoogleCalendarUrl(primaryNotice)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 py-0.5 font-medium whitespace-nowrap text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
              >
                <CalendarPlus aria-hidden="true" className="h-3 w-3 shrink-0" />
                <span>Google Calendar</span>
                <span className="sr-only"> (opens in new tab)</span>
              </a>

              <span aria-hidden="true">&middot;</span>

              <button
                type="button"
                aria-label={`Download .ics calendar event for ${primaryNotice.title}`}
                onClick={() => {
                  downloadNoticeIcs(primaryNotice);
                  showToast('Saved proclamation to calendar (.ics)');
                }}
                className="inline-flex items-center gap-1 py-0.5 font-medium whitespace-nowrap text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
              >
                <Download aria-hidden="true" className="h-3 w-3 shrink-0" />
                <span>.ics</span>
              </button>
            </div>

            {/* Expandable Full Text Drawer (never truncated or cut off) */}
            {showHeroFullText && (
              <div
                id="hero-full-text"
                className="mt-4 w-full rounded-2xl border border-slate-200 bg-white/95 p-4 sm:p-5 text-left text-xs sm:text-sm text-slate-800 shadow-xs break-words animate-fadeIn dark:border-slate-800/90 dark:bg-slate-900/70 dark:text-slate-200"
              >
                {renderFormattedFullText(primaryNotice.fullText || primaryNotice.summary)}
              </div>
            )}

            {/* Co-Active Orders Banner when multiple proclamations are active today */}
            {coActiveNotices.length > 0 && (
              <div
                aria-label="Additional active half-staff proclamations today"
                className="mt-4 space-y-2 text-left"
              >
                {coActiveNotices.map((coNotice) => {
                  const actualIdx = activeNoticesForState.findIndex((n) => n.id === coNotice.id);
                  return (
                    <div
                      key={coNotice.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs dark:border-amber-500/25 dark:bg-amber-500/10"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                          <Layers aria-hidden="true" className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            Also Active:{' '}
                            {coNotice.scope === 'federal'
                              ? 'U.S. Order'
                              : `${coNotice.stateName || selectedStateName} Order`}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate font-semibold text-slate-900 dark:text-white">
                          {coNotice.title}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (actualIdx >= 0) {
                            setActivePrimaryIndex(actualIdx);
                            setShowHeroFullText(false);
                          }
                        }}
                        className="shrink-0 rounded-full border border-amber-600/35 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-amber-900 transition hover:bg-white dark:border-amber-400/30 dark:bg-slate-900/90 dark:text-amber-200 dark:hover:bg-slate-900"
                      >
                        View
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 w-full max-w-xl">
            {/* Full-Staff Status Label */}
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600 dark:bg-emerald-400"
              />
              <span>Full-Staff Today</span>
            </div>

            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl md:text-4xl">
              No Active Half-Staff Orders
            </h1>

            {/* Single Clean Sentence with Inline Source Links */}
            <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 sm:text-base">
              The American flag is flying at full-staff in{' '}
              <span className="font-semibold text-slate-900 dark:font-medium dark:text-white">
                {selectedStateName}
              </span>{' '}
              and nationwide today, with no active proclamations from the{' '}
              <a
                href="https://www.whitehouse.gov/presidential-actions/proclamations/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-slate-800 underline decoration-slate-400 underline-offset-4 transition hover:text-amber-800 hover:decoration-amber-700 dark:font-normal dark:text-slate-200 dark:decoration-slate-600 dark:hover:text-amber-300 dark:hover:decoration-amber-400"
              >
                White House
                <span className="sr-only"> (opens in new tab)</span>
              </a>
              ,{' '}
              <a
                href={toSafeHttpUrl(statePortalLink.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-slate-800 underline decoration-slate-400 underline-offset-4 transition hover:text-amber-800 hover:decoration-amber-700 dark:font-normal dark:text-slate-200 dark:decoration-slate-600 dark:hover:text-amber-300 dark:hover:decoration-amber-400"
              >
                {statePortalLink.label}
                <span className="sr-only"> (opens in new tab)</span>
              </a>
              , or{' '}
              <a
                href={`https://halfstaff.org/state/${selectedState.toLowerCase()}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-slate-800 underline decoration-slate-400 underline-offset-4 transition hover:text-amber-800 hover:decoration-amber-700 dark:font-normal dark:text-slate-200 dark:decoration-slate-600 dark:hover:text-amber-300 dark:hover:decoration-amber-400"
              >
                HalfStaff.org
                <span className="sr-only"> (opens in new tab)</span>
              </a>
              .
            </p>
          </div>
        )}

        {/* Progressive Disclosure Toggle ("Dig in for more info") */}
        {!loading && payload && (
          <div className="mt-6 sm:mt-8 w-full">
            <button
              type="button"
              aria-expanded={showMoreDrawer}
              aria-controls="recent-orders-drawer"
              onClick={() => setShowMoreDrawer((v) => !v)}
              className="mx-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white/95 px-4 py-2 text-xs font-medium text-slate-700 shadow-xs transition hover:border-slate-400 hover:bg-white hover:text-slate-950 dark:border-slate-800/90 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-white"
            >
              <span>
                {showMoreDrawer
                  ? 'Hide recent orders & details'
                  : `Recent ${selectedStateName} & U.S. orders (${allHistoryNotices.length})`}
              </span>
              {showMoreDrawer ? (
                <ChevronUp
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-400"
                />
              ) : (
                <ChevronDown
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-400"
                />
              )}
            </button>

            {/* Collapsible History & Live Sources Drawer */}
            {showMoreDrawer && (
              <section
                id="recent-orders-drawer"
                aria-labelledby="recent-orders-heading"
                className="mt-4 space-y-3 text-left animate-fadeIn"
              >
                <h2 id="recent-orders-heading" className="sr-only">
                  Recent {selectedStateName} and U.S. Half-Staff Orders
                </h2>

                {/* Centered Single-Row Scope Filter Pills */}
                <div className="flex justify-center">
                  <div
                    role="group"
                    aria-label="Filter proclamations by scope"
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white/95 p-0.5 text-[11px] shadow-2xs dark:border-slate-800 dark:bg-slate-900/80"
                  >
                    <button
                      type="button"
                      aria-pressed={drawerFilter === 'all'}
                      onClick={() => {
                        setDrawerFilter('all');
                        setVisibleHistoryCount(INITIAL_HISTORY_LIMIT);
                      }}
                      className={`rounded-full px-3 py-1 font-medium whitespace-nowrap transition ${
                        drawerFilter === 'all'
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      All ({allHistoryNotices.length})
                    </button>
                    <button
                      type="button"
                      aria-pressed={drawerFilter === 'state'}
                      onClick={() => {
                        setDrawerFilter('state');
                        setVisibleHistoryCount(INITIAL_HISTORY_LIMIT);
                      }}
                      className={`rounded-full px-3 py-1 font-medium whitespace-nowrap transition ${
                        drawerFilter === 'state'
                          ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-slate-950'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      {selectedState} ({stateHistoryCount})
                    </button>
                    <button
                      type="button"
                      aria-pressed={drawerFilter === 'federal'}
                      onClick={() => {
                        setDrawerFilter('federal');
                        setVisibleHistoryCount(INITIAL_HISTORY_LIMIT);
                      }}
                      className={`rounded-full px-3 py-1 font-medium whitespace-nowrap transition ${
                        drawerFilter === 'federal'
                          ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      Federal ({federalHistoryCount})
                    </button>
                  </div>
                </div>

                {recentNoticesForState.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-6 text-center text-xs text-slate-600 dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-400">
                    No proclamations found in the current feed for this filter.
                  </div>
                ) : (
                  recentNoticesForState.map((notice) => {
                    const isExpanded = expandedHistoryId === notice.id;
                    const isUpcoming = notice.dateStart > todayDate;
                    const fullTextId = `notice-full-text-${notice.id}`;
                    return (
                      <article
                        key={notice.id}
                        className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 sm:p-5 shadow-xs transition hover:border-slate-300 dark:border-slate-800/80 dark:bg-slate-900/60 dark:hover:border-slate-700/80"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                            <span
                              className={`font-semibold uppercase tracking-wider whitespace-nowrap ${
                                notice.scope === 'federal'
                                  ? 'text-blue-700 dark:text-blue-400'
                                  : 'text-amber-800 dark:text-amber-300'
                              }`}
                            >
                              {notice.scope === 'federal'
                                ? 'Federal'
                                : notice.stateName || notice.stateCode}
                            </span>
                            {isUpcoming && (
                              <>
                                <span aria-hidden="true">&middot;</span>
                                <span className="font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                                  Upcoming
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">&middot;</span>
                            <span className="whitespace-nowrap">
                              {formatDateRange(notice.dateStart, notice.dateEnd, notice.isOngoing)}
                            </span>
                          </div>
                          <h3 className="mt-1 text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                            {notice.title}
                          </h3>
                        </div>

                        {!isExpanded ? (
                          <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words">
                            {notice.summary}
                          </p>
                        ) : (
                          <div
                            id={fullTextId}
                            className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4 text-xs sm:text-sm text-slate-800 break-words animate-fadeIn dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-200"
                          >
                            {renderFormattedFullText(notice.fullText || notice.summary)}
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-slate-200/80 pt-2.5 text-[11px] sm:text-xs whitespace-nowrap dark:border-slate-800/60">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 sm:gap-x-3.5">
                            <a
                              href={toSafeHttpUrl(notice.sourceUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${notice.sourceLabel} for ${notice.title} (opens in new tab)`}
                              className="inline-flex items-center gap-1 py-0.5 font-medium text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-200"
                            >
                              <span className="sm:hidden">Source</span>
                              <span className="hidden sm:inline">{notice.sourceLabel}</span>
                              <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
                            </a>

                            <a
                              href={getGoogleCalendarUrl(notice)}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Add ${notice.title} to Google Calendar (opens in new tab)`}
                              className="inline-flex items-center gap-1 py-0.5 text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                            >
                              <CalendarPlus
                                aria-hidden="true"
                                className="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400"
                              />
                              <span className="sm:hidden">Calendar</span>
                              <span className="hidden sm:inline">Google Calendar</span>
                            </a>

                            <button
                              type="button"
                              aria-label={`Download .ics calendar event for ${notice.title}`}
                              onClick={() => {
                                downloadNoticeIcs(notice);
                                showToast('Saved proclamation to calendar (.ics)');
                              }}
                              className="inline-flex items-center gap-1 py-0.5 text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                            >
                              <Download aria-hidden="true" className="h-3 w-3 shrink-0" />
                              <span>.ics</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-controls={fullTextId}
                            aria-label={`${isExpanded ? 'Hide full text' : 'Show full text'} for ${notice.title}`}
                            onClick={() => setExpandedHistoryId(isExpanded ? null : notice.id)}
                            className="inline-flex shrink-0 items-center gap-0.5 py-0.5 font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                          >
                            <span>{isExpanded ? 'Hide text' : 'Full text'}</span>
                            {isExpanded ? (
                              <ChevronUp aria-hidden="true" className="h-3 w-3 shrink-0" />
                            ) : (
                              <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
                            )}
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}

                {/* Pagination ("Show more") when more notices exist in the filtered set */}
                {filteredHistoryNotices.length > visibleHistoryCount && (
                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleHistoryCount((c) => c + INITIAL_HISTORY_LIMIT)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white/95 px-4 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-slate-400 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white"
                    >
                      <span>
                        Show more orders ({filteredHistoryNotices.length - visibleHistoryCount}{' '}
                        remaining)
                      </span>
                      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    </button>
                  </div>
                )}

                {/* Compact Data Source Status inside the drawer */}
                {payload?.sources && (
                  <section
                    aria-labelledby="live-feeds-heading"
                    className="rounded-2xl border border-slate-200/90 bg-white/85 p-3.5 sm:p-4 text-[11px] sm:text-xs text-slate-600 shadow-xs dark:border-slate-800/60 dark:bg-slate-900/30 dark:text-slate-400"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 font-medium text-slate-800 dark:text-slate-200">
                      <h2
                        id="live-feeds-heading"
                        className="whitespace-nowrap text-[11px] sm:text-xs font-medium"
                      >
                        Connected Live Feeds
                      </h2>
                      {payload.fetchedAt && (
                        <span className="shrink-0 whitespace-nowrap text-slate-600 dark:text-slate-400">
                          Updated{' '}
                          {new Date(payload.fetchedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {payload.sources.map((src) => (
                        <div key={src.name} className="flex items-center justify-between gap-3">
                          <a
                            href={toSafeHttpUrl(src.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-w-0 truncate hover:text-slate-900 hover:underline dark:hover:text-slate-200"
                          >
                            {src.name}
                            <span className="sr-only"> (opens in new tab)</span>
                          </a>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-medium ${
                              src.status === 'ok'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                src.status === 'ok'
                                  ? 'bg-emerald-600 dark:bg-emerald-400'
                                  : 'bg-amber-600 dark:bg-amber-400'
                              }`}
                            />
                            <span>{src.status === 'ok' ? 'Live' : 'Fallback'}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {/* Whisper-quiet footer lifted above iOS Safari bottom toolbar */}
      <footer className="relative z-10 px-4 pt-2 pb-10 sm:pb-5 text-center text-[11px] text-slate-600 dark:text-slate-400">
        Real-time U.S. &amp; State Flag Status
      </footer>
    </div>
  );
}
export default App;
