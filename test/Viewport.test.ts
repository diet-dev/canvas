import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {Viewport, type ViewportHost, type ViewportChange} from "../src/Viewport.ts";

/** Хост-фейк вместо window. */
function fakeHost(innerWidth: number, innerHeight: number): ViewportHost & {resizeTo(w: number, h: number): void} {
  const listeners: (() => void)[] = [];
  const host: ViewportHost & {resizeTo(w: number, h: number): void} = {
    innerWidth: innerWidth,
    innerHeight: innerHeight,
    addEventListener: (_type: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_type: string, fn: () => void) => {
      const index = listeners.indexOf(fn);
      if (index !== -1) listeners.splice(index, 1);
    },
    resizeTo(w: number, h: number) {
      host.innerWidth = w;
      host.innerHeight = h;
      for (const fn of listeners) fn();
    },
  };
  return host;
}

describe("Viewport", () => {
  it("resize передаёт согласованный снимок и сохраняет предыдущие снимки", () => {
    const host = fakeHost(1000, 800);
    const view = new Viewport({maxW: 600}, host);
    const seen: ViewportChange[] = [];
    view.onChange(change => seen.push(change));
    host.resizeTo(500, 400);
    assert.deepEqual(seen[1], {size: {w: 500, h: 400}, pos: {x: 0, y: 0}});
    host.resizeTo(500, 400);
    assert.equal(seen.length, 3);
    assert.deepEqual(seen[2], seen[1]);
    assert.deepEqual(seen[0], {size: {w: 600, h: 800}, pos: {x: 200, y: 0}});
  });

  it("изменение исходных options не меняет ограничения вьюпорта", () => {
    const host = fakeHost(1000, 800);
    const options = {maxW: 500, ratio: 0.5};
    const view = new Viewport(options, host);
    options.maxW = 900;
    options.ratio = 2;
    host.resizeTo(1000, 800);
    assert.deepEqual(view.state.size, {w: 500, h: 250});
    assert.deepEqual(view.state.pos, {x: 250, y: 275});
  });

  it("подписчик не может изменить снимок для других подписчиков", () => {
    const host = fakeHost(1000, 800);
    const view = new Viewport({}, host);
    view.onChange(change => {
      assert.equal(Reflect.set(change, "size", {w: 1, h: 1}), false);
      assert.equal(Reflect.set(change.size, "w", 1), false);
      assert.equal(Reflect.set(change.pos, "x", 1), false);
    });
    const seen: ViewportChange[] = [];
    view.onChange(change => seen.push(change));
    host.resizeTo(500, 400);
    assert.deepEqual(seen[1], {size: {w: 500, h: 400}, pos: {x: 0, y: 0}});
  });

  it("без ограничений занимает всё окно", () => {
    const host: ReturnType<typeof fakeHost> = fakeHost(1000, 800);
    const vp: Viewport = new Viewport({}, host);

    assert.equal(vp.state.size.w, 1000);
    assert.equal(vp.state.size.h, 800);
    assert.equal(vp.state.pos.x, 0);
    assert.equal(vp.state.pos.y, 0);
  });

  it("ratio вписывает прямоугольник по высоте окна", () => {
    const host: ReturnType<typeof fakeHost> = fakeHost(1000, 800);
    // ratio = h/w = 0.5: при w=1000 → h=500 ≤ 800, влезает.
    const vp: Viewport = new Viewport({ratio: 0.5}, host);

    assert.equal(vp.state.size.w, 1000);
    assert.equal(vp.state.size.h, 500);
    assert.equal(vp.state.pos.y, Math.ceil((800 - 500) / 2));
  });

  it("ratio упирается в максимальную высоту", () => {
    const host: ReturnType<typeof fakeHost> = fakeHost(2000, 800);
    // ratio 0.5 → h = 1000 > 800, значит h = 800, w = 1600.
    const vp: Viewport = new Viewport({ratio: 0.5}, host);

    assert.equal(vp.state.size.w, 1600);
    assert.equal(vp.state.size.h, 800);
    assert.equal(vp.state.pos.x, Math.ceil((2000 - 1600) / 2));
    assert.equal(vp.state.pos.y, 0);
  });

  it("onChange дёргается сразу с текущим состоянием", () => {
    const vp: Viewport = new Viewport({maxW: 500, maxH: 400}, fakeHost(1000, 800));
    const seen: {w: number; h: number}[] = [];
    vp.onChange(({size}) => seen.push({w: size.w, h: size.h}));

    assert.deepEqual(seen, [{w: 500, h: 400}]);
  });

  it("resize окна пересчитывает размер и уведомляет", () => {
    const host: ReturnType<typeof fakeHost> = fakeHost(1000, 800);
    const vp: Viewport = new Viewport({}, host);
    let changes: number = 0;
    vp.onChange(() => changes++);
    changes = 0; // первый (мгновенный) вызов не считаем

    host.resizeTo(500, 400);
    assert.equal(vp.state.size.w, 500);
    assert.equal(vp.state.size.h, 400);
    assert.equal(changes, 1);
  });

  it("state и onChange предоставляют один неизменяемый снимок", () => {
    const host = fakeHost(1000, 800);
    const view = new Viewport({}, host);
    const initial = view.state;
    let notified: ViewportChange | undefined;
    view.onChange(change => {
      notified = change;
    });
    assert.equal(view.state, initial);
    assert.equal(notified, initial);
    assert.equal(Reflect.set(view, "state", {}), false);
    assert.equal(Reflect.set(initial.size, "w", 1), false);
    host.resizeTo(500, 400);
    assert.equal(view.state, notified);
    assert.notEqual(view.state, initial);
    assert.deepEqual(initial, {size: {w: 1000, h: 800}, pos: {x: 0, y: 0}});
  });

  it("функция отписки удаляет только свою подписку и допускает повторный вызов", () => {
    const host = fakeHost(1000, 800);
    const view = new Viewport({}, host);
    let calls = 0;
    const listener = () => calls++;
    const unsubscribe = view.onChange(listener);
    view.onChange(listener);
    calls = 0;
    unsubscribe();
    unsubscribe();
    host.resizeTo(500, 400);
    assert.equal(calls, 1);
  });

  it("destroy снимает resize, очищает подписчиков и запрещает новые подписки", () => {
    const host = fakeHost(1000, 800);
    let removes = 0;
    const remove = host.removeEventListener;
    host.removeEventListener = (type, fn) => {
      removes++;
      remove(type, fn);
    };
    const view = new Viewport({}, host);
    let calls = 0;
    const unsubscribe = view.onChange(() => calls++);
    calls = 0;
    view.destroy();
    view.destroy();
    unsubscribe();
    view.onChange(() => calls++);
    host.resizeTo(500, 400);
    assert.equal(removes, 1);
    assert.equal(calls, 0);
    assert.deepEqual(view.state.size, {w: 1000, h: 800});
  });
});
