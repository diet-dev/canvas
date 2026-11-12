/**
 * Обёртка над Canvas 2D с масштабированием по devicePixelRatio.
 *
 * Все координаты и размеры задаются в CSS-пикселях. Базовый масштаб
 * `ctx.scale(dpr, dpr)` применяется в `resize()` сразу после присвоения
 * width/height: по спецификации присвоение сбрасывает всё состояние контекста,
 * поэтому масштаб восстанавливается после каждого изменения размера.
 * Контекст масштабирует геометрию, шрифты, линии и градиенты.
 *
 * Отдельное масштабирование требуется для:
 * - тени: `shadowBlur`/`shadowOffset` задаются в device-space, CTM на них
 *   не влияет — умножаются вручную;
 * - исходный прямоугольник `drawImage` из canvas-источника: это пиксели
 *   источника, трансформ назначения на них не влияет.
 *
 * При прямом доступе к ctx вызовы setTransform(), resetTransform() и reset()
 * могут заменить или сбросить масштаб DPR. resize() устанавливает его заново.
 *
 * Принимает готовый элемент canvas или создаёт новый. Размещением элемента
 * в DOM управляет вызывающий код.
 */
import type {Size} from "./geometry.ts";

export type CanvasOptions = {
  /** Готовый элемент. По умолчанию создаётся новый, не прикреплённый к DOM. */
  canvas?: HTMLCanvasElement;
  /**
   * Плотность пикселей. По умолчанию — `window.devicePixelRatio` (в браузере)
   * или 1 (вне браузера). Явное значение нужно тестам и скриншот-рендеру.
   * Неположительные и нечисловые значения, включая бесконечность, заменяются на 1.
   */
  dpr?: number;
};

export type Draw3dTextOptions = {
  text: string;
  x: number;
  y: number;
  /** Глубина 3d-сдвига в пикселях. */
  depth: number;
  fontSize: number;
  fontFamily?: string;
  color: string;
  shadowColor: string;
};

export class Canvas {
  public readonly canvasEl: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  private pixelRatio: number;

  public get dpr(): number {
    return this.pixelRatio;
  }

  private logicalWidth: number = 0;
  private logicalHeight: number = 0;

  /** Логическая ширина в CSS-пикселях. Изменяется через resize(). */
  public get width(): number {
    return this.logicalWidth;
  }

  /** Логическая высота в CSS-пикселях. Изменяется через resize(). */
  public get height(): number {
    return this.logicalHeight;
  }

  constructor(width: number, height: number, options: CanvasOptions = {}) {
    this.pixelRatio = normalizeDpr(options.dpr ?? resolveDpr(), 1);
    this.canvasEl = options.canvas ?? (document.createElement("canvas") as HTMLCanvasElement);
    this.ctx = this.canvasEl.getContext("2d") as CanvasRenderingContext2D;
    this.resize(width, height);
  }

  /** Меняет плотность, сохраняя логические размеры; сбрасывает bitmap и контекст. */
  public setDpr(dpr: number): void {
    dpr = normalizeDpr(dpr, this.pixelRatio);
    if (dpr === this.pixelRatio) return;
    this.pixelRatio = dpr;
    this.resize(this.width, this.height);
  }

  /** Меняет размер сцены. Стилевые размеры остаются в CSS-пикселях. */
  public resize(width: number, height: number): void {
    this.logicalWidth = width;
    this.logicalHeight = height;
    // Присвоение width/height сбрасывает контекст (матрица, стили, битмап) —
    // базовый масштаб задаётся сразу после него.
    this.canvasEl.width = width * this.dpr;
    this.canvasEl.height = height * this.dpr;
    this.canvasEl.style.width = width + "px";
    this.canvasEl.style.height = height + "px";
    this.ctx.scale(this.dpr, this.dpr);
  }

  public size(): Size {
    return {w: this.width, h: this.height};
  }

  // ---------- состояние ----------

