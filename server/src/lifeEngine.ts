export interface LifeEngineBitmapConfig {
    width: number;
    height: number;
    current: Uint8Array;
}

export function computeNextGeneration({
    width,
    height,
    current,
}: LifeEngineBitmapConfig): Uint8Array {
    const next = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            let neighbors = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;

                    const nx = x + dx;
                    const ny = y + dy;

                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nIdx = ny * width + nx;
                        neighbors += current[nIdx];
                    }
                }
            }

            const isAlive = current[idx] === 1;
            if (
                (isAlive && (neighbors === 2 || neighbors === 3)) ||
                (!isAlive && neighbors === 3)
            ) {
                next[idx] = 1;
            }
        }
    }

    return next;
}
