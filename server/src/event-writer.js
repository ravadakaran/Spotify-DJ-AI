import { summarize } from "./session-analytics.js";
import { position } from "./queue-reducer.js";
// One bounded process-wide buffer; transactions include the checkpoint watermark.
export class EventWriter {
  constructor(
    models,
    connection,
    {
      onFailure = () => {},
      onDurable = () => {},
      maxEvents = 500,
      intervalMs = 1000,
    } = {},
  ) {
    Object.assign(this, {
      models,
      connection,
      onFailure,
      onDurable,
      maxEvents,
    });
    this.buffer = [];
    this.failed = false;
    this.inFlight = null;
    this.timer = setInterval(() => this.flush().catch(() => {}), intervalMs);
    this.timer.unref();
  }
  append(event, state) {
    if (this.buffer.length >= this.maxEvents)
      throw new Error("Event buffer full");
    const checkpoint = structuredClone(state);
    if (checkpoint.nowPlaying && !checkpoint.nowPlaying.paused) {
      const now = event.occurredAt.getTime();
      checkpoint.nowPlaying.offsetSeconds = position(
        checkpoint.nowPlaying,
        now,
      );
      checkpoint.nowPlaying.startedAt = now;
    }
    this.buffer.push({ event, state: checkpoint });
    if (this.buffer.length >= 50)
      queueMicrotask(() => this.flush().catch(() => {}));
  }
  async flush() {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.drain();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }
  async drain() {
    try {
      while (this.buffer.length) {
        const batch = this.buffer.slice(0, 50);
        await this.connection.transaction(async (session) => {
          for (const { event } of batch) {
            const { loungeId, epoch, revision, eventSeq } = event;
            await this.models.QueueEvent.updateOne(
              { loungeId, epoch, revision, eventSeq },
              { $setOnInsert: event },
              { upsert: true, session },
            );
            if (event.type === "interaction.record")
              await this.models.Interaction.updateOne(
                {
                  loungeId,
                  userId: event.actorId,
                  playbackId: event.payload.interaction.playbackId,
                },
                { $set: event.payload.interaction },
                { upsert: true, session },
              );
            if (event.type === "room.end") {
              const events = await this.models.QueueEvent.find({ loungeId })
                .sort({ occurredAt: 1, revision: 1 })
                .session(session)
                .lean();
              await this.models.SessionSummary.updateOne(
                { loungeId },
                { $set: { summary: summarize(events), revision } },
                { upsert: true, session },
              );
            }
            const message =
              event.type === "chat.message"
                ? event.payload.message
                : event.type === "battle.resolved"
                  ? event.payload.announcement
                  : null;
            if (message)
              await this.models.ChatMessage.updateOne(
                { messageId: message.messageId },
                {
                  $setOnInsert: {
                    ...message,
                    createdAt: new Date(message.createdAt),
                    loungeId,
                    revision,
                  },
                },
                { upsert: true, session },
              );
            if (event.type === "chat.reaction") {
              const p = event.payload;
              await this.models.ChatMessage.updateOne(
                { loungeId, messageId: p.messageId },
                {
                  $set: { reactions: p.reactions },
                },
                { session },
              );
            }
          }
          const latest = new Map(
            batch.map((item) => [item.event.loungeId, item]),
          );
          for (const { event, state } of latest.values()) {
            await this.models.Lounge.updateOne(
              { _id: event.loungeId },
              { $set: { status: state.status } },
              { session },
            );
            await this.models.RoomSnapshot.updateOne(
              { loungeId: event.loungeId },
              {
                $set: {
                  epoch: event.epoch,
                  revision: event.revision,
                  reducerVersion: event.reducerVersion,
                  state,
                  persistedAt: new Date(),
                },
              },
              { upsert: true, session },
            );
          }
        });
        this.buffer.splice(0, batch.length);
        for (const item of batch) this.onDurable(item.event);
      }
      this.failed = false;
    } catch (error) {
      this.failed = true;
      this.onFailure();
      throw error;
    }
  }
  stop() {
    clearInterval(this.timer);
  }
}
