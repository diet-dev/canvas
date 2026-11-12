import "./style.css";
import {Viewport} from "@dietdev/canvas";
import {TicTacToeGame} from "./TicTacToeGame.ts";

// Квадратная сцена до 520px, отцентрована в окне
const view = new Viewport({ratio: 1, maxW: 520, maxH: 520});
const game = new TicTacToeGame({view, className: "TicTacToe"});
document.body.append(game.scene.canvasEl);

import.meta.hot?.dispose(() => {
  game.destroy();
  view.destroy();
  game.scene.canvasEl.remove();
});
