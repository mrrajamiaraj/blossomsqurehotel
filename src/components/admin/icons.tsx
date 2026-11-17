import type { ReactNode } from "react";

type P = { size?: number; className?: string };

function I({ size = 18, className, children }: P & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IToday = (p: P) => (
  <I {...p}>
    <path d="M3 11l9-7 9 7M5 10v10h14V10" />
  </I>
);
export const IBookings = (p: P) => (
  <I {...p}>
    <path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h4" />
  </I>
);
export const ICalendar = (p: P) => (
  <I {...p}>
    <rect x="3" y="5" width="18" height="16" rx="1.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </I>
);
export const IRooms = (p: P) => (
  <I {...p}>
    <path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" />
  </I>
);
export const IInbox = (p: P) => (
  <I {...p}>
    <path d="M3 13l3-8h12l3 8v6H3zM3 13h5l1.5 2.5h5L16 13h5" />
  </I>
);
export const IGuests = (p: P) => (
  <I {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.2 3.2 0 0 1 0 6.3M21 20a6 6 0 0 0-4-5.6" />
  </I>
);
export const ISettings = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </I>
);
export const ISearch = (p: P) => (
  <I {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </I>
);
export const IPlus = (p: P) => (
  <I {...p}>
    <path d="M12 5v14M5 12h14" />
  </I>
);
export const IMenu = (p: P) => (
  <I {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </I>
);
export const IClose = (p: P) => (
  <I {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </I>
);
export const ILogout = (p: P) => (
  <I {...p}>
    <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />
  </I>
);
export const IExternal = (p: P) => (
  <I {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
  </I>
);
export const IChevronLeft = (p: P) => (
  <I {...p}>
    <path d="M15 5l-7 7 7 7" />
  </I>
);
export const IChevronRight = (p: P) => (
  <I {...p}>
    <path d="M9 5l7 7-7 7" />
  </I>
);
export const IArrowRight = (p: P) => (
  <I {...p}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </I>
);
export const IAlert = (p: P) => (
  <I {...p}>
    <path d="M12 3l10 18H2zM12 10v5M12 18h.01" />
  </I>
);
export const IBroom = (p: P) => (
  <I {...p}>
    <path d="M14 4l6 6M12 6l6 6-7 7H5v-6zM8 13l3 3" />
  </I>
);
export const IPrint = (p: P) => (
  <I {...p}>
    <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" />
    <rect x="6" y="14" width="12" height="7" />
  </I>
);
export const IReports = (p: P) => (
  <I {...p}>
    <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6M20 16V6" />
  </I>
);
export const IDownload = (p: P) => (
  <I {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </I>
);
export const ICommand = (p: P) => (
  <I {...p}>
    <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />
  </I>
);
export const IUp = (p: P) => (
  <I {...p}>
    <path d="M7 14l5-5 5 5" />
  </I>
);
export const IDown = (p: P) => (
  <I {...p}>
    <path d="M7 10l5 5 5-5" />
  </I>
);
export const IKey = (p: P) => (
  <I {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9M17 6l3 3M14 9l2 2" />
  </I>
);
