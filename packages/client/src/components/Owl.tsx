type OwlMood = 'happy' | 'thinking' | 'sleeping' | 'celebrating' | 'confused';

interface OwlProps {
  mood?: OwlMood;
  size?: number;
  /** Gently bob up and down — off when the reader prefers reduced motion. */
  bob?: boolean;
}

/**
 * The mascot, drawn in the theme's colours so it changes with dark mode.
 * Decorative everywhere it appears: the text next to it says what it means.
 */
export function Owl({ mood = 'happy', size = 120, bob = false }: OwlProps) {
  const wingsUp = mood === 'celebrating';
  return (
    <svg
      viewBox="0 0 120 124"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={bob ? 'owl-bob' : undefined}
    >
      {mood === 'celebrating' && <Confetti />}
      {/* Ear tufts */}
      <path d="M31 33 L24 9 L47 24 Z" fill="var(--owl-feather-dark)" />
      <path d="M89 33 L96 9 L73 24 Z" fill="var(--owl-feather-dark)" />
      {/* Wings */}
      {wingsUp ? (
        <>
          <path
            d="M22 62 C 6 54 2 34 10 24 C 18 34 26 44 32 56 Z"
            fill="var(--owl-feather-dark)"
          />
          <path
            d="M98 62 C 114 54 118 34 110 24 C 102 34 94 44 88 56 Z"
            fill="var(--owl-feather-dark)"
          />
        </>
      ) : (
        <>
          <path
            d="M22 60 C 10 74 13 94 28 102 C 25 88 25 74 30 62 Z"
            fill="var(--owl-feather-dark)"
          />
          <path
            d="M98 60 C 110 74 107 94 92 102 C 95 88 95 74 90 62 Z"
            fill="var(--owl-feather-dark)"
          />
        </>
      )}
      {/* Body */}
      <path
        d="M60 18 C 88 18 102 40 102 68 C 102 96 84 112 60 112 C 36 112 18 96 18 68 C 18 40 32 18 60 18 Z"
        fill="var(--owl-feather)"
      />
      {/* Belly with a few feathers */}
      <ellipse cx="60" cy="84" rx="27" ry="24" fill="var(--owl-belly)" />
      <g
        fill="none"
        stroke="var(--owl-feather)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      >
        <path d="M48 80 l4 4 l4 -4" />
        <path d="M64 80 l4 4 l4 -4" />
        <path d="M56 92 l4 4 l4 -4" />
      </g>
      {/* Feet */}
      <g fill="var(--owl-beak)">
        <path d="M46 110 h10 l-2 6 h-6 Z" />
        <path d="M64 110 h10 l-2 6 h-6 Z" />
      </g>
      <Eyes mood={mood} />
      {/* Beak */}
      <path d="M60 60 L53 68 L60 77 L67 68 Z" fill="var(--owl-beak)" />
      {mood === 'sleeping' && (
        <text
          x="96"
          y="22"
          fontSize="16"
          fontWeight="800"
          fill="var(--owl-muted)"
        >
          z
          <tspan x="106" y="12" fontSize="11">
            z
          </tspan>
        </text>
      )}
      {(mood === 'thinking' || mood === 'confused') && (
        <text
          x="98"
          y="26"
          fontSize="20"
          fontWeight="900"
          fill="var(--owl-brand)"
        >
          ?
        </text>
      )}
    </svg>
  );
}

function Eyes({ mood }: { mood: OwlMood }) {
  if (mood === 'sleeping' || mood === 'celebrating') {
    // Closed eyes: the lids sag when asleep and arch when celebrating.
    const [left, right] =
      mood === 'sleeping'
        ? ['M33 52 Q42 58 51 52', 'M69 52 Q78 58 87 52']
        : ['M34 54 Q42 44 50 54', 'M70 54 Q78 44 86 54'];
    return (
      <g
        fill="none"
        stroke="var(--owl-feather-dark)"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <circle cx="42" cy="50" r="15" fill="var(--owl-eye)" stroke="none" />
        <circle cx="78" cy="50" r="15" fill="var(--owl-eye)" stroke="none" />
        <path d={left} />
        <path d={right} />
      </g>
    );
  }
  // Where the pupils look, and how big the irises are.
  const look = mood === 'thinking' ? { x: -3, y: -4 } : { x: 0, y: 1 };
  const left = mood === 'confused' ? 7 : 9;
  const right = mood === 'confused' ? 11 : 9;
  return (
    <g className="owl-eyes">
      <circle cx="42" cy="50" r="15" fill="var(--owl-eye)" />
      <circle cx="78" cy="50" r="15" fill="var(--owl-eye)" />
      <circle
        cx={42 + look.x}
        cy={50 + look.y}
        r={left}
        fill="var(--owl-iris)"
      />
      <circle
        cx={78 + look.x}
        cy={50 + look.y}
        r={right}
        fill="var(--owl-iris)"
      />
      <circle
        cx={42 + look.x}
        cy={50 + look.y}
        r={left * 0.55}
        fill="#2a2118"
      />
      <circle
        cx={78 + look.x}
        cy={50 + look.y}
        r={right * 0.55}
        fill="#2a2118"
      />
      <circle cx={40 + look.x} cy={47 + look.y} r="1.8" fill="#ffffff" />
      <circle cx={76 + look.x} cy={47 + look.y} r="1.8" fill="#ffffff" />
    </g>
  );
}

function Confetti() {
  const pieces: [number, number, string, number][] = [
    [14, 14, 'var(--owl-yes)', 20],
    [104, 16, 'var(--owl-maybe)', -30],
    [8, 44, 'var(--owl-brand)', 45],
    [112, 46, 'var(--owl-yes)', 10],
    [24, 4, 'var(--owl-maybe)', -15],
    [96, 4, 'var(--owl-brand)', 60],
  ];
  return (
    <g>
      {pieces.map(([x, y, fill, rotate]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="6"
          height="3"
          rx="1"
          fill={fill}
          transform={`rotate(${rotate} ${x + 3} ${y + 1.5})`}
        />
      ))}
    </g>
  );
}
