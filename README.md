# Ironbound Chronicles — 2D Wartales-like Browser RPG

A playable 2D tactical mercenary RPG prototype inspired by the **structure and game loop** of Wartales, with original names, world, UI and content.

## What is playable

- Large scrolling overworld with three visually distinct regions
- Towns and discoverable points of interest
- Moving hostile parties that wander/chase the player
- World encounters with fight/flee choice
- Tactical battle scene with free-radius movement, armor/HP, guard and enemy AI
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
npm install
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

Battle: click a blue mercenary, click ground to move, click a nearby red enemy to attack, Guard or Space/End Unit to finish an action.

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
