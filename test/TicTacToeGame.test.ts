import assert from "node:assert/strict";
import {register} from "node:module";
import {describe, it, type TestContext} from "node:test";
import type {ViewportChange} from "../src/Viewport.ts";
import {fakeCanvasEl} from "./FakeCanvas.ts";

register("./local-canvas-loader.mjs", import.meta.url);
const {TicTacToeGame} = await import("../demo/TicTacToeGame.ts");

function replaceGlobal(t: TestContext, name: string, value: unknown): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {value, configurable: true, writable: true});
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else Reflect.deleteProperty(globalThis, name);
  });
}

class TrackedTarget extends EventTarget {
  public listeners = new Set<EventListenerOrEventListenerObject>();

  public override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    super.addEventListener(type, listener);
    if (listener) this.listeners.add(listener);
  }

  public override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    super.removeEventListener(type, listener);
    if (listener) this.listeners.delete(listener);
  }
}

function makeGame(t: TestContext) {
  t.after(() => game.destroy());
  const pointer = new TrackedTarget();
  const theme = Object.assign(new TrackedTarget(), {matches: false});
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  replaceGlobal(t, "window", {devicePixelRatio: 1, matchMedia: () => theme});
  replaceGlobal(t, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  replaceGlobal(t, "cancelAnimationFrame", (id: number) => frames.delete(id));
  const {el, ctx} = fakeCanvasEl();
  Object.assign(el, {
    addEventListener: pointer.addEventListener.bind(pointer),
    removeEventListener: pointer.removeEventListener.bind(pointer),
    getBoundingClientRect: () => ({left: 0, top: 0}),
  });
  const viewListeners = new Set<(change: ViewportChange) => void>();
  const game = new TicTacToeGame({
    canvas: el,
    dpr: 1,
    view: {
      state: {size: {w: 300, h: 300}, pos: {x: 0, y: 0}},
      onChange: callback => {
        viewListeners.add(callback);
        return () => {
          viewListeners.delete(callback);
        };
      },
    },
  });
  const first = frames.entries().next().value!;
  frames.delete(first[0]);
  first[1](1000);
  const click = (col = 0, row = 0): void => {
    pointer.dispatchEvent(Object.assign(new Event("pointerdown"), {clientX: 50 + col * 92, clientY: 50 + row * 92}));
  };
  return {game, ctx, pointer, theme, frames, viewListeners, click};
}

describe("TicTacToeGame", () => {
  it("русский заголовок поражения помещается в ширину поля", t => {
    t.mock.timers.enable({apis: ["setTimeout"]});
    const {game, ctx, frames, click} = makeGame(t);
    ctx.measureText = (text: string): TextMetrics =>
      ({
        width: text.length * Number(ctx.font.match(/([\d.]+)px/)?.[1]) * 0.6,
      }) as TextMetrics;

    click(0, 0);
    t.mock.timers.tick(450);
    click(1, 0);
    t.mock.timers.tick(450);
    click(0, 1);
    t.mock.timers.tick(450);
    const frame = frames.entries().next().value!;
    frames.delete(frame[0]);
    frame[1](1032);

    const title = ctx.draws.find(draw => draw.method === "fillText" && draw.args[0] === "Поражение");
    assert.ok(title);
    const fontSize = Number(title.props.font.match(/([\d.]+)px/)?.[1]);
    assert.ok("Поражение".length * fontSize * 0.6 <= game.scene.width * 0.92);
  });

  it("destroy снимает обработчики указателя, темы и вьюпорта и отменяет кадр", t => {
    const {game, pointer, theme, frames, viewListeners, click} = makeGame(t);
    assert.equal(pointer.listeners.size, 1);
    assert.equal(theme.listeners.size, 1);
    const redraw = t.mock.method(game, "requestRedraw");

    game.destroy();
    game.destroy();
    theme.dispatchEvent(new Event("change"));
    click();
    game.newGame();

    assert.equal(pointer.listeners.size, 0);
    assert.equal(theme.listeners.size, 0);
    assert.equal(viewListeners.size, 0);
    assert.equal(frames.size, 0);
    assert.equal(redraw.mock.callCount(), 0);
  });

  it("destroy отменяет ожидающий ход бота без изменения состояния игры", t => {
    t.mock.timers.enable({apis: ["setTimeout"]});
    const {game, click} = makeGame(t);
    click();
    const redraw = t.mock.method(game, "requestRedraw");
    const clear = t.mock.method(globalThis, "clearTimeout");

    game.destroy();
    t.mock.timers.tick(1000);

    assert.equal(clear.mock.callCount(), 1);
    assert.equal(redraw.mock.callCount(), 0);
  });

  it("до destroy бот ходит через 450 мс, а смена темы запрашивает кадр", t => {
    t.mock.timers.enable({apis: ["setTimeout"]});
    const {game, theme, click} = makeGame(t);
    click();
    const redraw = t.mock.method(game, "requestRedraw");

    t.mock.timers.tick(449);
    assert.equal(redraw.mock.callCount(), 0);
    t.mock.timers.tick(1);
    assert.equal(redraw.mock.callCount(), 1);
    theme.dispatchEvent(new Event("change"));
    assert.equal(redraw.mock.callCount(), 2);
  });
});
