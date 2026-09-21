import type { ReactElement } from 'react';

export type IconName =
  | 'selfie'
  | 'rear'
  | 'flip'
  | 'help'
  | 'debug'
  | 'lock'
  | 'unlock'
  | 'clear'
  | 'record'
  | 'stop'
  | 'download'
  | 'share'
  | 'trash'
  | 'retake'
  | 'close'
  | 'alert'
  | 'shield'
  | 'hand'
  | 'arrowLeft';

// Square caps + mitred joins give the set a slightly industrial, pixel-adjacent character.
const PATHS: Record<IconName, ReactElement> = {
  selfie: (
    <>
      <rect x="3" y="3" width="18" height="18" />
      <circle cx="12" cy="10" r="3.2" />
      <path d="M6.5 19c1.2-2.7 3.1-4 5.5-4s4.3 1.3 5.5 4" />
    </>
  ),
  rear: (
    <>
      <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  flip: (
    <>
      <path d="M4 9a8 8 0 0 1 14.5-3.5L20 7" />
      <path d="M20 3v4h-4" />
      <path d="M20 15a8 8 0 0 1-14.5 3.5L4 17" />
      <path d="M4 21v-4h4" />
    </>
  ),
  help: (
    <>
      <rect x="3" y="3" width="18" height="18" />
      <path d="M9.2 9.2A2.8 2.8 0 1 1 12 12v2" />
      <path d="M12 17.2v.6" />
    </>
  ),
  debug: (
    <>
      <path d="M3 3h6M3 3v6M21 3h-6M21 3v6M3 21h6M3 21v-6M21 21h-6M21 21v-6" />
      <path d="M8 12h8M12 8v8" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <path d="M12 15v2" />
    </>
  ),
  unlock: (
    <>
      <rect x="4" y="11" width="16" height="10" />
      <path d="M8 11V7a4 4 0 0 1 7.6-1.8" />
      <path d="M12 15v2" />
    </>
  ),
  clear: (
    <>
      <rect x="3" y="3" width="18" height="18" strokeDasharray="3 3" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
    </>
  ),
  record: <circle cx="12" cy="12" r="7" />,
  stop: <rect x="6" y="6" width="12" height="12" fill="currentColor" />,
  download: (
    <>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V3" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 12v9h14v-9" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 14h10l1-14" />
    </>
  ),
  retake: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 3v5h5" />
    </>
  ),
  close: <path d="M5 5l14 14M19 5L5 19" />,
  alert: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 17.5v.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  hand: (
    <>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7-2.6 0-4.3-1.4-5.6-3.6L3.2 14a1.5 1.5 0 0 1 2.6-1.5L8 15" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M20 12H4" />
      <path d="M10 6l-6 6 6 6" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 22, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
