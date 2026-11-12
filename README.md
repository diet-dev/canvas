# Canvas

Canvas 2D с учётом плотности экрана (DPR), игровым циклом и анимационными эффектами. Пакет также содержит `Viewport` для размещения сцены в окне и `InteractiveObject` для нарисованных элементов с проверкой попадания указателя.

## Установка

```bash
pnpm add @dietdev/canvas
```

Пакет поставляется собранным: ES-модули и декларации TypeScript находятся в `dist/`. Примеры ниже написаны на TypeScript. Для рисования нужен браузер с Canvas 2D; игровой цикл использует `requestAnimationFrame`.

## Canvas

```ts
import {Canvas} from "@dietdev/canvas";

const scene = new Canvas(400, 300);
scene.fillAll("#f7f3e8");
scene.roundRect(20, 20, 160, 60, 12, "#34566b");
scene.font(20, "Arial", "bold");
scene.fillStyle("#fff");
scene.fillText("Привет", 40, 58);
document.body.append(scene.canvasEl);
```

Координаты и размеры задаются в CSS-пикселях. По умолчанию DPR берётся из `window.devicePixelRatio`; размер bitmap и масштаб контекста устанавливаются автоматически. Например, при DPR = 2 сцена размером 400 × 300 имеет bitmap 800 × 600.

Третий аргумент конструктора — объект с необязательными полями:

| Поле     | Назначение                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `canvas` | Готовый `HTMLCanvasElement`. Если не передан, создаётся новый элемент.                                                          |
| `dpr`    | Фиксированная плотность пикселей. Некорректное значение — ноль, отрицательное число, `NaN` или бесконечность — заменяется на 1. |

Размеры доступны через `scene.width` и `scene.height`, плотность — через `scene.dpr`. Эти свойства предназначены только для чтения. `scene.size()` возвращает размер в виде `{w, h}`.

Для изменения размера используйте `resize(width, height)`, для изменения плотности — `setDpr(dpr)`. `resize()` очищает bitmap и сбрасывает состояние контекста, даже если размеры не изменились. `setDpr()` сохраняет логические размеры и выполняет такой же сброс при смене плотности; повторное или некорректное значение игнорируется. После сброса установите нужные стили и нарисуйте сцену заново.

Через `scene.ctx` доступен обычный `CanvasRenderingContext2D`. Его геометрия уже масштабирована по DPR. При прямом использовании `setTransform()`, `resetTransform()` или `reset()` этот масштаб может быть заменён или сброшен. Радиус в `shadowBlur()` задаётся в CSS-пикселях; метод сам умножает его на DPR.

### Изображения

`drawImage()` принимает `Canvas`, `HTMLCanvasElement` или `HTMLImageElement`. Поддерживаются три формы вызова:

```ts
import {Canvas} from "@dietdev/canvas";

const source = new Canvas(100, 50, {dpr: 2});
source.fillAll("#34566b");
source.fillRect(25, 0, 50, 50, "#e7a85f");

const target = new Canvas(400, 300, {dpr: 1});
target.drawImage(source, 10, 20); // весь источник в размере 100 × 50
target.drawImage(source, 120, 20, 200, 100); // весь источник с изменением размера
target.drawImage(source, 25, 0, 50, 50, 10, 140, 100, 100); // вырезка с изменением размера
document.body.append(target.canvasEl);
```

Координаты и размеры назначения всегда задаются в CSS-пикселях. Единицы вырезки зависят от источника:

| Источник            | Координаты вырезки                                         | Размер при вызове без размера назначения |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| `Canvas`            | Логические пиксели источника; метод сам учитывает его DPR. | `source.width × source.height`           |
| `HTMLCanvasElement` | Физические пиксели bitmap.                                 | Размер bitmap.                           |
| `HTMLImageElement`  | Пиксели исходного изображения.                             | Исходный размер изображения.             |

Для логической вырезки из другого экземпляра `Canvas` передавайте сам экземпляр. При передаче его `canvasEl` действуют правила обычного HTML-источника.

## Игровой цикл

`CanvasGame` создаёт сцену и запускает цикл при создании игры. Добавление элемента в DOM и его CSS-позиционирование выполняет приложение:

```ts
import {CanvasGame, Viewport, type CanvasGameOptions} from "@dietdev/canvas";

class MyGame extends CanvasGame {
  private x = 20;

  public constructor(options: CanvasGameOptions) {
    super(options);
  }

  protected updateScene(dt: number): void {
    this.x = (this.x + dt * 0.1) % this.scene.width;
    this.requestRedraw();
  }

  protected drawBackground(): void {
    this.scene.fillAll("#f7f3e8");
  }

  protected drawScene(): void {
    this.scene.fillCircle(this.x, this.scene.height / 2, 10, "#34566b");
  }
}

const view = new Viewport({ratio: 0.75, maxW: 600});
const game = new MyGame({view, className: "Game__scene"});
game.scene.canvasEl.style.position = "fixed";
document.body.append(game.scene.canvasEl);
```

