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
import { RoomService } from "./rooms.js";
import { HttpError } from "./validation.js";
import { root } from "./config.js";

export function createApplication({
  models,
  connection,
  config,
  logger = console,
}) {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: config.origin, credentials: true },
    maxHttpBufferSize: 65536,
    allowRequest: (req, cb) => cb(null, req.headers.origin === config.origin),
  });
  const namespace = io.of("/lounges");
  const auth = createAuth(models, config, (id) =>
    namespace.in(`session:${id}`).disconnectSockets(true),
  );
  const rooms = new RoomService(models, connection);
  const envelope = (state) => ({
    event: "lounge.state.snapshot",
    loungeId: state.loungeId,
    epoch: state.epoch,
    revision: state.revision,
    ts: Date.now(),
    payload: state,
  });
  rooms.publish = (state) =>
    namespace
      .to(`lounge:${state.loungeId}`)
      .emit("lounge.state.snapshot", envelope(state));
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
    res.status(201).json(await rooms.create(req.auth.user._id, req.body)),
  );
  api.post("/lounges/join", async (req, res) =>
    res.json(await rooms.join(req.auth.user._id, req.body)),
  );
  api.get("/lounges/:id", async (req, res) => {
    await rooms.member(req.params.id, req.auth.user._id);
    res.json(await rooms.snapshot(req.params.id));
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
    socket.on("disconnect", () => clearTimeout(timer));
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
        await rooms.member(id, current.user._id);
        await rooms.serial(id, async () => {
          for (const room of socket.rooms)
            if (room.startsWith("lounge:")) await socket.leave(room);
          await socket.join(`lounge:${id}`);
          const state = await rooms.snapshot(id);
          socket.emit("lounge.state.snapshot", envelope(state));
          ack({ ok: true, epoch: state.epoch, revision: state.revision });
        });
      } catch (error) {
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
    socket.on("lounge.subscribe", subscribe);
    socket.on("lounge.resync", subscribe);
    socket.on("lounge.sync.ping", (input, ack) => {
      if (typeof ack === "function")
        ack({
          clientSentAt: input?.clientSentAt,
          serverReceivedAt: Date.now(),
          serverSentAt: Date.now(),
        });
    });
  });
  return {
    app,
    server,
    io,
    rooms,
    auth,
    close: () => new Promise((resolve) => io.close(resolve)),
  };
}
