import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { Server } from "socket.io";
import { ZodError } from "zod";
import { createAuth, publicUser } from "./auth.js";
import { catalogRouter } from "./catalog.js";
import { RoomService } from "./live-rooms.js";
import { HttpError } from "./validation.js";
import { root } from "./config.js";
import { createThrottle } from "./throttle.js";

export function createApplication({
  models,
  connection,
  config,
  logger = console,
}) {
  const app = express();
  const server = createServer(app);
  const handshakeAllowed = createThrottle({
    limit: config.handshakeLimit || 30,
  });
  const io = new Server(server, {
    cors: { origin: config.origin, credentials: true },
    maxHttpBufferSize: 65536,
    allowRequest: (req, cb) =>
      cb(
        null,
        req.headers.origin === config.origin &&
          handshakeAllowed(req.socket.remoteAddress),
      ),
  });
  const namespace = io.of("/lounges");
  const auth = createAuth(models, config, (id) =>
    namespace.in(`session:${id}`).disconnectSockets(true),
  );
  const rooms = new RoomService(
    models,
    connection,
    config.key,
    config.roomOptions,
  );
  const envelope = (state) => ({
    event: "lounge.state.snapshot",
    loungeId: state.loungeId,
    epoch: state.epoch,
    revision: state.revision,
    eventSeq: 0,
    ts: rooms.now(),
    payload: state,
  });
  const pendingSnapshots = new Map(),
    lastFanout = new Map();
  let fanoutScheduled = false;
  const fanout = (state) => {
    const prior = lastFanout.get(state.loungeId),
      notifications = [];
    if (
      !prior ||
      JSON.stringify(prior.nextUp) !== JSON.stringify(state.nextUp) ||
      JSON.stringify(prior.nowPlaying) !== JSON.stringify(state.nowPlaying) ||
      prior.reservedEntryId !== state.reservedEntryId
    )
      notifications.push([
        "lounge.queue.update",
        {
          queue: state.nextUp,
          nowPlaying: state.nowPlaying,
          reservation: state.reservedEntryId,
          reason: state.lastEventType === "queue.vote" ? "vote" : "manual",
        },
      ]);
    for (const participantId of state.presentUserIds)
      if (!prior?.presentUserIds.includes(participantId))
        notifications.push([
          "lounge.presence.update",
          {
            participantId,
            action: "joined",
            participantCount: state.participantCount,
          },
        ]);
    for (const participantId of prior?.presentUserIds || [])
      if (!state.presentUserIds.includes(participantId))
        notifications.push([
          "lounge.presence.update",
          {
            participantId,
            action: "left",
            participantCount: state.participantCount,
          },
        ]);
    if (
      !prior ||
      prior.status !== state.status ||
      prior.mutationFrozen !== state.mutationFrozen
    )
      notifications.push([
        "lounge.status.update",
        {
          status: state.status,
          hostConnected: state.hostConnected,
          mutationFrozen: state.mutationFrozen,
        },
      ]);
    lastFanout.set(state.loungeId, state);
    for (const socket of namespace.sockets.values()) {
      if (!socket.rooms.has(`lounge:${state.loungeId}`)) continue;
      // Do not accumulate snapshots behind a slow transport.
      if (socket.conn.writeBuffer.length > 20) {
        socket.disconnect(true);
        continue;
      }
      socket.emit("lounge.state.snapshot", envelope(state));
      notifications.forEach(([event, payload], index) =>
        socket.volatile.emit(event, {
          ...envelope(state),
          event,
          eventSeq: index + 1,
          payload,
        }),
      );
    }
  };
  rooms.publish = (state) => {
    pendingSnapshots.set(state.loungeId, state);
    if (fanoutScheduled) return;
    fanoutScheduled = true;
    setImmediate(() => {
      fanoutScheduled = false;
      for (const latest of pendingSnapshots.values()) fanout(latest);
      pendingSnapshots.clear();
    });
  };
  rooms.detach = (id, userId) => {
    rooms.presence.get(id)?.delete(userId);
    for (const socket of namespace.sockets.values())
      if (socket.data.loungeId === id && socket.data.auth.user._id === userId) {
        socket.emit("lounge.membership.detached", { loungeId: id });
        socket.data.loungeId = null;
        socket.leave(`lounge:${id}`);
      }
  };
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set("X-Request-Id", req.requestId);
    const started = performance.now();
    res.on("finish", () =>
      logger.info(
        JSON.stringify({
          requestId: req.requestId,
          method: req.method,
          route: req.route?.path || "unmatched",
          status: res.statusCode,
          durationMs: Math.round(performance.now() - started),
        }),
      ),
    );
    next();
  });
  const throttleError = {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Try again later.",
    },
  };
  const loginLimit = rateLimit({
    windowMs: 60000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: throttleError,
  });
  const generalLimit = rateLimit({
    windowMs: 60000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: throttleError,
  });
  app.get("/api/v1/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/v1/health/ready", async (_req, res) => {
    try {
      if (connection.readyState !== 1) throw new Error();
      if (!rooms.healthy || rooms.degradedAt !== null) throw new Error();
      await connection.db.admin().ping();
      await access(config.assetRoot, constants.R_OK | constants.W_OK);
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.post("/api/v1/auth/register", loginLimit, auth.register);
  app.post("/api/v1/auth/login", loginLimit, auth.login);
  app.post("/api/v1/auth/refresh", loginLimit, auth.origin, auth.refresh);
  app.post("/api/v1/auth/logout", auth.origin, auth.logout);
  const api = express.Router();
  api.use(auth.middleware, generalLimit);
  api.get("/users/me", (req, res) =>
    res.json({ user: publicUser(req.auth.user) }),
  );
  api.get("/users/me/lounges", async (req, res) => {
    const memberships = await models.Membership.find({
      userId: req.auth.user._id,
      removed: false,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const rows = await models.Lounge.find({
      _id: { $in: memberships.map((m) => m.loungeId) },
    })
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      items: rows.map((l) => ({
        loungeId: l._id,
        vibeProfile: l.vibeProfile,
        status: l.status,
      })),
      nextCursor: null,
    });
  });
  api.use(catalogRouter(models, auth, config));
  api.post("/lounges", async (req, res) =>
    res
      .status(201)
      .json(
        await rooms.create(
          req.auth.user._id,
          req.body,
          req.headers["x-command-id"],
        ),
      ),
  );
  api.post("/lounges/join", async (req, res) =>
    res.json(await rooms.join(req.auth.user._id, req.body)),
  );
  api.get("/lounges/:id", async (req, res) => {
    res.json(
      await rooms.serial(req.params.id, async () => {
        await rooms.member(req.params.id, req.auth.user._id);
        return rooms.snapshot(req.params.id);
      }),
    );
  });
  for (const [method, route, type] of [
    ["post", "/lounges/:id/queue", "queue.enqueue"],
    ["delete", "/lounges/:id/queue/:entryId", "queue.remove"],
    ["put", "/lounges/:id/queue/:entryId/vote", "queue.vote"],
    ["post", "/lounges/:id/queue/:entryId/promote", "queue.promote"],
    ["post", "/lounges/:id/playback", "playback.control"],
    ["patch", "/lounges/:id/settings", "room.settings"],
    ["post", "/lounges/:id/invites/rotate", "room.invite"],
    ["patch", "/lounges/:id/members/:userId", "member.update"],
    ["post", "/lounges/:id/host-transfer", "host.transfer"],
    ["post", "/lounges/:id/leave", "member.leave"],
  ])
    api[method](route, async (req, res) => {
      const payload = {
        ...req.body,
        ...(req.params.entryId ? { entryId: req.params.entryId } : {}),
        ...(req.params.userId ? { userId: req.params.userId } : {}),
      };
      const result = await rooms.command(
        req.params.id,
        req.auth.user._id,
        type,
        payload,
        req.headers["x-command-id"],
      );
      res
        .status(type === "queue.enqueue" || type === "room.invite" ? 201 : 200)
        .json(result);
    });
  app.use("/api/v1", api);
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "Endpoint not implemented.")),
  );
  app.use(express.static(path.join(root, "client/dist")));
  app.use((_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "Resource not found.")),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error.status || 500;
    let code = error.code || "INTERNAL_ERROR";
    let message = error.message;
    if (error instanceof ZodError || error.name === "ValidationError") {
      status = 422;
      code = "VALIDATION_FAILED";
      message = "Check required fields, types and allowed ranges.";
    }
    if (error.code === 11000) {
      status = 409;
      code = "CONFLICT";
      message = "That record already exists.";
    }
    if (error.code === "LIMIT_FILE_SIZE") {
      status = 413;
      code = "TOO_LARGE";
      message = "Audio upload exceeds 25 MiB.";
    }
    if (status >= 500) {
      message = "The request could not be completed.";
      logger.error(
        JSON.stringify({ requestId: req.requestId, code: "INTERNAL_ERROR" }),
      );
    }
    res
      .status(status)
      .json({ error: { code, message, requestId: req.requestId } });
  });
  namespace.use(async (socket, next) => {
    try {
      socket.data.auth = await auth.verify(socket.handshake.auth.accessToken);
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });
  namespace.on("connection", (socket) => {
    const { claims } = socket.data.auth;
    socket.join(`session:${claims.sid}`);
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, claims.exp * 1000 - Date.now()),
    );
    socket.on("disconnect", () => {
      clearTimeout(timer);
      if (socket.data.loungeId)
        rooms
          .disconnected(
            socket.data.loungeId,
            socket.data.auth.user._id,
            socket.id,
          )
          .catch(() => {});
    });
    let count = 0;
    let windowAt = Date.now();
    const subscribe = async (input, ack) => {
      if (typeof ack !== "function") return;
      if (Date.now() - windowAt > 60000) {
        count = 0;
        windowAt = Date.now();
      }
      if (++count > 30)
        return ack({ ok: false, error: { code: "RATE_LIMITED" } });
      try {
        const current = await auth.verify(socket.handshake.auth.accessToken);
        const id = input?.loungeId;
        if (socket.data.loungeId && socket.data.loungeId !== id) {
          const old = socket.data.loungeId;
          socket.data.loungeId = null;
          await socket.leave(`lounge:${old}`);
          await rooms.disconnected(old, current.user._id, socket.id);
        }
        await rooms.serial(id, async () => {
          await rooms.member(id, current.user._id);
          if (!socket.connected) return;
          socket.data.loungeId = id;
          await socket.join(`lounge:${id}`);
          await rooms.attach(id, current.user._id, socket.id);
          if (!socket.connected) {
            rooms
              .disconnected(id, current.user._id, socket.id, true)
              .catch(() => {});
            return;
          }
          const state = await rooms.snapshot(id);
          socket.emit("lounge.state.snapshot", envelope(state));
          ack({
            ok: true,
            epoch: state.epoch,
            revision: state.revision,
            durableRevision: state.durableRevision,
            snapshot: state,
          });
        });
      } catch (error) {
        if (socket.data.loungeId) {
          const old = socket.data.loungeId;
          socket.data.loungeId = null;
          await socket.leave(`lounge:${old}`);
          await rooms
            .disconnected(old, socket.data.auth.user._id, socket.id, true)
            .catch(() => {});
        }
        ack({
          ok: false,
          error: {
            code:
              error instanceof ZodError
                ? "VALIDATION_FAILED"
                : error.code || "INTERNAL_ERROR",
          },
        });
      }
    };
    let subscriptions = Promise.resolve(),
      queuedSubscriptions = 0;
    const scheduleSubscription = (input, ack) => {
      if (queuedSubscriptions >= 30) {
        if (typeof ack === "function")
          ack({ ok: false, error: { code: "RATE_LIMITED" } });
        return;
      }
      queuedSubscriptions++;
      subscriptions = subscriptions
        .catch(() => {})
        .then(() => subscribe(input, ack))
        .finally(() => queuedSubscriptions--);
    };
    socket.on("lounge.subscribe", scheduleSubscription);
    socket.on("lounge.resync", scheduleSubscription);
    const commandAllowed = createThrottle({ limit: 240, maxKeys: 1 });
    socket.on("lounge.command", async (input, ack) => {
      if (typeof ack !== "function") return;
      if (!commandAllowed("socket"))
        return ack({ ok: false, error: { code: "RATE_LIMITED" } });
      try {
        const current = await auth.verify(socket.handshake.auth.accessToken);
        if (!socket.data.loungeId)
          throw new HttpError(403, "FORBIDDEN", "Subscribe to a room first.");
        const payload = {
          ...input?.payload,
          ...(input?.expectedRevision !== undefined
            ? { expectedRevision: input.expectedRevision }
            : {}),
        };
        ack(
          await rooms.command(
            socket.data.loungeId,
            current.user._id,
            input?.type,
            payload,
            input?.commandId,
          ),
        );
      } catch (error) {
        ack({
          ok: false,
          error: {
            code:
              error instanceof ZodError
                ? "VALIDATION_FAILED"
                : error.code || "INTERNAL_ERROR",
            message:
              error.status < 500
                ? error.message
                : "Command could not be completed.",
          },
        });
      }
    });
    socket.on("lounge.sync.ping", (input, ack) => {
      const pong = {
        clientSentAt: input?.clientSentAt,
        serverReceivedAt: rooms.now(),
        serverSentAt: rooms.now(),
      };
      if (typeof ack === "function") ack(pong);
      socket.emit("lounge.sync.pong", pong);
    });
  });
  return {
    app,
    server,
    io,
    rooms,
    auth,
    close: async () => {
      await new Promise((resolve) => io.close(resolve));
      await rooms.close();
    },
  };
}
