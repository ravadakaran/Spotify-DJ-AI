const number = { bsonType: ['double', 'int', 'long', 'decimal'] };
const str = { bsonType: 'string' };
const profile = { bsonType: 'object', required: ['bpm', 'camelotKey', 'energy', 'valence'], properties: { bpm: { ...number, minimum: 0, exclusiveMinimum: true }, camelotKey: { ...str, pattern: '^(?:[1-9]|1[0-2])[AB]$' }, energy: { ...number, minimum: 0, maximum: 1 }, valence: { ...number, minimum: 0, maximum: 1 } } };
export async function up(connection, models) {
  for (const model of Object.values(models)) { await model.createCollection(); await model.createIndexes(); }
  const definitions = {
    users: { required: ['emailNormalized', 'passwordHash', 'displayName', 'isAdmin'], properties: { emailNormalized: str, passwordHash: str, displayName: { ...str, minLength: 1, maxLength: 80 }, isAdmin: { bsonType: 'bool' } } },
    refresh_sessions: { required: ['userId', 'tokenHash', 'expiresAt'], properties: { userId: str, tokenHash: str, expiresAt: { bsonType: 'date' } } },
    audio_assets: { required: ['storageKey', 'licenseLabel', 'sourceAttribution', 'byteLength', 'sha256'], properties: { storageKey: str, licenseLabel: str, sourceAttribution: str, byteLength: { ...number, minimum: 1 }, sha256: str } },
    tracks: { required: ['title', 'artist', 'durationSeconds', 'profileVersion'], properties: { title: { ...str, minLength: 1 }, artist: { ...str, minLength: 1 }, durationSeconds: { ...number, minimum: 0, exclusiveMinimum: true }, profileVersion: { ...number, minimum: 1 }, acoustic: { anyOf: [profile, { bsonType: 'null' }] }, profileStatus: { enum: ['ready', 'pending'] } } },
    lounges: { required: ['hostUserId', 'seedTrackId', 'status', 'settings'], properties: { hostUserId: str, seedTrackId: str, status: { enum: ['scheduled', 'live', 'ended'] }, settings: { bsonType: 'object', required: ['maxParticipants', 'bpmTolerancePct'], properties: { maxParticipants: { ...number, minimum: 2, maximum: 50 }, bpmTolerancePct: { ...number, minimum: 0, maximum: 8 } } } } },
    memberships: { required: ['loungeId', 'userId', 'role'], properties: { loungeId: str, userId: str, role: { enum: ['listener', 'co_dj', 'host'] } } }
  };
  await connection.collection('tracks').updateMany({ profileStatus: { $exists: false } }, { $set: { profileStatus: 'ready' } });
  for (const [name, definition] of Object.entries(definitions)) {
    const validator = { $jsonSchema: { bsonType: 'object', ...definition } };
    if (name === 'tracks') validator.$and = [{ $or: [{ profileStatus: 'pending', acoustic: null }, { profileStatus: 'ready', acoustic: { $type: 'object' } }] }];
    await connection.db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
  }
}
