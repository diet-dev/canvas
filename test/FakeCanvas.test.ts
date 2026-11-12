import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {fakeCanvasEl, fakeCtx} from "./FakeCanvas.ts";

describe("FakeCanvas", () => {
  it("вложенные save/restore восстанавливают стили и матрицу в обратном порядке", () => {
    const ctx = fakeCtx();
    ctx.fillStyle = "#111";
    ctx.translate(5, 7);
    ctx.save();
    ctx.fillStyle = "#222";
    ctx.globalAlpha = 0.5;
    ctx.scale(2, 3);
    ctx.save();
    ctx.fillStyle = "#333";
    ctx.resetTransform();

    ctx.restore();
    ctx.fillRect(0, 0, 10, 10);
    assert.equal(ctx.draws[0].props.fillStyle, "#222");
    assert.equal(ctx.draws[0].props.globalAlpha, 0.5);
    assert.deepEqual(ctx.draws[0].transform, [2, 0, 0, 3, 5, 7]);

    ctx.restore();
    assert.equal(ctx.fillStyle, "#111");
    assert.equal(ctx.globalAlpha, 1);
    assert.deepEqual(ctx.getTransform(), {a: 1, b: 0, c: 0, d: 1, e: 5, f: 7});
    ctx.restore();
    assert.equal(ctx.fillStyle, "#111", "restore без save не меняет состояние");
    assert.equal(ctx.draws[0].props.fillStyle, "#222", "снимок не меняется после restore");
  });

  it("матрица учитывает порядок scale, translate и rotate", () => {
    const ctx = fakeCtx();
    ctx.scale(2, 2);
    ctx.translate(5, 7);
    ctx.scale(3, 4);
    assert.deepEqual(ctx.getTransform(), {a: 6, b: 0, c: 0, d: 8, e: 10, f: 14});
    ctx.rotate(Math.PI / 2);
    const {a, b, c, d, e, f} = ctx.getTransform();
    assert.ok(Math.abs(a) < 1e-10);
    assert.ok(Math.abs(d) < 1e-10);
    assert.equal(b, 8);
    assert.equal(c, -6);
    assert.equal(e, 10);
    assert.equal(f, 14);
    ctx.setTransform(1, 2, 3, 4, 5, 6);
    assert.deepEqual(ctx.getTransform(), {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6});
  });

  for (const dimension of ["width", "height"] as const) {
    it(`присвоение ${dimension}, даже прежнего значения, сбрасывает стили, матрицу и стек`, () => {
      const {el, ctx} = fakeCanvasEl();
      ctx.fillStyle = "#f00";
      ctx.font = "bold 24px Arial";
      ctx.shadowBlur = 10;
      ctx.translate(10, 20);
      ctx.save();
      ctx.globalAlpha = 0.5;

      const previousSize = el[dimension];
      el[dimension] = previousSize;
      ctx.restore();

      assert.equal(ctx.fillStyle, "#000000");
      assert.equal(ctx.font, "10px sans-serif");
      assert.equal(ctx.shadowBlur, 0);
      assert.equal(ctx.globalAlpha, 1);
      assert.deepEqual(ctx.getTransform(), {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0});
    });
  }
});
