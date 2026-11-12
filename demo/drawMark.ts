import type {Canvas} from "@dietdev/canvas";
import type {Mark} from "./TicTacToeGame.ts";

/** Крест или ноль с центром (cx, cy); cell — размер клетки. */
export function drawMark(scene: Canvas, mark: Mark, cx: number, cy: number, cell: number, color: string): void {
  scene.strokeStyle(color);
  scene.lineWidth(Math.max(2, cell * 0.09));
  scene.beginPath();
  if (mark === "X") {
    const r = cell * 0.28;
    scene.moveTo(cx - r, cy - r);
    scene.lineTo(cx + r, cy + r);
    scene.moveTo(cx + r, cy - r);
    scene.lineTo(cx - r, cy + r);
  } else {
    scene.arc(cx, cy, cell * 0.3, 0, Math.PI * 2);
  }
  scene.stroke();
}
