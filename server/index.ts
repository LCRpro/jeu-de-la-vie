import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { generateInitialBitmap } from "./src/generateGrid";
import { computeNextGeneration } from "./src/lifeEngine";
import { randomUUID } from "crypto";

const DEFAULT_PORT = "0.0.0.0:50051";
const PROTO_PATH = __dirname + "/proto/game.proto";

// Chargement du .proto
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: Number,
    enums: String,
    defaults: false,
    oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition) as any;

// Sessions : chaque client a sa propre grille
const sessions = new Map<
    string,
    {
        width: number;
        height: number;
        bitmap: Uint8Array;
    }
>();

const gameService = {
    RequestGame: (
        call: grpc.ServerUnaryCall<any, any>,
        callback: grpc.sendUnaryData<any>
    ) => {
        const { width, height } = call.request;

        if (width <= 0 || height <= 0) {
            callback({
                code: grpc.status.INVALID_ARGUMENT,
                details: "Invalid dimensions.",
            });
            return;
        }

        const bitmap = generateInitialBitmap(width, height, 0.25);
        const sessionId = randomUUID();

        sessions.set(sessionId, { width, height, bitmap });

        console.log(
            `🆕 New session created: ${sessionId} (${width}x${height})`
        );
        callback(null, { height, width, sessionId });
    },

    SubscribeToGame: (call: grpc.ServerWritableStream<any, any>) => {
        console.log("📡 Client subscribed to game updates.");
        console.log("Client ID:", call.getPeer());

        const { sessionId } = call.request;
        const session = sessions.get(sessionId);

        if (!session) {
            call.destroy(new Error("Invalid session ID."));
            return;
        }

        console.log(`✅ Client subscribed to session ${sessionId}`);

        let { width, height, bitmap } = session;
        let generation = 0;

        const interval = setInterval(() => {
            call.write({
                generation,
                width,
                height,
                bitmap: Buffer.from(bitmap),
            });

            bitmap = computeNextGeneration({ width, height, current: bitmap });
            generation++;
        }, 500);

        call.on("cancelled", () => {
            console.log(`❌ Client unsubscribed from ${sessionId}`);
            clearInterval(interval);
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
