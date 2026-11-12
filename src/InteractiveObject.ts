import type {Canvas} from "./Canvas.ts";

export type InteractiveObjectProps = {
  x?: number;
  y?: number;
  visible?: boolean;
};

/**
 * Основа интерактивного элемента, нарисованного на Canvas.
 * render() сохраняет смещение контейнера в x0/y0 и вызывает renderSelf().
 * Потомок реализует отрисовку и hitTest(); check() передаёт в hitTest()
 * координаты указателя без преобразования.
 */
export abstract class InteractiveObject<TProps = object> {
  protected props: TProps & Required<InteractiveObjectProps>;
  /** Смещение контейнера на момент последней отрисовки. */
  protected x0: number = 0;
  protected y0: number = 0;
  protected hover: boolean = false;

  protected constructor(props: TProps & InteractiveObjectProps) {
    this.props = Object.assign({x: 0, y: 0, visible: props.visible ?? true}, props) as TProps &
      Required<InteractiveObjectProps>;
  }

  /** Обновляет переданные свойства объекта. */
  public upd(props: Partial<TProps & InteractiveObjectProps>): void {
    Object.assign(this.props, props);
  }

  public get visible(): boolean {
    return this.props.visible;
  }

  public get x(): number {
    return this.props.x;
  }

  public get y(): number {
    return this.props.y;
  }

  /** Рисует объект, запоминая смещение для хит-теста. */
  public render(scene: Canvas, offsetX: number = 0, offsetY: number = 0): void {
    this.x0 = offsetX;
    this.y0 = offsetY;
    if (this.props.visible) this.renderSelf(scene, this.hover);
  }

  /** Проверяет попадание указателя. Для невидимого объекта возвращает false. */
  public check(x: number, y: number): boolean {
    return this.props.visible && this.hitTest(x, y);
  }

  /** Включает hover. Возвращает true, если состояние изменилось. */
  public over(): boolean {
    const before: boolean = this.hover;
    this.hover = true;
    return before !== this.hover;
  }

  /** Выключает hover. Возвращает true, если состояние изменилось. */
  public out(): boolean {
    const before: boolean = this.hover;
    this.hover = false;
    return before !== this.hover;
  }

  /** Клик. Координаты — те же, что прошли `check()`; переопределяется наследником. */
  public click(x: number, y: number): void {
    void x;
    void y;
  }

  protected abstract renderSelf(scene: Canvas, hover: boolean): void;

  protected abstract hitTest(x: number, y: number): boolean;

  /** Расширяет прямоугольник на d с каждой стороны. */
  protected incRect(rect: [number, number, number, number], d: number): [number, number, number, number] {
    return [rect[0] - d, rect[1] - d, rect[2] + 2 * d, rect[3] + 2 * d];
  }
}
