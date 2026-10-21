// Only launched by the isolated replica-set integration test, never by the app.
import { connect } from "../../src/persistence.js";
import { RoomService } from "../../src/live-rooms.js";
const db = await connect(process.env.PHASE_TEST_URI);
if (db.connection.name !== "phase_two_tests")
  throw new Error("Disposable test database required");
const rooms = new RoomService(
  db.models,
  db.connection,
  "isolated-process-test-key",
  { intervalMs: 60000 },
);
process.on("message", async (message) => {
  try {
    if (message.action === "stop") {
      await rooms.close();
      await db.connection.close();
      process.exit(0);
    }
    const { roomId, userId } = message;
    if (message.action === "prepare") {
      await rooms.serial(roomId, () =>
        rooms.attach(roomId, userId, "process-test-host"),
      );
      const asset = await db.models.Asset.create({
        storageKey: "process-test.wav",
        byteLength: 44,
        mimeType: "audio/wav",
        sha256: "isolated-test",
        licenseLabel: "Test only",
        sourceAttribution: "Process recovery fixture, not playable seed music",
      });
      const track = await db.models.Track.create({
        title: "Process test",
        artist: "Test",
        assetId: asset._id,
        durationSeconds: 30,
        acoustic: { bpm: 120, camelotKey: "8A", energy: 0.5, valence: 0.5 },
      });
      let state = await rooms.snapshot(roomId);
      await rooms.command(roomId, userId, "queue.enqueue", {
        trackId: track._id,
        expectedRevision: state.revision,
      });
      state = await rooms.snapshot(roomId);
      await rooms.command(roomId, userId, "playback.control", {
        action: "advance",
        expectedRevision: state.revision,
      });
      state = await rooms.snapshot(roomId);
      await rooms.command(roomId, userId, "queue.enqueue", {
        trackId: track._id,
        expectedRevision: state.revision,
      });
      await rooms.writer.flush();
      const durable = await rooms.snapshot(roomId);
      await rooms.command(roomId, userId, "queue.enqueue", {
        trackId: track._id,
        expectedRevision: durable.revision,
      });
      process.send({ durable, live: await rooms.snapshot(roomId) });
    } else process.send({ recovered: await rooms.snapshot(roomId) });
  } catch (error) {
    process.send({ error: error.message });
  }
});
process.send({ ready: true });
