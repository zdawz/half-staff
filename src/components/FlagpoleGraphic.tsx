import React from 'react';

interface FlagpoleGraphicProps {
  isHalfStaff: boolean;
  scope?: 'federal' | 'state' | 'both' | 'none';
  stateCode?: string;
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
}) => {
  // Position of the US flag along the pole (top vs half-way down)
  const flagTopPx = isHalfStaff ? 86 : 30;

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

  return (
    <div
      className="relative mx-auto flex h-56 w-56 items-center justify-center select-none"
      role="img"
      aria-label={
        isHalfStaff
          ? 'Illustration of the 50-star, 13-stripe American flag flying at half-staff'
          : 'Illustration of the 50-star, 13-stripe American flag flying at full-staff'
      }
    >
      {/* Ambient radial glow behind the flagpole */}
      <div
        className={`absolute inset-2 rounded-full blur-2xl transition-colors duration-700 ${
          isHalfStaff
            ? 'bg-gradient-to-b from-amber-500/25 via-rose-500/15 to-transparent'
            : 'bg-gradient-to-b from-emerald-500/20 via-sky-500/10 to-transparent'
        }`}
      />

      {/* Circular framing ring (208x208px) */}
      <div
        className={`relative flex h-52 w-52 items-end justify-center overflow-hidden rounded-full border transition-colors duration-500 ${
          isHalfStaff
            ? 'border-amber-500/35 bg-slate-900/90 shadow-[0_0_40px_-10px_rgba(245,158,11,0.3)]'
            : 'border-emerald-500/30 bg-slate-900/90 shadow-[0_0_40px_-10px_rgba(16,185,129,0.25)]'
        }`}
      >
        {/* Subtle horizon fade at bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-slate-950/90 to-transparent" />

        {/* Half-staff reference tick mark on the pole */}
        <div
          className="pointer-events-none absolute left-[45px] top-[86px] flex items-center gap-1 opacity-50"
          title="Half-staff position"
        >
          <div className="h-[1px] w-2.5 bg-slate-400/60" />
        </div>

        {/* Flagpole structure */}
        <div className="relative h-full w-full">
          {/* Finial (gold ball at top of pole) */}
          <div className="absolute left-[52px] top-[19px] z-20 h-3 w-3 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 shadow-sm" />

          {/* Main vertical pole */}
          <div className="absolute bottom-0 left-[56px] top-[28px] z-10 w-[4px] rounded-t-sm bg-gradient-to-r from-slate-300 via-slate-100 to-slate-400 shadow" />

          {/* Halyard rope */}
          <div className="absolute bottom-4 left-[61px] top-[30px] z-0 w-[1px] bg-slate-400/45" />

          {/* Animated US Flag group */}
          <div
            className="absolute left-[60px] z-20 transition-all duration-1000 ease-in-out"
            style={{ top: `${flagTopPx}px` }}
          >
            <div className="animate-flag-wave">
              <svg
                width="86"
                height="45"
                viewBox="0 0 88.8 46.8"
                className="drop-shadow-[0_6px_12px_rgba(0,0,0,0.55)]"
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
              {isHalfStaff && stateCode && (scope === 'state' || scope === 'both') && (
                <div className="mt-1 flex items-center">
                  <div className="flex h-4 items-center rounded-r bg-sky-900/95 px-1.5 text-[9px] font-bold tracking-wider text-sky-100 shadow ring-1 ring-sky-400/40">
                    {stateCode} STATE
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Direction indicator arrow when half-staff */}
          {isHalfStaff && (
            <div className="absolute left-[36px] top-[34px] flex flex-col items-center text-amber-400/80">
              <div className="h-10 w-[1.5px] bg-gradient-to-b from-amber-400/20 to-amber-400" />
              <svg width="9" height="7" viewBox="0 0 10 8" className="-mt-0.5 fill-current">
                <path d="M5 8L0 0h10L5 8z" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
