export interface GridCell { col: number; row: number; }
export interface GridLayout {
  cols: number;
  rows: number;
  cellSize: number;
  originX: number;
  originY: number;
}

export function cellKey(cell: GridCell): string { return `${cell.col},${cell.row}`; }

export function createGridLayout(width: number, height: number, dimensions?: Pick<GridLayout, 'cols' | 'rows'>): GridLayout {
  // Keep the same tactical board when rotating the device. Reserve space for the HUD.
  const compact = width < 700 || height < 520;
  const top = height < 520 ? 66 : compact ? 138 : 156;
  const bottom = height < 520 ? 92 : compact ? 164 : 154;
  const cols = dimensions?.cols ?? (width < 700 ? 7 : 12);
  const rows = dimensions?.rows ?? (height < 520 ? 5 : 7);
  const cellSize = Math.max(8, Math.min(64, Math.floor((width - 24) / cols), Math.floor((height - top - bottom) / rows)));
  const gridWidth = cols * cellSize;
  const gridHeight = rows * cellSize;
  return {
    cols,
    rows,
    cellSize,
    originX: Math.round((width - gridWidth) / 2),
    originY: Math.round(top + Math.max(0, (height - top - bottom - gridHeight) / 2))
  };
}

export function cellToWorld(layout: GridLayout, cell: GridCell): { x: number; y: number } {
  return {
    x: layout.originX + cell.col * layout.cellSize + layout.cellSize / 2,
    y: layout.originY + cell.row * layout.cellSize + layout.cellSize / 2
  };
}

export function worldToCell(layout: GridLayout, x: number, y: number): GridCell | null {
  const col = Math.floor((x - layout.originX) / layout.cellSize);
  const row = Math.floor((y - layout.originY) / layout.cellSize);
  if (col < 0 || row < 0 || col >= layout.cols || row >= layout.rows) return null;
  return { col, row };
}

export function manhattan(a: GridCell, b: GridCell): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

export function neighbours(layout: GridLayout, cell: GridCell): GridCell[] {
  return [
    { col: cell.col + 1, row: cell.row },
    { col: cell.col - 1, row: cell.row },
    { col: cell.col, row: cell.row + 1 },
    { col: cell.col, row: cell.row - 1 }
  ].filter(c => c.col >= 0 && c.row >= 0 && c.col < layout.cols && c.row < layout.rows);
}

export function reachableCells(
  layout: GridLayout,
  start: GridCell,
  maxSteps: number,
  blocked: Set<string>
): Map<string, number> {
  const result = new Map<string, number>();
  const queue: Array<{ cell: GridCell; d: number }> = [{ cell: start, d: 0 }];
  const seen = new Set<string>([cellKey(start)]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.d > 0) result.set(cellKey(current.cell), current.d);
    if (current.d >= maxSteps) continue;
    for (const next of neighbours(layout, current.cell)) {
      const key = cellKey(next);
      if (seen.has(key) || blocked.has(key)) continue;
      seen.add(key);
      queue.push({ cell: next, d: current.d + 1 });
    }
  }
  return result;
}

export function shortestPath(
  layout: GridLayout,
  start: GridCell,
  goals: GridCell[],
  blocked: Set<string>,
  maxSteps = 99
): GridCell[] {
  const goalKeys = new Set(goals.map(cellKey));
  const queue: GridCell[] = [start];
  const seen = new Set<string>([cellKey(start)]);
  const parent = new Map<string, GridCell>();
  let found: GridCell | null = null;
  while (queue.length) {
    const current = queue.shift()!;
    if (goalKeys.has(cellKey(current))) { found = current; break; }
    for (const next of neighbours(layout, current)) {
      const key = cellKey(next);
      if (seen.has(key) || blocked.has(key)) continue;
      seen.add(key);
      parent.set(key, current);
      queue.push(next);
    }
  }
  if (!found) return [];
  const path: GridCell[] = [];
  let cursor = found;
  // Reconstruct the WHOLE route first. Truncating while walking backwards returns
  // the final steps near the goal, causing distant enemies to teleport.
  while (cellKey(cursor) !== cellKey(start)) {
    path.unshift(cursor);
    const p = parent.get(cellKey(cursor));
    if (!p) break;
    cursor = p;
  }
  return path.slice(0, maxSteps);
}

export function defaultObstacleCells(layout: GridLayout): GridCell[] {
  const mid = Math.floor(layout.cols / 2);
  const candidates: GridCell[] = [
    { col: mid, row: 1 },
    { col: mid, row: 2 },
    { col: mid - 1, row: layout.rows - 2 },
    { col: mid + 2, row: Math.max(1, Math.floor(layout.rows / 2)) }
  ];
  return candidates.filter(c => c.col > 1 && c.col < layout.cols - 2 && c.row >= 0 && c.row < layout.rows);
}
