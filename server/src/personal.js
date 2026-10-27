import { Router } from "express";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import { HttpError, requireId } from "./validation.js";
import { fit, recommend } from "./recommendations/model.js";

export function personalRouter(models, rooms) {
  const router = Router();
  let active = null,
    running = false;
  const ready = models.RecommendationJob.findOne({ status: "complete" })
    .sort({ createdAt: -1 })
    .lean()
    .then((j) => {
      active = j?.artifact || null;
    });
  router.put(
    "/lounges/:id/playbacks/:playbackId/interaction",
    async (req, res) =>
      res.json(
        await rooms.command(
          req.params.id,
          req.auth.user._id,
          "interaction.record",
          { ...req.body, playbackId: req.params.playbackId },
          req.headers["x-command-id"],
        ),
      ),
  );
  router.get("/lounges/:id/analytics", async (req, res) => {
    requireId(req.params.id);
    const member = await models.Membership.exists({
      loungeId: req.params.id,
      userId: req.auth.user._id,
    });
    if (!member)
      throw new HttpError(403, "FORBIDDEN", "Session membership required.");
    const summary = await models.SessionSummary.findOne({
      loungeId: req.params.id,
    }).lean();
    res.status(summary ? 200 : 202).json(
      summary
        ? {
            ...summary.summary,
            revision: summary.revision,
            summaryStatus: "complete",
          }
        : { summaryStatus: "pending" },
    );
  });
  router.get("/users/me/lounges", async (req, res) => {
    const userId = req.auth.user._id;
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(req.query.limit ?? 20);
    const query = { userId, removed: false };
    if (req.query.cursor) {
      requireId(req.query.cursor);
      const anchor = await models.Membership.findOne({
        _id: req.query.cursor,
        userId,
        removed: false,
      }).lean();
      if (!anchor)
        throw new HttpError(
          400,
          "INVALID_CURSOR",
          "History cursor unavailable.",
        );
      query.$or = [
        { createdAt: { $lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, _id: { $lt: anchor._id } },
      ];
    }
    const members = await models.Membership.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();
    const page = members.slice(0, limit);
    const lounges = await models.Lounge.find({
      _id: { $in: page.map((m) => m.loungeId) },
    }).lean();
    res.json({
      items: page
        .map((m) => lounges.find((l) => l._id === m.loungeId))
        .filter(Boolean)
        .map((l) => ({
          loungeId: l._id,
          vibeProfile: l.vibeProfile,
          status: l.status,
        })),
      nextCursor: members.length > limit ? page.at(-1)._id : null,
    });
  });
  router.get("/users/me/dashboard", async (req, res) => {
    const userId = req.auth.user._id;
    const rows = await models.Interaction.find({ userId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(1000)
      .lean();
    const memberships = await models.Membership.find({ userId, removed: false })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const lounges = await models.Lounge.find({
      _id: { $in: memberships.map((m) => m.loungeId) },
    }).lean();
    const weight = rows.reduce(
      (n, r) => n + (r.acoustic ? r.playedSeconds : 0),
      0,
    );
    const average = (key) =>
      weight
        ? rows.reduce(
            (n, r) => n + (r.acoustic?.[key] || 0) * r.playedSeconds,
            0,
          ) / weight
        : null;
    const keys = {};
    for (const r of rows)
      if (r.acoustic)
        keys[r.acoustic.camelotKey] =
          (keys[r.acoustic.camelotKey] || 0) + r.playedSeconds;
    res.json({
      history: rows.slice(0, 50),
      tasteProfile: {
        bpm: average("bpm"),
        energy: average("energy"),
        valence: average("valence"),
        keys,
        playedSeconds: weight,
      },
      activeLounges: lounges
        .filter((l) => l.status !== "ended")
        .map((l) => ({
          loungeId: l._id,
          vibeProfile: l.vibeProfile,
          status: l.status,
        })),
      asOf: new Date(),
      scope: "Latest 1000 durable interactions; history shows latest 50",
    });
  });
  router.get("/users/me/recommendations", async (req, res) => {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .parse(req.query.limit ?? 5);
    await ready;
    const model =
      active ||
      fit({
        tracks: await models.Track.find({ profileStatus: "ready" })
          .sort({ _id: 1 })
          .limit(500)
          .lean(),
        interactions: [],
        cutoff: new Date().toISOString(),
      });
    res.json({
      items: recommend(model, req.auth.user._id, limit),
      modelVersion: active?.modelVersion || null,
      fallbackReason: !active
        ? "MODEL_NOT_FITTED"
        : !active.users[req.auth.user._id]
          ? "COLD_START"
          : null,
      asOf: model.cutoff,
    });
  });
  router.post("/admin/recommendation-jobs", async (req, res) => {
    if (!req.auth.user.isAdmin)
      throw new HttpError(403, "FORBIDDEN", "Administrator required.");
    z.object({}).strict().parse(req.body);
    await ready;
    if (running)
      throw new HttpError(409, "FIT_RUNNING", "A fit is already running.");
    running = true;
    let job;
    try {
      const cutoff = new Date(rooms.now()).toISOString();
      const tracks = await models.Track.find({ profileStatus: "ready" })
        .sort({ _id: 1 })
        .limit(501)
        .lean();
      const interactions = await models.Interaction.find({
        createdAt: { $lte: new Date(cutoff) },
      })
        .sort({ createdAt: 1, _id: 1 })
        .limit(50001)
        .lean();
      if (tracks.length > 500 || interactions.length > 50000)
        throw new HttpError(
          409,
          "FIT_CAPACITY",
          "Fit supports 500 tracks and 50000 interactions.",
        );
      job = await models.RecommendationJob.create({ status: "running" });
      const worker = new Worker(
        new URL("./recommendations/worker.js", import.meta.url),
        { workerData: { tracks, interactions, cutoff } },
      );
      let settled = false;
      const timer = setTimeout(() => {
        worker.terminate();
        fail().catch(() => {});
      }, 30000);
      timer.unref();
      const fail = async () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          await models.RecommendationJob.updateOne(
            { _id: job._id },
            { $set: { status: "failed", failureReason: "FIT_FAILED" } },
          );
        } finally {
          running = false;
        }
      };
      worker.once("message", async (artifact) => {
        if (settled) return;
        try {
          await models.RecommendationJob.updateOne(
            { _id: job._id },
            {
              $set: {
                status: "complete",
                modelVersion: artifact.modelVersion,
                artifact,
              },
            },
          );
          active = artifact;
          settled = true;
          clearTimeout(timer);
          running = false;
        } catch {
          await fail().catch(() => {});
        }
      });
      worker.once("error", () => fail().catch(() => {}));
      worker.once("exit", (code) => {
        if (code) fail().catch(() => {});
      });
      res.status(202).json({ jobId: job._id, status: "running" });
    } catch (error) {
      running = false;
      throw error;
    }
  });
  router.get("/admin/recommendation-jobs/:id", async (req, res) => {
    if (!req.auth.user.isAdmin)
      throw new HttpError(403, "FORBIDDEN", "Administrator required.");
    requireId(req.params.id);
    const job = await models.RecommendationJob.findById(req.params.id)
      .select("-artifact")
      .lean();
    if (!job) throw new HttpError(404, "NOT_FOUND", "Job not found.");
    res.json(job);
  });
  return router;
}
