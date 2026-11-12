import assert from "node:assert/strict";
import {afterEach, beforeEach, describe, it} from "node:test";
import type {Canvas} from "../src/Canvas.ts";
import {CanvasGame, type CanvasGameEvents, type CanvasGameOptions} from "../src/CanvasGame.ts";
import {Animation, type AnimationProps} from "../src/Animation.ts";
import type {ViewportLike} from "../src/CanvasGame.ts";
import {callsOf, fakeCanvasEl} from "./FakeCanvas.ts";
import {Viewport, type ViewportChange} from "../src/Viewport.ts";
import {Text3dEffect} from "../src/effects/Text3dEffect.ts";
import {Ripple} from "../src/effects/Ripple.ts";

/** Стаб requestAnimationFrame: кадры крутятся только ручным step(). */
class RafStub {
  private queue = new Map<number, (time: number) => void>();
  private nextId = 0;
  private readonly real: typeof requestAnimationFrame;
  private readonly realCancel = globalThis.cancelAnimationFrame;

  constructor() {
    this.real = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: (time: number) => void) => {
      const id = ++this.nextId;
      this.queue.set(id, cb);
      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = id => {
      this.queue.delete(id);
    };
  }

  public get pendingCount(): number {
    return this.queue.size;
  }

  public get nextCallback(): (time: number) => void {
    const cb = this.queue.values().next().value;
    assert.ok(cb, "очередь кадров пуста");
    return cb;
  }

  public step(time: number): void {
    const entry = this.queue.entries().next().value;
    assert.ok(entry, "очередь кадров пуста");
    const [id, cb] = entry;
    this.queue.delete(id);
    cb(time);
  }

  public restore(): void {
    globalThis.requestAnimationFrame = this.real;
    globalThis.cancelAnimationFrame = this.realCancel;
  }
}

/** Фейк вьюпорта: размер/позиция фиксированы. */
function fakeView(): ViewportLike & {resize(): void; listener: () => void} {
  let listener: (change: ViewportChange) => void = () => {};
  const view: ViewportLike & {resize(): void; listener: () => void} = {
    state: {size: {w: 200, h: 100}, pos: {x: 10, y: 20}},
    onChange: (fn: (change: ViewportChange) => void) => {
      listener = fn;
      return () => {
        listener = () => {};
      };
    },
    resize: () => listener(view.state),
    listener: () => listener(view.state),
  };
  return view;
}

class SpyGame extends CanvasGame<CanvasGameEvents> {
  public scenesDrawn: number = 0;
  public animated: number = 0;

  // Публичный конструктор: базовый защищён, тесты создают игру снаружи.
  public constructor(options: CanvasGameOptions) {
    super(options);
  }

  protected updateScene(_dt: number, _time: number): void {
    this.animated++;
  }

  protected drawScene(): void {
    this.scenesDrawn++;
  }
}

/** Эффект-шпион: живёт limit кадров, считает upd/draw. */
class SpyEffect extends Animation<AnimationProps & {limit?: number}> {
  public upds: number = 0;
  public draws: number = 0;
  private readonly limit: number;

  constructor(props: AnimationProps & {limit?: number}) {
    super(props);
    this.limit = props.limit ?? 2;
    this.maxTime = Infinity;
  }

  protected update(dt: number): void {
    super.update(dt);
    this.upds++;
    if (this.upds >= this.limit) {
      this.finish();
    }
  }

  public draw(_scene: Canvas): void {
    this.draws++;
  }
}

