export async function up(connection, models) {
  await models.ChatMessage.createCollection();
  await models.ChatMessage.createIndexes();
  await connection.db.command({
    collMod: "chat_messages",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["loungeId", "messageId", "body", "msgType", "revision"],
        properties: {
          loungeId: { bsonType: "string" },
          messageId: { bsonType: "string" },
          body: { bsonType: "string", minLength: 1, maxLength: 1000 },
          msgType: { enum: ["chat", "dj_announcement"] },
          revision: {
            bsonType: ["int", "long", "double"],
            minimum: 0,
            multipleOf: 1,
          },
          reactions: { bsonType: "object" },
        },
      },
    },
    validationLevel: "strict",
    validationAction: "error",
  });
}
