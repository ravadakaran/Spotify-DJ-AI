export async function up(connection, models) {
  for (const model of [
    models.Interaction,
    models.SessionSummary,
    models.RecommendationJob,
  ]) {
    await model.createCollection();
    await model.createIndexes();
  }
  await models.Membership.collection.createIndex({
    userId: 1,
    createdAt: -1,
    _id: -1,
  });
  await connection.db.command({
    collMod: "interactions",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "loungeId",
          "userId",
          "playbackId",
          "trackId",
          "playedSeconds",
          "completed",
          "liked",
        ],
        properties: {
          playedSeconds: { bsonType: ["double", "int", "long"], minimum: 0 },
          completed: { bsonType: "bool" },
          liked: { bsonType: "bool" },
        },
      },
    },
    validationLevel: "strict",
    validationAction: "error",
  });
}
