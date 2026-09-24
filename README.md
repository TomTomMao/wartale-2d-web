# Ironbound Chronicles — 2D Wartales-like Browser RPG

A playable 2D tactical mercenary RPG prototype inspired by the **structure and game loop** of Wartales, with original names, world, UI and content.

## What is playable

- Large scrolling overworld with three visually distinct regions
- Towns and discoverable points of interest
- Moving hostile parties that wander/chase the player
- World encounters with fight/flee choice
- Tactical grid battles with blocked cells, reachable tiles, attack-range highlights and animated enemy turns
- Mercenary party and equipment/inventory progression
- Contract flow and quest rewards
- Tavern recruitment, market provisions and blacksmith repairs
- Camp, food, wages, morale and resting
- Save/load in browser storage
- Vitest unit tests and Playwright browser tests
- GitHub Actions CI

This is an MVP: system completeness is prioritized over large content quantity.

## Run

```bash
npm ci
npm run dev
```

## Build and test

```bash
npm run build
npm test
npm run test:e2e
```

## Controls

World: WASD move, left click move, mouse wheel zoom, I inventory, Q contracts, R camp. Click a nearby town marker to enter.

Battle: select a mercenary from the field or roster; tap a blue tile to move and a highlighted enemy to attack. Skills spend shared Valor. Guard or Space/End Unit finishes the activation; N selects the next ready unit, and Escape cancels skill targeting. Guard and End Unit remain visible on narrow screens. The next ready mercenary is selected automatically.

## Architecture

- `src/types.ts` — domain types
- `src/data.ts` — balance/content data
- `src/domain.ts` — pure gameplay rules
- `src/store.ts` — persistence
- `src/game.ts` — Phaser world and tactical battle
- `src/main.ts` — UI and orchestration
- `tests/domain.test.ts` — unit tests
- `tests/e2e/game.spec.ts` — Playwright smoke scenarios


## Mobile browser

The game supports touch-first play on modern mobile browsers.

- Tap the world to move the company.
- Use the fixed bottom navigation for Company, Contracts, Knowledge, Camp and Save.
- Town, inventory, camp and knowledge screens open as mobile bottom sheets.
- In battle, tap a blue unit, tap a valid location to move, then tap an enemy to attack.
- Battle actions are fixed above the safe-area at the bottom of the screen.
- Responsive tactical deployment keeps both sides visible on narrow portrait displays.
- iPhone-sized Chromium touch emulation is covered by Playwright CI.


## Tactical and interface update

- A new frontier title screen, company journal, labeled resource counters, minimap, pixel portraits and collapsible mercenary details.
- Menus pause overworld movement and patrols. Encounter and battle result screens cannot be dismissed into a stuck state.
- Cell-sized battle hit targets and an action lock prevent missed movement taps and duplicate attacks. Enemy movement follows each step of a valid route.
- Rotation preserves the battlefield and unit positions. Turn controls stay separate from the horizontally scrolling skill list.
- Defeated units leave the battlefield immediately. Victories grant 35 XP per surviving mercenary, loot and contract progress exactly once.
- Each class starts with compatible equipment. Armor swaps preserve condition; repairs restore armor as well as equipment durability.
- Food, repair kits and armor reinforcement can be used from the pack. Rest also heals animal companions.
- Profession work is available once per mercenary per day; rest starts a new day. Knowledge perks now affect food consumption, suspicion, trading and tomb research.
- Selling goods in the same town returns less than the buying price. Trading between regions can still be profitable.
- Existing saves are retained; duplicate old item IDs are migrated. Invalid saves and unavailable browser storage are handled without crashing the game.

### Verification

The suite covers 63 unit tests and 14 Chromium browser scenarios, including real battle inputs through victory, contract rewards, saving and reloading. Mobile checks cover a 390×844 touch viewport and rotation to landscape. These checks are browser emulation, not physical iPhone/Safari testing.

See [CHANGELOG.md](CHANGELOG.md) for the bug fixes and intentional rule changes.
