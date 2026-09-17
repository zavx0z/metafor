import {noChange} from "../html.js"
import {directive, Directive, PartType} from "../directive.js"

class TemplateContentDirective extends Directive {
  /**
   * @type {HTMLTemplateElement | undefined}
   * @private
   */
  _previousTemplate

  /**
   * @param {import("../types/directives.js").PartInfo} partInfo
   */
  constructor(partInfo) {
    super(partInfo)
    if (partInfo.type !== PartType.CHILD)
      throw new Error("templateContent можно использовать только в дочерних привязках")
  }

  /** @param {HTMLTemplateElement} template */
  render(template) {
    if (this._previousTemplate === template) {
      return noChange
    }
    this._previousTemplate = template
    return document.importNode(template.content, true)
  }
}

/**
 * Отображает содержимое элемента template как HTML.
 *
 * Примечание: шаблон должен контролироваться разработчиком, а не пользователем.
 * Отображение шаблона, контролируемого пользователем, с помощью этой директивы
 * может привести к уязвимостям межсайтового скриптинга.
 */
export const templateContent = directive(TemplateContentDirective)
