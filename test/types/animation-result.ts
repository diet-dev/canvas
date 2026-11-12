import {Animation, CanvasGame, Ripple, type AnimationProps, type Canvas} from "../../src/index.ts";

type ChoiceProps = {choice: string} & AnimationProps<string>;

class Choice extends Animation<ChoiceProps, string> {
  public constructor(props: ChoiceProps) {
    super(props);
  }

  public draw(_scene: Canvas): void {}

  public choose(value: string): void {
    this.finish(value);
  }

  public finishWithWrongType(): void {
    // @ts-expect-error finish принимает только строковый результат.
    this.finish(123);
  }
}

declare const game: CanvasGame;
declare function expectType<T>(value: T): void;

const result = game.runEffect(Choice, {choice: "first"});
expectType<Promise<string | undefined>>(result);
expectType<Promise<void>>(game.runEffect(Ripple, {x: 0, y: 0}));
expectType<Promise<void>>(game.runEffect<{x: number; y: number}>(Ripple, {x: 0, y: 0}));
game.addBeforeEffect(new Choice({choice: "first"}));
game.addAfterEffect(new Choice({choice: "first"}));

// @ts-expect-error Результат строкового эффекта нельзя использовать как число.
expectType<Promise<number>>(result);
// @ts-expect-error У эффекта без результата нет числового результата.
expectType<Promise<number>>(game.runEffect(Ripple, {x: 0, y: 0}));
// @ts-expect-error Обязательное свойство эффекта должно сохранять свой тип.
game.runEffect(Choice, {choice: 123});
// @ts-expect-error Обязательное свойство эффекта нельзя пропустить.
game.runEffect(Choice, {});
// @ts-expect-error Callback должен принимать результат строкового эффекта.
new Choice({choice: "first", onDone: (_value?: number) => {}});
// @ts-expect-error Передать эффекту результат другого типа нельзя.
new Choice({choice: "first"}).choose(123);
