# Ironbound Chronicles — 2D Wartales-like Browser RPG

A playable 2D tactical mercenary RPG prototype inspired by the **structure and game loop** of Wartales, with original names, world, UI and content.

## What is playable

- Large scrolling overworld with three visually distinct regions
- Eleven enterable and revisitable locations, with gathering, caches, garrison battles and tomb rooms
- Moving hostile parties that wander/chase the player
- World encounters with fight/flee choice
- Tactical grid battles with blocked cells, reachable tiles, attack-range highlights and animated enemy turns
- Mercenary party and equipment/inventory progression
- Contract flow and quest rewards
- Tavern recruitment, material markets, seven equipment recipes and upgrades to +3
- Seven professions with resource production, passive benefits and persistent trade experience
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

World: WASD move, left click move, mouse wheel zoom, I inventory, Q contracts, R camp. Click any location marker to walk there and enter on arrival. Use **Explore** to choose a destination, or **E / Enter nearby** to revisit a location.

Battle: select a mercenary from the field or roster; tap a blue tile to move and a highlighted enemy to attack. Skills spend shared Valor. Guard or Space/End Unit finishes the activation; N selects the next ready unit, and Escape cancels skill targeting. Guard and End Unit remain visible on narrow screens. The next ready mercenary is selected automatically.

## Architecture

- `src/types.ts` — domain types
- `src/data.ts` — balance/content data
- `src/domain.ts` — pure gameplay rules
- `src/systems.ts` — professions, camp, crafting and company systems
- `src/locations.ts` — exploration, gathering, caches and garrisons
- `src/forging.ts` — equipment recipes and upgrades
- `src/resources.ts` — shared costs and material supplies
- `src/store.ts` — persistence
- `src/game.ts` — Phaser world and tactical battle
- `src/main.ts` — UI and orchestration
- `tests/domain.test.ts` — unit tests
- `tests/e2e/game.spec.ts` — Playwright smoke scenarios


## Mobile browser

The game supports touch-first play on modern mobile browsers.

- Tap the world to move the company.
- Use the fixed bottom navigation for Company, Explore, Contracts, Knowledge, Camp and Save.
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

The suite covers 106 unit tests and 20 Chromium browser scenarios, including real battle inputs through victory, contract rewards, saving and reloading. Mobile checks cover a 390×844 touch viewport and rotation to landscape. These checks are browser emulation, not physical iPhone/Safari testing.

See [CHANGELOG.md](CHANGELOG.md) for the bug fixes and intentional rule changes.


## Professions, exploration and forging

Open **Company → Professions & daily work** to choose each companion’s trade. Daily work is limited to once per companion per day, including after changing professions. Rest refreshes daily work and location gathering. Switching trades preserves their individual levels and XP. Production recipes consume materials and can be repeated while supplies last; the best assigned specialist performs the recipe.

| Profession | Gameplay effects |
|---|---|
| Blacksmith | Repairs the whole company for 1 iron; forges equipment; upgrades weapons and armor. |
| Cook | Converts 2 grain + 1 wood into 7–11 provisions (+2 with a Cooking Pot); reduces rest food by 1, or 2 at Lv 4; gathers extra grain. |
| Miner | Daily prospecting yields 3–7 iron; adds 2 iron per profession level to mine gathering. |
| Alchemist | Crafts medicine and poison oil; yields two doses at Lv 3. Medicine treats injuries. |
| Tinkerer | Produces repair kits, adds torches to each recipe, gathers extra timber; armor reinforcement unlocks at Lv 2. |
| Scholar | Daily knowledge research, +15 with a Lectern; +10 knowledge per level in each tomb room; extra battlefield research. |
| Thief | Opens caches without paying iron; earns crowns from daily fencing; reduces suspicion from market theft. |

**Explore** opens the field journal. All 11 locations can be entered and revisited, including those already discovered in old saves. The Old Mill yields grain and timber; the Iron Mine yields ore. Both refresh after resting. The Bandit Camp and Ruined Keep have garrisons that must be defeated before searching. Battlefield salvage and locked caches are one-time rewards. Cleared tombs remain accessible, but cannot pay out again.

**Camp / Town / Company → Forge & Upgrade** opens the equipment workshop. Assign a Blacksmith, gather materials or buy bundles at a town market, then forge a sword, axe, bow, spear, dagger or armor. Equipment is added to the pack; choose a compatible companion in Company to equip it. Existing equipped and pack gear can both be upgraded:

| Upgrade | Required Blacksmith | Cost | Benefit |
|---|---|---|---|
| +1 | Lv 1 | 12 crowns, 2 iron, 1 wood (weapon) or leather (armor) | +2 power or +3 armor |
| +2 | Lv 2 | 24 crowns, 4 iron, 2 wood or leather | Another +2 power or +3 armor |
| +3 | Lv 3 | 36 crowns, 6 iron, 3 wood or leather | Another +2 power or +3 armor |

Upgrades preserve damage and innate armor bonuses; repairing is a separate action. Forge recipes award 20 profession XP, upgrades 25. Old saves keep equipment, professions, completed tombs and discoveries; new location progress is initialized on entry.
