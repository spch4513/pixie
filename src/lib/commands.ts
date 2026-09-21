/**
 * Every user intent flows through one typed command. Buttons and keyboard shortcuts are
 * command *sources* today; a voice source (e.g. Web Speech API) can be added later by
 * mapping recognised phrases to these same commands — no UI or engine changes required.
 */
export type PixieCommand =
  | { type: 'lock' }
  | { type: 'unlock' }
  | { type: 'toggle-lock' }
  | { type: 'clear' }
  | { type: 'photo' }
  | { type: 'toggle-record' }
  | { type: 'flip-camera' }
  | { type: 'set-detail'; value: number }
  | { type: 'nudge-detail'; delta: number }
  | { type: 'help' }
  | { type: 'toggle-debug' };

export type CommandSource = 'touch' | 'keyboard' | 'voice';
export type CommandHandler = (command: PixieCommand, source: CommandSource) => void;

/** Keyboard shortcuts (ignored while typing in a field or using a modifier). */
export function commandForKey(e: KeyboardEvent): PixieCommand | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const target = e.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return null;
  switch (e.key.toLowerCase()) {
    case 'l':
      return { type: 'toggle-lock' };
    case 'x':
    case 'backspace':
      return { type: 'clear' };
    case 'p':
      return { type: 'photo' };
    case 'r':
      return { type: 'toggle-record' };
    case 'f':
      return { type: 'flip-camera' };
    case '[':
      return { type: 'nudge-detail', delta: -0.1 };
    case ']':
      return { type: 'nudge-detail', delta: 0.1 };
    case '?':
    case 'h':
      return { type: 'help' };
    case '`':
      return { type: 'toggle-debug' };
    default:
      return null;
  }
}

/** Phrase table a future voice source could use. Kept here so the vocabulary lives with the commands. */
export const VOICE_PHRASES: Readonly<Record<string, PixieCommand>> = {
  lock: { type: 'lock' },
  hold: { type: 'lock' },
  unlock: { type: 'unlock' },
  release: { type: 'unlock' },
  clear: { type: 'clear' },
  photo: { type: 'photo' },
  cheese: { type: 'photo' },
  record: { type: 'toggle-record' },
  stop: { type: 'toggle-record' },
  flip: { type: 'flip-camera' },
};
