import { LOCATIONS, WORLD_HEIGHT, WORLD_WIDTH } from './data';
import { cellKey, manhattan, neighbours, type GridCell, type GridLayout } from './battleGrid';

export const WORLD_TILE_SIZE = 40;
export const WORLD_REGIONS = ['Greenmarch', 'Ashen Hills', 'Frostmere'] as const;
export type WorldDirection = 'up' | 'down' | 'left' | 'right';
export type Ground = 'grass' | 'tallgrass' | 'path' | 'water' | 'bridge' | 'square';
export type WorldObstacle = 'tree' | 'rock' | 'cliff' | 'building' | 'fence';
export interface WorldTile { ground: Ground; region: number; obstacle?: WorldObstacle; entrance?: string }
export interface WorldBuilding { id: string; col: number; row: number; width: number; height: number; kind: 'town' | 'mill' | 'mine' | 'ruin' | 'house'; region: number }
export interface WorldMap extends GridLayout { tiles: WorldTile[][]; buildings: WorldBuilding[]; connected: Set<string> }
export const DIRECTION_OFFSET: Record<WorldDirection, GridCell> = { up: { col: 0, row: -1 }, down: { col: 0, row: 1 }, left: { col: -1, row: 0 }, right: { col: 1, row: 0 } };
const hash = (x: number, y: number) => (((x * 374761393 + y * 668265263) ^ ((x + 31) * (y + 19) * 1274126177)) >>> 0) % 100;
export const worldCell = (x: number, y: number): GridCell => ({ col: Math.floor(x / WORLD_TILE_SIZE), row: Math.floor(y / WORLD_TILE_SIZE) });
export const worldPoint = (cell: GridCell) => ({ x: (cell.col + .5) * WORLD_TILE_SIZE, y: (cell.row + .5) * WORLD_TILE_SIZE });
export const locationCell = (id: string): GridCell | undefined => { const loc = LOCATIONS.find(l => l.id === id); return loc ? worldCell(loc.x, loc.y) : undefined; };
export const tileAt = (map: WorldMap, cell: GridCell): WorldTile | undefined => map.tiles[cell.row]?.[cell.col];
export const walkable = (map: WorldMap, cell: GridCell): boolean => { const t = tileAt(map, cell); return !!t && !t.obstacle && t.ground !== 'water'; };
export const roadTile = (map: WorldMap, cell: GridCell): boolean => ['path', 'bridge', 'square'].includes(tileAt(map, cell)?.ground ?? '');
export const directedCell = (cell: GridCell, dir: WorldDirection): GridCell => ({ col: cell.col + DIRECTION_OFFSET[dir].col, row: cell.row + DIRECTION_OFFSET[dir].row });
export const directionBetween = (a: GridCell, b: GridCell): WorldDirection => b.col > a.col ? 'right' : b.col < a.col ? 'left' : b.row < a.row ? 'up' : 'down';

// A bounded four-neighbour A* search; ordinary routes never cross an obstacle.
// Generation alone can clear trees and build bridges, while preserving buildings.
export function worldPath(map: WorldMap, start: GridCell, goal: GridCell, carve = false): GridCell[] {
  if (!tileAt(map, start) || !tileAt(map, goal) || (!carve && (!walkable(map, start) || !walkable(map, goal)))) return [];
  const heap: { cell: GridCell; score: number; cost: number }[] = [];
  const push = (node: typeof heap[number]) => {
    heap.push(node); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p].score <= node.score) break; heap[i] = heap[p]; i = p; } heap[i] = node;
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++; if (last.score <= heap[child].score) break; heap[i] = heap[child]; i = child; } heap[i] = last; }
    return top;
  };
  const cost = new Map<string, number>([[cellKey(start), 0]]);
  const parent = new Map<string, GridCell>();
  push({ cell: start, score: manhattan(start, goal), cost: 0 });
  while (heap.length) {
    const current = pop(), key = cellKey(current.cell);
    if (current.cost !== cost.get(key)) continue;
    if (key === cellKey(goal)) {
      const path: GridCell[] = []; let cursor = goal;
      while (cellKey(cursor) !== cellKey(start)) { path.push(cursor); cursor = parent.get(cellKey(cursor))!; }
      return path.reverse();
    }
    for (const next of neighbours(map, current.cell)) {
      const tile = tileAt(map, next)!;
      if (carve ? next.col === 0 || next.row === 0 || next.col === map.cols - 1 || next.row === map.rows - 1 || tile.obstacle === 'building' || tile.obstacle === 'fence' : !walkable(map, next)) continue;
      const stepCost = carve ? (roadTile(map, next) ? 1 : tile.ground === 'water' ? 3 : tile.obstacle ? 2 : 1.4) : roadTile(map, next) ? 1 : 1.15;
      const candidate = current.cost + stepCost, nextKey = cellKey(next);
      if (candidate >= (cost.get(nextKey) ?? Infinity)) continue;
      cost.set(nextKey, candidate); parent.set(nextKey, current.cell);
      push({ cell: next, cost: candidate, score: candidate + manhattan(next, goal) });
    }
  }
  return [];
}

