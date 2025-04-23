import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { generateInitialBitmap } from "./src/generateGrid";
import { computeNextGeneration } from "./src/lifeEngine";
import { randomUUID } from "crypto";

const DEFAULT_PORT = "0.0.0.0:50051";
const PROTO_PATH = __dirname + "/proto/game.proto";

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: Number,
    enums: String,
    defaults: false,
    oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition) as any;

interface Session {
    sessionId: string;
    width: number;
    height: number;
    bitmap: Uint8Array;
    generation: number;
    interval: NodeJS.Timeout;
}

const sessions = new Map<string, Session>();

function startSession(session: Session) {
    console.log(`🟢 Starting session loop for ${session.sessionId}`);
    session.interval = setInterval(() => {
        const t0 = performance.now();
        session.bitmap = computeNextGeneration({
            width: session.width,
            height: session.height,
            current: session.bitmap,
        });
        session.generation++;
        const t1 = performance.now();
        console.log(
            `⚙️  [${session.sessionId}] Génération ${
                session.generation
            } calculée en ${(t1 - t0).toFixed(2)}ms`
        );
    }, 500);
}

const gameService = {
    RequestGame: (
        call: grpc.ServerUnaryCall<any, any>,
        callback: grpc.sendUnaryData<any>
    ) => {
        const { width, height } = call.request;

        console.log(`📥 Received RequestGame: ${width}x${height}`);
        if (width <= 0 || height <= 0) {
            console.warn(`❌ Invalid grid dimensions: ${width}x${height}`);
            callback({
                code: grpc.status.INVALID_ARGUMENT,
                details: "Invalid dimensions.",
            });
            return;
        }

        const sessionId = randomUUID();
        const bitmap = generateInitialBitmap(width, height, 0.25);

        const session: Session = {
            sessionId,
            width,
            height,
            bitmap,
            generation: 0,
            interval: setInterval(() => {}, 0),
        };

        startSession(session);
        sessions.set(sessionId, session);

        console.log(`🆕 Session created: ${sessionId} (${width}x${height})`);
        callback(null, { height, width, sessionId });
    },

    ListSessions: (
        call: grpc.ServerUnaryCall<any, any>,
        callback: grpc.sendUnaryData<any>
    ) => {
        console.log(`📋 Listing ${sessions.size} session(s)`);
        const sessionList = Array.from(sessions.values()).map((s) => ({
            sessionId: s.sessionId,
            width: s.width,
            height: s.height,
        }));
        callback(null, { sessions: sessionList });
    },

    SubscribeToGame: (call: grpc.ServerWritableStream<any, any>) => {
        const {
            sessionId,
            offsetX = 0,
            offsetY = 0,
            rows = 100,
            cols = 100,
        } = call.request;

        console.log(
            `📡 Subscription request: session=${sessionId}, view=${cols}x${rows} @(${offsetX},${offsetY})`
        );
        const session = sessions.get(sessionId);

        if (!session) {
            console.warn(`❌ Invalid sessionId: ${sessionId}`);
            call.destroy(new Error("Invalid session ID."));
            return;
        }

        const interval = setInterval(() => {
            const partial = new Uint8Array(cols * rows);
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const gx = x + offsetX;
                    const gy = y + offsetY;
                    if (gx >= session.width || gy >= session.height) continue;
                    const idx = gy * session.width + gx;
                    partial[y * cols + x] = session.bitmap[idx];
                }
            }

            call.write({
                generation: session.generation,
                bitmap: Buffer.from(partial),
            });

            console.log(
                `📤 Sent generation ${session.generation} to client for session ${sessionId}`
            );
        }, 500);

        call.on("cancelled", () => {
            clearInterval(interval);
            console.log(`❌ Client unsubscribed from ${sessionId}`);
        });
    },
};

const grpcServer = new grpc.Server({
    "grpc.max_receive_message_length": 200 * 1024 * 1024,
    "grpc.max_send_message_length": 200 * 1024 * 1024,
});
grpcServer.addService(proto.game.GameService.service, gameService);

grpcServer.bindAsync(
    DEFAULT_PORT,
    grpc.ServerCredentials.createInsecure(),
    () => {
        grpcServer.start();
        console.log(`🚀 Game of Life gRPC server running at ${DEFAULT_PORT}`);
    }
);
