import assert from "node:assert/strict";
import {describe, it} from "node:test";
import type {Canvas} from "../src/Canvas.ts";
import {Animation, type AnimationProps} from "../src/Animation.ts";

/** Фиксированный эффект: завершается по таймеру. */
class Timed extends Animation<{ms?: number}> {
  constructor(props: {ms?: number} & AnimationProps) {
    super(props);
    this.maxTime = props.ms ?? 100;
  }

  public draw(_scene: Canvas): void {}
}

describe("Animation", () => {
  it("завершает таймер в upd без проверки isDone и не меняет переданные props", () => {
    let calls = 0;
    const props = Object.freeze({ms: 10, onDone: () => calls++});
    const anim = new Timed(props);
    anim.upd(10);
    assert.equal(calls, 1);
    assert.equal(anim.isDone(), true);
    anim.isDone();
    anim.upd(10);
    assert.equal(calls, 1);
    assert.equal(typeof props.onDone, "function");
  });

  it("фиксирует состояние до callback и защищает от повторного входа", () => {
    let calls = 0;
    const anim = new Timed({
      ms: 10,
      onDone: () => {
        calls++;
        assert.equal(anim.isDone(), true);
        anim.upd(10);
      },
    });
    anim.upd(10);
    assert.equal(calls, 1);
  });

  it("проверяет таймер после логики наследника и больше её не обновляет", () => {
    class Updated extends Timed {
      public updates = 0;
      protected update(dt: number): void {
        super.update(dt);
        this.updates++;
      }
    }
    const anim = new Updated({ms: 10, onDone: () => assert.equal(anim.updates, 1)});
    anim.upd(10);
    anim.upd(10);
    assert.equal(anim.updates, 1);
  });

  it("finish передаёт результат один раз даже при совпадении с таймером", () => {
    class Result extends Animation<object, string> {
      public constructor(props: AnimationProps<string>) {
        super(props);
      }
      public draw(_scene: Canvas): void {}
      protected update(dt: number): void {
        super.update(dt);
        this.finish("result");
        this.finish("duplicate");
      }
    }
    const values: (string | undefined)[] = [];
    const effect = new Result({onDone: value => values.push(value)});
    effect.upd(1000);
    assert.deepEqual(values, ["result"]);
  });

  it("исключение callback не позволяет повторить завершение", () => {
    let calls = 0;
    const anim = new Timed({
      ms: 10,
      onDone: () => {
        calls++;
        throw new Error("callback");
      },
    });
    assert.throws(() => anim.upd(10), /callback/);
    assert.equal(anim.isDone(), true);
    anim.upd(10);
    assert.equal(calls, 1);
  });

  it("upd копит время, isDone срабатывает по достижении maxTime", () => {
    const anim: Timed = new Timed({ms: 100});
    anim.upd(50);
    assert.ok(!anim.isDone());
    anim.upd(50);
    assert.ok(anim.isDone());
  });

  it("onDone вызывается ровно один раз", () => {
    let done: number = 0;
    const anim: Timed = new Timed({ms: 10, onDone: () => done++});
    anim.upd(20);
    assert.ok(anim.isDone());
    anim.upd(20);
    assert.ok(anim.isDone());
    assert.equal(done, 1);
  });

  it("needRedraw по умолчанию true", () => {
    assert.ok(new Timed({}).needRedraw());
  });

  it("isDone стабильно true после завершения", () => {
    const anim: Timed = new Timed({ms: 1});
    anim.upd(10);
    assert.ok(anim.isDone());
    assert.ok(anim.isDone());
  });
});