export function createWorldMap(): WorldMap {
  const cols = WORLD_WIDTH / WORLD_TILE_SIZE, rows = WORLD_HEIGHT / WORLD_TILE_SIZE;
  const map: WorldMap = { cols, rows, cellSize: WORLD_TILE_SIZE, originX: 0, originY: 0, buildings: [], connected: new Set(), tiles: [] };
  for (let row = 0; row < rows; row++) {
    const river = 26 + Math.round(Math.sin(row / 7) * 2);
    map.tiles.push(Array.from({ length: cols }, (_, col): WorldTile => {
      const region = col < 42 ? 0 : col >= 58 && (row >= 28 || col >= 67) ? 2 : 1;
      const n = hash(col, row), grove = hash(Math.floor(col / 5), Math.floor(row / 5));
      const ground: Ground = Math.abs(col - river) <= 1 || ((col - 8) ** 2 / 12 + (row - 9) ** 2 / 8 < 1) ? 'water' : n < 14 ? 'tallgrass' : 'grass';
      const edge = !col || !row || col === cols - 1 || row === rows - 1;
      return { ground, region, obstacle: edge ? 'cliff' : ground === 'water' ? undefined : grove < 48 && n < 58 ? (region === 1 ? 'rock' : 'tree') : n > 95 ? 'rock' : undefined };
    }));
  }
  const clear = (col: number, row: number, radius: number, ground: Ground) => {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const tile = tileAt(map, { col: col + dx, row: row + dy });
      if (tile && col + dx > 0 && col + dx < cols - 1 && row + dy > 0 && row + dy < rows - 1 && tile.obstacle !== 'building') { tile.ground = ground; tile.obstacle = undefined; }
    }
  };
  clear(13, 22, 3, 'grass');
  for (const loc of LOCATIONS) {
    const entrance = locationCell(loc.id)!;
    clear(entrance.col, entrance.row, loc.type === 'town' ? 5 : 3, loc.type === 'town' ? 'square' : 'grass');
    const width = loc.type === 'town' ? 5 : 3, height = 3;
    map.buildings.push({ id: loc.id, col: entrance.col - Math.floor(width / 2), row: entrance.row - height, width, height, region: tileAt(map, entrance)!.region, kind: loc.type === 'town' ? 'town' : loc.id.includes('mill') ? 'mill' : loc.id.includes('mine') ? 'mine' : 'ruin' });
    if (loc.type === 'town') {
      map.buildings.push({ id: `${loc.id}-house`, col: entrance.col - 6, row: entrance.row - 1, width: 3, height: 2, kind: 'house', region: tileAt(map, entrance)!.region });
      map.buildings.push({ id: `${loc.id}-shop`, col: entrance.col + 4, row: entrance.row - 3, width: 3, height: 2, kind: 'house', region: tileAt(map, entrance)!.region });
    }
    tileAt(map, entrance)!.entrance = loc.id;
    tileAt(map, entrance)!.ground = 'square';
  }
  for (const building of map.buildings) {
    for (let y = 0; y < building.height; y++) for (let x = 0; x < building.width; x++) {
      const t = tileAt(map, { col: building.col + x, row: building.row + y });
      if (t) { t.obstacle = 'building'; t.ground = 'square'; }
    }
  }
  const edges = [
    ['stonebridge', 'old-mill'], ['stonebridge', 'iron-mine'], ['old-mill', 'bandit-camp'],
    ['iron-mine', 'greenmarch-tomb'], ['bandit-camp', 'ashen-tomb'], ['ashen-tomb', 'ruined-keep'],
    ['iron-mine', 'emberford'], ['emberford', 'northwatch'], ['northwatch', 'old-battlefield'], ['northwatch', 'frost-tomb']
  ];
  const routes: [GridCell, GridCell][] = [[{ col: 13, row: 22 }, locationCell('stonebridge')!], ...edges.map(([a,b]): [GridCell, GridCell] => [locationCell(a)!, locationCell(b)!])];
  for (const [a,b] of routes) {
    const route = worldPath(map, a, b, true);
    if (!route.length) throw new Error('Disconnected world road');
    for (const cell of [a, ...route]) {
      const t = tileAt(map, cell)!; t.obstacle = undefined;
      t.ground = t.ground === 'water' ? 'bridge' : t.ground === 'square' ? 'square' : 'path';
    }
  }
  // Record the connected landmass so legacy saves cannot load onto an island.
  const queue: GridCell[] = [{ col: 13, row: 22 }]; map.connected.add(cellKey(queue[0]));
  for (let i = 0; i < queue.length; i++) for (const next of neighbours(map, queue[i])) {
    if (!walkable(map, next) || map.connected.has(cellKey(next))) continue;
    map.connected.add(cellKey(next)); queue.push(next);
  }
  return map;
}
let cached: WorldMap | undefined;
export const getWorldMap = () => cached ??= createWorldMap();

