/*!
 * outCubic: Copyright (c) 2001 Robert Penner. MIT License.
 * cubeBezier: adapted from Party Preloader by Szenia Zadvornykh (zadvorsky).
 * Copyright (c) Szenia Zadvornykh. MIT License.
 * Sources and full license notices: THIRD_PARTY_LICENSES.
 */

import type {Point} from "./geometry.ts";

/**
 * easing equations from http://gizma.com/easing/
 * t = current time, b = start value, c = delta value, d = duration.
 */
export function outCubic(t: number, b: number, c: number, d: number): number {
  t /= d;
  t--;
  return c * (t * t * t + 1) + b;
}

/** Точка кубической кривой Безье для параметра t. */
export function cubeBezier(p0: Point, c0: Point, c1: Point, p1: Point, t: number): Point {
  const nt: number = 1 - t;
  return {
    x: nt * nt * nt * p0.x + 3 * nt * nt * t * c0.x + 3 * nt * t * t * c1.x + t * t * t * p1.x,
    y: nt * nt * nt * p0.y + 3 * nt * nt * t * c0.y + 3 * nt * t * t * c1.y + t * t * t * p1.y,
  };
}

/** Случайное число в диапазоне [min, max). */
export function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
