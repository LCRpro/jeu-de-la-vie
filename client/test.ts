// Taille de la grille
const width = 10;
const height = 6;

// Index des cellules mortes (affichées avec □)
const whiteIndices = [2, 3, 14, 15, 22, 23, 42, 43];

function drawGrid(whiteIndices: number[], width: number, height: number): void {
    const whiteSet = new Set(whiteIndices);

    for (let y = 0; y < height; y++) {
        let row = "";
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            row += whiteSet.has(idx) ? "■ " : "□ ";
        }
        console.log(row);
    }
}

console.log("🧪 Affichage statique du Jeu de la Vie :\n");
drawGrid(whiteIndices, width, height);
