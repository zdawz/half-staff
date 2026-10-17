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
} from 'lucide-react';
import { FlagpoleGraphic } from './components/FlagpoleGraphic';
import {
  type FlagStatusPayload,
  type NormalizedNotice,
  US_STATES,
  VALID_STATE_CODES,
  STATE_OFFICIAL_LINKS,
  toSafeHttpUrl,
  isNoticeActiveOnDate,
  formatDateRange,
  getGoogleCalendarUrl,
  downloadNoticeIcs,
} from './types';

const STORAGE_STATE_KEY = 'halfstaff_selected_state';
const STORAGE_ALERT_KEY = 'halfstaff_alerts_enabled';
const STORAGE_THEME_KEY = 'halfstaff_theme_preference';

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
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#0f172a' : '#f8fafc');
    }
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
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);

  // Progressive disclosure states — everything collapsed by default for a clean first glance
  const [showHeroFullText, setShowHeroFullText] = useState<boolean>(false);
  const [showMoreDrawer, setShowMoreDrawer] = useState<boolean>(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const lastNotifiedIdRef = useRef<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleStateChange = (code: string) => {
    const cleanCode = code.toUpperCase();
    if (!VALID_STATE_CODES.has(cleanCode)) return;
    setSelectedState(cleanCode);
    setShowHeroFullText(false);
    try {
      localStorage.setItem(STORAGE_STATE_KEY, cleanCode);
    } catch {
      // ignore
    }
  };

  const fetchStatus = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      const res = await fetch(`/api/flag-status${force ? '?refresh=1' : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FlagStatusPayload = await res.json();
      setPayload(data);
    } catch {
      // keep previous payload if transient network issue
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus(false);
    const interval = setInterval(() => {
      fetchStatus(false);
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const detectUserState = async () => {
    setLocating(true);
    try {
      const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client', {
        credentials: 'omit',
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const geo = await res.json();
        const subdivision: string =
          typeof geo?.principalSubdivisionCode === 'string' ? geo.principalSubdivisionCode : '';
        const match = subdivision.match(/^US-([A-Z]{2})$/);
        if (match && match[1] && VALID_STATE_CODES.has(match[1])) {
          handleStateChange(match[1]);
          showToast(`Location set to ${match[1]}`);
        }
      }
    } catch {
      // ignore
    } finally {
      setLocating(false);
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

  const todayDate = useMemo(() => {
    return payload?.referenceDate || new Date().toISOString().slice(0, 10);
  }, [payload]);

  const relevantNotices = useMemo(() => {
    if (!payload) return [];
    return payload.notices.filter(
      (n) => n.scope === 'federal' || (n.scope === 'state' && n.stateCode === selectedState)
    );
  }, [payload, selectedState]);

  const activeNoticesForState = useMemo(() => {
    return relevantNotices.filter((n) => isNoticeActiveOnDate(n, todayDate));
  }, [relevantNotices, todayDate]);

  const recentNoticesForState = useMemo(() => {
    const activeIds = new Set(activeNoticesForState.map((n) => n.id));
    return relevantNotices.filter((n) => !activeIds.has(n.id)).slice(0, 8);
  }, [relevantNotices, activeNoticesForState]);

  const isHalfStaff = activeNoticesForState.length > 0;
  const primaryNotice: NormalizedNotice | null = activeNoticesForState[0] || null;

  // Trigger browser notification if alerts are enabled and an active half-staff notice is present
  useEffect(() => {
    if (!alertsEnabled || !primaryNotice || !supportsNotifications) return;
    if (lastNotifiedIdRef.current === primaryNotice.id) return;
    lastNotifiedIdRef.current = primaryNotice.id;

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
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col justify-between transition-colors duration-300">
      {/* Skip to Main Content Link for Keyboard & Screen Reader Users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-amber-600 focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Subtle ambient background glow */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 top-0 h-96 opacity-40 dark:opacity-35 blur-3xl transition-colors duration-700 ${
          isHalfStaff
            ? 'bg-gradient-to-b from-amber-300/35 via-rose-200/15 to-transparent dark:from-amber-600/25 dark:via-rose-900/10'
            : 'bg-gradient-to-b from-emerald-300/30 via-sky-200/15 to-transparent dark:from-emerald-600/20 dark:via-sky-900/10'
        }`}
      />

      {/* Minimal Top Bar */}
      <header className="relative z-20 mx-auto flex w-full max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl items-center justify-between gap-2 px-4 sm:px-6 pt-4 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="relative flex min-w-0 items-center">
            <MapPin
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-400"
            />
            <select
              aria-label="Select State or Territory"
              value={selectedState}
              onChange={(e) => handleStateChange(e.target.value)}
              className="h-9 max-w-[180px] sm:max-w-none truncate appearance-none rounded-full border border-slate-300 bg-white/95 pl-7 pr-6 text-xs font-medium text-slate-800 shadow-xs transition hover:border-slate-400 focus:border-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-slate-700 dark:focus:border-slate-500"
            >
              {US_STATES.map((st) => (
                <option
                  key={st.code}
                  value={st.code}
                  className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                >
                  {st.name}
                </option>
              ))}
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
              className={`flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium whitespace-nowrap shadow-xs transition ${
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
              <span className="text-[11px]">{alertsEnabled ? 'Alerts On' : 'Alerts'}</span>
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
        className="pointer-events-none fixed top-16 left-1/2 z-50 -translate-x-1/2"
      >
        {toastMessage && (
          <div className="max-w-[90vw] truncate rounded-full border border-slate-300 bg-white/95 px-4 py-1.5 text-xs font-medium whitespace-nowrap text-slate-800 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200">
            {toastMessage}
          </div>
        )}
      </div>

      {/* Main Focal Point: Simple At-A-Glance View */}
      <main
        id="main-content"
        aria-busy={loading}
        className="relative z-10 mx-auto flex w-full max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl flex-1 flex-col items-center justify-center px-5 sm:px-8 py-6 text-center"
      >
        {/* Animated 50-Star, 13-Stripe Flagpole Icon */}
        <FlagpoleGraphic
          isHalfStaff={isHalfStaff}
          scope={activeScope}
          stateCode={selectedState}
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
        ) : isHalfStaff && primaryNotice ? (
          <div className="mt-3 w-full max-w-2xl">
            {/* Simple Status Label */}
            <div className="inline-flex flex-wrap items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-amber-800 dark:text-amber-300">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400 animate-pulse"
              />
              <span>
                Half-Staff &middot;{' '}
                {primaryNotice.scope === 'federal'
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

            {/* Subtle Secondary Actions: Date Range, Read Proclamation, Google Calendar & .ics */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
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
                className="py-0.5 font-medium whitespace-nowrap text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
              >
                {showHeroFullText ? 'Hide full text' : 'Full text'}
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
                className="mt-4 w-full rounded-2xl border border-slate-200 bg-white/95 p-4 sm:p-5 text-left text-xs sm:text-sm leading-relaxed text-slate-800 shadow-xs whitespace-pre-wrap break-words dark:border-slate-800/90 dark:bg-slate-900/70 dark:text-slate-200"
              >
                {primaryNotice.fullText || primaryNotice.summary}
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
        <div className="mt-8 w-full">
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
                : `Recent ${selectedStateName} & U.S. orders (${recentNoticesForState.length})`}
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

              {recentNoticesForState.map((notice) => {
                const isExpanded = expandedHistoryId === notice.id;
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
                        className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed text-slate-800 whitespace-pre-wrap break-words dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-200"
                      >
                        {notice.fullText || notice.summary}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-2.5 text-[11px] sm:text-xs whitespace-nowrap dark:border-slate-800/60">
                      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
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
                          <span>Google Calendar</span>
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
                        className="shrink-0 py-0.5 font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                      >
                        {isExpanded ? 'Hide text' : 'Full text'}
                      </button>
                    </div>
                  </article>
                );
              })}

              {/* Compact Data Source Status inside the drawer */}
              {payload?.sources && (
                <section
                  aria-labelledby="live-feeds-heading"
                  className="rounded-2xl border border-slate-200/90 bg-white/85 p-3.5 sm:p-4 text-[11px] sm:text-xs text-slate-600 shadow-xs dark:border-slate-800/60 dark:bg-slate-900/30 dark:text-slate-400"
                >
                  <div className="mb-2 flex items-center justify-between gap-2 font-medium text-slate-800 dark:text-slate-200">
                    <h2 id="live-feeds-heading" className="whitespace-nowrap text-[11px] sm:text-xs font-medium">
                      Connected Live Feeds
                    </h2>
                    {payload.fetchedAt && (
                      <span className="shrink-0 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        Updated{' '}
                        {new Date(payload.fetchedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
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
      </main>

      {/* Whisper-quiet footer with WCAG AA contrast */}
      <footer className="relative z-10 pb-4 text-center text-[11px] text-slate-600 dark:text-slate-400">
        Real-time U.S. &amp; State Flag Status
      </footer>
    </div>
  );
}
export default App;
