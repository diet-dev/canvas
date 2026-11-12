import type {Canvas} from "../Canvas.ts";
import {Animation, type AnimationProps} from "../Animation.ts";

export type TimerEffectProps = AnimationProps & {
  /** Полная длительность отсчёта, мс. */
  time: number;
  /** Текст плашки, `$t` заменяется на место для секунд. */
  text: string;
  /** Множитель скорости отсчёта. По умолчанию 1; 0 останавливает отсчёт. */
  speed?: number;
  /** Цвет фона плашки. По умолчанию #faf3dd. */
  boxColor?: string;
  textColor?: string;
  shadowColor?: string;
  fontSize?: number;
  boxHeight?: number;
};

const SPACES: string = "     ";

/**
 * Плашка с обратным отсчётом по центру сцены. Секунды считаются от разности
 * полного времени и прошедшего: эффект переживает паузу игры без сдвига
 * отсчёта, потому что время течёт только в `upd()`.
 */
export class TimerEffect extends Animation<TimerEffectProps> {
  private readonly text: string;

  constructor(props: TimerEffectProps) {
    super(props);
    this.maxTime = props.time;
    this.text = this.props.text.replace("$t", SPACES);
  }

  protected update(dt: number): void {
    this.time += dt * (this.props.speed ?? 1);
  }

  public draw(scene: Canvas): void {
    const fontSize: number = this.props.fontSize ?? 16;
    const height: number = this.props.boxHeight ?? 100;
    scene.font(fontSize);
    const w1: number = Math.max(270, scene.textWidth(this.text) + 20);
    const x1: number = (scene.width - w1) / 2;
    const y1: number = scene.height / 2 - height / 2;
    scene.save();
    scene.shadowBlur(15);
    scene.shadowColor(this.props.shadowColor ?? "#504e4c");
    scene.roundRect(x1, y1, w1, height, 10, this.props.boxColor ?? "#faf3dd");
    scene.restore();

    scene.fillStyle(this.props.textColor ?? "#424753");
    const tw1: number = scene.textWidth(this.text);
    const tx1: number = scene.width / 2 - tw1 / 2;
    const ty1: number = y1 + height / 2 + 3;
    scene.fillText(this.text, tx1, ty1);

    const time: number = Math.max(0, Math.ceil((this.props.time - this.time) / 1000));
    const tx2: number = tx1 + scene.textWidth(this.text.split(SPACES)[0]) + 10;
    scene.font(fontSize + 5);
    scene.fillText(String(time), tx2, ty1);
  }
}
