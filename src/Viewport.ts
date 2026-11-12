import type {Point, Size} from "./geometry.ts";

/** Источник размеров. По умолчанию — window; тесты подставляют фейк. */
export type ViewportHost = {
  innerWidth: number;
  innerHeight: number;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

export type ViewportOptions = {
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  /**
   * Соотношение сторон h/w. Размер вписывается в окно с учётом maxW/maxH;
   * minW/minH при заданном ratio игнорируются.
   */
  ratio?: number;
};

export type ViewportChange = {readonly size: Size; readonly pos: Point};

/**
 * Рассчитывает размер и позицию области игры в окне и сообщает об изменениях.
 * state и уведомления возвращают один неизменяемый снимок текущего состояния.
 */
export class Viewport {
  private readonly options: ViewportOptions;
  private readonly host: ViewportHost;
  private readonly listeners = new Set<(change: ViewportChange) => void>();
  private destroyed: boolean = false;
  private readonly onResize = (): void => {
    this.update();
  };
  private change: ViewportChange = {size: {w: 1, h: 1}, pos: {x: 0, y: 0}};

  constructor(options: ViewportOptions = {}, host?: ViewportHost) {
    this.options = {...options};
    this.host = host ?? ((globalThis as unknown as {window?: ViewportHost}).window as ViewportHost);

    if (this.host) {
      this.host.addEventListener("resize", this.onResize);
    }
    this.update();
  }

  /** Текущие размеры и позиция. Снимок неизменяем и сохраняется до следующего resize. */
  public get state(): ViewportChange {
    return this.change;
  }

  /** Сразу передаёт неизменяемый снимок состояния и возвращает функцию отписки. */
  public onChange(fn: (change: ViewportChange) => void): () => void {
    if (this.destroyed) return () => {};
    const listener = (change: ViewportChange): void => fn(change);
    this.listeners.add(listener);
    fn(this.change);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Снимает обработчик resize и удаляет подписчиков. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.host.removeEventListener("resize", this.onResize);
    this.listeners.clear();
  }

  /** Пересчитывает состояние и уведомляет подписчиков при resize окна. */
  private update(): void {
    if (this.destroyed) return;
    const {innerWidth, innerHeight} = this.host;
    const maxW: number = Math.min(innerWidth, this.options.maxW || innerWidth);
    const maxH: number = Math.min(innerHeight, this.options.maxH || innerHeight);
    let w: number = maxW;
    let h: number = maxH;

    if (this.options.ratio) {
      // ratio = h / w; h = ratio * w; w = h / ratio
      const ratioH: number = this.options.ratio * w;
      h = ratioH > maxH ? maxH : ratioH;
      w = h / this.options.ratio;
    } else {
      w = Math.max(w, this.options.minW || 1);
      h = Math.max(h, this.options.minH || 1);
    }
    const change: ViewportChange = Object.freeze({
      size: Object.freeze({w, h}),
      pos: Object.freeze({x: Math.ceil((innerWidth - w) / 2), y: Math.ceil((innerHeight - h) / 2)}),
    });
    this.change = change;
    for (const fn of this.listeners) {
      fn(change);
    }
  }
}
