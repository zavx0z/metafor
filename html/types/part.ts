import {ATTRIBUTE_PART, AttributePart, BooleanAttributePart, CHILD_PART, type ChildPart, COMMENT_PART, ELEMENT_PART, ElementPart, EventPart, PropertyPart} from "../html.js"

type AttributeTemplatePart = {
  readonly type: typeof ATTRIBUTE_PART
  readonly index: number
  readonly name: string
  readonly ctor: typeof AttributePart
  readonly strings: ReadonlyArray<string>
}
type ChildTemplatePart = {
  readonly type: typeof CHILD_PART
  readonly index: number
}
type ElementTemplatePart = {
  readonly type: typeof ELEMENT_PART
  readonly index: number
}
type CommentTemplatePart = {
  readonly type: typeof COMMENT_PART
  readonly index: number
}
/**
 * TemplatePart представляет динамическую часть в шаблоне до его создания. Когда шаблон создается, части создаются из TemplateParts.
 */
export type TemplatePart = ChildTemplatePart | AttributeTemplatePart | ElementTemplatePart | CommentTemplatePart
export type Part = ChildPart | AttributePart | PropertyPart | BooleanAttributePart | ElementPart | EventPart
export {type ChildPart, type AttributePart, type PropertyPart, type BooleanAttributePart, type ElementPart, type EventPart}

/**
 * `ChildPart` верхнего уровня, возвращаемый из `render`, который управляет состоянием
 * подключения `AsyncDirective`, созданных во всем дереве под ним.
 */
export interface RootPart extends ChildPart {
  /**
   * Устанавливает состояние подключения для `AsyncDirective`, содержащихся в этом корневом ChildPart.
   *
   * @pkg/html не отслеживает автоматически подключенность отрендеренного DOM;
   * поэтому вызывающая сторона `render` должна обеспечить вызов
   * `part.setConnected(false)` до того, как объект part потенциально
   * будет удален, чтобы гарантировать, что `AsyncDirective` имеют возможность освободить
   * все удерживаемые ресурсы. Если `RootPart`, который был ранее
   * отключен, впоследствии переподключается (и его `AsyncDirective` должны
   * переподключиться), следует вызвать `setConnected(true)`.
   *
   * @param isConnected Должны ли директивы в этом дереве быть подключены
   * или нет
   */
  setConnected(isConnected: boolean): void
}