export function safeWorldCell(map: WorldMap, x: number, y: number): GridCell {
  const raw = worldCell(Number.isFinite(x) ? x : 520, Number.isFinite(y) ? y : 900);
  const start = { col: Math.max(0, Math.min(map.cols - 1, raw.col)), row: Math.max(0, Math.min(map.rows - 1, raw.row)) };
  const queue = [start], seen = new Set([cellKey(start)]);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (walkable(map, cell) && (!map.connected.size || map.connected.has(cellKey(cell)))) return cell;
    for (const next of neighbours(map, cell)) if (!seen.has(cellKey(next))) { seen.add(cellKey(next)); queue.push(next); }
  }
  throw new Error('World map has no traversable land');
}

export function fleeCell(map: WorldMap, from: GridCell, enemy: GridCell): GridCell {
  const queue = [{ cell: from, distance: 0 }], seen = new Set([cellKey(from)]);
  let best = from;
  for (let i = 0; i < queue.length; i++) {
    const { cell, distance } = queue[i];
    if (manhattan(cell, enemy) > manhattan(best, enemy)) best = cell;
    if (distance === 5) continue;
    for (const next of neighbours(map, cell)) if (walkable(map, next) && !seen.has(cellKey(next))) { seen.add(cellKey(next)); queue.push({ cell: next, distance: distance + 1 }); }
  }
  return best;
}

let overview: string | undefined;
export function worldMapOverview(): string {
  if (overview) return overview;
  const colors = (t: WorldTile) => t.obstacle === 'building' ? '#a56d4f' : t.obstacle ? ['#42694c','#877a5d','#788f8b'][t.region] : t.ground === 'water' ? '#609cac' : t.ground === 'bridge' ? '#af8d55' : ['path', 'square'].includes(t.ground) ? '#d7bc82' : ['#8bad68','#b29f72','#bfcebf'][t.region];
  const map = getWorldMap(); let svg = '';
  map.tiles.forEach((row,y) => {
    for (let x=0;x<row.length;) {
      const color=colors(row[x]); let end=x+1; while(end<row.length&&colors(row[end])===color) end++;
      svg+=`<rect x="${x*8}" y="${y*8}" width="${(end-x)*8}" height="8" fill="${color}"/>`; x=end;
    }
  });
  return overview = svg;
}
