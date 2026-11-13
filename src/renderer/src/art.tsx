import type { ReactElement } from 'react'

const LINE = '#6B4A40'
const PIG = '#F6CFC3'
const PIG_DEEP = '#EBA898'

export type Mood = 'calm' | 'happy' | 'sleepy' | 'care'

function PigHead({ mood = 'calm' }: { mood?: Mood }): ReactElement {
  const stroke = { stroke: LINE, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <g>
      <path className="ear-l" d="M25 44 C15 22 26 10 47 24 Z" fill={PIG_DEEP} {...stroke} />
      <path className="ear-r" d="M95 44 C105 22 94 10 73 24 Z" fill={PIG_DEEP} {...stroke} />
      <ellipse cx="60" cy="66" rx="45" ry="40" fill={PIG} {...stroke} />
      <circle cx="31" cy="76" r="8" fill="#F2A090" opacity="0.5" />
      <circle cx="89" cy="76" r="8" fill="#F2A090" opacity="0.5" />
      {mood === 'happy' && (
        <g fill="none" {...stroke}>
          <path d="M37 60 Q43 53 49 60" />
          <path d="M71 60 Q77 53 83 60" />
        </g>
      )}
      {mood === 'sleepy' && (
        <g fill="none" {...stroke}>
          <path d="M37 59 Q43 64 49 59" />
          <path d="M71 59 Q77 64 83 59" />
        </g>
      )}
      {(mood === 'calm' || mood === 'care') && (
        <g fill={LINE}>
          <ellipse className="eye" cx="43" cy="59" rx="3.6" ry="4.2" />
          <ellipse className="eye" cx="77" cy="59" rx="3.6" ry="4.2" />
          <circle cx="44.3" cy="57.4" r="1.1" fill="#fff" />
          <circle cx="78.3" cy="57.4" r="1.1" fill="#fff" />
        </g>
      )}
      <ellipse cx="60" cy="77" rx="17" ry="12" fill={PIG_DEEP} {...stroke} />
      <ellipse cx="54" cy="77" rx="2.5" ry="3.8" fill="#A9604F" />
      <ellipse cx="66" cy="77" rx="2.5" ry="3.8" fill="#A9604F" />
      <path d="M53 93 Q60 98 67 93" fill="none" {...stroke} />
    </g>
  )
}

export function Pig({ size = 56, mood = 'calm', float = false }: { size?: number; mood?: Mood; float?: boolean }): ReactElement {
  return (
    <svg className={'pig' + (float ? ' float' : '')} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <PigHead mood={mood} />
      {mood === 'care' && (
        <path d="M100 22 c-4 -7 -14 -2 -10 6 c2 4 7 7 10 9 c3 -2 8 -5 10 -9 c4 -8 -6 -13 -10 -6z" fill="#D97757" opacity="0.9" />
      )}
      {mood === 'sleepy' && (
        <g fill={LINE} fontFamily="var(--voice)" opacity="0.55">
          <text x="96" y="30" fontSize="15">z</text>
          <text x="106" y="18" fontSize="11">z</text>
        </g>
      )}
    </svg>
  )
}

type Slot = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'

const SKY: Record<Slot, [string, string]> = {
  morning: ['#FDEBD3', '#FBF6E9'],
  noon: ['#DCEBF0', '#F4F8F6'],
  afternoon: ['#E6EFEA', '#FBF3E2'],
  evening: ['#F8CDB2', '#FCE9D2'],
  night: ['#3B4664', '#6A6F90']
}