В `updateScene(dt, time)` аргумент `dt` — время с предыдущего кадра в миллисекундах, ограниченное 100 мс; `time` — исходная метка времени `requestAnimationFrame`. После игровой логики обновляются эффекты. Вызов `super.updateScene()` не требуется.

Изменение состояния игры само по себе не вызывает отрисовку: запросите её через `requestRedraw()`. Активные эффекты также могут запрашивать отрисовку. Порядок рисования: очистка холста → `drawBackground()` → нижние эффекты → `drawScene()` → верхние эффекты → `drawOverlay()`.

| Метод                   | Когда нужен                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `drawBackground()`      | Фон под сценой и эффектами.                                                            |
| `drawScene()`           | Содержимое игры.                                                                       |
| `drawOverlay()`         | Содержимое поверх всех эффектов, например перетаскиваемая фигура.                      |
| `shouldUpdateEffects()` | Верните `false`, чтобы заморозить эффекты, сохранив обновление игровой логики.         |
| `shouldDrawScene()`     | Верните `false`, чтобы рисовать только фон. Обновление логики и эффектов продолжается. |

Методы рисования вызываются только при перерисовке. По умолчанию они пустые, а оба условия возвращают `true`.

`pause()` останавливает обновление игровой логики и эффектов. Перерисовка остаётся доступной, например для экрана паузы. `resume()` продолжает обновление, `isPaused()` возвращает состояние паузы. На встроенное событие первого кадра можно подписаться через `game.on("loop:start", handler)`; отписка — `game.off("loop:start", handler)`.

Когда игра больше не нужна, вызовите `game.destroy()`: он отменяет запланированный кадр, снимает подписку на вьюпорт, очищает обработчики событий игры и удаляет эффекты. Затем удалите `game.scene.canvasEl` из DOM. Если вьюпорт больше нигде не используется, вызовите и `view.destroy()`.

## Эффекты

Готовые эффекты:

| Класс            | Назначение и основные параметры                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ripple`         | Расходящаяся волна от точки `{x, y}`. Цвет задаётся строкой RGB, например `"70, 130, 180"`.                                                                           |
| `ConfettiEffect` | Конфетти. `width` и `height` задают область частиц; по умолчанию берутся размеры окна. `maxTime` ограничивает длительность, по умолчанию — 2000 мс.                   |
| `TimerEffect`    | Плашка обратного отсчёта. `time` — длительность в миллисекундах, `text` — строка с маркером `$t` для секунд. `speed` задаёт скорость отсчёта; 0 останавливает таймер. |

В следующих примерах `game` — игра, созданная выше:

```ts
import {ConfettiEffect, Ripple, TimerEffect} from "@dietdev/canvas";

game.addAfterEffect(new Ripple({x: 100, y: 100}));
game.addBeforeEffect(new ConfettiEffect({width: game.scene.width, height: game.scene.height}));
await game.runEffect(TimerEffect, {time: 3000, text: "Начало через $t"});
```

`addBeforeEffect()` размещает эффект под сценой, `addAfterEffect()` — над ней. `runEffect(Effect, props)` создаёт эффект над сценой и возвращает Promise его завершения; третий аргумент `true` помещает его под сцену. При уничтожении игры незавершённые Promise отклоняются с `AbortError`. Запуск `runEffect()` после `destroy()` также возвращает отклонённый Promise — вызывающий код должен обработать эту ошибку.

### Отмена группы эффектов

Для связанных эффектов передайте один `symbol` вторым аргументом:

```ts
import {Ripple} from "@dietdev/canvas";

const attempt = Symbol("attempt");
game.addAfterEffect(new Ripple({x: 100, y: 100}), attempt);
game.addBeforeEffect(new Ripple({x: 200, y: 100}), attempt);
game.cancelEffects(attempt);
```

`cancelEffects()` удаляет эффекты группы из обоих слоёв и запрашивает перерисовку, в том числе на паузе. Обработчики `onDone` при отмене не вызываются. Символ можно использовать снова. `runEffect()` не принимает группу и не отменяется этим методом.

### Свой эффект

Наследник `Animation` реализует `draw()`. Например, заливка, которая исчезает за полсекунды:

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

game.addAfterEffect(new Fade({color: "#000"}));
```

База накапливает время в `this.time` и завершает эффект по `this.maxTime` (по умолчанию 1000 мс). Для собственной логики переопределите защищённый `update(dt)` и вызовите `super.update(dt)`, чтобы продвинуть время. Для другого хода времени можно изменять `time` самостоятельно, как это делает `TimerEffect` с учётом скорости.

Чтобы завершить эффект по своему условию, вызовите `finish()`. Если ограничение по времени не нужно, задайте `maxTime = Infinity`. Публичные `upd()` и `isDone()` обслуживаются базой: после завершения обновления прекращаются, а проверка `isDone()` только читает состояние.

