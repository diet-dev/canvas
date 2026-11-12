import type {Canvas} from "../../src/index.ts";

declare const scene: Canvas;
declare const image: HTMLImageElement;
declare const canvas: HTMLCanvasElement;

for (const source of [image, canvas, scene]) {
  scene.drawImage(source, 10, 20);
  scene.drawImage(source, 10, 20, 30, 40);
  scene.drawImage(source, 0, 0, 100, 50, 10, 20, 200, 100);

  // @ts-expect-error Координаты назначения обязательны.
  scene.drawImage(source);
  // @ts-expect-error Нужны обе координаты назначения.
  scene.drawImage(source, 10);
  // @ts-expect-error Размер назначения должен содержать ширину и высоту.
  scene.drawImage(source, 10, 20, 30);
  // @ts-expect-error Вырезка требует полного прямоугольника назначения.
  scene.drawImage(source, 0, 0, 100, 50, 10);
  // @ts-expect-error Вырезка требует размеров назначения.
  scene.drawImage(source, 0, 0, 100, 50, 10, 20);
  // @ts-expect-error Вырезка требует высоты назначения.
  scene.drawImage(source, 0, 0, 100, 50, 10, 20, 200);
  // @ts-expect-error Пропуск обязательного размера через undefined запрещён.
  scene.drawImage(source, 10, 20, 30, undefined);
}
