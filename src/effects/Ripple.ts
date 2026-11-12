import type {Canvas} from "../Canvas.ts";
import {Animation, type AnimationProps} from "../Animation.ts";

export type RippleProps = AnimationProps & {
  x: number;
  y: number;
  /** Начальный радиус, px. */
  radius?: number;
  /** Скорость расширения, px/мс. */
  speed?: number;
  /** Скорость затухания, 1/мс. */
  fade?: number;
  /** Цвет волны. */
  color?: string;
};

/**
 * Расходящаяся волна от точки клика. Завершается, когда полностью погасла:
 * `maxTime` — лишь аварийный предел, чтобы эффект не жил вечно.
 */
export class Ripple extends Animation<RippleProps> {
  protected maxTime: number = 5000;

  private radius: number;
  private opacity: number = 1;
  private readonly speed: number;
  private readonly fade: number;
  private readonly color: string;

  constructor(props: RippleProps) {
    super(props);
    this.radius = props.radius ?? 1;
    this.speed = props.speed ?? 0.2;
    this.fade = props.fade ?? 0.005;
    this.color = props.color ?? "255,255,255";
  }

  protected update(dt: number): void {
    super.update(dt);
    this.radius += dt * this.speed;
    this.opacity = Math.max(0, this.opacity - dt * this.fade);
    if (this.opacity <= 0) {
      this.finish();
    }
  }

  public draw(scene: Canvas): void {
    const {x, y} = this.props;
    scene.fillCircle(x, y, this.radius, `rgba(${this.color},${this.opacity.toFixed(2)})`);
  }
}
