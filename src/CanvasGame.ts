import type {Animation, AnimationProps} from "./Animation.ts";
import {Canvas} from "./Canvas.ts";
import type {EventMap} from "@dietdev/emitter";
import {EventEmitter} from "@dietdev/emitter";
import type {ViewportChange} from "./Viewport.ts";

type StoredAnimation = Pick<Animation, "upd" | "isDone" | "needRedraw" | "draw">;

/**
 * Интерфейс вьюпорта: размеры, позиция и подписка на изменения.
 * Реализован классом Viewport; можно передать собственную реализацию.
 */
export type ViewportLike = {
  readonly state: ViewportChange;
  onChange(fn: (change: ViewportChange) => void): () => void;
};

/** События, которые игра получает всегда, без настройки. */
export type CanvasGameEvents = {
  /** Отправляется после отрисовки первого кадра. */
  "loop:start": undefined;
};

export type CanvasGameOptions = {
  view: ViewportLike;
  /** Готовый элемент сцены; по умолчанию создаётся новый. */
  canvas?: HTMLCanvasElement;
  /** Плотность пикселей сцены; по умолчанию — плотность окружения. */
  dpr?: number;
  /** CSS-класс элемента сцены, например "game-scene". */
  className?: string;
};

/**
 * Игровой цикл на requestAnimationFrame с шагом времени не более 100 мс.
 * Обновляет логику и эффекты, перерисовывает сцену по запросу.
 * Пауза останавливает обновление, но сохраняет возможность перерисовки.
 * Эффекты размещаются под сценой или над ней; runEffect() позволяет ждать
 * завершения эффекта. Приложение добавляет scene.canvasEl в DOM.
 */
export abstract class CanvasGame<TEvents extends EventMap = Record<never, never>> {
  public readonly scene: Canvas;

  private viewport: ViewportChange;
  private readonly emitter: EventEmitter<TEvents & CanvasGameEvents> = new EventEmitter();
  private readonly effectsBefore: Map<string, StoredAnimation> = new Map();
  private readonly effectsAfter: Map<string, StoredAnimation> = new Map();
  private readonly effectGroups: Map<string, symbol> = new Map();
  private effectId: number = 0;
  private time: number = 0;
  private paused: boolean = false;
  private needRedraw: boolean = true;
  private destroyed: boolean = false;
  private readonly unsubscribeView: () => void;
  private frameId: number | undefined;
  private readonly pendingEffects = new Set<() => void>();
  protected drawCounter: number = 0;

  protected constructor(options: CanvasGameOptions) {
    this.viewport = options.view.state;
    const {w, h} = this.viewport.size;
    this.scene = new Canvas(w, h, {canvas: options.canvas, dpr: options.dpr});
    if (options.className) this.scene.canvasEl.className = options.className;

    this.unsubscribeView = options.view.onChange(change => {
      if (this.destroyed) return;
      this.viewport = change;
      this.onResize();
    });

    this.frameId = requestAnimationFrame((time: number) => {
      this.frameId = undefined;
      if (this.destroyed) return;
      this.onResize();
      /* В некоторых браузерах между первым вызовом requestAnimationFrame() и первым
        вызовом функции обратного вызова существует многокадровая задержка.
        Фиксируем время заранее, чтобы первый dt не получился гигантским. */
      this.time = time - 16;
      this.loop(time);
      if (!this.destroyed) {
        this.emitter.emit("loop:start", undefined as (TEvents & CanvasGameEvents)["loop:start"]);
      }
    });
  }

  public on<K extends keyof (TEvents & CanvasGameEvents)>(
    event: K,
    handler: (payload: (TEvents & CanvasGameEvents)[K]) => void,
  ): void {
    if (this.destroyed) return;
    this.emitter.on(event, handler);
  }

