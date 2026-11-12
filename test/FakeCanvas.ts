import {Canvas} from "../src/Canvas.ts";

type Matrix = [number, number, number, number, number, number];

function defaultProps() {
  return {
    fillStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    strokeStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    shadowColor: "rgba(0, 0, 0, 0)",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalAlpha: 1,
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    font: "10px sans-serif",
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
  };
}

export type DrawRecord = {
  method: string;
  args: unknown[];
  props: ReturnType<typeof defaultProps>;
  transform: Matrix;
};

const drawingMethods = new Set([
  "fillRect",
  "strokeRect",
  "clearRect",
  "fill",
  "stroke",
  "fillText",
  "strokeText",
  "drawImage",
]);

/**
 * Контекст для Node-тестов: хранит стили, матрицу и стек save/restore.
 * draws содержит состояние на момент рисования. Пиксели, clipping и
 * проверка допустимости CSS-значений не моделируются.
 */
export class FakeCtx2D {
  public calls: [string, unknown[]][] = [];
  public draws: DrawRecord[] = [];
  public props = defaultProps();
  private matrix: Matrix = [1, 0, 0, 1, 0, 0];
  private stack: {props: ReturnType<typeof defaultProps>; matrix: Matrix}[] = [];

  public record(method: string, args: unknown[]): void {
    this.calls.push([method, args]);
    if (drawingMethods.has(method)) {
      this.draws.push({method, args: [...args], props: {...this.props}, transform: [...this.matrix]});
    }
  }

  public resetState(): void {
    this.props = defaultProps();
    this.matrix = [1, 0, 0, 1, 0, 0];
    this.stack = [];
  }

  public save(): void {
    this.record("save", []);
    this.stack.push({props: {...this.props}, matrix: [...this.matrix]});
  }

  public restore(): void {
    this.record("restore", []);
    const saved = this.stack.pop();
    if (saved) {
      this.props = saved.props;
      this.matrix = saved.matrix;
    }
  }

  public getTransform(): DOMMatrix {
    const [a, b, c, d, e, f] = this.matrix;
    return {a, b, c, d, e, f} as DOMMatrix;
  }

  public setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.record("setTransform", [a, b, c, d, e, f]);
    this.matrix = [a, b, c, d, e, f];
  }

  public resetTransform(): void {
    this.record("resetTransform", []);
    this.matrix = [1, 0, 0, 1, 0, 0];
  }

  public scale(x: number, y: number): void {
    this.record("scale", [x, y]);
    this.multiply([x, 0, 0, y, 0, 0]);
  }

  public translate(x: number, y: number): void {
    this.record("translate", [x, y]);
    this.multiply([1, 0, 0, 1, x, y]);
  }

  public rotate(angle: number): void {
    this.record("rotate", [angle]);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.multiply([cos, sin, -sin, cos, 0, 0]);
  }

  private multiply([a, b, c, d, e, f]: Matrix): void {
    const [ma, mb, mc, md, me, mf] = this.matrix;
    this.matrix = [
      ma * a + mc * b,
      mb * a + md * b,
      ma * c + mc * d,
      mb * c + md * d,
      ma * e + mc * f + me,
      mb * e + md * f + mf,
    ];
  }

  public measureText(text: string): TextMetrics {
    // 10 CSS-px на символ, ascender/descender фиксированные.
    return {
      width: text.length * 10,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
    } as TextMetrics;
  }

  public createLinearGradient(): CanvasGradient {
    return {} as CanvasGradient;
  }

  public createRadialGradient(): CanvasGradient {
    return {} as CanvasGradient;
  }
}

/** Добавляет методы пути и рисования, а также свойства контекста. */
export function fakeCtx(): CanvasRenderingContext2D & FakeCtx2D {
  const ctx: FakeCtx2D = new FakeCtx2D();
  const methods: string[] = [
    "fillRect",
    "strokeRect",
    "clearRect",
    "beginPath",
    "closePath",
    "moveTo",
    "lineTo",
    "quadraticCurveTo",
    "arc",
    "ellipse",
    "fill",
    "stroke",
    "fillText",
    "strokeText",
    "drawImage",
  ];
  for (const method of methods) {
    (ctx as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
      ctx.record(method, args);
    };
  }
  for (const prop of Object.keys(ctx.props) as (keyof typeof ctx.props)[]) {
    Object.defineProperty(ctx, prop, {
      set: (value: unknown) => {
        Object.assign(ctx.props, {[prop]: value});
      },
      get: () => ctx.props[prop],
    });
  }
  return ctx as unknown as CanvasRenderingContext2D & FakeCtx2D;
}

/** Присвоение width или height сбрасывает состояние контекста, включая стек. */
export function fakeCanvasEl(
  width: number = 300,
  height: number = 150,
): {
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D & FakeCtx2D;
} {
  const ctx: CanvasRenderingContext2D & FakeCtx2D = fakeCtx();
  let bitmapWidth = width;
  let bitmapHeight = height;
  const el: Record<string, unknown> = {
    style: {} as Record<string, string>,
    className: "",
    getContext: () => ctx,
  };
  Object.defineProperties(el, {
    width: {
      get: () => bitmapWidth,
      set: (value: number) => {
        bitmapWidth = Math.trunc(value);
        ctx.resetState();
      },
    },
    height: {
      get: () => bitmapHeight,
      set: (value: number) => {
        bitmapHeight = Math.trunc(value);
        ctx.resetState();
      },
    },
  });
  return {el: el as unknown as HTMLCanvasElement, ctx};
}

export function callsOf(ctx: CanvasRenderingContext2D & FakeCtx2D, method: string): unknown[][] {
  return ctx.calls.filter(([name]) => name === method).map(([, args]) => args);
}

/** Сцена целиком на фейковом элементе — рендер идёт в записи вызовов. */
export function fakeScene(
  width: number,
  height: number,
  dpr: number = 1,
): {scene: Canvas; ctx: CanvasRenderingContext2D & FakeCtx2D} {
  const {el, ctx} = fakeCanvasEl();
  const scene: Canvas = new Canvas(width, height, {canvas: el, dpr: dpr});
  return {scene, ctx};
}
