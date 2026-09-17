import type {Directive} from "../directive"
import {HTML_RESULT, MATHML_RESULT, SVG_RESULT, type Template} from "../html"

export type ResultType = typeof HTML_RESULT | typeof SVG_RESULT | typeof MATHML_RESULT


/**
 * Тип возвращаемого значения функций тегов шаблона {@linkcode html} и {@linkcode svg}
 *
 * Объект `TemplateResult` содержит всю информацию о шаблоне
 * выражении, необходимую для его рендеринга: строки шаблона, значения выражений,
 * и тип шаблона (html или svg).
 *
 * Объекты `TemplateResult` не создают DOM самостоятельно. Чтобы создать или
 * обновить DOM, вам нужно будет рендерить `TemplateResult`. 
 */
export type UncompiledTemplateResult<T extends ResultType = ResultType> = {
  ["_$atomType$"]: T
  strings: TemplateStringsArray
  values: unknown[]
}

/**
 * Это шаблонный результат, который может быть либо нескомпилированным, либо скомпилированным.
 *
 * В будущем TemplateResult будет этот тип. Если вы хотите явно отметить, что шаблонный результат потенциально скомпилирован, вы можете ссылаться на этот
 * тип, и он будет продолжать вести себя так же через следующую основную версию @pkg/html. Это может быть полезно для кода, который хочет подготовиться к следующей
 * основной версии @pkg/html.
 */
export type MaybeCompiledTemplateResult<T extends ResultType = ResultType> =
  | UncompiledTemplateResult<T>
  | CompiledTemplateResult

/**
 * Тип возвращаемого значения функций тегов шаблона {@linkcode html} и {@linkcode svg}.
 *
 * Объект `TemplateResult` содержит всю информацию о шаблоне
 * выражении, необходимое для его рендеринга: строки шаблона, значения выражений,
 * и тип шаблона (html или svg).
 *
 * Объекты `TemplateResult` не создают DOM самостоятельно. Чтобы создать или
 * обновить DOM, вам нужно будет рендерить `TemplateResult`.
 *
 * MaybeCompiledTemplateResult, так что код получит ошибки типа, если он предполагает,
 * что шаблоны @pkg/html не скомпилированы. Когда работает с одним из них, используйте
 * либо {@linkcode CompiledTemplateResult}, либо {@linkcode UncompiledTemplateResult} явно.
 */
export type TemplateResult<T extends ResultType = ResultType> = UncompiledTemplateResult<T>

export type HTMLTemplateResult = TemplateResult<typeof HTML_RESULT>

export type SVGTemplateResult = TemplateResult<typeof SVG_RESULT>

export type MathMLTemplateResult = TemplateResult<typeof MATHML_RESULT>

/**
 * Интерфейс, описывающий результат скомпилированного шаблона.
 * 
 */
export interface CompiledTemplateResult {
  // Это фабрика, чтобы сделать инициализацию шаблона ленивой
  // и позволить ShadyRenderOptions scope быть переданным.
  // Это свойство должно оставаться неминифицированным.
  ["_$atomType$"]: CompiledTemplate
  values: unknown[]
}

export interface CompiledTemplate extends Omit<Template, "el"> {
  // Переопределен el как необязательный. Инициализируем его при первом рендеринге
  el?: HTMLTemplateElement
  // Подготовленная HTML-строка для создания элемента шаблона.
  // Тип является TemplateStringsArray, чтобы гарантировать, что значение пришло из
  // исходного кода, предотвращая атаку внедрения JSON.
  h: TemplateStringsArray
}

/**
 * DirectiveParent - тип, описывающий классы с полями для директив:
 *
 * Используется в функции resolveDirective.
 *
 * @property _$parent - родительский элемент директивы (опционально)
 * @property _$isConnected - флаг, указывающий, подключен ли элемент к DOM
 * @property __directive - одиночная директива (опционально)
 * @property __directives - массив директив (опционально)
 */
export interface DirectiveParent {
  _$parent?: DirectiveParent;
  _$isConnected: boolean;
  __directive?: Directive;
  __directives?: (Directive | undefined)[];
}

/**
 * Объект, указывающий параметры для контроля рендеринга @pkg/html. Обратите внимание, что
 * хотя `render` может быть вызван несколько раз на одном и том же `container` (и
 * `renderBefore` узел ссылки) для эффективного обновления содержимого,
 * только параметры, переданные при первом рендеринге, учитываются в течение
 * всего времени рендеринга для этой уникальной комбинации `container` + `renderBefore`.
 */
export interface RenderOptions {
  /** Объект для использования в качестве `this` для обработчиков событий. Часто
   * полезно установить это значение равным хосту компонента, который рендерит шаблон. */
  host?: object
  /** DOM узел перед которым будет отрисован контент в контейнере. */
  renderBefore?: ChildNode | null
  /** Узел, используемый для клонирования шаблона (`importNode` будет вызван на этом узле).
   * Это контролирует `ownerDocument` отрисованного DOM, а также любой наследуемый контекст.
   * По умолчанию используется глобальный `document`. */
  creationScope?: { importNode(node: Node, deep?: boolean): Node }
  /**
   * Начальное состояние подключения для верхнего уровня части, которая отрисовывается.
   * Если не установлен параметр `isConnected`, `AsyncDirective`s будут подключены по умолчанию.
   * Установите значение `false`, если начальный рендеринг происходит в отключенном дереве
   * и `AsyncDirective`s должны увидеть `isConnected === false` для их начального рендеринга.
   * Метод `part.setConnected()` должен быть использован после начального рендеринга, чтобы изменить состояние подключения части.
   */
  isConnected?: boolean
}

export type EventListenerWithOptions = EventListenerOrEventListenerObject & Partial<AddEventListenerOptions>

export interface Disconnectable {
  _$parent?: Disconnectable
  _$disconnectableChildren?: Set<Disconnectable>
  // Вместо хранения состояния подключения на экземплярах, Disconnectables рекурсивно
  // получают состояние подключения от RootPart, к которому они подключены, через
  // геттеры вверх по дереву Disconnectable через ссылки _$parent. Это перекладывает
  // стоимость отслеживания состояния isConnected на `AsyncDirectives` и избавляет
  // от необходимости передавать всем Disconnectables (частям, экземплярам шаблонов и
  // директивам) их состояние подключения каждый раз при его изменении, что было бы
  // затратно для деревьев без AsyncDirectives.
  _$isConnected: boolean
}