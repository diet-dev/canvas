/**
 * Крестики-нолики 3×3 на Canvas: человек против бота.
 * Демо `@dietdev/canvas`: сцена и цикл — CanvasGame, раскладка — Viewport,
 * отклик на клик — Ripple. Логика партии включает проверку победных линий
 * и эвристику выбора хода бота.
 */

import {CanvasGame, Ripple, type CanvasGameOptions} from "@dietdev/canvas";
import {drawMark} from "./drawMark.ts";

export type Mark = "X" | "O";
type Outcome = "win" | "loss" | "draw";

/** Победные линии; клетки пронумерованы по строкам слева направо, сверху вниз. */
const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const OTHER: Record<Mark, Mark> = {X: "O", O: "X"};

/** Поставить фигуру в клетку index (0–8), вернув новое поле. */
function place(board: string, index: number, mark: Mark): string {
  return board.slice(0, index) + mark + board.slice(index + 1);
}

function other(mark: Mark): Mark {
  return OTHER[mark];
}

/** Собрана ли победная линия у mark. */
function hasWin(board: string, mark: Mark): boolean {
  return LINES.some(([a, b, c]) => board[a] === mark && board[b] === mark && board[c] === mark);
}

function winnerOf(board: string): Mark | null {
  if (hasWin(board, "X")) return "X";
  if (hasWin(board, "O")) return "O";
  return null;
}

function isFull(board: string): boolean {
  return !board.includes("-");
}

/** Исход партии с точки зрения человека; null — партия ещё не завершена. */
function outcomeOf(board: string, humanMark: Mark): Outcome | null {
  const w = winnerOf(board);
  if (w) return w === humanMark ? "win" : "loss";
  return isFull(board) ? "draw" : null;
}

function freeCells(board: string): number[] {
  const free: number[] = [];
  for (let i = 0; i < 9; i++) if (board[i] === "-") free.push(i);
  return free;
}

/**
 * Ход бота: выиграть → заблокировать → центр → случайный угол → случайная клетка.
 */
function botMove(board: string, mark: Mark): number {
  const free = freeCells(board);

  const winning = (m: Mark): number => {
    for (const i of free) if (winnerOf(place(board, i, m)) === m) return i;
    return -1;
  };

  let move = winning(mark);
  if (move < 0) move = winning(other(mark));
  if (move < 0 && board[4] === "-") move = 4;
  if (move < 0) {
    const corners = [0, 2, 6, 8].filter(i => board[i] === "-");
    if (corners.length > 0) move = corners[Math.floor(Math.random() * corners.length)];
  }
  if (move < 0 && free.length > 0) move = free[Math.floor(Math.random() * free.length)];
  return move;
}

type Palette = {
  bg: string;
  grid: string;
  x: string;
  o: string;
  overlay: string;
  overlayText: string;
  /** Цвет волны от клика, формат "r,g,b" для Ripple. */
  ripple: string;
};

const LIGHT: Palette = {
  bg: "#f4f4f4",
  grid: "#3b3b3b",
  x: "#1565c0",
  o: "#c62828",
  overlay: "rgba(0, 0, 0, 0.55)",
  overlayText: "#ffffff",
  ripple: "59, 59, 59",
};

const DARK: Palette = {
  bg: "#121212",
  grid: "#d4d4d4",
  x: "#64b5f6",
  o: "#ef9a9a",
  overlay: "rgba(0, 0, 0, 0.6)",
  overlayText: "#ffffff",
  ripple: "212, 212, 212",
};

type Geometry = {
  boardSize: number;
  cell: number;
  offsetX: number;
  offsetY: number;
};

const BOT_DELAY_MS = 450;
const OVERLAY_TEXT: Record<Outcome, string> = {
  win: "Победа",
  loss: "Поражение",
  draw: "Ничья",
};
const AGAIN_TEXT = "нажмите, чтобы сыграть ещё";

export class TicTacToeGame extends CanvasGame {
  private board = "---------";
  private turn: Mark = "X";
  private humanMark: Mark = "X";
  private phase: "playing" | "over" = "playing";
  private outcome: Outcome | null = null;
  private botTimer: ReturnType<typeof setTimeout> | undefined;
  private palette: Palette = LIGHT;
  private readonly darkQuery: MediaQueryList;
  private disposed = false;
  private readonly onThemeChange = (): void => {
    if (!this.disposed) this.requestRedraw();
  };

  public constructor(options: CanvasGameOptions) {
    super(options);

    this.darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    this.darkQuery.addEventListener("change", this.onThemeChange);

    this.scene.canvasEl.addEventListener("pointerdown", this.onPointerDown);
  }

