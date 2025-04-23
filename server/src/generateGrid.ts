export interface GridConfig {
    width: number;
    height: number;
    aliveRatio?: number; // entre 0 et 1
}

/**
 * Génère une liste d'index de cellules vivantes aléatoirement,
 * optimisée pour supporter des très grandes grilles.
 */
export function generateInitialGrid({
    width,
    height,
    aliveRatio = 0.3,
}: GridConfig): number[] {
    const total = width * height;
    const cells: number[] = [];

    for (let i = 0; i < total; i++) {
        if (Math.random() < aliveRatio) {
            cells.push(i);
        }
    }

    return cells;
}

export function generateInitialBitmap(
    width: number,
    height: number,
    ratio = 0.3
): Uint8Array {
    const grid = new Uint8Array(width * height);
    for (let i = 0; i < grid.length; i++) {
        grid[i] = Math.random() < ratio ? 1 : 0;
    }
    return grid;
}
