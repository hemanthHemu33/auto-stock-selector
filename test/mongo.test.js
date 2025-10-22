import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectMongo,
  closeMongo,
  __setMongoClientFactory,
  __resetMongoClientFactory,
} from "../src/db/mongo.js";

test("connectMongo reuses the same MongoClient instance", async (t) => {
  let constructorCalls = 0;
  let connectCalls = 0;

  class FakeClient {
    constructor(uri, options) {
      constructorCalls += 1;
      this.uri = uri;
      this.options = options;
    }
    async connect() {
      connectCalls += 1;
      return this;
    }
    db(name) {
      this.dbName = name;
      return { name };
    }
    async close() {
      this.closed = true;
    }
  }

  __setMongoClientFactory((uri) => new FakeClient(uri, { ignoreUndefined: true }));

  process.env.MONGO_URI = "mongodb://localhost:27017";
  process.env.DB_NAME = "unit_test";

  t.after(async () => {
    await closeMongo();
    __resetMongoClientFactory();
    delete process.env.MONGO_URI;
    delete process.env.DB_NAME;
  });

  const first = await connectMongo();
  assert.equal(first.name, "unit_test");
  assert.equal(constructorCalls, 1);
  assert.equal(connectCalls, 1);

  const second = await connectMongo();
  assert.strictEqual(second, first);
  assert.equal(constructorCalls, 1, "should not re-create client");
  assert.equal(connectCalls, 1, "should not reconnect when cached");

  await closeMongo();
  const third = await connectMongo();
  assert.equal(constructorCalls, 2, "recreate after close");
  assert.equal(connectCalls, 2, "reconnect after close");
});
