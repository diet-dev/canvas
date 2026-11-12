import type {Canvas} from "../Canvas.ts";
import {Animation, type AnimationProps} from "../Animation.ts";

export type Text3dEffectProps = AnimationProps & {
  /** Строки выводятся друг под другом, каждая со своим 3d-сдвигом. */
  text: string[];
  x?: number;
  y?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  shadowColor?: string;
  /** Глубина 3d-сдвига в пикселях. */
  textDepth?: number;
  /** Скорость всплытия, px/мс. */
  vy?: number;
  /** Скорость изменения размера шрифта. */
  vf?: number;
  /** Амплитуда изменения размера шрифта. */
  af?: number;
  /** Скорость вращения вокруг Z. */
  vz?: number;
  /** Амплитуда вращения вокруг Z. */
  az?: number;
  maxTime?: number;
};

/**
 * Всплывающий 3d-заголовок («+500», «Уровень пройден»): строка всплывает,
 * покачиваясь, с «пульсацией» размера в начале. Рендер делегирует
 * `Canvas.draw3dText()` — эффект управляет только траекторией.
 */
export class Text3dEffect extends Animation<Text3dEffectProps> {
  constructor(props: Text3dEffectProps) {
    super(props);
    this.maxTime = this.props.maxTime || 1500;
  }

  public draw(scene: Canvas): void {
    const x: number = this.props.x ?? scene.width / 2;
    const y: number = this.props.y ?? scene.height / 2 - 50;
    const fontSize: number = this.props.fontSize ?? 35;
    const fontSizeFactor: number = this.time * (this.props.vf ?? 0.01);

    scene.save();
    const vy: number = this.props.vy === undefined ? 0.02 : this.props.vy;
    scene.translate(x, y - this.time * vy);
    const vz: number = this.props.vz === undefined ? 0.005 : this.props.vz;
    scene.rotate(Math.sin(this.time * vz) * (this.props.az ?? 0.1));

    const fontSizeAnimated: number =
      fontSizeFactor <= Math.PI ? fontSize + Math.sin(fontSizeFactor) * (this.props.af ?? 20) : fontSize;
    const common = {
      depth: this.props.textDepth ?? 2,
      fontSize: fontSizeAnimated,
      fontFamily: this.props.fontFamily ?? "Arial",
      color: this.props.color ?? "#ffe650",
      shadowColor: this.props.shadowColor ?? "#000",
    };

    this.props.text.forEach((text, i) => {
      scene.draw3dText({text, x: 0, y: i * common.fontSize, ...common});
    });
    scene.restore();
  }
}
