import React from 'react';

interface FlagpoleGraphicProps {
  isHalfStaff: boolean;
  scope?: 'federal' | 'state' | 'both' | 'none';
  stateCode?: string;
  loading?: boolean;
  hasError?: boolean;
}

/**
 * Renders the American flag on a sleek flagpole with:
 * - All 13 alternating stripes (7 red, 6 white)
 * - All 50 stars in the official 9-row staggered grid (5 rows of 6 stars + 4 rows of 5 stars = 50)
 * - Smooth vertical transition between Full-Staff (top) and Half-Staff (middle)
 * - Positioned within a 208x208 circular frame so the flag and pole are never clipped by the circle
 */
export const FlagpoleGraphic: React.FC<FlagpoleGraphicProps> = ({
  isHalfStaff,
  scope = 'none',
  stateCode,
  loading = false,
  hasError = false,
}) => {
  const isNeutral = loading || hasError;
  // Position of the US flag along the pole (top vs half-way down)
  const flagTopPx = isNeutral ? 48 : isHalfStaff ? 86 : 30;

  // Official 9-row staggered 50-star pattern (6-5-6-5-6-5-6-5-6)
  // Canton dimensions: width = 38.4, height = 25.2 (7 stripes high: 7 * 3.6 = 25.2)
  const starRows = Array.from({ length: 9 }, (_, rowIndex) => {
    const isSixStarRow = rowIndex % 2 === 0;
    const count = isSixStarRow ? 6 : 5;
    const cy = 2.6 + rowIndex * 2.5;
    return Array.from({ length: count }, (__, colIndex) => {
      const cx = isSixStarRow
        ? 3.4 + colIndex * 6.32
        : 6.56 + colIndex * 6.32;
      return { key: `${rowIndex}-${colIndex}`, cx, cy };
    });
  }).flat();

  const ariaLabel = loading
    ? 'Checking live American flag status'
    : hasError
      ? 'American flag status currently unavailable'
      : isHalfStaff
        ? 'Illustration of the 50-star, 13-stripe American flag flying at half-staff'
        : 'Illustration of the 50-star, 13-stripe American flag flying at full-staff';

  return (
    <div
      className="relative mx-auto flex h-52 w-52 sm:h-56 sm:w-56 items-center justify-center select-none"
      role="img"
      aria-label={ariaLabel}
    >
      {/* Ambient radial glow behind the flagpole */}
      <div
        aria-hidden="true"
        className={`absolute inset-2 rounded-full blur-2xl transition-colors duration-700 ${
          isNeutral
            ? 'bg-gradient-to-b from-slate-300/25 via-indigo-300/10 to-transparent dark:from-slate-700/25 dark:via-indigo-900/15'
            : isHalfStaff
              ? 'bg-gradient-to-b from-amber-400/30 via-rose-400/15 to-transparent dark:from-amber-500/25 dark:via-rose-500/15'
              : 'bg-gradient-to-b from-emerald-400/25 via-sky-400/15 to-transparent dark:from-emerald-500/20 dark:via-sky-500/10'
        }`}
      />

      {/* Circular framing ring (208x208px) */}
      <div
        aria-hidden="true"
        className={`relative flex h-48 w-48 sm:h-52 sm:w-52 items-end justify-center overflow-hidden rounded-full border transition-colors duration-500 ${
          isNeutral
            ? 'border-slate-300/80 bg-gradient-to-b from-slate-100 via-slate-50 to-white shadow-sm dark:border-slate-700/70 dark:from-indigo-950/70 dark:via-slate-900/95 dark:to-slate-950'
            : isHalfStaff
              ? 'border-amber-500/45 bg-gradient-to-b from-sky-100 via-sky-50 to-white shadow-[0_10px_35px_-10px_rgba(245,158,11,0.3)] dark:border-amber-500/35 dark:from-indigo-950/80 dark:via-slate-900/95 dark:to-slate-900/95 dark:shadow-[0_0_40px_-10px_rgba(245,158,11,0.3)]'
              : 'border-emerald-500/40 bg-gradient-to-b from-sky-100 via-sky-50 to-white shadow-[0_10px_35px_-10px_rgba(16,185,129,0.25)] dark:border-emerald-500/30 dark:from-indigo-950/75 dark:via-slate-900/95 dark:to-slate-900/95 dark:shadow-[0_0_40px_-10px_rgba(16,185,129,0.25)]'
        }`}
      >
        {/* Subtle horizon fade at bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-slate-200/75 to-transparent dark:from-slate-950/90" />

        {/* Flagpole structure */}
        <div className="relative h-full w-full">
          {/* Finial (gold ball at top of pole) */}
          <div className="absolute left-[52px] top-[19px] z-20 h-3 w-3 rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 shadow-sm dark:from-amber-200 dark:via-amber-400 dark:to-amber-600" />

          {/* Main vertical pole */}
          <div className="absolute bottom-0 left-[56px] top-[28px] z-10 w-[4px] rounded-t-sm bg-gradient-to-r from-slate-400 via-slate-200 to-slate-500 shadow dark:from-slate-300 dark:via-slate-100 dark:to-slate-400" />

          {/* Halyard rope */}
          <div className="absolute bottom-4 left-[61px] top-[30px] z-0 w-[1px] bg-slate-500/50 dark:bg-slate-400/45" />

          {/* Animated US Flag group */}
          <div
            className={`absolute left-[60px] z-20 transition-all duration-1000 ease-in-out motion-reduce:transition-none ${
              isNeutral ? 'opacity-70' : 'opacity-100'
            }`}
            style={{ top: `${flagTopPx}px` }}
          >
            <div className="animate-flag-wave">
              <svg
                aria-hidden="true"
                focusable="false"
                width="86"
                height="45"
                viewBox="0 0 88.8 46.8"
                className="drop-shadow-[0_5px_10px_rgba(15,23,42,0.28)] dark:drop-shadow-[0_6px_12px_rgba(0,0,0,0.55)]"
              >
                <defs>
                  <linearGradient id="flagShade" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                    <stop offset="35%" stopColor="#000000" stopOpacity="0.13" />
                    <stop offset="70%" stopColor="#ffffff" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
                  </linearGradient>
                  <clipPath id="flagClip">
                    <rect x="0" y="0" width="88.8" height="46.8" rx="1.6" />
                  </clipPath>
                </defs>

                <g clipPath="url(#flagClip)">
                  {/* 13 Alternating Stripes (7 Red, 6 White), each height = 3.6 */}
                  {Array.from({ length: 13 }, (_, i) => (
                    <rect
                      key={i}
                      x="0"
                      y={i * 3.6}
                      width="88.8"
                      height="3.6"
                      fill={i % 2 === 0 ? '#b22234' : '#ffffff'}
                    />
                  ))}

                  {/* Blue Union Canton (spans top 7 stripes = 25.2 height) */}
                  <rect x="0" y="0" width="38.4" height="25.2" fill="#3c3b6e" />

                  {/* Official 50 Stars (5 rows of 6 + 4 rows of 5) */}
                  {starRows.map((star) => (
                    <circle
                      key={star.key}
                      cx={star.cx}
                      cy={star.cy}
                      r="0.88"
                      fill="#ffffff"
                    />
                  ))}

                  {/* Subtle fabric wave shading overlay */}
                  <rect
                    x="0"
                    y="0"
                    width="88.8"
                    height="46.8"
                    fill="url(#flagShade)"
                  />
                </g>
              </svg>

              {/* Compact state indicator below US flag when a state order is active */}
              {!isNeutral && isHalfStaff && stateCode && (scope === 'state' || scope === 'both') && (
                <div className="mt-1 flex items-center">
                  <div className="flex h-4 items-center rounded-r bg-sky-800 px-1.5 text-[9px] font-bold tracking-wider text-white shadow ring-1 ring-sky-400/40 dark:bg-sky-900/95 dark:text-sky-100">
                    {stateCode} STATE
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Direction indicator arrow when half-staff */}
          {!isNeutral && isHalfStaff && (
            <div className="absolute left-[36px] top-[34px] flex flex-col items-center text-amber-600 dark:text-amber-400/80">
              <div className="h-10 w-[1.5px] bg-gradient-to-b from-amber-500/20 to-amber-600 dark:from-amber-400/20 dark:to-amber-400" />
              <svg
                aria-hidden="true"
                focusable="false"
                width="9"
                height="7"
                viewBox="0 0 10 8"
                className="-mt-0.5 fill-current"
              >
                <path d="M5 8L0 0h10L5 8z" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
