import { describe, expect, it } from 'vitest';
import { cellKey, createGridLayout, reachableCells, shortestPath } from '../src/battleGrid';

describe('battle grid', () => {
  it('does not allow reachable movement through occupied cells', () => {
    const grid = createGridLayout(900, 700);
    const start = { col: 1, row: 2 };
    const blocked = new Set([cellKey({ col: 2, row: 2 }), cellKey({ col: 1, row: 1 }), cellKey({ col: 1, row: 3 })]);
    const reachable = reachableCells(grid, start, 5, blocked);
    expect(reachable.has(cellKey({ col: 3, row: 2 }))).toBe(false);
  });

  it('can route around a blocker when another lane is open', () => {
    const grid = createGridLayout(900, 700);
    const start = { col: 1, row: 2 };
    const goal = { col: 4, row: 2 };
    const blocked = new Set([cellKey({ col: 2, row: 2 })]);
    const path = shortestPath(grid, start, [goal], blocked);
    expect(path.length).toBeGreaterThan(3);
    expect(path.some(c => c.col === 2 && c.row === 2)).toBe(false);
  });

  it('returns no path through a fully blocked corridor', () => {
    const grid = createGridLayout(320, 520);
    const start = { col: 1, row: 2 };
    const goal = { col: 4, row: 2 };
    const blocked = new Set<string>();
    for (let row=0; row<grid.rows; row++) blocked.add(cellKey({ col: 2, row }));
    expect(shortestPath(grid,start,[goal],blocked)).toEqual([]);
  });
});
