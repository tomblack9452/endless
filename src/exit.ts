// Android's back button at the top of the game (the title or welcome screen):
// with "ask before closing" on, a small dialog asks first; back again while it
// shows means stay. On the web there's nothing to leave to.

export type ExitChoice = 'stay' | 'ask' | 'exit' | 'none';

/**
 * What back at the top does. `native`: the Android app; `ask`: the "ask before
 * closing" setting; `asking`: the dialog is already up.
 */
export function exitChoice(o: { native: boolean; ask: boolean; asking: boolean }): ExitChoice {
  if (o.asking) return 'stay';
  if (!o.native) return 'none';
  return o.ask ? 'ask' : 'exit';
}
