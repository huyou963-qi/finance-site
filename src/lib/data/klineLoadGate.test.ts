import assert from "node:assert/strict";
import { it } from "node:test";
import { KlineLoadGate } from "./klineLoadGate";

it("limits distinct cold loads, transfers slots FIFO, releases them on errors, rejects excess queue", async () => {
  const gate = new KlineLoadGate(1, 1);
  let release!: () => void;
  const order: number[] = [];
  const first = gate.run(async () => {
    order.push(1);
    await new Promise<void>(resolve => { release = resolve; });
    throw new Error("source failed");
  });
  const firstFailed = assert.rejects(first, /source failed/);
  const second = gate.run(async () => { order.push(2); return 2; });
  await assert.rejects(gate.run(async () => 3), /繁忙/);
  assert.deepEqual(order, [1]);
  release();
  await firstFailed;
  assert.equal(await second, 2);
  assert.equal(await gate.run(async () => 4), 4);
  assert.deepEqual(order, [1, 2]);
});

it("expired queue entries never start upstream requests later", async () => {
  const gate = new KlineLoadGate(1, 2, 15);
  let release!: () => void;
  const first = gate.run(() => new Promise<void>(resolve => { release = resolve; }));
  let queuedLoads = 0;
  await assert.rejects(gate.run(async () => { queuedLoads++; }), /排队超时/);
  release();
  await first;
  assert.equal(queuedLoads, 0);
  assert.equal(await gate.run(async () => 3), 3);
});