  public fillStyle(style: string | CanvasGradient): void {
    this.ctx.fillStyle = style;
  }

  public strokeStyle(style: string | CanvasGradient): void {
    this.ctx.strokeStyle = style;
  }

  /** Толщина линии в CSS-пикселях — растягивается трансформом. */
  public lineWidth(width: number): void {
    this.ctx.lineWidth = width;
  }

  public shadowColor(color: string): void {
    this.ctx.shadowColor = color;
  }

  /** Радиус тени в CSS-пикселях. Тени живут в device-space и умножаются вручную. */
  public shadowBlur(blur: number): void {
    this.ctx.shadowBlur = blur * this.dpr;
  }

  /** Размер шрифта в CSS-пикселях — растягивается трансформом. */
  public font(size: number, family?: string, weight?: "normal" | "bold"): void {
    this.ctx.font = `${weight ?? "normal"} ${size}px ${family ?? "Arial"}`;
  }

  public globalAlpha(alpha: number): void {
    this.ctx.globalAlpha = alpha;
  }

  // ---------- текст ----------

  public fillText(text: string, x: number, y: number): void {
    this.ctx.fillText(text, x, y);
  }

  public strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.ctx.strokeText(text, x, y, maxWidth);
  }

  public fillCenterText(text: string, y: number): void {
    this.fillText(text, (this.width - this.textWidth(text)) / 2, y);
  }

  /** Метрики — в юзер-пространстве (до трансформа), поэтому без делений. */
  public textWidth(text: string): number {
    return this.ctx.measureText(text).width;
  }

  public textHeight(text: string): number {
    const metrics: TextMetrics = this.ctx.measureText(text);
    return metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  }

  /** Текст с псевдо-3d: стопка сдвинутых заливок + подсветка тенью. */
  public draw3dText(options: Draw3dTextOptions): void {
    const {text, x, y, depth, fontSize, fontFamily, color, shadowColor} = options;
    this.save();
    this.fillStyle(color);
    this.font(fontSize, fontFamily);
    const dx: number = this.textWidth(text) / 2;

    for (let n: number = 0; n < depth; n++) {
      this.ctx.fillText(text, x - n - dx, y - n);
    }
    this.shadowColor(shadowColor);
    this.shadowBlur(10);
    // Смещение тени — device-space, как и её радиус.
    this.ctx.shadowOffsetX = (depth + 2) * this.dpr;
    this.ctx.shadowOffsetY = (depth + 2) * this.dpr;

    this.ctx.fillText(text, x - depth - dx, y - depth);
    this.restore();
  }

  // ---------- фигуры ----------

  public fillRect(x: number, y: number, width: number, height: number, color?: string | CanvasGradient): void {
    if (color) {
      this.ctx.fillStyle = color;
    }
    this.ctx.fillRect(x, y, width, height);
  }

  /** Заливает весь холст целиком. */
  public fillAll(color: string): void {
    this.fillStyle(color);
    this.fillRect(0, 0, this.width, this.height);
  }

  public strokeRect(x: number, y: number, width: number, height: number, color?: string, lineWidth: number = 1): void {
    if (color) this.strokeStyle(color);
    this.lineWidth(lineWidth);
    this.ctx.strokeRect(x, y, width, height);
  }

  public fillCircle(x: number, y: number, radius: number, color?: string): void {
    this.beginPath();
    if (color) this.fillStyle(color);
    this.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.closePath();
  }

  public roundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill?: string | CanvasGradient,
    stroke?: string,
  ): void {
    this.beginPath();
    this.moveTo(x + radius, y);
    this.lineTo(x + width - radius, y);
    this.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.lineTo(x + width, y + height - radius);
    this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.lineTo(x + radius, y + height);
    this.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.lineTo(x, y + radius);
    this.quadraticCurveTo(x, y, x + radius, y);
    this.closePath();

    if (fill) {
      this.fill(fill);
    }
    if (stroke) {
      this.stroke(stroke);
    }
  }

  // ---------- путь ----------

  public beginPath(): void {
    this.ctx.beginPath();
  }

  public closePath(): void {
    this.ctx.closePath();
  }

  public moveTo(x: number, y: number): void {
    this.ctx.moveTo(x, y);
  }

  public lineTo(x: number, y: number): void {
    this.ctx.lineTo(x, y);
  }

  public quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.ctx.quadraticCurveTo(cpx, cpy, x, y);
  }

  public arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    anticlockwise?: boolean,
  ): void {
    this.ctx.arc(x, y, radius, startAngle, endAngle, anticlockwise);
  }

  public fill(color?: string | CanvasGradient): void {
    if (color) {
      this.fillStyle(color);
    }
    this.ctx.fill();
  }

  public stroke(color?: string): void {
    if (color) {
      this.strokeStyle(color);
    }
    this.ctx.stroke();
  }

  public strokeLine(x1: number, y1: number, x2: number, y2: number): void {
    this.beginPath();
    this.moveTo(x1, y1);
    this.lineTo(x2, y2);
    this.stroke();
    this.closePath();
  }

  // ---------- трансформации ----------

  public save(): void {
    this.ctx.save();
  }

  public restore(): void {
    this.ctx.restore();
  }

  /** Сдвиг в CSS-пикселях, поверх базового масштаба. */
  public translate(x: number, y: number): void {
    this.ctx.translate(x, y);
  }

  public rotate(angle: number): void {
    this.ctx.rotate(angle);
  }

  public scale(x: number, y: number): void {
    this.ctx.scale(x, y);
  }

  // ---------- градиенты и картинки ----------

  /** Координаты градиента — в CSS-пикселях: трансформ применяется при отрисовке. */
  public createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    return this.ctx.createLinearGradient(x0, y0, x1, y1);
  }

  public createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient {
    return this.ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  }

  /** Очистка. Без аргументов — весь холст; аргументы — в CSS-пикселях. */
  public clear(x: number = 0, y: number = 0, width: number = this.width, height: number = this.height): void {
    this.ctx.clearRect(x, y, width, height);
  }

  /**
   * Назначение всегда в CSS-пикселях. Для Canvas координаты вырезки логические:
   * они умножаются на DPR источника. Без размера назначения Canvas рисуется
   * в своём логическом размере. Для HTMLImageElement и HTMLCanvasElement
   * вырезка и исходный размер — физические пиксели, как в Canvas 2D.
   */
  public drawImage(source: Canvas | HTMLImageElement | HTMLCanvasElement, dx: number, dy: number): void;
  public drawImage(
    source: Canvas | HTMLImageElement | HTMLCanvasElement,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  public drawImage(
    source: Canvas | HTMLImageElement | HTMLCanvasElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  public drawImage(
    source: Canvas | HTMLImageElement | HTMLCanvasElement,
    ...args:
      | [dx: number, dy: number]
      | [dx: number, dy: number, dw: number, dh: number]
      | [sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number]
  ): void {
    const wrapped = source instanceof Canvas;
    const image = wrapped ? source.canvasEl : source;
    if (args.length === 2) {
      if (wrapped) this.ctx.drawImage(image, ...args, source.width, source.height);
      else this.ctx.drawImage(image, ...args);
      return;
    }
    if (args.length === 4) {
      this.ctx.drawImage(image, ...args);
      return;
    }
    const [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    const sourceScale = wrapped ? source.dpr : 1;
    this.ctx.drawImage(image, sx * sourceScale, sy * sourceScale, sw * sourceScale, sh * sourceScale, dx, dy, dw, dh);
  }
}

/** Плотность пикселей окружения: в браузере — devicePixelRatio, иначе 1. */
function resolveDpr(): number {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

/** Недопустимая плотность сохраняет переданное безопасное значение. */
function normalizeDpr(dpr: number, fallback: number): number {
  return Number.isFinite(dpr) && dpr > 0 ? dpr : fallback;
}
