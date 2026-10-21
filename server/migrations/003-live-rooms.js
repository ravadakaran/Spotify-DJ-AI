export async function up(connection, models) {
  for (const model of [models.QueueEvent,models.RoomSnapshot]) { await model.createCollection(); await model.createIndexes(); }
  const integer = {bsonType:['int','long','double'],minimum:0,multipleOf:1};
  const shared = {loungeId:{bsonType:'string'},epoch:{bsonType:'string'},revision:integer,reducerVersion:{...integer,minimum:1}};
  for (const [name,properties,required] of [
    ['queue_events',{...shared,eventSeq:integer,commandId:{bsonType:'string'},type:{bsonType:'string'},payload:{bsonType:'object'},occurredAt:{bsonType:'date'}},['eventSeq','commandId','type','payload','occurredAt']],
    ['room_snapshots',{...shared,state:{bsonType:'object'},persistedAt:{bsonType:'date'}},['state','persistedAt']],
  ]) await connection.db.command({collMod:name,validator:{$jsonSchema:{bsonType:'object',required:[...Object.keys(shared),...required],properties}},validationLevel:'strict',validationAction:'error'});
}