describe("CanvasGame", () => {
  let raf: RafStub;

  beforeEach(() => {
    raf = new RafStub();
  });

  afterEach(() => {
    raf.restore();
  });

  /** Конструктор + первый кадр: loop:start уже отправлен, сцена отрисована. */
  function makeGame(): SpyGame {
    const game: SpyGame = new SpyGame({
      view: fakeView(),
      canvas: fakeCanvasEl().el,
    });
    raf.step(1000);
    return game;
  }

  it("первый кадр рисует сцену и эмитит loop:start", () => {
    let started: number = 0;
    const game: SpyGame = new SpyGame({
      view: fakeView(),
      canvas: fakeCanvasEl().el,
    });
    game.on("loop:start", () => started++);
    raf.step(1000);

    assert.equal(started, 1);
    assert.equal(game.scenesDrawn, 1);
  });

  it("кадры без изменений не перерисовывают сцену", () => {
    const game: SpyGame = makeGame();
    raf.step(1032);
    raf.step(1064);

    assert.equal(game.scenesDrawn, 1);
  });

  it("пустой drawScene сохраняет фон и нижний слой эффектов", () => {
    class Game extends CanvasGame {
      public constructor(options: CanvasGameOptions) {
        super(options);
      }
      protected drawBackground(): void {
        this.scene.fillText("background", 0, 0);
      }
    }
    class Effect extends Animation {
      public constructor() {
        super({});
      }
      public draw(scene: Canvas): void {
        scene.fillText("before", 0, 0);
      }
    }
    const {el, ctx} = fakeCanvasEl();
    const game = new Game({view: fakeView(), canvas: el});
    game.addBeforeEffect(new Effect());
    ctx.calls.length = 0;

    raf.step(1000);

    const drawing = ctx.calls.filter(([name]) => name === "clearRect" || name === "fillText");
    assert.deepEqual(drawing, [
      ["clearRect", [0, 0, 200, 100]],
      ["fillText", ["background", 0, 0]],
      ["fillText", ["before", 0, 0]],
    ]);
    raf.step(1032);
    assert.equal(callsOf(ctx, "clearRect").length, 2, "каждый нарисованный кадр начинается с очистки");
    game.destroy();
  });

  it("draw очищает холст до фона, нижних эффектов, сцены и верхних эффектов", () => {
    class Game extends SpyGame {
      protected drawBackground(): void {
        this.scene.fillText("background", 0, 0);
      }
      protected drawScene(): void {
        this.scene.fillText("scene", 0, 0);
      }
    }
    class Effect extends Animation<{label: string}> {
      public constructor(props: {label: string}) {
        super(props);
      }
      public draw(scene: Canvas): void {
        scene.fillText(this.props.label, 0, 0);
      }
    }
    const {el, ctx} = fakeCanvasEl();
    const game = new Game({view: fakeView(), canvas: el});
    game.addBeforeEffect(new Effect({label: "before"}));
    game.addAfterEffect(new Effect({label: "after"}));
    ctx.calls.length = 0;

    raf.step(1000);

    const drawing = ctx.calls.filter(([name]) => name === "clearRect" || name === "fillText");
    assert.deepEqual(drawing, [
      ["clearRect", [0, 0, 200, 100]],
      ["fillText", ["background", 0, 0]],
      ["fillText", ["before", 0, 0]],
      ["fillText", ["scene", 0, 0]],
      ["fillText", ["after", 0, 0]],
    ]);
    game.destroy();
  });

  it("requestRedraw вызывает перерисовку", () => {
    const game: SpyGame = makeGame();
    game.requestRedraw();
    raf.step(1032);

    assert.equal(game.scenesDrawn, 2);
  });

  it("requestRedraw из drawScene сохраняется для следующего кадра", () => {
    class Game extends SpyGame {
      protected drawScene(): void {
        super.drawScene();
        if (this.scenesDrawn === 1) this.requestRedraw();
      }
    }
    const game = new Game({view: fakeView(), canvas: fakeCanvasEl().el});

    raf.step(1000);
    assert.equal(game.scenesDrawn, 1);
    raf.step(1032);
    assert.equal(game.scenesDrawn, 2);
    raf.step(1064);
    assert.equal(game.scenesDrawn, 2, "без нового запроса лишнего кадра нет");
  });

  it("animate крутится каждый кадр, pause его останавливает", () => {
    const game: SpyGame = makeGame();
    // Первый кадр уже прошёл в makeGame → animated === 1.
    raf.step(1032);
    assert.equal(game.animated, 2);

    game.pause();
    raf.step(1064);
    assert.equal(game.animated, 2);

    game.resume();
    raf.step(1096);
    assert.equal(game.animated, 3);
  });

  it("dt ограничен 100 мс даже после большой задержки кадра", () => {
    let lastDt: number = 0;
    class Game extends SpyGame {
      protected updateScene(dt: number): void {
        lastDt = dt;
      }
    }
    new Game({view: fakeView(), canvas: fakeCanvasEl().el});
    raf.step(1000);
    raf.step(5000);

    assert.equal(lastDt, 100);
  });

  it("переопределение updateScene без super сохраняет обновление обоих слоёв эффектов", () => {
    const game = makeGame();
    const before = new SpyEffect({limit: 1});
    const after = new SpyEffect({limit: 1});
    game.addBeforeEffect(before);
    game.addAfterEffect(after);
    raf.step(1032);
    assert.equal(game.animated, 2);
    for (const effect of [before, after]) {
      assert.equal(effect.upds, 1);
      assert.equal(effect.draws, 1);
      assert.equal(effect.isDone(), true);
    }
  });

  it("игровая логика предшествует эффектам, а верхний слой рисуется последним", () => {
    const order: string[] = [];
    class Ordered extends SpyGame {
      protected updateScene(): void {
        order.push("updateScene");
      }
      protected drawBackground(): void {
        order.push("background");
      }
      protected drawScene(): void {
        order.push("scene");
      }
      protected drawOverlay(): void {
        order.push("overlay");
      }
    }
    class Effect extends SpyEffect {
      public draw(): void {
        order.push("effect");
      }
    }
    const game = new Ordered({view: fakeView(), canvas: fakeCanvasEl().el});
    raf.step(1000);
    order.length = 0;
    game.addBeforeEffect(new Effect({limit: 1, onDone: () => order.push("beforeDone")}));
    game.addAfterEffect(new Effect({limit: 1, onDone: () => order.push("afterDone")}));
    raf.step(1032);
    assert.deepEqual(order, [
      "updateScene",
      "beforeDone",
      "afterDone",
      "background",
      "effect",
      "scene",
      "effect",
      "overlay",
    ]);
    order.length = 0;
    raf.step(1064); // Очистка завершённых эффектов.
    order.length = 0;
    raf.step(1096);
    assert.deepEqual(order, ["updateScene"], "без запроса рисования верхний слой тоже не рисуется");
  });

  it("ручная пауза замораживает эффекты, но позволяет обновлять интерфейс и рисовать фон", () => {
    class ManualPause extends SpyGame {
      public manuallyPaused = false;
      public backgrounds = 0;
      protected shouldUpdateEffects(): boolean {
        return !this.manuallyPaused;
      }
      protected shouldDrawScene(): boolean {
        return !this.manuallyPaused;
      }
      protected drawBackground(): void {
        this.backgrounds++;
      }
    }
    const game = new ManualPause({view: fakeView(), canvas: fakeCanvasEl().el});
    raf.step(1000);
    const effect = new SpyEffect({limit: 2});
    game.addAfterEffect(effect);
    game.manuallyPaused = true;
    game.requestRedraw();
    raf.step(1032);
    assert.equal(game.animated, 2);
    assert.equal(effect.upds, 0);
    assert.equal(effect.draws, 0);
    assert.equal(game.backgrounds, 2);
    assert.equal(game.scenesDrawn, 1);
    game.manuallyPaused = false;
    raf.step(1064);
    assert.equal(effect.upds, 1);
    assert.equal(effect.draws, 1);
    game.pause();
    game.requestRedraw();
    raf.step(1096);
    assert.equal(effect.upds, 1);
    assert.equal(effect.draws, 2);
    assert.equal(game.animated, 3);
  });

  it("скрытая сцена не останавливает эффекты и не рисует верхний слой", () => {
    class Hidden extends SpyGame {
      public overlays = 0;
      protected shouldDrawScene(): boolean {
        return false;
      }
      protected drawOverlay(): void {
        this.overlays++;
      }
    }
    const game = new Hidden({view: fakeView(), canvas: fakeCanvasEl().el});
    raf.step(1000);
    const effect = new SpyEffect({limit: 1});
    game.addAfterEffect(effect);
    raf.step(1032);
    assert.equal(effect.isDone(), true);
    assert.equal(effect.draws, 0);
    assert.equal(game.scenesDrawn, 0);
    assert.equal(game.overlays, 0);
  });

  it("изменение вьюпорта позиционирует и ресайзит сцену", () => {
    const view = fakeView();
    const game: SpyGame = new SpyGame({view: view, canvas: fakeCanvasEl().el});
    view.resize();

    const scene: Canvas = game.scene;
    assert.equal(scene.canvasEl.style.left, "10px");
    assert.equal(scene.canvasEl.style.top, "20px");
    assert.equal(scene.width, 200);
  });

  it("игра использует снимок подписки без повторного чтения state", () => {
    const view = fakeView();
    let notify: (change: ViewportChange) => void = () => {};
    view.onChange = fn => {
      notify = fn;
      return () => {};
    };
    const game = new SpyGame({view, canvas: fakeCanvasEl().el});
    Object.defineProperty(view, "state", {
      get: () => {
        throw new Error("повторное чтение state");
      },
    });
    notify({size: {w: 300, h: 150}, pos: {x: 25, y: 50}});
    raf.step(1000);
    assert.deepEqual(game.scene.size(), {w: 300, h: 150});
    assert.equal(game.scene.canvasEl.style.left, "25px");
    assert.equal(game.scene.canvasEl.style.top, "50px");
  });

  it("эффекты: upd каждый кадр, after удаляется после isDone", () => {
    const game: SpyGame = makeGame();
    const effect: SpyEffect = new SpyEffect({limit: 2});
    game.addAfterEffect(effect);

    raf.step(1032); // upd #1
    raf.step(1064); // upd #2 → done, удаляется
    raf.step(1096); // upd больше не зовётся

    assert.equal(effect.upds, 2);
    assert.equal(effect.draws, 2);
  });

  for (const layer of ["before", "after"] as const) {
    for (const paused of [false, true]) {
      it(`последний кадр ${layer}-эффекта очищается${paused ? " на паузе" : ""}, затем перерисовка прекращается`, () => {
        const {el, ctx} = fakeCanvasEl();
        const game = new SpyGame({view: fakeView(), canvas: el});
        raf.step(1000);
        let completed = 0;
        const effect = new Text3dEffect({text: ["Done"], maxTime: 32, onDone: () => completed++});
        if (layer === "before") game.addBeforeEffect(effect);
        else game.addAfterEffect(effect);

        raf.step(1032);
        assert.ok(callsOf(ctx, "fillText").length > 0, "последний кадр эффекта нарисован");
        assert.equal(completed, 1);
        if (paused) game.pause();
        ctx.calls.length = 0;

        raf.step(1064);
        assert.deepEqual(callsOf(ctx, "clearRect"), [[0, 0, 200, 100]]);
        assert.equal(callsOf(ctx, "fillText").length, 0, "эффект больше не рисуется");
        const scenes = game.scenesDrawn;
        raf.step(1096);
        assert.equal(game.scenesDrawn, scenes, "после очистки нет лишних перерисовок");
        assert.equal(completed, 1);
        game.destroy();
      });
    }
  }

  it("отмена группы на паузе убирает оба слоя, не завершает эффекты и сохраняет остальные", async () => {
    const game = makeGame();
    const attempt = Symbol("attempt");
    const otherGroup = Symbol("attempt");
    let completed = 0;
    const before = new SpyEffect({limit: 20, onDone: () => completed++});
    const after = new SpyEffect({limit: 20, onDone: () => completed++});
    const other = new SpyEffect({limit: 20});
    game.addBeforeEffect(before, attempt);
    game.addAfterEffect(after, attempt);
    game.addAfterEffect(other, otherGroup);
    const service = game.runEffect(SpyEffect, {limit: 2});
    raf.step(1032);
    game.pause();
    const draws = game.scenesDrawn;
    game.cancelEffects(attempt);
    game.cancelEffects(attempt); // повторная отмена безопасна
    raf.step(1064);
    assert.equal(game.scenesDrawn, draws + 1, "отмена запрашивает кадр даже на паузе");
    assert.equal(before.draws, 1);
    assert.equal(after.draws, 1);
    assert.equal(other.draws, 2);
    assert.equal(completed, 0, "отмена не вызывает успешное завершение");
    game.resume();
    raf.step(1096);
    assert.equal(before.upds, 1);
    assert.equal(after.upds, 1);
    assert.equal(other.upds, 2);
    await service; // негрупповой runEffect сохраняет свой Promise и завершение
    const nextAttempt = new SpyEffect({limit: 20});
    game.addAfterEffect(nextAttempt, attempt);
    raf.step(1128);
    game.cancelEffects(attempt); // группу можно использовать для следующей попытки
    raf.step(1160);
    assert.equal(nextAttempt.upds, 1);
    assert.equal(nextAttempt.draws, 1);
  });

  it("эффект с needRedraw=false не будит перерисовку", () => {
    class LazyEffect extends Animation {
      constructor() {
        super({});
      }
      protected maxTime: number = Infinity;
      public draw(_scene: Canvas): void {}
      public needRedraw(): boolean {
        return false;
      }
    }
    const game: SpyGame = makeGame();
    const scenesBefore: number = game.scenesDrawn;
    game.addAfterEffect(new LazyEffect());
    raf.step(1032);

    assert.equal(game.scenesDrawn, scenesBefore);
  });

  it("завершение будит заключительный кадр даже при needRedraw=false", () => {
    class LazyTimed extends SpyEffect {
      public needRedraw(): boolean {
        return false;
      }
    }
    const game = makeGame();
    const effect = new LazyTimed({limit: 1});
    const scenesBefore = game.scenesDrawn;
    game.addAfterEffect(effect);
    raf.step(1032);
    assert.equal(effect.isDone(), true);
    assert.equal(effect.draws, 1);
    assert.equal(game.scenesDrawn, scenesBefore + 1);
    raf.step(1064);
    assert.equal(effect.draws, 1);
    assert.equal(game.scenesDrawn, scenesBefore + 2);
  });

  it("обработчик завершения меняет сцену до заключительного рисования эффекта", () => {
    const order: string[] = [];
    class HandoffGame extends SpyGame {
      protected drawScene(): void {
        order.push("scene");
      }
    }
    class HandoffEffect extends SpyEffect {
      public draw(_scene: Canvas): void {
        order.push(this.isDone() ? "final" : "active");
      }
    }
    const game = new HandoffGame({view: fakeView(), canvas: fakeCanvasEl().el, dpr: 1});
    raf.step(1000);
    order.length = 0;
    game.addAfterEffect(new HandoffEffect({limit: 1, onDone: () => order.push("done")}));
    raf.step(1032);
    assert.deepEqual(order, ["done", "scene", "final"]);
  });

  it("runEffect резолвится с данными onDone", async () => {
    class Data extends Animation<{limit?: number}, string> {
      private upds = 0;
      constructor(props: AnimationProps<string> & {limit?: number}) {
        super(props);
        this.maxTime = Infinity;
      }
      protected update(_dt: number): void {
        this.upds++;
        if (this.upds >= (this.props.limit ?? 2)) {
          this.finish("payload");
        }
      }
      public draw(_scene: Canvas): void {}
    }
    const game: SpyGame = makeGame();
    const promise: Promise<string | undefined> = game.runEffect(Data, {limit: 2});
    raf.step(1032);
    raf.step(1064);

    assert.equal(await promise, "payload");
  });

  it("runEffect с Ripple и fade=0 завершается по пределу времени", async () => {
    const game = makeGame();
    let completed = false;
    const promise = game.runEffect(Ripple, {x: 10, y: 10, fade: 0}).then(() => {
      completed = true;
    });

    for (let i = 1; i < 50; i++) raf.step(1000 + i * 100);
    await Promise.resolve();
    assert.equal(completed, false);
    raf.step(6000);
    await Promise.resolve();
    assert.equal(completed, true);
    await promise;
    game.destroy();
  });

  it("destroy останавливает цикл", () => {
    const game: SpyGame = makeGame();
    game.destroy();
    assert.equal(raf.pendingCount, 0);

    assert.equal(game.scenesDrawn, 1);
  });

  it("destroy до первого кадра отменяет запуск и отписывает игру от вьюпорта", () => {
    const view = fakeView();
    const {el, ctx} = fakeCanvasEl();
    const game = new SpyGame({view, canvas: el});
    let started = 0;
    game.on("loop:start", () => started++);
    ctx.calls.length = 0;
    const firstFrame = raf.nextCallback;

    game.destroy();
    game.destroy();
    view.resize();
    firstFrame(1000); // даже если отменённый callback всё-таки был доставлен

    assert.equal(raf.pendingCount, 0);
    assert.equal(started, 0);
    assert.equal(game.scenesDrawn, 0);
    assert.equal(ctx.calls.length, 0);
  });

  it("destroy из updateScene не рисует сцену и не планирует следующий кадр", () => {
    class Game extends SpyGame {
      protected updateScene(): void {
        this.destroy();
      }
    }
    const game = new Game({view: fakeView(), canvas: fakeCanvasEl().el});
    raf.step(1000);
    assert.equal(game.scenesDrawn, 0);
    assert.equal(raf.pendingCount, 0);
  });

  it("destroy из drawScene не планирует следующий кадр и не отправляет loop:start", () => {
    class Game extends SpyGame {
      protected drawScene(): void {
        super.drawScene();
        this.destroy();
      }
    }
    const game = new Game({view: fakeView(), canvas: fakeCanvasEl().el});
    let started = 0;
    game.on("loop:start", () => started++);
    raf.step(1000);
    assert.equal(game.scenesDrawn, 1);
    assert.equal(raf.pendingCount, 0);
    assert.equal(started, 0);
  });

  it("destroy отменяет runEffect в обоих слоях без успешного завершения", async () => {
    const game = makeGame();
    let completed = 0;
    const effect = new SpyEffect({limit: 100, onDone: () => completed++});
    game.addAfterEffect(effect, Symbol("group"));
    const before = game.runEffect(SpyEffect, {limit: 100}, true);
    const after = game.runEffect(SpyEffect, {limit: 100});
    const checks = [assert.rejects(before, {name: "AbortError"}), assert.rejects(after, {name: "AbortError"})];

    game.destroy();
    game.destroy();
    await Promise.all(checks);
    assert.equal(effect.upds, 0);
    assert.equal(completed, 0);
    assert.equal(raf.pendingCount, 0);
    await assert.rejects(game.runEffect(SpyEffect, {}), {name: "AbortError"});
  });

  it("destroy одной игры не уничтожает общий вьюпорт", () => {
    const resizeListeners = new Set<() => void>();
    const host = {
      innerWidth: 200,
      innerHeight: 100,
      addEventListener: (_type: string, fn: () => void) => {
        resizeListeners.add(fn);
      },
      removeEventListener: (_type: string, fn: () => void) => {
        resizeListeners.delete(fn);
      },
    };
    const view = new Viewport({}, host);
    const first = new SpyGame({view, canvas: fakeCanvasEl().el});
    const second = new SpyGame({view, canvas: fakeCanvasEl().el});
    first.destroy();
    host.innerWidth = 400;
    for (const fn of resizeListeners) fn();

    assert.equal(first.scene.width, 200);
    assert.equal(second.scene.width, 400);
    assert.equal(resizeListeners.size, 1);
    second.destroy();
    view.destroy();
    assert.equal(resizeListeners.size, 0);
  });
});
