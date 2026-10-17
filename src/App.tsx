import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  MapPin,
  RefreshCw,
  ExternalLink,
  Calendar,
  ChevronDown,
  ChevronUp,
  Bell,
  BellRing,
  Download,
  Compass,
} from 'lucide-react';
import { FlagpoleGraphic } from './components/FlagpoleGraphic';
import {
  type FlagStatusPayload,
  type NormalizedNotice,
  US_STATES,
  STATE_OFFICIAL_LINKS,
  isNoticeActiveOnDate,
  formatDateRange,
  downloadNoticeIcs,
} from './types';

const STORAGE_STATE_KEY = 'halfstaff_selected_state';
const STORAGE_ALERT_KEY = 'halfstaff_alerts_enabled';

export function App() {
  const [selectedState, setSelectedState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_STATE_KEY) || 'MN';
    } catch {
      return 'MN';
    }
  });

  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_ALERT_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [payload, setPayload] = useState<FlagStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);

  // Progressive disclosure states — everything collapsed by default for a clean first glance
  const [showHeroFullText, setShowHeroFullText] = useState<boolean>(false);
  const [showMoreDrawer, setShowMoreDrawer] = useState<boolean>(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const lastNotifiedIdRef = useRef<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleStateChange = (code: string) => {
    setSelectedState(code);
    setShowHeroFullText(false);
    try {
      localStorage.setItem(STORAGE_STATE_KEY, code);
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
      const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client');
      if (res.ok) {
        const geo = await res.json();
        const subdivision: string = geo.principalSubdivisionCode || '';
        const match = subdivision.match(/^US-([A-Z]{2})$/);
        if (match && match[1]) {
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

    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          setAlertsEnabled(true);
          localStorage.setItem(STORAGE_ALERT_KEY, 'true');
          showToast(`Alerts enabled for ${selectedStateName} & U.S. orders`);
          return;
        }
      } catch {
        // fallback below
      }
    }

    // Fallback when running in embedded preview or browser without Notification prompt
    setAlertsEnabled(true);
    try {
      localStorage.setItem(STORAGE_ALERT_KEY, 'true');
    } catch {
      // ignore
    }
    showToast(`Live half-staff alerts enabled for ${selectedStateName}`);
  };

  const selectedStateName = useMemo(() => {
    return US_STATES.find((s) => s.code === selectedState)?.name || selectedState;
  }, [selectedState]);

  const effectiveDate = useMemo(() => {
    if (customDate) return customDate;
    return payload?.referenceDate || new Date().toISOString().slice(0, 10);
  }, [customDate, payload]);

  const relevantNotices = useMemo(() => {
    if (!payload) return [];
    return payload.notices.filter(
      (n) => n.scope === 'federal' || (n.scope === 'state' && n.stateCode === selectedState)
    );
  }, [payload, selectedState]);

  const activeNoticesForState = useMemo(() => {
    return relevantNotices.filter((n) => isNoticeActiveOnDate(n, effectiveDate));
  }, [relevantNotices, effectiveDate]);

  const recentNoticesForState = useMemo(() => {
    const activeIds = new Set(activeNoticesForState.map((n) => n.id));
    return relevantNotices.filter((n) => !activeIds.has(n.id)).slice(0, 8);
  }, [relevantNotices, activeNoticesForState]);

  const isHalfStaff = activeNoticesForState.length > 0;
  const primaryNotice: NormalizedNotice | null = activeNoticesForState[0] || null;

  // Trigger browser notification if alerts are enabled and an active half-staff notice is present
  useEffect(() => {
    if (!alertsEnabled || !primaryNotice) return;
    if (lastNotifiedIdRef.current === primaryNotice.id) return;
    lastNotifiedIdRef.current = primaryNotice.id;

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`Half-Staff Active: ${primaryNotice.title}`, {
          body: primaryNotice.summary,
          icon: '/favicon.svg',
        });
      } catch {
        // ignore
      }
    }
  }, [alertsEnabled, primaryNotice]);

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Subtle ambient background glow */}
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 h-96 opacity-35 blur-3xl transition-colors duration-700 ${
          isHalfStaff
            ? 'bg-gradient-to-b from-amber-600/25 via-rose-900/10 to-transparent'
            : 'bg-gradient-to-b from-emerald-600/20 via-sky-900/10 to-transparent'
        }`}
      />

      {/* Minimal Top Bar */}
      <header className="relative z-20 mx-auto flex w-full max-w-md items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex items-center">
            <MapPin className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
            <select
              aria-label="Select State or Territory"
              value={selectedState}
              onChange={(e) => handleStateChange(e.target.value)}
              className="h-8 appearance-none rounded-full border border-slate-800 bg-slate-900/80 pl-7 pr-6 text-xs font-medium text-slate-200 transition hover:border-slate-700 focus:border-slate-500 focus:outline-none"
            >
              {US_STATES.map((st) => (
                <option key={st.code} value={st.code} className="bg-slate-900 text-slate-100">
                  {st.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-slate-400" />
          </div>

          <button
            type="button"
            onClick={detectUserState}
            disabled={locating}
            title="Auto-detect my state"
            aria-label="Auto-detect my state"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-800 bg-slate-900/80 text-slate-400 transition hover:border-slate-700 hover:text-slate-200 disabled:opacity-50"
          >
            <Compass className={`h-3.5 w-3.5 ${locating ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleAlerts}
            title={alertsEnabled ? 'Half-staff alerts enabled' : 'Enable half-staff alerts'}
            aria-label={alertsEnabled ? 'Half-staff alerts enabled' : 'Enable half-staff alerts'}
            className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition ${
              alertsEnabled
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            {alertsEnabled ? (
              <BellRing className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Bell className="h-3.5 w-3.5" />
            )}
            <span className="text-[11px]">{alertsEnabled ? 'Alerts On' : 'Alerts'}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchStatus(true)}
            disabled={refreshing}
            title="Refresh live flag status"
            aria-label="Refresh live flag status"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-800 bg-slate-900/80 text-slate-400 transition hover:border-slate-700 hover:text-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Optional Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 z-50 -translate-x-1/2 rounded-full border border-slate-700 bg-slate-900/95 px-4 py-1.5 text-xs font-medium text-slate-200 shadow-lg backdrop-blur">
          {toastMessage}
        </div>
      )}

      {/* Main Focal Point: Simple At-A-Glance View */}
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 py-6 text-center">
        {/* Simulation date banner when previewing a historical/recent proclamation */}
        {customDate && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs text-amber-200">
            <span>
              Viewing{' '}
              {new Date(customDate + 'T12:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <button
              type="button"
              onClick={() => {
                setCustomDate(null);
                setShowHeroFullText(false);
              }}
              className="font-semibold text-amber-300 underline decoration-amber-400/60 underline-offset-2 hover:text-white"
            >
              Reset to Today
            </button>
          </div>
        )}

        {/* Animated 50-Star, 13-Stripe Flagpole Icon */}
        <FlagpoleGraphic
          isHalfStaff={isHalfStaff}
          scope={activeScope}
          stateCode={selectedState}
        />

        {loading ? (
          <div className="mt-4 w-full max-w-xs animate-pulse space-y-2.5">
            <div className="mx-auto h-7 w-40 rounded-lg bg-slate-800" />
            <div className="mx-auto h-4 w-64 rounded bg-slate-800/70" />
          </div>
        ) : isHalfStaff && primaryNotice ? (
          <div className="mt-3 max-w-sm">
            {/* Simple Status Label */}
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>
                Half-Staff &middot;{' '}
                {primaryNotice.scope === 'federal'
                  ? 'U.S. Presidential Order'
                  : `${selectedStateName} Order`}
              </span>
            </div>

            {/* Headline */}
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {primaryNotice.title}
            </h1>

            {/* 1–2 Sentence Reason with Inline Source Links */}
            <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-[15px]">
              {primaryNotice.summary}{' '}
              <a
                href={primaryNotice.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-amber-400 underline decoration-amber-400/40 underline-offset-4 transition hover:text-amber-300 hover:decoration-amber-300"
              >
                <span>{primaryNotice.sourceLabel}</span>
                <ExternalLink className="ml-0.5 h-3 w-3" />
              </a>
              {primaryNotice.secondaryUrl && (
                <>
                  {' · '}
                  <a
                    href={primaryNotice.secondaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-400 underline decoration-slate-600 underline-offset-4 transition hover:text-slate-200"
                  >
                    <span>{primaryNotice.secondaryLabel}</span>
                    <ExternalLink className="ml-0.5 h-2.5 w-2.5" />
                  </a>
                </>
              )}
            </p>

            {/* Subtle Secondary Actions: Date Range, Read Proclamation, Calendar (.ics) */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                {formatDateRange(
                  primaryNotice.dateStart,
                  primaryNotice.dateEnd,
                  primaryNotice.isOngoing
                )}
              </span>

              <span>&middot;</span>

              <button
                type="button"
                onClick={() => setShowHeroFullText((v) => !v)}
                className="font-medium text-slate-300 hover:text-white"
              >
                {showHeroFullText ? 'Hide full text' : 'Read proclamation'}
              </button>

              <span>&middot;</span>

              <button
                type="button"
                onClick={() => {
                  downloadNoticeIcs(primaryNotice);
                  showToast('Saved proclamation to calendar (.ics)');
                }}
                className="inline-flex items-center gap-1 font-medium text-slate-300 hover:text-white"
              >
                <Download className="h-3 w-3" />
                <span>Add to Calendar</span>
              </button>
            </div>

            {/* Expandable Full Text Drawer (only when requested) */}
            {showHeroFullText && primaryNotice.fullText && (
              <div className="mt-4 rounded-2xl border border-slate-800/90 bg-slate-900/70 p-4 text-left text-xs leading-relaxed text-slate-300 whitespace-pre-line">
                {primaryNotice.fullText}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 max-w-sm">
            {/* Full-Staff Status Label */}
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Full-Staff Today</span>
            </div>

            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              No Active Half-Staff Orders
            </h1>

            {/* Single Clean Sentence with Inline Source Links */}
            <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-[15px]">
              The American flag is flying at full-staff in{' '}
              <span className="font-medium text-white">{selectedStateName}</span> and nationwide
              today, with no active proclamations from the{' '}
              <a
                href="https://www.whitehouse.gov/presidential-actions/proclamations/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-200 underline decoration-slate-600 underline-offset-4 transition hover:text-amber-300 hover:decoration-amber-400"
              >
                White House
              </a>
              ,{' '}
              <a
                href={statePortalLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-200 underline decoration-slate-600 underline-offset-4 transition hover:text-amber-300 hover:decoration-amber-400"
              >
                {statePortalLink.label}
              </a>
              , or{' '}
              <a
                href={`https://halfstaff.org/state/${selectedState.toLowerCase()}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-200 underline decoration-slate-600 underline-offset-4 transition hover:text-amber-300 hover:decoration-amber-400"
              >
                HalfStaff.org
              </a>
              .
            </p>
          </div>
        )}

        {/* Progressive Disclosure Toggle ("Dig in for more info") */}
        <div className="mt-8 w-full">
          <button
            type="button"
            onClick={() => setShowMoreDrawer((v) => !v)}
            className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-slate-800/90 bg-slate-900/60 px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white"
          >
            <span>
              {showMoreDrawer
                ? 'Hide recent orders & details'
                : `Recent ${selectedStateName} & U.S. orders (${recentNoticesForState.length})`}
            </span>
            {showMoreDrawer ? (
              <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            )}
          </button>

          {/* Collapsible History & Live Sources Drawer */}
          {showMoreDrawer && (
            <div className="mt-4 space-y-3 text-left animate-fadeIn">
              {recentNoticesForState.map((notice) => {
                const isExpanded = expandedHistoryId === notice.id;
                return (
                  <article
                    key={notice.id}
                    className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 transition hover:border-slate-700/80"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span
                            className={`font-semibold uppercase tracking-wider ${
                              notice.scope === 'federal' ? 'text-blue-400' : 'text-amber-400'
                            }`}
                          >
                            {notice.scope === 'federal'
                              ? 'Federal'
                              : notice.stateName || notice.stateCode}
                          </span>
                          <span>&middot;</span>
                          <span>
                            {formatDateRange(notice.dateStart, notice.dateEnd, notice.isOngoing)}
                          </span>
                        </div>
                        <h3 className="mt-1 text-sm font-semibold text-white">{notice.title}</h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setCustomDate(notice.dateStart);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="shrink-0 rounded-full border border-slate-700/80 bg-slate-800/60 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-amber-500/40 hover:text-amber-300"
                      >
                        Preview
                      </button>
                    </div>

                    <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                      {notice.summary}
                    </p>

                    {isExpanded && notice.fullText && (
                      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-300 whitespace-pre-line">
                        {notice.fullText}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/60 pt-2.5 text-xs">
                      <div className="flex flex-wrap items-center gap-3">
                        <a
                          href={notice.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-amber-400 hover:text-amber-300"
                        >
                          <span>{notice.sourceLabel}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            downloadNoticeIcs(notice);
                            showToast('Saved proclamation to calendar (.ics)');
                          }}
                          className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200"
                        >
                          <Download className="h-3 w-3" />
                          <span>.ics</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedHistoryId(isExpanded ? null : notice.id)}
                        className="text-[11px] font-medium text-slate-400 hover:text-slate-200"
                      >
                        {isExpanded ? 'Hide text' : 'Full text'}
                      </button>
                    </div>
                  </article>
                );
              })}

              {/* Compact Data Source Status inside the drawer */}
              {payload?.sources && (
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-3.5 text-[11px] text-slate-400">
                  <div className="mb-2 flex items-center justify-between font-medium text-slate-300">
                    <span>Connected Live Feeds</span>
                    {payload.fetchedAt && (
                      <span className="text-slate-500">
                        Updated{' '}
                        {new Date(payload.fetchedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {payload.sources.map((src) => (
                      <div key={src.name} className="flex items-center justify-between">
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-slate-200 hover:underline"
                        >
                          {src.name}
                        </a>
                        <span
                          className={
                            src.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'
                          }
                        >
                          {src.status === 'ok' ? '● Live' : '● Fallback'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Whisper-quiet footer */}
      <footer className="relative z-10 pb-4 text-center text-[11px] text-slate-600">
        Real-time U.S. &amp; State Flag Status
      </footer>
    </div>
  );
}
export default App;
