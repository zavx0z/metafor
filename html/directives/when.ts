type Falsy = null | undefined | false | 0 | -0 | 0n | '';

/**
 * Если `condition` истинно, возвращает результат вызова `trueCase()`, иначе
 * возвращает результат вызова `falseCase()`, если `falseCase` определён.
 *
 * Это удобная обёртка над тернарным выражением, которая делает запись
 * инлайн-условия без else более приятной.
 *
 * @example
 *
 * ```ts
 * render() {
 *   return html`
 *     ${when(this.user, () => html`Пользователь: ${this.user.username}`, () => html`Войти...`)}
 *   `;
 * }
 * ```
 */
export function when<C extends Falsy, T, F = undefined>(
  condition: C,
  trueCase: (c: C) => T,
  falseCase?: (c: C) => F
): F;
export function when<C, T, F>(
  condition: C extends Falsy ? never : C,
  trueCase: (c: C) => T,
  falseCase?: (c: C) => F
): T;
export function when<C, T, F = undefined>(
  condition: C,
  trueCase: (c: Exclude<C, Falsy>) => T,
  falseCase?: (c: Extract<C, Falsy>) => F
): C extends Falsy ? F : T;
export function when(
  condition: unknown,
  trueCase: (c: unknown) => unknown,
  falseCase?: (c: unknown) => unknown
): unknown {
  return condition ? trueCase(condition) : falseCase?.(condition);
}
