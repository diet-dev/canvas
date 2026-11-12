import type {Canvas} from "../../src/index.ts";

declare const scene: Canvas;

const width: number = scene.width;
const height: number = scene.height;
scene.resize(width, height);

// @ts-expect-error Размеры доступны только для чтения; для изменения есть resize().
scene.width = 640;
// @ts-expect-error Размеры доступны только для чтения; для изменения есть resize().
scene.height = 480;
