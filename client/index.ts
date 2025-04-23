import readline from "readline";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import blessed from "blessed";

let screen: blessed.Widgets.Screen | null = null;
let box: blessed.Widgets.BoxElement;
let offsetX = 0;
let offsetY = 0;
let paused = false;
let gridWidth = 0;
let gridHeight = 0;
let showHelp = false;

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
        "grpc.max_receive_message_length": 200 * 1024 * 1024,
        "grpc.max_send_message_length": 200 * 1024 * 1024,
    }
);

function getStep(): number {
    return gridWidth >= 100 && gridHeight >= 100 ? 20 : 10;
}

function clampOffsets(): void {
    const maxCols = screen ? Math.floor(((screen.width as number) - 2) / 2) : 0;
    const maxRows = screen ? (screen.height as number) - 4 : 0;
    offsetX = Math.max(0, Math.min(offsetX, gridWidth - maxCols));
    offsetY = Math.max(0, Math.min(offsetY, gridHeight - maxRows));
}

function initUI(): void {
    screen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        title: "Jeu de la Vie",
    });

    box = blessed.box({
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        tags: true,
        scrollable: false,
        alwaysScroll: false,
        padding: 0,
        content: "",
        style: {
            fg: "white",
            bg: "black",
        },
        border: "line",
    });

    screen.append(box);

    screen.key(["q", "C-c", "escape"], () => process.exit(0));
    screen.key(["p"], () => (paused = !paused));
    screen.key(["h"], () => {
        showHelp = !showHelp;
        screen!.render();
    });

    screen.key(["up"], () => {
        offsetY -= getStep();
        clampOffsets();
    });
    screen.key(["down"], () => {
        offsetY += getStep();
        clampOffsets();
    });
    screen.key(["left"], () => {
        offsetX -= getStep();
        clampOffsets();
    });
    screen.key(["right"], () => {
        offsetX += getStep();
        clampOffsets();
    });

    screen.on("resize", () => screen!.render());
    screen.render();
}

function askQuestion(query: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

function drawBlessedGrid(
    whiteIndices: number[],
    width: number,
    height: number,
    generation: number
): void {
    const whiteSet = new Set(whiteIndices);
    const termWidth = screen
        ? Math.floor(((screen.width as number) - 2) / 2)
        : 0;
    const termHeight = screen ? (screen.height as number) - 4 : 0;

    const visibleCols = Math.min(termWidth, width - offsetX);
    const visibleRows = Math.min(termHeight, height - offsetY);

    let output = `{bold}Génération ${generation}{/bold} — ${width}x${height} | offset: (${offsetX}, ${offsetY})`;
    output += paused ? " {red-fg}(PAUSE){/red-fg}" : "";
    output += " | [←↑↓→] scroll | p pause | q quit | h help\n\n";

    if (showHelp) {
        output += `{underline}Commandes disponibles :{/underline}
← ↑ ↓ → : déplacement rapide
p : pause / reprendre
h : afficher / cacher l'aide
q : quitter\n\n`;
    }

    for (let y = 0; y < visibleRows; y++) {
        let row = "";
        for (let x = 0; x < visibleCols; x++) {
            const gx = x + offsetX;
            const gy = y + offsetY;
            const idx = gy * width + gx;
            row += whiteSet.has(idx) ? "■ " : "  ";
        }
        output += row + "\n";
    }

    box.setContent(output.trimEnd());
    screen!.render();
}

function launchSession(sessionId: string, width: number, height: number): void {
    gridWidth = width;
    gridHeight = height;
    initUI();

    const stream = client.SubscribeToGame({ sessionId, rows: 500, cols: 500 });

    stream.on("data", (gameData: any) => {
        if (paused) return;

        const generation = gameData.generation;
        const bitmap = new Uint8Array(gameData.bitmap);
        const whiteIndices: number[] = [];

        for (let i = 0; i < bitmap.length; i++) {
            if (bitmap[i]) whiteIndices.push(i);
        }

        drawBlessedGrid(whiteIndices, width, height, generation);
    });

    stream.on("end", () => {
        process.exit(0);
    });

    stream.on("error", (err: any) => {
        console.error("Erreur du stream :", err);
    });
}

(async () => {
    const list = await new Promise<any[]>((resolve, reject) => {
        client.ListSessions({}, (err: any, res: any) => {
            if (err) return reject(err);
            resolve(res.sessions || []);
        });
    });

    console.log("\nSessions disponibles :\n");
    list.forEach((session, i) => {
        console.log(
            `(${i + 1}) ${session.sessionId} — ${session.width}x${
                session.height
            }`
        );
    });
    console.log("(n) Nouvelle grille\n");

    const choice = await askQuestion(
        "Choisissez une session (numéro ou 'n') : "
    );

    if (choice === "n") {
        const height = parseInt(await askQuestion("Hauteur de la grille : "));
        const width = parseInt(await askQuestion("Largeur de la grille : "));
        client.RequestGame({ width, height }, (err: any, res: any) => {
            if (err) return console.error("Erreur lors de RequestGame:", err);
            launchSession(res.sessionId, res.width, res.height);
        });
    } else {
        const index = parseInt(choice) - 1;
        if (!list[index]) return console.error("Choix invalide");

        const sessionId = list[index].sessionId;
        const width = list[index].width;
        const height = list[index].height;

        launchSession(sessionId, width, height);
    }
})();
