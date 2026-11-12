import assert from "node:assert/strict";
import {describe, it} from "node:test";
import type {Canvas} from "../src/Canvas.ts";
import {InteractiveObject, type InteractiveObjectProps} from "../src/InteractiveObject.ts";

class Box extends InteractiveObject<{size: number}> {
  public rendered: number = 0;

  // Публичный конструктор: базовый защищён.
  public constructor(props: {size: number} & InteractiveObjectProps) {
    super(props);
  }

  protected renderSelf(_scene: Canvas, _hover: boolean): void {
    this.rendered++;
  }

  protected hitTest(x: number, y: number): boolean {
    const size: number = this.props.size;
    return x >= this.x0 && x <= this.x0 + size && y >= this.y0 && y <= this.y0 + size;
  }
}

describe("InteractiveObject", () => {
  it("дефолты: x/y=0, visible=true", () => {
    const box: Box = new Box({size: 10});
    assert.deepEqual([box.x, box.y, box.visible], [0, 0, true]);
  });

  it("hitTest по смещению, заданному при отрисовке", () => {
    const box: Box = new Box({size: 10});
    box.render({} as Canvas, 100, 50);

    assert.ok(box.check(105, 55));
    assert.ok(!box.check(5, 5));
  });

  it("невидимый объект не ловит клики и не рисуется", () => {
    const box: Box = new Box({size: 10, visible: false});
    box.render({} as Canvas, 0, 0);

    assert.ok(!box.check(5, 5));
    assert.equal(box.rendered, 0);
  });

  it("upd патчит пропсы на месте", () => {
    const box: Box = new Box({size: 10});
    box.upd({x: 7, visible: false});

    assert.equal(box.x, 7);
    assert.ok(!box.visible);
  });

  it("over/out возвращают изменение состояния", () => {
    const box: Box = new Box({size: 10});
    assert.ok(box.over()); // false → true
    assert.ok(!box.over()); // уже true
    assert.ok(box.out()); // true → false
    assert.ok(!box.out());
  });

  it("click — переопределяемая заглушка", () => {
    const box: Box = new Box({size: 10});
    box.click(1, 2); // не бросает
  });
});
