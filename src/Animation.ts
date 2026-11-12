import type {Canvas} from "./Canvas.ts";

/** Обработчик завершения эффекта с необязательным результатом. */
export type AnimationProps<TResult = void> = {
  onDone?: (data?: TResult) => void;
};

/**
 * Базовый эффект игрового цикла.
 *
 * Класс накапливает время в `upd(dt)` и завершает эффект по `maxTime`,
 * вызывая `onDone` один раз до отрисовки кадра. Подклассы переопределяют
 * `update()` и завершают эффект через `finish()`. `isDone()` только читает состояние.
 * CanvasGame рисует активные эффекты при перерисовке сцены и удаляет завершённые.
 */
export abstract class Animation<TProps = object, TResult = void> {
  /** Нарисовать себя на сцене. Состояние читается из `this.props`/`this.time`. */
  public abstract draw(scene: Canvas): void;

  protected time: number = 0;
  protected maxTime: number = 1000;
  private done: boolean = false;
  private onDone: AnimationProps<TResult>["onDone"];
  protected props: AnimationProps<TResult> & TProps;

  protected constructor(props: AnimationProps<TResult> & TProps) {
    this.props = props;
    this.onDone = props.onDone;
  }

  /** Обновляет эффект и завершает его до рисования; после завершения ничего не делает. */
  public upd(dt: number): void {
    if (this.done) return;
    this.update(dt);
    if (this.time >= this.maxTime) this.finish();
  }

  public isDone(): boolean {
    return this.done;
  }

  /** Логика наследника; вызов super.update(dt) продвигает стандартные часы. */
  protected update(dt: number): void {
    this.time += dt;
  }

  /** Возвращает true, если обновление эффекта требует перерисовки. */
  public needRedraw(): boolean {
    return true;
  }

  /** Фиксирует завершение перед вызовом обработчика, в том числе при повторном входе. */
  protected finish(data?: TResult): void {
    if (this.done) return;
    this.done = true;
    const onDone = this.onDone;
    this.onDone = undefined;
    onDone?.(data);
  }
}
