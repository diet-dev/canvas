import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {callsOf, fakeCanvasEl, fakeScene} from "./FakeCanvas.ts";
import {Canvas} from "../src/Canvas.ts";

// В Node нет HTMLImageElement: определяем стаб, чтобы проверить ветку
// «источник — картинка» в drawImage (в ней координаты не трогаются).
class FakeImageElement {}
(globalThis as unknown as {HTMLImageElement: unknown}).HTMLImageElement ??= FakeImageElement;

describe("Canvas", () => {
  it("размеры нельзя изменить присваиванием в обход resize", () => {
    const {el} = fakeCanvasEl();
    const scene = new Canvas(100, 50, {canvas: el, dpr: 2});
    assert.equal(Reflect.set(scene, "width", 300), false);
    assert.equal(Reflect.set(scene, "height", 150), false);
    assert.deepEqual(scene.size(), {w: 100, h: 50});
    assert.equal(el.width, 200);
    assert.equal(el.height, 100);
    scene.resize(300, 150);
    assert.equal(scene.width, 300);
    assert.equal(scene.height, 150);
    assert.deepEqual(scene.size(), {w: 300, h: 150});
    assert.equal(el.width, 600);
    assert.equal(el.height, 300);
  });

  it("конструктор применяет базовый масштаб и выставляет размеры", () => {
    const {el, ctx} = fakeCanvasEl();
    new Canvas(100, 50, {canvas: el, dpr: 2});

    // resize() внутри конструктора: сначала width/height (сброс контекста),
    // затем ctx.scale(dpr) — восстановление базового масштаба.
    assert.deepEqual(callsOf(ctx, "scale"), [[2, 2]]);
    assert.deepEqual(ctx.getTransform(), {a: 2, b: 0, c: 0, d: 2, e: 0, f: 0});
    assert.equal(el.width, 200);
    assert.equal(el.height, 100);
    assert.equal(el.style.width, "100px");
    assert.equal(el.style.height, "50px");
  });

  it("конструктор проверяет DPR и однократно устанавливает размер и масштаб", () => {
    for (const dpr of [0, -1, NaN, Infinity, -Infinity, 1, 1.5, 2]) {
      const {el, ctx} = fakeCanvasEl();
      const scene = new Canvas(100, 50, {canvas: el, dpr});
      const expected = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
      assert.equal(scene.dpr, expected);
      assert.deepEqual(scene.size(), {w: 100, h: 50});
      assert.equal(el.width, 100 * expected);
      assert.equal(el.height, 50 * expected);
      assert.deepEqual(callsOf(ctx, "scale"), [[expected, expected]]);
      assert.deepEqual(ctx.getTransform(), {a: expected, b: 0, c: 0, d: expected, e: 0, f: 0});
    }
  });

  it("resize обновляет размеры и возвращает базовый масштаб", () => {
    const {el, ctx} = fakeCanvasEl();
    const scene: Canvas = new Canvas(100, 50, {canvas: el, dpr: 2});
    ctx.calls.length = 0;
    scene.resize(300, 150);

    assert.equal(scene.width, 300);
    assert.equal(scene.height, 150);
    assert.equal(el.width, 600);
    assert.equal(el.height, 300);
    assert.equal(el.style.width, "300px");
    assert.deepEqual(callsOf(ctx, "scale"), [[2, 2]]);
  });

  it("resize сбрасывает старое состояние и не накапливает DPR при повторном вызове", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    scene.fillStyle("#f00");
    scene.globalAlpha(0.5);
    scene.translate(10, 20);
    scene.save();
    scene.scale(3, 4);

    scene.resize(100, 100);
    scene.resize(100, 100);
    scene.restore();

    assert.equal(ctx.fillStyle, "#000000");
    assert.equal(ctx.globalAlpha, 1);
    assert.deepEqual(ctx.getTransform(), {a: 2, b: 0, c: 0, d: 2, e: 0, f: 0});
  });

  it("fillRect пробрасывает CSS-координаты", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    scene.fillRect(10, 20, 30, 40, "#fff");

    assert.deepEqual(callsOf(ctx, "fillRect"), [[10, 20, 30, 40]]);
    assert.equal(ctx.props.fillStyle, "#fff");
    assert.equal(ctx.draws[0].props.fillStyle, "#fff");
    assert.deepEqual(ctx.draws[0].transform, [2, 0, 0, 2, 0, 0]);
  });

  it("fillAll льёт весь холст", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    scene.fillAll("#000");

    assert.deepEqual(callsOf(ctx, "fillRect"), [[0, 0, 100, 100]]);
  });

  it("fillCircle пробрасывает координаты и радиус", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    scene.fillCircle(10, 10, 5, "#f00");

    const arcArgs: unknown[] = callsOf(ctx, "arc")[0];
    assert.deepEqual(arcArgs.slice(0, 5), [10, 10, 5, 0, Math.PI * 2]);
  });

  it("roundRect применяет переданные цвета заливки и обводки", () => {
    const {scene, ctx} = fakeScene(100, 100);
    scene.fillStyle("#111");
    scene.strokeStyle("#222");

    scene.roundRect(10, 20, 60, 40, 5, "#abc", "#def");

    assert.equal(ctx.props.fillStyle, "#abc");
    assert.equal(ctx.props.strokeStyle, "#def");
    assert.equal(callsOf(ctx, "fill").length, 1);
    assert.equal(callsOf(ctx, "stroke").length, 1);
    assert.equal(ctx.draws.find(draw => draw.method === "fill")?.props.fillStyle, "#abc");
    assert.equal(ctx.draws.find(draw => draw.method === "stroke")?.props.strokeStyle, "#def");
  });

  it("roundRect поддерживает градиентную заливку без обводки", () => {
    const {scene, ctx} = fakeScene(100, 100);
    const gradient = scene.createLinearGradient(0, 0, 100, 0);

    scene.roundRect(0, 0, 100, 50, 5, gradient);

    assert.equal(ctx.props.fillStyle, gradient);
    assert.equal(callsOf(ctx, "fill").length, 1);
    assert.equal(callsOf(ctx, "stroke").length, 0);
    assert.equal(ctx.draws[0].props.fillStyle, gradient);
  });

  it("roundRect рисует только обводку, когда заливка не задана", () => {
    const {scene, ctx} = fakeScene(100, 100);
    scene.fillStyle("#111");

    scene.roundRect(0, 0, 100, 50, 5, undefined, "#def");

    assert.equal(ctx.props.fillStyle, "#111");
    assert.equal(ctx.props.strokeStyle, "#def");
    assert.equal(callsOf(ctx, "fill").length, 0);
    assert.equal(callsOf(ctx, "stroke").length, 1);
  });

  it("shadowBlur остаётся в device-space: умножается вручную", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    scene.shadowBlur(10);

    assert.equal(ctx.props.shadowBlur, 20);
  });

  it("font собирает строку без умножения — размер тянет трансформ", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    scene.font(12, "Arial", "bold");

    assert.equal(ctx.props.font, "bold 12px Arial");
  });

  it("font без family/weight даёт дефолты", () => {
    const {scene, ctx} = fakeScene(100, 100, 3);
    scene.font(10);

    assert.equal(ctx.props.font, "normal 10px Arial");
  });

  it("fillText пробрасывает координаты", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    scene.fillText("hi", 5, 6);

    assert.deepEqual(callsOf(ctx, "fillText"), [["hi", 5, 6]]);
  });

  it("textWidth возвращает метрику как есть — она в юзер-пространстве", () => {
    const {scene} = fakeScene(100, 100, 2);
    // Фейк measureText: 10px на символ → "abcd" = 40.
    assert.equal(scene.textWidth("abcd"), 40);
  });

  it("fillCenterText центрует по ширине сцены", () => {
    const {scene, ctx} = fakeScene(100, 100, 1);
    scene.fillCenterText("abcd", 10);

    // width 100, текст 40 → x = 30
    assert.deepEqual(callsOf(ctx, "fillText"), [["abcd", 30, 10]]);
  });

  it("translate пробрасывает CSS-сдвиг", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    scene.translate(10, 20);
    scene.rotate(Math.PI);

    assert.deepEqual(callsOf(ctx, "translate"), [[10, 20]]);
    assert.deepEqual(callsOf(ctx, "rotate"), [[Math.PI]]);
  });

  it("clear() без аргументов чистит весь холст", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    scene.clear();

    assert.deepEqual(callsOf(ctx, "clearRect"), [[0, 0, 100, 100]]);
  });

  it("clear() с аргументами режет область в CSS-пикселях", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    scene.clear(10, 10, 20, 20);

    assert.deepEqual(callsOf(ctx, "clearRect"), [[10, 10, 20, 20]]);
  });

  it("size() отдаёт CSS-размеры в формате Size {w, h}", () => {
    const {scene} = fakeScene(320, 240, 2);
    assert.deepEqual(scene.size(), {w: 320, h: 240});
  });

  it("draw3dText рисует depth+1 заливок", () => {
    const {scene, ctx} = fakeScene(200, 200, 1);
    scene.draw3dText({
      text: "OK",
      x: 100,
      y: 100,
      depth: 3,
      fontSize: 20,
      color: "#fff",
      shadowColor: "#000",
    });

    assert.equal(callsOf(ctx, "fillText").length, 4);
  });

  it("draw3dText применяет цвета и тень при рисовании, затем восстанавливает контекст", () => {
    const {scene, ctx} = fakeScene(200, 200, 2);
    scene.fillStyle("#123");
    scene.font(12, "Verdana", "bold");
    scene.globalAlpha(0.5);
    scene.shadowBlur(3);
    scene.translate(5, 7);
    const props = {...ctx.props};
    const transform = ctx.getTransform();

    scene.draw3dText({text: "OK", x: 100, y: 100, depth: 2, fontSize: 20, color: "#fff", shadowColor: "#000"});

    assert.equal(ctx.draws.length, 3);
    for (const draw of ctx.draws) {
      assert.equal(draw.props.fillStyle, "#fff");
      assert.equal(draw.props.font, "normal 20px Arial");
      assert.equal(draw.props.globalAlpha, 0.5);
      assert.deepEqual(draw.transform, [2, 0, 0, 2, 10, 14]);
    }
    const last = ctx.draws.at(-1)!;
    assert.equal(last.props.shadowColor, "#000");
    assert.equal(last.props.shadowBlur, 20);
    assert.equal(last.props.shadowOffsetX, 8);
    assert.equal(last.props.shadowOffsetY, 8);
    assert.deepEqual(ctx.props, props);
    assert.deepEqual(ctx.getTransform(), transform);
  });

  it("drawImage из img-источника пробрасывает всё как есть", () => {
    const {scene, ctx} = fakeScene(100, 100, 2);
    const img = new (globalThis as unknown as {HTMLImageElement: new () => object}).HTMLImageElement();
    scene.drawImage(img as unknown as HTMLImageElement, 0, 0, 10, 10, 5, 5, 20, 20);

    assert.deepEqual(callsOf(ctx, "drawImage")[0], [img, 0, 0, 10, 10, 5, 5, 20, 20]);
  });

  it("drawImage из canvas-источника сохраняет координаты назначения без вырезки", () => {
    for (const dpr of [1, 1.5, 2]) {
      const {scene, ctx} = fakeScene(100, 100, dpr);
      const source = fakeCanvasEl().el;
      scene.drawImage(source, 10, 20);

      assert.deepEqual(callsOf(ctx, "drawImage"), [[source, 10, 20]], `dpr=${dpr}`);
    }
  });

  it("drawImage из canvas-источника сохраняет координаты и размеры назначения без вырезки", () => {
    for (const dpr of [1, 1.5, 2]) {
      const {scene, ctx} = fakeScene(100, 100, dpr);
      const source = fakeCanvasEl().el;
      scene.drawImage(source, 10, 20, 30, 40);

      assert.deepEqual(callsOf(ctx, "drawImage"), [[source, 10, 20, 30, 40]], `dpr=${dpr}`);
    }
  });

  it("drawImage из HTMLCanvasElement использует физическую вырезку независимо от DPR назначения", () => {
    for (const dpr of [1, 1.5, 2]) {
      const {scene, ctx} = fakeScene(100, 100, dpr);
      const source = fakeCanvasEl().el;
      scene.drawImage(source, 3, 4, 10, 12, 5, 6, 20, 24);
      assert.deepEqual(callsOf(ctx, "drawImage"), [[source, 3, 4, 10, 12, 5, 6, 20, 24]]);
    }
  });

  it("drawImage из Canvas учитывает DPR источника во всех формах вызова", () => {
    for (const sourceDpr of [1, 1.5, 2, 3]) {
      for (const targetDpr of [1, 1.5, 2, 3]) {
        const {scene: source} = fakeScene(80, 40, sourceDpr);
        const {scene: target, ctx} = fakeScene(200, 100, targetDpr);
        target.drawImage(source, 10, 20);
        target.drawImage(source, 10, 20, 160, 80);
        target.drawImage(source, 3, 4, 10, 12, 5, 6, 20, 24);
        assert.deepEqual(callsOf(ctx, "drawImage"), [
          [source.canvasEl, 10, 20, 80, 40],
          [source.canvasEl, 10, 20, 160, 80],
          [source.canvasEl, 3 * sourceDpr, 4 * sourceDpr, 10 * sourceDpr, 12 * sourceDpr, 5, 6, 20, 24],
        ]);
        assert.deepEqual(ctx.getTransform(), {a: targetDpr, b: 0, c: 0, d: targetDpr, e: 0, f: 0});
      }
    }
  });

  it("drawImage использует актуальные размер и DPR источника после их изменения", () => {
    const {scene: source} = fakeScene(80, 40, 1);
    const {scene: target, ctx} = fakeScene(200, 100, 2);
    source.resize(100, 50);
    source.setDpr(3);
    target.drawImage(source, 0, 0);
    target.drawImage(source, 0, 0, 100, 50, 0, 0, 100, 50);
    assert.deepEqual(callsOf(ctx, "drawImage"), [
      [source.canvasEl, 0, 0, 100, 50],
      [source.canvasEl, 0, 0, 300, 150, 0, 0, 100, 50],
    ]);
  });
  it("setDpr сохраняет логические размеры, меняет масштаб и не сбрасывает холст повторно", () => {
    const {el, ctx} = fakeCanvasEl();
    const scene = new Canvas(100, 50, {canvas: el, dpr: 2});
    ctx.calls.length = 0;
    scene.setDpr(1.5);
    assert.equal(scene.dpr, 1.5);
    assert.deepEqual(scene.size(), {w: 100, h: 50});
    assert.equal(el.width, 150);
    assert.equal(el.height, 75);
    assert.equal(el.style.width, "100px");
    assert.deepEqual(callsOf(ctx, "scale"), [[1.5, 1.5]]);
    ctx.calls.length = 0;
    for (const invalid of [1.5, 0, -1, NaN, Infinity]) scene.setDpr(invalid);
    assert.equal(ctx.calls.length, 0);
    scene.resize(200, 100);
    assert.equal(el.width, 300);
    assert.equal(el.height, 150);
  });
});
