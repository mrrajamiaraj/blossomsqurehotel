import type { ReactNode } from "react";

type IconProps = { size?: number; strokeWidth?: number; className?: string };

function Icon({ size = 24, strokeWidth = 1.3, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => (
  <Icon size={18} {...p} className={`arrow ${p.className ?? ""}`}>
    <path d="M3 12h18M15 6l6 6-6 6" />
  </Icon>
);

export const ArrowLeft = (p: IconProps) => (
  <Icon size={18} {...p}>
    <path d="M21 12H3M9 6l-6 6 6 6" />
  </Icon>
);

export const ArrowUpRight = (p: IconProps) => (
  <Icon size={16} {...p}>
    <path d="M7 17L17 7M8 7h9v9" />
  </Icon>
);

export const ArrowUp = (p: IconProps) => (
  <Icon size={18} {...p}>
    <path d="M12 21V3M6 9l6-6 6 6" />
  </Icon>
);

export const ChevronLeft = (p: IconProps) => (
  <Icon size={20} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const ChevronRight = (p: IconProps) => (
  <Icon size={20} {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const ChevronDown = (p: IconProps) => (
  <Icon size={16} {...p}>
    <path d="M5 9l7 7 7-7" />
  </Icon>
);

export const Close = (p: IconProps) => (
  <Icon size={22} {...p}>
    <path d="M5 5l14 14M19 5L5 19" />
  </Icon>
);

export const Plus = (p: IconProps) => (
  <Icon size={16} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const Minus = (p: IconProps) => (
  <Icon size={16} {...p}>
    <path d="M5 12h14" />
  </Icon>
);

export const Check = (p: IconProps) => (
  <Icon size={16} strokeWidth={1.6} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const Calendar = (p: IconProps) => (
  <Icon size={18} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="1" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const Guests = (p: IconProps) => (
  <Icon size={18} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0M16 4.5a3 3 0 0 1 0 6M18 14.5a5.5 5.5 0 0 1 3 5" />
  </Icon>
);

export const Phone = (p: IconProps) => (
  <Icon size={18} {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </Icon>
);

export const Mail = (p: IconProps) => (
  <Icon size={18} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1" />
    <path d="M3.5 6l8.5 7 8.5-7" />
  </Icon>
);

export const Pin = (p: IconProps) => (
  <Icon size={18} {...p}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
);

export const Copy = (p: IconProps) => (
  <Icon size={16} {...p}>
    <rect x="8" y="8" width="12" height="12" rx="1" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
  </Icon>
);

export const Lock = (p: IconProps) => (
  <Icon size={16} {...p}>
    <rect x="5" y="11" width="14" height="10" rx="1" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const Grid = (p: IconProps) => (
  <Icon size={16} {...p}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </Icon>
);

export const Bed = (p: IconProps) => (
  <Icon size={18} {...p}>
    <path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" />
    <circle cx="7" cy="11" r="1.6" />
  </Icon>
);

export const Info = (p: IconProps) => (
  <Icon size={18} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v5h1" />
  </Icon>
);

export const Print = (p: IconProps) => (
  <Icon size={16} {...p}>
    <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" />
    <rect x="6" y="14" width="12" height="7" />
  </Icon>
);

/** Single-path line icon, for data-driven lists such as amenities. */
export const PathIcon = ({ d, ...p }: IconProps & { d: string }) => (
  <Icon {...p}>
    <path d={d} pathLength={1} />
  </Icon>
);

/** The hotel's mark: a four-petal blossom drawn in one line. */
export const Monogram = ({ size = 40, className }: { size?: number; className?: string }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
    <g stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <path d="M24 24c0-7 3-12 0-17-3 5 0 10 0 17zM24 24c7 0 12 3 17 0-5-3-10 0-17 0zM24 24c0 7-3 12 0 17 3-5 0-10 0-17zM24 24c-7 0-12-3-17 0 5 3 10 0 17 0z" />
      <circle cx="24" cy="24" r="22.5" opacity="0.5" />
      <circle cx="24" cy="24" r="1.6" fill="currentColor" stroke="none" />
    </g>
  </svg>
);
