import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {callsOf, fakeScene} from "./FakeCanvas.ts";
import {ConfettiEffect} from "../src/effects/ConfettiEffect.ts";
import {Ripple} from "../src/effects/Ripple.ts";
import {TimerEffect} from "../src/effects/TimerEffect.ts";

describe("Ripple", () => {
  for (const fade of [0, 0.0001]) {
    it(`завершается через 5000 мс при fade=${fade} и вызывает onDone один раз`, () => {
      let completed = 0;
      const effect = new Ripple({x: 0, y: 0, fade, onDone: () => completed++});

      effect.upd(4999);
      assert.equal(effect.isDone(), false);
      assert.equal(completed, 0);
      effect.upd(1);
      assert.equal(effect.isDone(), true);
      assert.equal(completed, 1);
      effect.upd(10000);
      assert.equal(effect.isDone(), true);
      assert.equal(completed, 1);
    });
  }

  it("гаснет и вызывает onDone один раз", () => {
    let done: number = 0;
    const {scene} = fakeScene(100, 100, 1);
    const ripple: Ripple = new Ripple({
      x: 50,
      y: 50,
      fade: 0.01,
      onDone: () => done++,
    });

    for (let i: number = 0; i < 150; i++) {
      ripple.upd(1);
      if (ripple.isDone()) break;
    }
    ripple.draw(scene);

    assert.ok(ripple.isDone());
    assert.equal(done, 1);
  });

  it("рисует fillCircle с радиусом, растущим от dt", () => {
    const {scene, ctx} = fakeScene(100, 100, 1);
    const ripple: Ripple = new Ripple({x: 10, y: 10, radius: 2, speed: 0.1});
    ripple.upd(100);
    ripple.draw(scene);

    const [x, y, radius] = callsOf(ctx, "arc")[0];
    assert.deepEqual([x, y], [10, 10]);
    assert.ok(Math.abs((radius as number) - 12) < 1e-9);
  });
});

describe("ConfettiEffect", () => {
  it("заканчивается по maxTime, даже если частицы не долетели", () => {
    let done: number = 0;
    const effect: ConfettiEffect = new ConfettiEffect({
      width: 100,
      height: 100,
      maxTime: 100,
      onDone: () => done++,
    });

    for (let i: number = 0; i < 20; i++) {
      effect.upd(50); // суммарно 1000мс > 100мс
      if (effect.isDone()) break;
    }

    assert.ok(effect.isDone());
    assert.equal(done, 1);
  });

  it("рисует 128 частиц с корректными цветами и восстанавливает контекст", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    scene.fillStyle("#abc");
    scene.translate(3, 5);
    const props = {...ctx.props};
    const transform = ctx.getTransform();
    const effect: ConfettiEffect = new ConfettiEffect({
      width: 100,
      height: 100,
    });
    effect.upd(16);
    effect.draw(scene);
    assert.equal(ctx.draws.length, 128);
    assert.ok(ctx.draws.every(draw => /^#[0-9a-f]{6}$/.test(String(draw.props.fillStyle))));
    assert.deepEqual(ctx.props, props);
    assert.deepEqual(ctx.getTransform(), transform);
  });
});

describe("TimerEffect", () => {
  it("рисует фон заданным цветом и не переносит тень плашки на текст", () => {
    const {scene, ctx} = fakeScene(300, 300, 2);
    scene.fillStyle("#f00");
    const timer = new TimerEffect({time: 10000, text: "$t", boxColor: "#abc", textColor: "#def", shadowColor: "#123"});

    timer.draw(scene);

    const box = ctx.draws.find(draw => draw.method === "fill")!;
    assert.equal(box.props.fillStyle, "#abc");
    assert.equal(box.props.shadowColor, "#123");
    assert.equal(box.props.shadowBlur, 30);
    const texts = ctx.draws.filter(draw => draw.method === "fillText");
    assert.equal(texts.length, 2);
    for (const text of texts) {
      assert.equal(text.props.fillStyle, "#def");
      assert.equal(text.props.shadowBlur, 0);
      assert.deepEqual(text.transform, [2, 0, 0, 2, 0, 0]);
    }
  });

  it("speed=0 останавливает отсчёт и не вызывает onDone", () => {
    const {scene, ctx} = fakeScene(300, 300);
    let completed = 0;
    const timer = new TimerEffect({time: 1000, text: "$t", speed: 0, onDone: () => completed++});

    timer.upd(5000);
    timer.upd(5000);
    timer.draw(scene);

    assert.equal(timer.isDone(), false);
    assert.equal(completed, 0);
    assert.equal(callsOf(ctx, "fillText")[1][0], "1");
  });

  it("дробная speed замедляет отсчёт", () => {
    const {scene, ctx} = fakeScene(300, 300);
    const timer = new TimerEffect({time: 10000, text: "$t", speed: 0.5});

    timer.upd(4000);
    timer.draw(scene);

    assert.equal(timer.isDone(), false);
    assert.equal(callsOf(ctx, "fillText")[1][0], "8");
    timer.upd(16000);
    assert.equal(timer.isDone(), true);
  });

  it("рисует плашку и обратный отсчёт", () => {
    const {scene, ctx} = fakeScene(300, 300, 1);
    const timer: TimerEffect = new TimerEffect({
      time: 10000,
      text: "До конца $t сек",
    });
    timer.upd(2500);
    timer.draw(scene);

    const texts: unknown[][] = callsOf(ctx, "fillText");
    assert.equal(texts.length, 2);
    // "$t" заменяется ровно на 5 пробелов.
    assert.equal(texts[0][0], "До конца " + " ".repeat(5) + " сек");
    assert.equal(texts[1][0], "8"); // 10 - 2.5 → ceil = 8
  });

  it("speed ускоряет отсчёт", () => {
    const {scene} = fakeScene(300, 300, 1);
    const timer: TimerEffect = new TimerEffect({
      time: 10000,
      text: "$t",
      speed: 2,
    });
    timer.upd(5000); // x2 → прошло 10с
    timer.draw(scene);
    assert.ok(timer.isDone());
  });
});
