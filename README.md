# Canvas

Компоненты для браузерных игр на Canvas 2D: масштабирование под плотность экрана, игровой цикл, анимационные эффекты, интерактивные объекты и размещение сцены в окне.

## Установка

```bash
pnpm add @dietdev/canvas
```

```ts
import {Canvas, CanvasGame, Viewport} from "@dietdev/canvas";
```

Пакет публикуется собранным: `dist/` содержит ES-модули и декларации типов. Для потребителя нужен Node.js 18+ и, если проект на TypeScript, компилятор 5.7 или новее — декларации сохраняют расширения `.ts` в относительных импортах, а разрешать их научились начиная с этой версии.

## Возможности

- **Canvas.** Координаты задаются в CSS-пикселях. Контекст масштабирует геометрию и текст с учётом DPR. Радиус и смещение тени масштабируются отдельно.
- **CanvasGame.** Обновление через `requestAnimationFrame`, шаг времени не более 100 мс, пауза и перерисовка по запросу. Эффекты могут рисоваться под сценой или над ней.
- **Animation.** Общий интерфейс эффектов и готовые реализации: конфетти, волна от клика и обратный отсчёт.
- **InteractiveObject.** Основа для нарисованных элементов с проверкой попадания указателя и состоянием наведения.
- **Viewport.** Размеры и позиция сцены с учётом окна, ограничений размеров и соотношения сторон.

Сцена предоставляется как элемент `<canvas>`. Игра сама размещает его в DOM.

## API

### Canvas

```ts
const scene = new Canvas(400, 300); // dpr = devicePixelRatio
const scene2 = new Canvas(400, 300, {canvas: el}); // рисуем в готовый элемент
const scene3 = new Canvas(400, 300, {dpr: 2}); // фиксированный dpr (тесты, скриншоты)

scene.fillRect(10, 20, 30, 40, "#fff"); // все координаты — CSS-пиксели
scene.roundRect(x, y, w, h, r, fill, stroke);
scene.font(16, "Arial", "bold");
scene.fillText("привет", 5, 5);
scene.fillCenterText("по центру", 20);

scene.width; // логическая ширина, только чтение
scene.height; // логическая высота, только чтение
scene.resize(640, 480); // меняет логические размеры, bitmap и масштаб DPR
scene.canvasEl; // сам <canvas>
scene.ctx; // прямой доступ к CanvasRenderingContext2D
```

При работе с `scene.ctx` напрямую учитывайте, что `setTransform()`, `resetTransform()` и `reset()` могут заменить или сбросить масштаб DPR. Вызов `resize()` устанавливает его заново.

`drawImage()` принимает изображение, обычный `<canvas>` или экземпляр `Canvas`:

```ts
const source = new Canvas(100, 50, {dpr: 2});
const target = new Canvas(400, 300, {dpr: 1});
target.drawImage(source, 10, 20); // весь источник в логическом размере 100×50
target.drawImage(source, 10, 20, 200, 100); // весь источник с масштабированием
target.drawImage(source, 25, 0, 50, 50, 10, 20, 100, 100); // логическая вырезка
```

Для источника `Canvas` вырезка задаётся в его логических пикселях и переводится в bitmap по **DPR источника**. DPR назначения применяется его контекстом независимо. Для `HTMLCanvasElement` и `HTMLImageElement` вырезка задаётся в физических пикселях, как в стандартном Canvas 2D.

При миграции прежнего вызова с логической вырезкой из нашей обёртки замените `source.canvasEl` на `source`. При передаче обычного `<canvas>` указывайте физические координаты вырезки самостоятельно. Без указания размера назначения экземпляр `Canvas` рисуется в логическом размере, а обычный HTML-источник — в своём исходном размере, как в Canvas 2D.

### CanvasGame

```ts
import {CanvasGame, Viewport, type CanvasGameOptions} from "@dietdev/canvas";

class MyGame extends CanvasGame {
  public constructor(options: CanvasGameOptions) {
    super(options);
  }

  protected drawScene(): void {
    this.scene.fillAll("#f7f3e8");
    // Здесь рисуется содержимое игры.
  }
}

const view = new Viewport({ratio: 0.75});
const game = new MyGame({view, className: "Game__scene"});
game.scene.canvasEl.style.position = "absolute";
document.body.append(game.scene.canvasEl);

game.pause();
game.resume();
game.requestRedraw(); // запросить следующий кадр
game.destroy(); // остановить цикл навсегда
```

