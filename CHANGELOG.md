# Tactical gameplay and interface update

## Fixes

- Restored the TypeScript production build by narrowing optional equipment slots before indexing.
- Reconstructed full paths before applying movement limits; enemy units no longer jump to the end of distant routes.
- Reduced battle hitboxes to one cell and locked inputs during movement, attacks and enemy turns.
- Prevented duplicate battle completion rewards and stale world pointer/wheel listeners after encounters.
- Paused world movement, encounters and patrols while a modal is open. Protected encounter/result dialogs from Escape soft locks.
- Preserved tactical cells and obstacle locations on resize/rotation. Limited animal deployment to distinct available cells.
- Removed the undocumented extra-hit “Dying” behavior. Units at zero HP disappear and release their cells immediately.
- Fixed starting equipment/class mismatches, missing starting armor bonuses, armor-swapping repairs, blacksmith armor repairs and resting animal health.
- Generated distinct IDs for mercenaries and loot across reloads; migrated duplicate item IDs in old saves.
- Escaped player company names in the HUD and handled storage failures and malformed saves.
- Applied permadeath on defeat as well as victory. A company with no mercenaries is offered a new start.

## Interface and gameplay

- Frontier title art, a consistent icon set, pixel portraits, a live objective, a minimap and compact company cards.
- Automatic next-unit selection, visible ready/spent states, movement/attack highlights, damage numbers and sequential animated enemy turns.
- Persistent Guard/End Unit controls on mobile, scrollable skills, clear disabled states, help, focus outlines and keyboard shortcuts.
- Victory XP (35 per surviving mercenary), consumable pack supplies, functional knowledge perks and once-per-day profession work.
- Regional trade has a buy/sell spread instead of an unlimited same-town money loop.
- Poison weapon oil and critical hits now affect attacks; spear-wall kills stop the dead attacker from striking.

## Validation

- 63 passing Vitest tests.
- 14 passing Chromium Playwright scenarios, including a complete fight/loot/contract/save/reload loop.
- Production TypeScript and Vite build passed.
- Desktop, portrait mobile and rotated landscape layouts inspected from screenshots.
- CI uses the committed dependency lockfile and retains browser evidence.

## Intentional limits

This remains an original browser RPG prototype. It is not full feature parity with Wartales. Battles deploy up to six mercenaries and two animal companions; extra company members stay in reserve. Battle state is not saved mid-fight. Range checks do not yet implement line of sight. Physical-device Safari testing has not been performed.
