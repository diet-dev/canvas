/**
 * @dietdev/canvas — Canvas 2D с поддержкой DPR, игровой цикл и эффекты.
 * Размещением canvas в DOM управляет игра. Эффекты рисуются средствами
 * Canvas 2D без внешних изображений.
 *
 * @packageDocumentation
 */
export {Canvas} from "./Canvas.ts";
export type {CanvasOptions, Draw3dTextOptions} from "./Canvas.ts";
export {Animation} from "./Animation.ts";
export type {AnimationProps} from "./Animation.ts";
export {CanvasGame} from "./CanvasGame.ts";
export type {CanvasGameEvents, CanvasGameOptions, ViewportLike} from "./CanvasGame.ts";
export {InteractiveObject} from "./InteractiveObject.ts";
export type {InteractiveObjectProps} from "./InteractiveObject.ts";
export type {Point, Size} from "./geometry.ts";
export {Viewport} from "./Viewport.ts";
export type {ViewportChange, ViewportHost, ViewportOptions} from "./Viewport.ts";
export {cubeBezier, outCubic, random} from "./easing.ts";
export {ConfettiEffect} from "./effects/ConfettiEffect.ts";
export type {ConfettiEffectProps} from "./effects/ConfettiEffect.ts";
export {Ripple} from "./effects/Ripple.ts";
export type {RippleProps} from "./effects/Ripple.ts";
export {Text3dEffect} from "./effects/Text3dEffect.ts";
export type {Text3dEffectProps} from "./effects/Text3dEffect.ts";
export {TimerEffect} from "./effects/TimerEffect.ts";
export type {TimerEffectProps} from "./effects/TimerEffect.ts";
