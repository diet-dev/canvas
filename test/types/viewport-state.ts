import type {Viewport, ViewportChange, ViewportLike} from "../../src/index.ts";

declare const viewport: Viewport;
declare function expectState(state: ViewportChange): void;

const view: ViewportLike = viewport;
expectState(view.state);
viewport.onChange(expectState);

// @ts-expect-error Снимок доступен только для чтения.
viewport.state = {size: {w: 100, h: 50}, pos: {x: 0, y: 0}};
// @ts-expect-error Размеры снимка неизменяемы.
viewport.state.size.w = 100;
// @ts-expect-error Пересчёт выполняет сам Viewport.
viewport.update();
// @ts-expect-error Для чтения размеров используется state.size.
viewport.size();
// @ts-expect-error Для чтения позиции используется state.pos.
viewport.pos();
