import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {cubeBezier, outCubic, random} from "../src/easing.ts";

describe("outCubic", () => {
  it("в t=0 возвращает старт", () => {
    assert.equal(outCubic(0, 10, 5, 4), 10);
  });

  it("в t=d возвращает старт + дельта", () => {
    assert.equal(outCubic(4, 10, 5, 4), 15);
  });

  it("монотонно растёт", () => {
    let prev: number = outCubic(0, 0, 1, 10);
    for (let t: number = 1; t <= 10; t++) {
      const v: number = outCubic(t, 0, 1, 10);
      assert.ok(v >= prev, `v(${t})=${v} < prev=${prev}`);
      prev = v;
    }
  });
});

describe("cubeBezier", () => {
  const p0 = {x: 0, y: 0};
  const c0 = {x: 0, y: 1};
  const c1 = {x: 1, y: 1};
  const p1 = {x: 1, y: 0};

  it("в t=0 — начало, в t=1 — конец", () => {
    const start = cubeBezier(p0, c0, c1, p1, 0);
    const end = cubeBezier(p0, c0, c1, p1, 1);
    assert.deepEqual([start.x, start.y], [0, 0]);
    assert.deepEqual([end.x, end.y], [1, 0]);
  });

  it("в t=0.5 — точка на кривой (0.5, 0.75)", () => {
    const mid = cubeBezier(p0, c0, c1, p1, 0.5);
    assert.ok(Math.abs(mid.x - 0.5) < 1e-12);
    assert.ok(Math.abs(mid.y - 0.75) < 1e-12);
  });
});

describe("random", () => {
  it("значение в диапазоне [min, max)", () => {
    for (let i: number = 0; i < 1000; i++) {
      const v: number = random(5, 7);
      assert.ok(v >= 5 && v < 7, `v=${v}`);
    }
  });
});
