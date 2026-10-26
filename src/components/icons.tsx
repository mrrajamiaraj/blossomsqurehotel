import type { ReactNode } from "react";

type IconProps = { size?: number; strokeWidth?: number; stroke?: string; className?: string };

function Icon({
  size = 24,
  strokeWidth = 1.6,
  stroke = "currentColor",
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
);

export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </Icon>
);

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const ArrowIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const BedIcon = (p: IconProps) => (
  <Icon strokeWidth={1.5} {...p}>
    <path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" />
    <circle cx="7" cy="11" r="1.6" />
  </Icon>
);

export const SizeIcon = (p: IconProps) => (
  <Icon strokeWidth={1.5} {...p}>
    <path d="M4 4h6M4 4v6M20 20h-6M20 20v-6M4 4l16 16" />
  </Icon>
);

export const GuestIcon = (p: IconProps) => (
  <Icon strokeWidth={1.5} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
  </Icon>
);

/** Single-path line icon, for data-driven lists such as amenities. */
export const PathIcon = ({ d, ...p }: IconProps & { d: string }) => (
  <Icon strokeWidth={1.5} {...p}>
    <path d={d} />
  </Icon>
);
