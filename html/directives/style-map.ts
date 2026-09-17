import {type AttributePart, noChange} from '../html.js'
import {directive, Directive, PartType,} from '../directive.js'
import type {DirectiveParameters, PartInfo, StyleInfo} from "../types/directives.js"

const important = 'important'
// Ведущий пробел важен
const importantFlag = ' !' + important
// Сколько символов удалить из значения (отрицательное число)
const flagTrim = 0 - importantFlag.length

class StyleMapDirective extends Directive {
  private _previousStyleProperties?: Set<string>

  constructor(partInfo: PartInfo) {
    super(partInfo)
    if (
      partInfo.type !== PartType.ATTRIBUTE ||
      // @ts-ignore
      partInfo.name !== 'style' ||
      // @ts-ignore
      (partInfo.strings?.length as number) > 2
    ) {
      throw new Error('Директива `styleMap` должна использоваться в атрибуте `style` и должна быть единственной частью в атрибуте.')
    }
  }

  render(styleInfo: Readonly<StyleInfo>) {
    return Object.keys(styleInfo).reduce((style, prop) => {
      const value = styleInfo[prop]
      if (value == null) {
        return style
      }
      // Преобразование имен свойств из camel-case в dash-case, например:
      //  `backgroundColor` -> `background-color`
      // Имена с вендорными префиксами требуют дополнительный `-` в начале:
      //  `webkitAppearance` -> `-webkit-appearance`
      // Исключением являются имена свойств, содержащие дефис, включая
      // пользовательские свойства; мы предполагаем, что они уже в формате dash-case:
      //  `--my-button-color` --> `--my-button-color`
      prop = prop.includes('-')
        ? prop
        : prop
          .replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g, '-$&')
          .toLowerCase()
      return style + `${prop}:${value};`
    }, '')
  }

  override update(part: AttributePart, [styleInfo]: DirectiveParameters<this>) {
    const {style} = part.element as HTMLElement

    if (this._previousStyleProperties === undefined) {
      this._previousStyleProperties = new Set(Object.keys(styleInfo))
      return this.render(styleInfo)
    }

    // Удаляем старые свойства, которых больше нет в styleInfo
    for (const name of this._previousStyleProperties) {
      // Если имя отсутствует в styleInfo или его значение null/undefined
      if (styleInfo[name] == null) {
        this._previousStyleProperties!.delete(name)
        if (name.includes('-')) style.removeProperty(name)
        else (style as any)[name] = null
      }
    }

    // Добавляем или обновляем свойства
    for (const name in styleInfo) {
      const value = styleInfo[name]
      if (value != null) {
        this._previousStyleProperties.add(name)
        const isImportant = typeof value === 'string' && value.endsWith(importantFlag)
        if (name.includes('-') || isImportant) {
          style.setProperty(
            name,
            isImportant
              ? (value as string).slice(0, flagTrim)
              : (value as string),
            isImportant ? important : ''
          )
        } else (style as any)[name] = value
      }
    }
    return noChange
  }
}

/**
 * Директива, которая применяет CSS свойства к элементу.
 *
 * `styleMap` может использоваться только в атрибуте `style` и должна быть единственным
 * выражением в атрибуте. Она берет имена свойств из объекта {@link StyleInfo styleInfo}
 * и добавляет свойства в инлайн стили элемента.
 *
 * Имена свойств с дефисами (`-`) считаются валидными именами CSS свойств
 * и устанавливаются в объекте style элемента с помощью `setProperty()`.
 * Имена без дефисов считаются JavaScript именами в camelCase
 * и устанавливаются в объекте style элемента через присваивание свойств, позволяя
 * объекту style преобразовывать JavaScript-стиль имен в имена CSS свойств.
 *
 * Например, `styleMap({backgroundColor: 'red', 'border-top': '5px', '--size': '0'})`
 * устанавливает свойства `background-color`, `border-top` и `--size`.
 *
 * @param styleInfo
 */
export const styleMap = directive(StyleMapDirective)