`destroy()` отменяет запланированный кадр, снимает подписку игры на вьюпорт и удаляет эффекты. Незавершённые вызовы `runEffect()` отклоняются с ошибкой `AbortError`, без вызова `onDone`; эту ошибку нужно обработать в вызывающем коде. Запуск `runEffect()` после уничтожения игры также возвращает отклонённый Promise. Общий вьюпорт игра не уничтожает: когда он больше не нужен, вызовите `view.destroy()` отдельно.

Цикл:

- `dt` ограничен 100 мс, чтобы задержка между кадрами не приводила к большому скачку анимации;
- `updateScene(dt, time)` (игровая логика) и эффекты останавливаются общей паузой; перерисовка остаётся доступной;
- сцена рисуется после `requestRedraw()`, `needRedraw()` эффекта или его завершения;
- перед отрисовкой кадра холст очищается, затем рисуются фон, нижние эффекты, сцена, верхние эффекты и `drawOverlay()`; базовые методы рисования пустые;
- встроенное событие `loop:start` отправляется после первого кадра. Типы собственных событий задаются параметром класса: `CanvasGame<{ score: number }>`.

Игровую логику размещайте в `updateScene(dt, time)`: она вызывается до обновления эффектов и не требует `super`. Порядок обновления и рисования закрыт внутри `CanvasGame`; `animate()` и `draw()` больше не являются точками расширения. Для рисования используйте `drawBackground()`, `drawScene()` и `drawOverlay()` (поверх всех эффектов). Все они вызываются только при фактической перерисовке.

Для ручной паузы эффектов при работающем интерфейсе переопределите `shouldUpdateEffects()`. Для экрана паузы или слишком маленького окна `shouldDrawScene()` может вернуть false: тогда рисуется только фон через `drawBackground()`. Общие `pause()`/`resume()` управляют игровой логикой и эффектами вместе.

### Эффекты

```ts
await game.runEffect(Ripple, {x: 100, y: 100}); // Promise по завершении
game.addBeforeEffect(new Ripple({x: 100, y: 100})); // рисуется под сценой
game.addAfterEffect(new Ripple({x: 100, y: 100})); // над сценой

const attempt = Symbol("attempt");
game.addAfterEffect(new Ripple({x: 100, y: 100}), attempt);
game.cancelEffects(attempt); // удалить группу из обоих слоёв без onDone
```

Группа — необязательный `symbol` в `addBeforeEffect` / `addAfterEffect`. Отмена удаляет эффекты сразу и запрашивает перерисовку, в том числе на паузе; callback успешного завершения не вызывается. Другие группы и эффекты без группы сохраняются. `runEffect` не входит в группы: его Promise по-прежнему завершается через `onDone`. После отмены символ можно использовать повторно.

Свой эффект — наследник `Animation`:

```ts
import {Animation, type AnimationProps, type Canvas} from "@dietdev/canvas";

type FadeProps = AnimationProps & {color?: string};

class Fade extends Animation<FadeProps> {
  protected maxTime = 500;

  public constructor(props: FadeProps = {}) {
    super(props);
  }

  public draw(scene: Canvas): void {
    scene.save();
    scene.globalAlpha(Math.max(0, 1 - this.time / this.maxTime));
    scene.fillAll(this.props.color ?? "#000");
    scene.restore();
  }
}

const fade = new Fade({color: "#000"});
```

База управляет жизненным циклом через `upd(dt)`: вызывает защищённый `update(dt)`, затем проверяет `maxTime`. Наследники переопределяют `update()`, вызывают `super.update(dt)` для продвижения стандартного времени и завершаются через `finish()`. Для другого хода времени (например, таймер со скоростью) можно обновлять `time` самостоятельно. Для завершения только по собственному условию задайте `maxTime = Infinity`. `upd()` и `isDone()` переопределять не нужно; `isDone()` только читает состояние. После завершения `upd()` ничего не делает.

`finish()` сначала фиксирует завершение и освобождает обработчик, затем однократно вызывает `onDone`, не изменяя переданные props. Обработчик вызывается во время обновления, до рисования кадра. Завершённый эффект получает заключительный вызов `draw()` перед удалением, даже если `needRedraw()` возвращает false; если изображение уже передано основной сцене, эффект может пропустить рисование через `if (this.isDone()) return`. Следующий кадр очищает следы удалённого эффекта. Отмена группы и уничтожение игры не вызывают `onDone`.