  public off<K extends keyof (TEvents & CanvasGameEvents)>(
    event: K,
    handler: (payload: (TEvents & CanvasGameEvents)[K]) => void,
  ): void {
    this.emitter.off(event, handler);
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  /** Запрашивает перерисовку на следующем кадре. */
  public requestRedraw(): void {
    this.needRedraw = true;
  }

  /** Останавливает цикл, освобождает подписки и эффекты; runEffect отклоняется с AbortError. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frameId !== undefined) {
      cancelAnimationFrame(this.frameId);
      this.frameId = undefined;
    }
    this.unsubscribeView();
    this.emitter.clear();
    this.effectsBefore.clear();
    this.effectsAfter.clear();
    this.effectGroups.clear();
    for (const cancel of this.pendingEffects) cancel();
    this.pendingEffects.clear();
  }

  /** Добавляет эффект под сценой; group позволяет отменить связанные эффекты. */
  public addBeforeEffect<TProps, TResult>(effect: Animation<TProps, TResult>, group?: symbol): void {
    this.addEffect(this.effectsBefore, effect, group);
  }

  /** Добавляет эффект над сценой; group позволяет отменить связанные эффекты. */
  public addAfterEffect<TProps, TResult>(effect: Animation<TProps, TResult>, group?: symbol): void {
    this.addEffect(this.effectsAfter, effect, group);
  }

  /**
   * Удаляет эффекты группы из обоих слоёв без вызова onDone.
   * Остальные эффекты (в том числе runEffect) продолжают работать.
   * Следующий кадр перерисуется даже на паузе. Символ группы можно использовать снова.
   */
  public cancelEffects(group: symbol): void {
    for (const [key, effectGroup] of this.effectGroups) {
      if (effectGroup !== group) continue;
      this.effectsBefore.delete(key);
      this.effectsAfter.delete(key);
      this.effectGroups.delete(key);
    }
    this.requestRedraw();
  }

  /**
   * Запускает эффект и возвращает Promise с результатом onDone.
   * Обработчик onDone устанавливается внутри метода и не входит в props.
   * Тип результата выводится из второго параметра Animation; завершение без данных даёт undefined.
   * При destroy() или запуске после destroy() Promise отклоняется с AbortError.
   */
  public runEffect<TProps extends object, TResult = void>(
    Effect: new (props: TProps & AnimationProps<TResult>) => Animation<TProps, TResult>,
    props: Omit<TProps, "onDone">,
    before?: boolean,
  ): Promise<TResult | undefined> {
    return new Promise<TResult | undefined>((resolve, reject) => {
      const cancel = (): void => reject(new DOMException("Game has been destroyed", "AbortError"));
      if (this.destroyed) {
        cancel();
        return;
      }
      this.pendingEffects.add(cancel);
      try {
        const effect = new Effect({
          ...props,
          onDone: (data?: TResult) => {
            this.pendingEffects.delete(cancel);
            resolve(data);
          },
        } as TProps & AnimationProps<TResult>);
        const collection = before ? this.effectsBefore : this.effectsAfter;
        this.addEffect(collection, effect);
      } catch (error) {
        this.pendingEffects.delete(cancel);
        reject(error);
      }
    });
  }

  private addEffect(collection: Map<string, StoredAnimation>, effect: StoredAnimation, group?: symbol): void {
    if (this.destroyed) return;
    const key = String(++this.effectId);
    collection.set(key, effect);
    if (group !== undefined) this.effectGroups.set(key, group);
  }

  private loop = (time: number): void => {
    this.frameId = undefined;
    if (this.destroyed) return;

    if (time && this.time) {
      const dt: number = Math.min(100, time - this.time);

      if (dt > 0) {
        if (!this.paused) {
          this.updateFrame(dt, time);
        }
        if (this.destroyed) return;
        if (this.needRedraw) {
          this.needRedraw = false;
          this.drawCounter++;
          this.drawFrame();
        }
        if (this.destroyed) return;
      }
    }
    this.time = time;

    if (!this.destroyed) this.frameId = requestAnimationFrame(this.loop);
  };

  /** Реакция на изменение вьюпорта: позиционируем и ресайзим сцену. */
  protected onResize(): void {
    const {
      pos: {x, y},
      size: {w, h},
    } = this.viewport;
    this.scene.canvasEl.style.left = `${x}px`;
    this.scene.canvasEl.style.top = `${y}px`;
    this.scene.resize(w, h);
    this.needRedraw = true;
  }

  /** Обновляет игровую логику и эффекты независимо от переопределений наследника. */
  private updateFrame(dt: number, time: number): void {
    this.updateScene(dt, time);
    if (this.destroyed || !this.shouldUpdateEffects()) return;
    this.animateEffects(this.effectsBefore, dt);
    if (this.destroyed) return;
    this.animateEffects(this.effectsAfter, dt);
  }

  /** Игровая логика. Вызывается до обновления эффектов; общая пауза останавливает её. */
  protected updateScene(_dt: number, _time: number): void {
    void _dt;
    void _time;
  }

  /** Позволяет заморозить эффекты, сохранив обновление интерфейса. */
  protected shouldUpdateEffects(): boolean {
    return true;
  }

  /** Очищает холст и рисует фон, нижние эффекты, сцену, верхние эффекты и верхний слой. */
  private drawFrame(): void {
    this.scene.clear();
    this.drawBackground();
    if (this.destroyed || !this.shouldDrawScene()) return;
    this.drawEffects(this.effectsBefore);
    if (this.destroyed) return;
    this.drawScene();
    if (this.destroyed) return;
    this.drawEffects(this.effectsAfter);
    if (this.destroyed) return;
    this.drawOverlay();
  }

  /** Фон рисуется всегда; false скрывает сцену, эффекты и верхний слой. */
  protected shouldDrawScene(): boolean {
    return true;
  }

  /** Фон под сценой — статичная заливка/текстура. */
  protected drawBackground(): void {}

  /** Содержимое сцены; переопределяется в игре. */
  protected drawScene(): void {}

  /** Содержимое поверх сцены и всех эффектов, например перетаскиваемые фигуры. */
  protected drawOverlay(): void {}

  private animateEffects(effects: Map<string, StoredAnimation>, dt: number): void {
    for (const [, effect] of effects) {
      // Завершённые эффекты больше не обновляются; drawEffects рисует
      // их последний кадр и удаляет из коллекции.
      if (effect.isDone()) {
        this.requestRedraw();
        continue;
      }
      effect.upd(dt);
      if (this.destroyed) return;
      if (effect.isDone() || effect.needRedraw()) this.needRedraw = true;
    }
  }

  private drawEffects(effects: Map<string, StoredAnimation>): void {
    for (const effect of effects.values()) {
      effect.draw(this.scene);
      if (this.destroyed) return;
    }
    // Чистим после отрисовки: последний кадр эффекта обязан попасть на экран.
    for (const [key, effect] of effects) {
      if (effect.isDone()) {
        effects.delete(key);
        this.effectGroups.delete(key);
        this.requestRedraw();
      }
    }
  }
}
