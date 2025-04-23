import readline from "readline";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const PROTO_PATH = __dirname + "/game.proto";

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: Number,
    enums: String,
    defaults: false,
    oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;

const client = new proto.game.GameService(
    "localhost:50051",
    grpc.credentials.createInsecure(),
    {
        "grpc.max_receive_message_length": 200 * 1024 * 1024, // 200 Mo
        "grpc.max_send_message_length": 200 * 1024 * 1024, // optionnel ici
    }
);

// Fonction de saisie dans la console
function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) =>
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        })
    );
}

// Fonction d'affichage de la grille
function drawGrid(
    whiteIndices: number[],
    width: number,
    height: number,
    generation: number
): void {
    const whiteSet = new Set(whiteIndices);
    console.clear();
    console.log(`\n--- Génération ${generation} ---`);
    console.log("Height:", height, "Width:", width);

    for (let y = 0; y < height; y++) {
        let row = "";
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            row += whiteSet.has(idx) ? "■ " : "□ ";
        }
        console.log(row);
    }
}

// 🎬 Programme principal
(async () => {
    // 1. Saisie utilisateur
    const heightInput = await askQuestion("Hauteur de la grille : ");
    const widthInput = await askQuestion("Largeur de la grille : ");

    const request = {
        height: parseInt(heightInput),
        width: parseInt(widthInput),
    };

    // 2. Envoyer au serveur la demande de session + grille
    client.RequestGame(request, async (err: any, res: any) => {
        if (err) {
            console.error("Erreur lors de RequestGame:", err);
            return;
        }

        const sessionId = res.sessionId;
        const height = res.height;
        const width = res.width;

        console.log(`Grille confirmée : ${width} x ${height}`);
        console.log(`Session ID reçue : ${sessionId}`);

        // 3. Attendre que l'utilisateur soit prêt
        await askQuestion("\nAppuyez sur Entrée pour démarrer le jeu...");

        // 4. Envoyer GameInformation pour SubscribeToGame avec sessionId
        const gameInfo = {
            sessionId: sessionId,
            height: height,
            width: width,
        };

        const stream = client.SubscribeToGame(gameInfo);

        stream.on("data", (gameData: any) => {
            const generation = gameData.generation;
            const bitmap = new Uint8Array(gameData.bitmap); // buffer -> Uint8Array

            const whiteIndices: number[] = [];
            for (let i = 0; i < bitmap.length; i++) {
                if (bitmap[i]) whiteIndices.push(i);
            }
            // drawGrid(whiteIndices, width, height, generation);
        });

        stream.on("end", () => {
            console.log("Fin du stream.");
        });

        stream.on("error", (err: any) => {
            console.error("Erreur du stream :", err);
        });
    });
})();