Для эффекта с результатом задайте второй параметр типа, например `Animation<MyEffectProps, string>`, и используйте `AnimationProps<string>` в типе его параметров. Вызов `finish(value)` проверяет тип значения, а `runEffect()` возвращает `Promise<string | undefined>`. `undefined` возможен, если эффект завершился по базовому таймеру без передачи данных. По умолчанию результат имеет тип `void`, и `runEffect(Ripple, ...)` возвращает `Promise<void>`. Проверка типов через `pnpm typecheck` включает положительные и отрицательные примеры API из `test/types/`.

Готовые: `ConfettiEffect`, `Ripple`, `TimerEffect` (плашка с обратным отсчётом).

### InteractiveObject

```ts
import {Canvas, InteractiveObject, type InteractiveObjectProps} from "@dietdev/canvas";

type CellProps = InteractiveObjectProps & {row: number; col: number};

class Cell extends InteractiveObject<CellProps> {
  public constructor(props: CellProps) {
    super(props);
  }

  protected renderSelf(scene: Canvas, hover: boolean): void {
    const x = this.x0 + this.x + this.props.col * 40;
    const y = this.y0 + this.y + this.props.row * 40;
    scene.fillRect(x, y, 38, 38, hover ? "#ddd" : "#aaa");
  }

  protected hitTest(x: number, y: number): boolean {
    const left = this.x0 + this.x + this.props.col * 40;
    const top = this.y0 + this.y + this.props.row * 40;
    return x >= left && x < left + 38 && y >= top && y < top + 38;
  }
}

const scene = new Canvas(400, 300);
const cell = new Cell({row: 0, col: 0});
cell.render(scene, 10, 20); // запоминает смещение для хит-теста
cell.check(15, 25); // координаты события мыши
cell.over();
cell.out(); // hover, возвращают «изменилось ли»
```

### Viewport

```ts
const view = new Viewport({ratio: 9 / 16, maxW: 600});
view.state.size; // Size {w, h} — вписанный в окно размер
view.state.pos; // Point {x, y} — смещение сцены
const unsubscribe = view.onChange(({size, pos}) => {
  /* пересчитать раскладку */
});
unsubscribe(); // снять эту подписку
view.destroy(); // снять обработчик resize и удалить всех подписчиков
```

`state` возвращает текущий неизменяемый снимок `{size, pos}`. `onChange()` сразу передаёт этот же снимок и передаёт новый при каждом resize окна. Старые снимки сохраняют прежние значения. Опции копируются при создании; их внешняя мутация не меняет вьюпорт. После `destroy()` обновления и новые подписки игнорируются.

Публичные `size()` и `pos()` заменены на `state.size` и `state.pos`; `update()` — закрытая реализация обработки resize, вызывать его снаружи не нужно.

Собственная реализация `ViewportLike` предоставляет доступное только для чтения `state`, передаёт снимок `{size, pos}` в обработчик `onChange()` и возвращает функцию отписки. Для собственного `ViewportHost` нужны методы `addEventListener()` и `removeEventListener()`.

## Демо

Для разработки используются Node.js 22.13+ (или 24+) и pnpm 9.15.1 (версия закреплена в `package.json`). Установите зависимости из lock-файла:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Исходники `src/` и тесты `test/` проверяются готовым набором Google TypeScript Style (`gts`): ESLint проверяет код, а Prettier — форматирование. Используются точки с запятой, двойные кавычки и отступ в два пробела. В `.prettierrc.cjs` поверх настроек `gts` заданы ширина строки 120 символов и двойные кавычки. Правило кавычек ESLint согласовано с Prettier в `eslint.config.mjs`.

```bash
pnpm lint      # проверка без предупреждений
pnpm lint:fix  # автоматическое исправление
```

`pnpm format` форматирует исходники, тесты, демо и остальные поддерживаемые файлы по конфигурации `gts`; `pnpm format:check` проверяет форматирование. Сборки и lock-файл исключены через `.prettierignore`.

Демо — крестики-нолики против бота. `CanvasGame` управляет циклом и перерисовкой, `Viewport` размещает квадратную сцену, `Ripple` показывает отклик на клик. Нажатие на экран результата начинает новую партию.

```bash
pnpm dev         # http://localhost:5173
pnpm build:demo  # сборка демки в dist-demo
```

## Интеграция в игры

Создайте сцену через `Canvas` или унаследуйте игру от `CanvasGame`, реализовав `drawScene()`. Для размещения сцены используйте `Viewport`, для интерактивных элементов — `InteractiveObject`, для анимаций — готовые эффекты или собственные наследники `Animation`. Примеры приведены в разделе API и каталоге `demo/`.

## Лицензия

MIT. Авторские уведомления и условия использования заимствованного кода приведены в [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES).
