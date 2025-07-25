import { AttributePart, noChange } from "../html"
import { directive, Directive, type DirectiveParameters, type PartInfo, PartType } from "../directive"

/**
 * Набор CSS-свойств и их значений в формате ключ-значение.
 *
 * Ключ должен быть либо строкой с корректным именем CSS-свойства (например, 'background-color'),
 * либо корректным camelCase-именем для CSSStyleDeclaration (например, backgroundColor).
 */
export interface StyleInfo {
  [name: string]: string | number | undefined | null
}

const important = "important"
// Ведущий пробел важен
const importantFlag = " !" + important
// Сколько символов нужно удалить из значения (отрицательное число)
const flagTrim = 0 - importantFlag.length

class StyleMapDirective extends Directive {
  private _previousStyleProperties?: Set<string>

  constructor(partInfo: PartInfo) {
    super(partInfo)
    if (partInfo.type !== PartType.ATTRIBUTE || partInfo.name !== "style" || (partInfo.strings?.length as number) > 2) {
      throw new Error(
        "Директива `styleMap` должна использоваться только в атрибуте `style` и быть единственным выражением в этом атрибуте."
      )
    }
  }

  render(styleInfo: Readonly<StyleInfo>) {
    return Object.keys(styleInfo).reduce((style, prop) => {
      const value = styleInfo[prop]
      if (value == null) {
        return style
      }
      // Преобразуем имена свойств из camelCase в dash-case, например:
      //  `backgroundColor` -> `background-color`
      // Для вендорных префиксов добавляем дополнительный `-` в начало:
      //  `webkitAppearance` -> `-webkit-appearance`
      // Исключение — любые имена, содержащие дефис, включая кастомные свойства:
      //  `--my-button-color` --> `--my-button-color`
      prop = prop.includes("-") ? prop : prop.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g, "-$&").toLowerCase()
      return style + `${prop}:${value};`
    }, "")
  }

  override update(part: AttributePart, [styleInfo]: DirectiveParameters<this>) {
    const { style } = part.element as HTMLElement

    if (this._previousStyleProperties === undefined) {
      this._previousStyleProperties = new Set(Object.keys(styleInfo))
      return this.render(styleInfo)
    }

    // Удаляем старые свойства, которых больше нет в styleInfo
    for (const name of this._previousStyleProperties) {
      // Если имени нет в styleInfo или оно null/undefined
      if (styleInfo[name] == null) {
        this._previousStyleProperties!.delete(name)
        if (name.includes("-")) {
          style.removeProperty(name)
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(style as any)[name] = null
        }
      }
    }

    // Добавляем или обновляем свойства
    for (const name in styleInfo) {
      const value = styleInfo[name]
      if (value != null) {
        this._previousStyleProperties.add(name)
        const isImportant = typeof value === "string" && value.endsWith(importantFlag)
        if (name.includes("-") || isImportant) {
          style.setProperty(
            name,
            isImportant ? (value as string).slice(0, flagTrim) : (value as string),
            isImportant ? important : ""
          )
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(style as any)[name] = value
        }
      }
    }
    return noChange
  }
}

/**
 * Директива, применяющая CSS-свойства к элементу.
 *
 * `styleMap` может использоваться только в атрибуте `style` и должна быть единственным выражением в этом атрибуте.
 * Она принимает имена свойств из объекта {@link StyleInfo styleInfo} и добавляет их в inline-стили элемента.
 *
 * Имена свойств с дефисами (`-`) считаются валидными CSS-свойствами и устанавливаются через setProperty().
 * Имена без дефисов считаются camelCase-именами JavaScript и устанавливаются через присваивание, что позволяет style-объекту преобразовывать их в CSS-имена.
 *
 * Например, `styleMap({backgroundColor: 'red', 'border-top': '5px', '--size': '0'})` задаёт свойства `background-color`, `border-top` и `--size`.
 *
 * @param styleInfo
 */
export const styleMap = directive(StyleMapDirective)

/**
 * Тип класса, реализующего эту директиву. Необходим для именования типа возвращаемого значения директивы.
 */
export type { StyleMapDirective }
