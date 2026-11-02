import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'home' | 'movement' | 'card' | 'chart' | 'goal' | 'search' | 'filter' | 'plus'
  | 'arrow' | 'calendar' | 'wallet' | 'bell' | 'chevron' | 'eye' | 'dots' | 'check'
  | 'receipt' | 'bag' | 'fork' | 'glass' | 'scooter' | 'car' | 'help' | 'mail'
  | 'upload' | 'warning' | 'lock' | 'logout' | 'settings' | 'trash' | 'edit'
  | 'refresh' | 'close' | 'info' | 'bank' | 'coins' | 'sparkles' | 'link' | 'unlink'
  | 'download' | 'spinner' | 'shield' | 'clock' | 'arrowDown' | 'arrowUp'

const PATHS: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-7h6v7" /></>,
  movement: <><path d="M4 7h13" /><path d="m14 4 3 3-3 3" /><path d="M20 17H7" /><path d="m10 14-3 3 3 3" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18" /><path d="M7 15h4" /></>,
  chart: <><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19H2" /></>,
  goal: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="m14 10 6-6" /><path d="M16 4h4v4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  filter: <><path d="M4 6h16" /><path d="M7 12h10" /><path d="M10 18h4" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  wallet: <><path d="M4 6.5h14a2 2 0 0 1 2 2V19H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h11v3" /><path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z" /></>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" /><path d="M10 20h4" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  dots: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
  bag: <><path d="M5 8h14l-1 13H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  fork: <><path d="M7 3v7a2 2 0 0 0 4 0V3" /><path d="M9 10v11" /><path d="M17 3c-2 2-2 5 0 7v11" /></>,
  glass: <><path d="M5 4h14l-7 8v7" /><path d="M9 21h8" /></>,
  scooter: <><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.5 18h7" /><path d="M14 5h2l2 13" /></>,
  car: <><path d="M4 16V11l2-5h12l2 5v5" /><path d="M4 16h16v3h-2" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="16.5" cy="19" r="1.5" /><path d="M4 12h16" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7v.5" /><path d="M12 17h.01" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
  upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
  warning: <><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.4-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></>,
  close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  bank: <><path d="M3 10 12 4l9 6" /><path d="M5 10v9h14v-9" /><path d="M9 19v-5h6v5" /></>,
  coins: <><circle cx="9" cy="9" r="5" /><path d="M14.5 5.6a5 5 0 1 1 0 12.8" /><path d="M9 7v4M7.5 8.5h3" /></>,
  sparkles: <><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" /><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8Z" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></>,
  unlink: <><path d="M15 7l2-2a5 5 0 0 1 7 7l-2 2" /><path d="M9 17l-2 2a5 5 0 0 1-7-7l2-2" /><path d="m3 3 18 18" /></>,
  download: <><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></>,
  spinner: <><path d="M12 3a9 9 0 1 0 9 9" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6Z" /><path d="m9 12 2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  arrowDown: <><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></>,
  arrowUp: <><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>,
}

export function Icon({
  name,
  size = 20,
  className,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}

export function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <i /><i /><i />
    </span>
  )
}
