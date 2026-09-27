import { describe, expect, it } from 'vitest';
import { LOCATIONS, WORLD_WIDTH, WORLD_HEIGHT } from '../src/data';
import { cellKey, manhattan } from '../src/battleGrid';
import { createWorldMap, fleeCell, locationCell, safeWorldCell, tileAt, walkable, worldCell, worldPath, worldPoint, WORLD_TILE_SIZE, WORLD_REGIONS } from '../src/worldMap';

const map = createWorldMap();
const spawn = { col: 13, row: 22 };
function validRoute(from: typeof spawn, route: typeof spawn[]) {
  for (const next of route) { expect(manhattan(from, next)).toBe(1); expect(walkable(map, next)).toBe(true); from = next; }
}

describe('tile overworld', () => {
  it('connects all eleven entrances from the start without walking through obstacles', () => {
    expect(map.cols * WORLD_TILE_SIZE).toBe(WORLD_WIDTH);
    expect(map.rows * WORLD_TILE_SIZE).toBe(WORLD_HEIGHT);
    expect(LOCATIONS).toHaveLength(11);
    for (const loc of LOCATIONS) {
      const goal = locationCell(loc.id)!;
      const route = worldPath(map, spawn, goal);
      expect(route.at(-1)).toEqual(goal);
      expect(tileAt(map, goal)?.entrance).toBe(loc.id);
      validRoute(spawn, route);
    }
  });

  it('crosses the river on a bridge and rejects water, tree, rock and building destinations', () => {
    const route = worldPath(map, spawn, locationCell('iron-mine')!);
    expect(route.some(c => tileAt(map, c)?.ground === 'bridge')).toBe(true);
    for (const obstacle of ['water', 'tree', 'rock', 'building']) {
      const row = map.tiles.findIndex(r => r.some(t => t.ground === obstacle || t.obstacle === obstacle));
      const col = map.tiles[row].findIndex(t => t.ground === obstacle || t.obstacle === obstacle);
      expect(walkable(map, { col, row })).toBe(false);
      expect(worldPath(map, spawn, { col, row })).toEqual([]);
    }
  });

  it('migrates legacy coordinates onto the connected landmass and preserves valid tile centers', () => {
    for (const [x,y] of [[520,900], [0,0], [-200,4000], [NaN,Infinity], [1040,500], [620,750], [3199,2199]]) {
      const cell = safeWorldCell(map, x, y), point = worldPoint(cell);
      expect(walkable(map, cell)).toBe(true);
      expect(map.connected.has(cellKey(cell))).toBe(true);
      expect(worldCell(point.x, point.y)).toEqual(cell);
      expect(safeWorldCell(map, point.x, point.y)).toEqual(cell);
      if (manhattan(spawn, cell)) expect(worldPath(map, spawn, cell).at(-1)).toEqual(cell);
    }
  });

  it('keeps escape destinations reachable and farther from the patrol', () => {
    const enemy = { col: spawn.col + 1, row: spawn.row };
    const to = fleeCell(map, spawn, enemy), route = worldPath(map, spawn, to);
    expect(manhattan(to, enemy)).toBeGreaterThan(manhattan(spawn, enemy));
    expect(route.length).toBeLessThanOrEqual(5);
    validRoute(spawn, route);
  });

  it('keeps every settlement and site in its named region', () => {
    for (const loc of LOCATIONS) expect(WORLD_REGIONS[tileAt(map, locationCell(loc.id)!)!.region]).toBe(loc.region);
  });

  it('generates the same terrain and paths for existing saves across reloads', () => {
    const again = createWorldMap();
    expect(again.tiles).toEqual(map.tiles);
    expect(worldPath(again, spawn, locationCell('northwatch')!)).toEqual(worldPath(map, spawn, locationCell('northwatch')!));
  });
});
