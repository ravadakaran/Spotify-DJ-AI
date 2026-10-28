import { MongoMemoryReplSet } from "mongodb-memory-server";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import { io } from "socket.io-client";
import {
  connect,
  migrate,
  seed,
  seedProfiles,
} from "../server/src/persistence.js";
import { createApplication } from "../server/src/app.js";

export const emit = (socket, event, payload) =>
  new Promise((resolve, reject) => {
    socket
      .timeout(5000)
      .emit(event, payload, (error, result) =>
        error ? reject(error) : resolve(result),
      );
  });
export async function fixture() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "dj-phase6-"));
  const repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  const db = await connect(repl.getUri("phase_six_disposable"));
  const config = {
    key: randomBytes(48).toString("hex"),
    issuer: "phase6",
    audience: "phase6",
    origin: "http://127.0.0.1:5173",
    secure: false,
    assetRoot: folder,
  };
  const sockets = [];
  await migrate(db.connection, db.models);
  await seed(db.models);
  const app = createApplication({
    ...db,
    config,
    logger: { info() {}, error() {} },
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  return {
    ...db,
    app,
    config,
    folder,
    repl,
    url,
    sockets,
    async user(index) {
      const user = await db.models.User.create({
        emailNormalized: `load-${index}@example.test`,
        displayName: `Load ${index}`,
        passwordHash: "not-a-login-hash",
      });
      const session = await db.models.Session.create({
        userId: user._id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3600000),
      });
      return {
        id: user._id,
        token: jwt.sign({ sid: session._id }, config.key, {
          subject: user._id,
          issuer: config.issuer,
          audience: config.audience,
          expiresIn: "1h",
        }),
      };
    },
    async room(user, capacity = 50) {
      return app.rooms.create(user.id, {
        seedTrackId: seedProfiles[0]._id,
        vibeProfile: "Synthetic load fixture",
        maxParticipants: capacity,
        bpmTolerancePct: 8,
        soundclashEnabled: true,
        aiVerbosity: "normal",
      });
    },
    async socket(user, room) {
      const socket = io(`${url}/lounges`, {
        auth: { accessToken: user.token },
        extraHeaders: { Origin: config.origin },
        transports: ["websocket"],
        reconnection: false,
      });
      sockets.push(socket);
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      const ack = await emit(socket, "lounge.subscribe", {
        loungeId: room.loungeId,
      });
      if (!ack.ok) throw new Error(JSON.stringify(ack));
      return socket;
    },
    async close() {
      sockets.forEach((s) => s.disconnect());
      await app.close();
      await db.connection.close();
      await repl.stop();
      await rm(folder, { recursive: true, force: true });
    },
  };
}