export function HeroScene({ slot }: { slot: Slot }): ReactElement {
  const night = slot === 'night'
  const sunY = { morning: 92, noon: 46, afternoon: 60, evening: 100, night: 50 }[slot]
  const sunX = { morning: 120, noon: 190, afternoon: 232, evening: 250, night: 228 }[slot]
  const hill1 = night ? '#56628A' : '#C9D8B6'
  const hill2 = night ? '#465075' : '#A9BF94'
  return (
    <svg className="hero-art" viewBox="0 0 380 250" role="img" aria-label="窗边的暖暖猪">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY[slot][0]} />
          <stop offset="1" stopColor={SKY[slot][1]} />
        </linearGradient>
        <clipPath id="pane">
          <rect x="72" y="22" width="216" height="150" rx="108" ry="108" />
        </clipPath>
      </defs>

      <rect x="64" y="14" width="232" height="166" rx="116" fill="var(--art-frame)" stroke="var(--art-frame-line)" strokeWidth="2" />
      <g clipPath="url(#pane)">
        <rect x="72" y="22" width="216" height="150" fill="url(#sky)" />
        {night ? (
          <g>
            <circle cx={sunX} cy={sunY} r="19" fill="#FBF0C9" />
            <circle cx={sunX + 9} cy={sunY - 5} r="17" fill={SKY.night[0]} />
            {[
              [110, 48],
              [150, 34],
              [186, 70],
              [262, 86],
              [128, 88],
              [248, 40]
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 2 ? 1.6 : 2.2} fill="#FBF0C9" opacity="0.9" />
            ))}
          </g>
        ) : (
          <g>
            <circle cx={sunX} cy={sunY} r="32" fill={slot === 'evening' ? '#F6A77E' : '#F8DE9A'} opacity="0.35" />
            <circle cx={sunX} cy={sunY} r="21" fill={slot === 'evening' ? '#EE8F62' : '#F5CE6E'} />
            <g fill="#FFFFFF" opacity="0.92">
              <path d="M96 66 q4 -14 18 -10 q8 -12 22 -2 q14 -2 12 12 z" />
              <path d="M214 96 q3 -10 14 -8 q7 -9 18 -1 q10 -1 9 9 z" opacity="0.8" />
            </g>
          </g>
        )}
        <path d="M60 150 Q120 104 190 140 T310 126 V180 H60 Z" fill={hill1} />
        <path d="M60 164 Q140 128 210 156 T310 150 V180 H60 Z" fill={hill2} />
      </g>
      <path d="M180 22 V172 M72 104 H288" stroke="var(--art-frame-line)" strokeWidth="2" opacity="0.75" />

      <path d="M22 196 H358" stroke="var(--art-desk-edge)" strokeWidth="3" strokeLinecap="round" />
      <rect x="22" y="197" width="336" height="53" fill="var(--art-desk)" />
      <rect x="22" y="197" width="336" height="7" fill="var(--art-desk-edge)" />

      <g>
        <path d="M54 196 c-3 -22 -20 -30 -24 -50 c12 6 22 20 24 36 c0 -24 8 -42 22 -52 c2 22 -8 44 -14 66 c6 -14 18 -22 30 -22 c-6 16 -22 20 -30 22z" fill="#9DB388" stroke="#6F8A5C" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M38 196 h34 l-4 30 q-13 5 -26 0z" fill="#E0A183" stroke="var(--art-line)" strokeWidth="2" strokeLinejoin="round" />
        <path d="M40 206 h30" stroke="#C9825F" strokeWidth="2" />
      </g>

      <g>
        <path d="M296 150 q-5 -9 2 -16 q7 -7 1 -15" fill="none" stroke="var(--art-steam)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M310 152 q-5 -8 2 -14 q6 -6 1 -12" fill="none" stroke="var(--art-steam)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M282 160 h44 v20 q0 16 -22 16 q-22 0 -22 -16z" fill="var(--art-paper)" stroke="var(--art-line)" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M326 166 q14 0 13 10 q-1 9 -14 8" fill="none" stroke="var(--art-line)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M298 172 c-2 -4 -8 -1 -6 3 c1 3 4 5 6 6 c2 -1 5 -3 6 -6 c2 -4 -4 -7 -6 -3z" fill="#D97757" />
      </g>

      <g transform="translate(122 96) scale(1.14)">
        <g className="pig float">
          <PigHead mood={night ? 'sleepy' : slot === 'evening' ? 'happy' : 'calm'} />
        </g>
      </g>
      <ellipse cx="160" cy="214" rx="13" ry="8" fill={PIG} stroke={LINE} strokeWidth="2.2" />
      <ellipse cx="222" cy="214" rx="13" ry="8" fill={PIG} stroke={LINE} strokeWidth="2.2" />
    </svg>
  )
}

