# Core Wartales-like Parity Checklist

Updated: 2026-09-23

This project is an **original browser RPG inspired by the high-level gameplay structure of Wartales**. It does not copy Wartales maps, characters, quests, dialogue, art, UI, music, or proprietary data.

## Scope used for this parity loop

"Core parity" means publicly documented, single-player systems that materially affect the main mercenary-company gameplay loop have a working original implementation.

Explicitly outside this pass:
- multiplayer/co-op
- DLC-exclusive systems
- exact Wartales story, regions, factions, quests, encounters, balance, UI, art, audio, names or data
- advanced Path ending quest chains
- complete region scenario chains
- full building-interior exploration
- fishing spots
- piton/cliff traversal
- full arena chains
- exact skill trees and class balance

## Core system checklist

| System | Status | Original implementation |
|---|---|---|
| Open-world travel | ✅ | Large multi-region overworld with moving parties and POIs |
| Roads affect travel | ✅ | Road proximity reduces fatigue accumulation |
| Towns / mines / camps / tombs | ✅ | Interactive world locations |
| Contracts / bounties | ✅ | Contract lifecycle and bounty turn-ins |
| Recruitment | ✅ | Crowns + Influence recruitment cost |
| Influence | ✅ | Earned by contracts, spent on recruitment |
| Classes | ✅ | Five playable mercenary classes |
| Specializations | ✅ | Two original specializations per class at level 3 |
| Skills / skill points | ✅ | Level-earned skill points and class abilities |
| Traits / personalities | ✅ | Traits modify combat, food, or wages |
| Appearance customization | ✅ | Per-mercenary appearance variants |
| Equipment | ✅ | Weapons, armor, rarity, durability and comparison loop |
| Weapon/class compatibility | ✅ | Weapon families restricted to appropriate classes |
| Weight / carrying capacity | ✅ | Inventory weight, mercenary capacity and pack ponies |
| Tactical turn combat | ✅ | Free-radius movement and activations |
| Attack range | ✅ | Distinct ranged, spear and melee ranges |
| Engagement | ✅ | Melee units engage on attack |
| Disengagement attack | ✅ | Opportunity damage when leaving engagement |
| Facing / back attacks | ✅ | Rear attacks gain damage bonus |
| Ally adjacency defense | ✅ | Nearby allies reduce incoming damage |
| Surrounding bonus | ✅ | Multiple nearby allies increase damage |
| Status effects | ✅ | Poison and Bleeding damage-over-time |
| Dying state | ✅ | First lethal hit can enter Dying before death |
| Permadeath option | ✅ | Optional permanent mercenary removal |
| Valor | ✅ | Rest restoration and combat Valor ability |
| Armor / HP | ✅ | Separate armor and health layers |
| Injuries | ✅ | Defeat/Dying injuries and medicine treatment |
| Difficulty | ✅ | Easy/Normal/Hard affect encounter strength |
| Adaptive / Region Locked | ✅ | User-selectable encounter scaling mode |
| Fatigue | ✅ | Travel fatigue and camp reset |
| Food | ✅ | Rest consumes party + animal food |
| Wages | ✅ | Periodic wages, including Greedy trait effect |
| Morale | ✅ | Survival and wage consequences |
| Camp | ✅ | Rest and company management |
| Camp facilities | ✅ | Campfire, Tent, Workshop, Cooking Pot, Lectern, Strategy Table, Training Dummy, Stocks |
| Camp facility effects | ✅ | Food efficiency, production, training, Valor, prisoner security |
| Professions | ✅ | Tinkerer, Blacksmith, Cook, Alchemist, Miner, Scholar, Thief |
| Profession progression | ✅ | Profession XP / levels and work outputs |
| Crafting | ✅ | Materials and multiple recipes |
| Weapon oils | ✅ | Craftable Poison Oil affecting combat |
| Knowledge | ✅ | Compendium-style progress and unlock points |
| Four Paths | ✅ | Power & Glory, Trade & Craftsmanship, Crime & Chaos, Mysteries & Wisdom |
| Crime / suspicion | ✅ | Theft raises suspicion and wanted level |
| Wanted system | ✅ | Wanted level and laying low |
| Prisoners | ✅ | Capture hostile survivors and turn in bounties |
| Prisoner escape / Stocks | ✅ | Escape risk at camp; Stocks prevent it |
| Animal capture | ✅ | Rope-based wolf capture |
| Animal companions | ✅ | Captured wolves join later tactical battles |
| Pack ponies | ✅ | Buyable ponies increase carrying capacity |
| Regional trade | ✅ | Region-dependent wool/salt/spice economy |
| Relationships | ✅ | Symmetric companion relationship values |
| Tomb exploration | ✅ | Torches, rooms, codices, relic rewards |
| Starting background | ✅ | Three original company origins with tradeoffs |
| Save / load | ✅ | Persistent browser save with migration for legacy saves |
| Automated testing | ✅ | Vitest + Playwright + GitHub Actions |
| Browser deployment | ✅ | GitHub Pages workflow |

## Deliberate content simplifications

System presence does not mean identical content volume. For example, the current build has fewer contracts, equipment pieces, enemy archetypes, profession minigames, region narratives and skills than Wartales. The goal of this pass is **system completeness**, not copying its content library.

## Verification rule

When a new core system is added later, it should:
1. have a player-visible entry point,
2. materially change game state or gameplay,
3. persist in saves when applicable,
4. have unit or browser coverage where practical,
5. keep CI and GitHub Pages green.