  public override destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelBot();
    this.darkQuery.removeEventListener("change", this.onThemeChange);
    this.scene.canvasEl.removeEventListener("pointerdown", this.onPointerDown);
    super.destroy();
  }

  private get playing(): boolean {
    return this.phase === "playing";
  }

  /** Начинает новую партию с хода человека. */
  public newGame(): void {
    if (this.disposed) return;
    this.cancelBot();
    this.board = "---------";
    this.turn = "X";
    this.humanMark = "X";
    this.phase = "playing";
    this.outcome = null;
    this.requestRedraw();
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.disposed) return;
    const rect = this.scene.canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Клик по оверлею — новая партия
    if (!this.playing) {
      this.newGame();
      this.addAfterEffect(new Ripple({x, y, color: this.palette.ripple}));
      return;
    }
    // Чужой ход: клики игнорируются
    if (this.turn !== this.humanMark) return;

    const g = this.geometry();
    const col = Math.floor((x - g.offsetX) / g.cell);
    const row = Math.floor((y - g.offsetY) / g.cell);
    if (col < 0 || col > 2 || row < 0 || row > 2) return;
    const index = row * 3 + col;
    if (this.board[index] !== "-") return;

    this.applyMove(index);
    this.addAfterEffect(new Ripple({x, y, color: this.palette.ripple}));
  };

  /** Совершает ход текущей стороной, затем передаёт ход или завершает партию. */
  private applyMove(index: number): void {
    this.board = place(this.board, index, this.turn);
    this.outcome = outcomeOf(this.board, this.humanMark);
    this.turn = other(this.turn);
    this.requestRedraw();

    if (this.outcome) {
      this.phase = "over";
      return;
    }
    if (this.turn !== this.humanMark) this.scheduleBot();
  }

  private scheduleBot(): void {
    this.botTimer = setTimeout(() => {
      this.botTimer = undefined;
      if (this.disposed || !this.playing || this.turn === this.humanMark) return;
      const index = botMove(this.board, this.turn);
      if (index >= 0) this.applyMove(index);
    }, BOT_DELAY_MS);
  }

  private cancelBot(): void {
    if (this.botTimer !== undefined) {
      clearTimeout(this.botTimer);
      this.botTimer = undefined;
    }
  }

  /** Квадратное поле с отступами, вписанное в сцену; координаты в CSS-пикселях. */
  private geometry(): Geometry {
    const boardSize = Math.min(this.scene.width, this.scene.height) * 0.92;
    return {
      boardSize,
      cell: boardSize / 3,
      offsetX: (this.scene.width - boardSize) / 2,
      offsetY: (this.scene.height - boardSize) / 2,
    };
  }

  protected drawScene(): void {
    const scene = this.scene;
    const p = this.darkQuery.matches ? DARK : LIGHT;
    this.palette = p;
    const g = this.geometry();
    scene.fillAll(p.bg);

    scene.strokeStyle(p.grid);
    scene.lineWidth(Math.max(1, g.cell * 0.05));
    scene.beginPath();
    for (const t of [1, 2]) {
      const x = g.offsetX + g.cell * t;
      const y = g.offsetY + g.cell * t;
      scene.moveTo(x, g.offsetY);
      scene.lineTo(x, g.offsetY + g.boardSize);
      scene.moveTo(g.offsetX, y);
      scene.lineTo(g.offsetX + g.boardSize, y);
    }
    scene.stroke();

    for (let i = 0; i < 9; i++) {
      if (this.board[i] === "-") continue;
      const mark = this.board[i] as Mark;
      const cx = g.offsetX + (i % 3) * g.cell + g.cell / 2;
      const cy = g.offsetY + Math.floor(i / 3) * g.cell + g.cell / 2;
      drawMark(scene, mark, cx, cy, g.cell, mark === "X" ? p.x : p.o);
    }

    if (this.playing || !this.outcome) return;

    // Выравнивание текста результата задаётся через контекст Canvas 2D.
    const ctx = scene.ctx;
    ctx.fillStyle = p.overlay;
    ctx.fillRect(0, 0, scene.width, scene.height);
    ctx.fillStyle = p.overlayText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const resultText = OVERLAY_TEXT[this.outcome];
    const resultFontSize = Math.round(g.boardSize / 5);
    ctx.font = `bold ${resultFontSize}px sans-serif`;
    const resultWidth = ctx.measureText(resultText).width;
    if (resultWidth > g.boardSize) {
      ctx.font = `bold ${Math.max(1, Math.floor((resultFontSize * g.boardSize) / resultWidth))}px sans-serif`;
    }
    ctx.fillText(resultText, scene.width / 2, scene.height / 2 - g.boardSize * 0.06);
    ctx.font = `${Math.round(g.boardSize / 16)}px sans-serif`;
    ctx.globalAlpha = 0.7;
    ctx.fillText(AGAIN_TEXT, scene.width / 2, scene.height / 2 + g.boardSize * 0.14);
    ctx.globalAlpha = 1;
  }
}