export function StatArt({ kind }: { kind: 'urgent' | 'normal' | 'ignore' }): ReactElement {
  if (kind === 'urgent') {
    return (
      <svg className="stat-art" viewBox="0 0 92 80" aria-hidden="true">
        <path d="M46 14 c-14 0 -22 10 -22 24 v12 l-7 10 h58 l-7 -10 v-12 c0 -14 -8 -24 -22 -24z" fill="#F6CFC3" stroke="var(--art-line)" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M38 62 q8 10 16 0" fill="#EBA898" stroke="var(--art-line)" strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx="46" cy="11" r="4" fill="#D97757" stroke="var(--art-line)" strokeWidth="2" />
        <path d="M12 26 q-5 9 0 18 M80 26 q5 9 0 18" fill="none" stroke="#D97757" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'normal') {
    return (
      <svg className="stat-art" viewBox="0 0 92 80" aria-hidden="true">
        <rect x="20" y="16" width="52" height="36" rx="6" fill="var(--butter-soft)" stroke="var(--art-line)" strokeWidth="2" transform="rotate(-8 46 34)" />
        <rect x="18" y="26" width="56" height="38" rx="6" fill="var(--art-paper)" stroke="var(--art-line)" strokeWidth="2.2" />
        <path d="M18 32 l28 18 l28 -18" fill="none" stroke="var(--art-line)" strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx="46" cy="52" r="5" fill="#F1D48A" stroke="var(--art-line)" strokeWidth="1.8" />
      </svg>
    )
  }
  return (
    <svg className="stat-art" viewBox="0 0 92 80" aria-hidden="true">
      <path d="M12 42 q34 -44 68 0 q-8 -6 -17 0 q-8 -6 -17 0 q-9 -6 -17 0 q-9 -6 -17 0z" fill="#C9D8B6" stroke="var(--art-line)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M46 16 v50 q0 8 -8 8" fill="none" stroke="var(--art-line)" strokeWidth="2.4" strokeLinecap="round" />
      <g stroke="#9DB388" strokeWidth="2.2" strokeLinecap="round">
        <path d="M14 10 l-3 9" />
        <path d="M30 4 l-3 9" />
        <path d="M70 6 l-3 9" />
        <path d="M84 16 l-3 9" />
      </g>
    </svg>
  )
}

export function Vinyl(): ReactElement {
  return (
    <svg className="vinyl" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#3A322E" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="#5A4E48" strokeWidth="1" />
      <circle cx="32" cy="32" r="19" fill="none" stroke="#5A4E48" strokeWidth="1" />
      <circle cx="32" cy="32" r="12" fill="#D97757" />
      <circle cx="32" cy="32" r="8" fill="#F6CFC3" />
      <circle cx="29" cy="31" r="1" fill={LINE} />
      <circle cx="35" cy="31" r="1" fill={LINE} />
      <ellipse cx="32" cy="34.5" rx="3" ry="2" fill="#EBA898" />
      <path d="M14 20 a22 22 0 0 1 10 -9" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
    </svg>
  )
}

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const Icon = {
  home: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M4 11.5 12 4l8 7.5V19a1.5 1.5 0 0 1-1.5 1.5H15V15H9v5.5H5.500A1.5 1.5 0 0 1 4 19z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M5 5.5h14A1.5 1.5 0 0 1 20.500 7v8.500A1.500 1.500 0 0 1 19 17h-6l-4.500 3.500V17H5a1.500 1.500 0 0 1-1.500-1.500V7A1.500 1.500 0 0 1 5 5.500z" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  ),
  todo: (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="m8.500 12.200 2.400 2.400 4.600-5" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="9" y="3.500" width="6" height="10.500" rx="3" />
      <path d="M5.500 11.500a6.500 6.500 0 0 0 13 0M12 18v2.500" />
    </svg>
  ),
  note: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M6.500 3.500h8l4 4V19a1.500 1.500 0 0 1-1.500 1.500h-10.500A1.500 1.500 0 0 1 5 19V5a1.500 1.500 0 0 1 1.500-1.500z" />
      <path d="M14.500 3.500v4h4M8.500 12h7M8.500 15.500h5" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.500v2.200M12 18.300v2.200M3.500 12h2.200M18.300 12h2.200M6 6l1.600 1.600M16.400 16.400 18 18M6 18l1.600-1.600M16.400 7.600 18 6" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" {...P} strokeWidth={2.4}>
      <path d="m5.500 12.500 4.200 4.200 8.800-9.400" />
    </svg>
  ),
  left: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="m14.500 6-6 6 6 6" />
    </svg>
  ),
  right: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="m9.500 6 6 6-6 6" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="8.500" y="8.500" width="11" height="11" rx="2.500" />
      <path d="M5.500 15.500h-.500A1.500 1.500 0 0 1 3.500 14V5A1.500 1.500 0 0 1 5 3.500h9A1.500 1.500 0 0 1 15.500 5v.500" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.800v12.400a.800.800 0 0 0 1.200.700l10-6.200a.800.800 0 0 0 0-1.400l-10-6.200A.800.800 0 0 0 8 5.800z" />
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.500 6.500l2.500 2.500M15 15l2.500 2.500M6.500 17.500 9 15M15 9l2.500-2.500" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M12 5.500v13M5.500 12h13" />
    </svg>
  ),
  people: (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c0-3.2 2.4-5.4 5.5-5.4s5.5 2.2 5.5 5.4M15.5 5.7a3 3 0 0 1 0 5.6M17 14.5c2.2.5 3.5 2.3 3.5 5" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M5 7h14M10 7V4.500h4V7M7 7l.800 12a1.500 1.500 0 0 0 1.500 1.400h5.400a1.500 1.500 0 0 0 1.500-1.400L17 7" />
    </svg>
  )
}