`finish()` фиксирует завершение и синхронно вызывает `onDone` один раз. Вызов из `update()` происходит до рисования кадра. При отрисовке сцены завершённый эффект получает заключительный вызов `draw()` перед удалением, даже если `needRedraw()` возвращает `false`. Если изображение уже передано основной сцене, эффект может пропустить этот вызов через проверку `isDone()`. После удаления запрашивается кадр очистки. По умолчанию `needRedraw()` возвращает `true`; переопределите его, если эффект может оставаться на экране без непрерывной перерисовки.

Для результата задайте второй параметр типа: `Animation<Props, Result>`, а в параметрах эффекта используйте `AnimationProps<Result>`. Вызов `finish(value)` передаст значение в `onDone`. `runEffect()` вернёт `Promise<Result | undefined>`: завершение по базовому таймеру может произойти без результата. Для эффекта без результата тип — `Promise<void>`.

## Интерактивные объекты

`InteractiveObject` хранит положение, видимость и состояние наведения. Наследник реализует рисование и проверку попадания. Прямоугольная ячейка:

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
cell.render(scene, 10, 20);
cell.check(15, 25); // true: точка в координатах сцены попадает в ячейку
document.body.append(scene.canvasEl);
```

`render()` запоминает смещение контейнера в `x0` и `y0`. Для рисования и проверки попадания наследник учитывает его вместе со своими `x` и `y`. Сначала нарисуйте объект, затем проверяйте попадание относительно запомненного положения. Невидимый объект не рисуется и не проходит `check()`.

Обработчики событий устанавливает приложение. Перед `check(x, y)` переведите координаты указателя в логические координаты сцены. Например, горизонтальная координата — `(event.clientX - rect.left) * scene.width / rect.width`, где `rect` получен через `canvasEl.getBoundingClientRect()`; вертикальная рассчитывается так же.

`over()` и `out()` меняют состояние наведения и возвращают `true`, если оно изменилось. `upd(props)` обновляет переданные свойства. После изменения состояния приложение запрашивает перерисовку. При клике вызовите переопределённый `click(x, y)` с теми же координатами, которые прошли `check()`.

## Viewport

`Viewport` рассчитывает размер и положение области относительно окна и обновляет их при resize:

```ts
import {Viewport} from "@dietdev/canvas";

const view = new Viewport({ratio: 9 / 16, maxW: 600});
const {size, pos} = view.state;
console.log(size.w, size.h, pos.x, pos.y);

const unsubscribe = view.onChange(({size, pos}) => {
  console.log("Размер и положение области:", size, pos);
});
```

| Параметр       | Значение                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `minW`, `minH` | Минимальные размеры. Они имеют приоритет над размером окна и ограничениями `maxW` / `maxH`.                                         |
| `maxW`, `maxH` | Ограничения размеров сверху. Значения больше размеров окна не увеличивают область.                                                  |
| `ratio`        | Соотношение **высоты к ширине**. При его наличии область вписывается в окно с учётом `maxW` и `maxH`; `minW` и `minH` игнорируются. |

Область центрируется в окне. `state` возвращает неизменяемый снимок `{size, pos}`. `onChange()` сразу передаёт этот же снимок и передаёт новый при каждом resize. Ранее полученные снимки сохраняют свои значения. Ограничения задаются при создании вьюпорта.

Для отписки вызовите возвращённую функцию `unsubscribe()`. `destroy()` снимает обработчик resize и удаляет подписчиков; после него новые подписки игнорируются.

Для собственного источника размеров можно передать вторым аргументом `ViewportHost` с `innerWidth`, `innerHeight`, `addEventListener()` и `removeEventListener()`. Собственная реализация `ViewportLike` предоставляет доступное только для чтения `state` и метод `onChange()`, который передаёт снимок и возвращает функцию отписки.

## Утилиты

Из корня пакета экспортируются три функции:

| Функция                         | Назначение                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `cubeBezier(p0, c0, c1, p1, t)` | Точка кубической кривой Безье для параметра `t`.                                                                      |
| `outCubic(t, b, c, d)`          | Кубическое замедление: `t` — прошедшее время, `b` — начальное значение, `c` — величина изменения, `d` — длительность. |
| `random(min, max)`              | Случайное число в диапазоне `[min, max)`.                                                                             |

Типы `Point` и `Size` описывают соответственно `{x, y}` и `{w, h}` с полями только для чтения.

## Разработка и демо

Для разработки нужны Node.js 22.13+ и pnpm 9.15.1:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

По умолчанию демо доступно по адресу `http://localhost:5173`: крестики-нолики против бота с волной от клика. Нажатие на экран результата начинает новую партию.

```bash
pnpm typecheck     # проверка типов, включая примеры из test/types
pnpm test          # тесты
pnpm lint          # ESLint
pnpm format:check  # проверка форматирования
pnpm build         # сборка пакета в dist/
pnpm build:demo    # сборка демо в dist-demo/
```

`pnpm lint:fix` и `pnpm format` исправляют оформление. Конфигурация ESLint и Prettier основана на `gts`; в проекте используются отступ в два пробела, двойные кавычки и точки с запятой.

## Лицензия

[MIT](./LICENSE). Авторские уведомления и условия использования заимствованного кода находятся в [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES).
