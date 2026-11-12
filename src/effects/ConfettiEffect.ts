/*!
 * Adapted from Party Preloader by Szenia Zadvornykh (zadvorsky).
 * https://codepen.io/zadvorsky/pen/OJwQxo
 * Copyright (c) Szenia Zadvornykh. MIT License.
 * See THIRD_PARTY_LICENSES for the permission notice and disclaimer.
 */

import type {Point} from "../geometry.ts";
import type {Canvas} from "../Canvas.ts";
import {Animation, type AnimationProps} from "../Animation.ts";
import {cubeBezier, outCubic, random} from "../easing.ts";

export type ConfettiEffectProps = AnimationProps & {
  /** Ширина области салюта. По умолчанию — окно (в браузере). */
  width?: number;
  /** Высота области салюта. По умолчанию — окно (в браузере). */
  height?: number;
  /** Задан — сцена под частицами заливается этим цветом. */
  bg?: string;
  /** Общая длительность, мс. По умолчанию 2000. */
  maxTime?: number;
};

/**
 * Частицы стартуют на одной высоте со случайными координатами по горизонтали
 * и движутся по кубическим кривым Безье за нижнюю границу области.
 * Эффект завершается, когда долетели все частицы или истёк maxTime.
 */
export class ConfettiEffect extends Animation<ConfettiEffectProps> {
  protected maxTime: number = 2000;
  private particles: Particle[] = [];
  private readonly bg: string = "";

  constructor(props: ConfettiEffectProps) {
    super(props);

    const width: number = props.width ?? resolveWindowSize("innerWidth", 800);
    const height: number = props.height ?? resolveWindowSize("innerHeight", 600);
    const maxWidth: number = Math.min(700, width);
    const randomX = (): number => width / 2 - maxWidth / 2 + Math.random() * maxWidth;
    const randomY = (): number => Math.random() * height;

    for (let i: number = 0; i < 128; i++) {
      const p0: Point = {x: (width * random(25, 75)) / 100, y: height * 0.15};
      const p1: Point = {x: randomX(), y: randomY()};
      const p2: Point = {x: randomX(), y: randomY()};
      const p3: Point = {x: randomX(), y: height + 64};
      this.particles.push(new Particle(p0, p1, p2, p3));
    }
    if (props.bg) this.bg = props.bg;
    if (props.maxTime) this.maxTime = props.maxTime;
  }

  protected update(dt: number): void {
    super.update(dt);

    let allComplete: boolean = true;
    for (const p of this.particles) {
      p.upd(dt);
      if (!p.complete) allComplete = false;
    }

    if (allComplete) {
      this.finish();
    }
  }

  public draw(scene: Canvas): void {
    if (this.bg) scene.fillAll(this.bg);
    for (const p of this.particles) p.draw(scene);
  }
}

class Particle {
  public complete: boolean;

  private readonly p0: Point;
  private readonly p1: Point;
  private readonly p2: Point;
  private readonly p3: Point;
  private time: number = 0;
  private readonly duration: number;
  private readonly color: string;
  private readonly w: number;
  private readonly h: number;
  private x: number = 0;
  private y: number = 0;
  private r: number = 0;
  private sy: number = 0;

  constructor(p0: Point, p1: Point, p2: Point, p3: Point) {
    this.p0 = p0;
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;

    this.duration = 3 + Math.random() * 2;
    // padStart: без него 0x0000f7 даёт "#f7" — невалидный цвет, частица
    // молча рисуется чёрным/предыдущим стилем.
    this.color =
      "#" +
      Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");

    this.w = 8;
    this.h = 6;

    this.complete = false;
  }

  public upd(dt: number): void {
    this.time = Math.min(this.duration, this.time + dt / 1000);

    const f: number = outCubic(this.time, 0, 1, this.duration);
    const p = cubeBezier(this.p0, this.p1, this.p2, this.p3, f);

    const dx: number = p.x - this.x;
    const dy: number = p.y - this.y;

    this.r = Math.atan2(dy, dx) + Math.PI * 0.5;
    this.sy = Math.sin(Math.PI * f * 10);
    this.x = p.x;
    this.y = p.y;

    this.complete = this.time === this.duration;
  }

  public draw(scene: Canvas): void {
    if (this.complete) return;
    scene.save();
    scene.translate(this.x, this.y);
    scene.rotate(this.r);
    scene.scale(1, this.sy);
    scene.fillRect(-this.w * 0.5, -this.h * 0.5, this.w, this.h, this.color);
    scene.restore();
  }
}

function resolveWindowSize(key: "innerWidth" | "innerHeight", fallback: number): number {
  return typeof window === "undefined" ? fallback : (window as unknown as Record<string, number>)[key] || fallback;
}
