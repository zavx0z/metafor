import {Directive, PartType} from "../directive.js"

export type KeyFn<T> = (item: T, index: number) => unknown
export type ItemTemplate<T> = (item: T, index: number) => unknown
/**
 * Директива, которая повторяет последовательность значений (обычно `TemplateResults`),
 * сгенерированных из итерируемого объекта, и эффективно обновляет эти элементы
 * при изменении итератора на основе предоставленных пользователем `keys`,
 * ассоциированных с каждым элементом.
 *
 * Заметьте, что если предоставлена функция `keyFn`, сохраняется строгая привязка ключей к DOM,
 * что означает, что предыдущий DOM для данного ключа перемещается в новую позицию при необходимости,
 * и DOM никогда не будет повторно использован с другими значениями ключей (для новых ключей всегда
 * создаётся новый DOM). Это, как правило, наиболее эффективный способ использования `repeat`,
 * поскольку он минимизирует лишние операции вставки и удаления.
 *
 * Функция `keyFn` принимает два параметра: элемент и его индекс, и возвращает уникальное значение ключа.
 *
 * ```js
 * html`
 *   <ol>
 *     ${repeat(this.items, (item) => item.id, (item, index) => {
 *       return html`<li>${index}: ${item.name}</li>`;
 *     })}
 *   </ol>
 * `
 * ```
 *
 * **Важно**: Если предоставляется функция `keyFn`, ключи *обязаны* быть уникальными для всех элементов
 * в данном вызове `repeat`. Поведение в случае, если два или более элемента имеют одинаковый ключ,
 * не определено.
 *
 * Если `keyFn` не предоставлена, эта директива будет работать аналогично маппингу элементов на значения,
 * и DOM будет переиспользоваться для потенциально разных элементов.
 */
export interface RepeatDirectiveFn<T> {
  <T>(items: Iterable<T>, keyFnOrTemplate: KeyFn<T> | ItemTemplate<T>, template?: ItemTemplate<T>): unknown
  <T>(items: Iterable<T>, template: ItemTemplate<T>): unknown
  <T>(items: Iterable<T>, keyFn: KeyFn<T> | ItemTemplate<T>, template: ItemTemplate<T>): unknown
}

/**
 * Этот служебный тип извлекает сигнатуру метода render() класса директивы,
 * чтобы мы могли использовать её для типа сгенерированной функции директивы.
 */
export type DirectiveParameters<C extends Directive> = Parameters<C["render"]>
export type PartType = (typeof PartType)[keyof typeof PartType]

export interface DirectiveClass {
  new (part: PartInfo): Directive
}

/**
 * Сгенерированная функция директивы не вычисляет директиву, а просто
 * возвращает объект DirectiveResult, который захватывает аргументы.
 */
export interface DirectiveResult<C extends DirectiveClass = DirectiveClass> {
  ["_$atomDirective$"]: C
  /** @internal */
  values: DirectiveParameters<InstanceType<C>>
}

export interface ChildPartInfo {
  readonly type: typeof PartType.CHILD
}

export interface AttributePartInfo {
  readonly type:
    | typeof PartType.ATTRIBUTE
    | typeof PartType.PROPERTY
    | typeof PartType.BOOLEAN_ATTRIBUTE
    | typeof PartType.EVENT
  readonly strings?: ReadonlyArray<string>
  readonly name: string
  readonly tagName: string
}

export interface ElementPartInfo {
  readonly type: typeof PartType.ELEMENT
  readonly element: HTMLElement
}

/**
 * Информация о части, к которой привязана директива.
 *
 * Это полезно для проверки того, что директива прикреплена к допустимой части,
 * например, с директивой, которая может использоваться только для привязок атрибутов.
 */
export type PartInfo = ChildPartInfo | AttributePartInfo | ElementPartInfo

/**
 * Набор ключ-значение для имен классов и их значений (истинных или ложных).
 */
export interface ClassInfo {
  readonly [name: string]: string | boolean | number;
}

/**
 * Набор пар ключ-значение CSS свойств и их значений.
 *
 * Ключ должен быть либо валидным именем CSS свойства в виде строки, как
 * `'background-color'`, либо валидным JavaScript именем в camelCase для
 * CSSStyleDeclaration, как `backgroundColor`.
 */
export interface StyleInfo {
  [name: string]: string | number | undefined | null;
}

/**
 * Проверяет, имеет ли часть только одно выражение без строк для интерполяции между ними.
 *
 * Только AttributePart и PropertyPart могут иметь несколько выражений.
 * Части с несколькими выражениями имеют свойство `strings`, а части с одним выражением - нет.
 */
export type IsSingleExpression = (part: PartInfo) => boolean