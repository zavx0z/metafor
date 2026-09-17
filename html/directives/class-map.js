import { noChange} from '../html.js'
import {directive, Directive, PartType,} from '../directive.js'

class ClassMapDirective extends Directive {
  /**
   * Хранит объект ClassInfo, примененный к данному AttributePart.
   * Используется для удаления существующих значений при применении нового объекта ClassInfo.
   * @type {Set<string>|undefined}
   * @private
   */
   _previousClasses
   /**
   * Хранит объект ClassInfo, примененный к данному AttributePart.
   * Используется для удаления существующих значений при применении нового объекта ClassInfo.
   * @type {Set<string>|undefined}
   * @private
   */
  _staticClasses

  /** @param {import('../types/directives.js').PartInfo} partInfo - Информация о части, к которой прикреплена директива. */
  constructor(partInfo) {
    super(partInfo)
    if ( partInfo.type !== PartType.ATTRIBUTE ||
      // @ts-ignore
      partInfo.name !== 'class' ||
      // @ts-ignore
      (partInfo.strings?.length ?? 0) > 2
    ) {
      throw new Error(
        '`classMap()` может использоваться только в атрибуте `class` ' +
        'и должен быть единственной частью в атрибуте.'
      )
    }
  }
  /** @param {import('../types/directives.js').ClassInfo} classInfo - Объект ClassInfo, содержащий имена классов и их значения. */
  render(classInfo) {
    // Добавляем пробелы для обеспечения разделения со статическими классами
    return (
      ' ' +
      Object.keys(classInfo)
        .filter((key) => classInfo[key])
        .join(' ') +
      ' '
    )
  }
/**
   * @param {import('../html.js').AttributePart} part - Часть, к которой прикреплена директива.
   * @param {import('../types/directives.js').DirectiveParameters<this>} classInfo - Объект ClassInfo, содержащий имена классов и их значения.
   */
   update(part, [classInfo]) {
    // Запоминаем динамические классы при первом рендере
    if (this._previousClasses === undefined) {
      this._previousClasses = new Set()
      if (part.strings !== undefined) {
        this._staticClasses = new Set(
          part.strings
            .join(' ')
            .split(/\s/)
            .filter((s) => s !== '')
        )
      }
      for (const name in classInfo) {
        if (classInfo[name] && !this._staticClasses?.has(name)) {
          this._previousClasses.add(name)
        }
      }
      return this.render(classInfo)
    }

    const classList = part.element.classList

    // Удаляем старые классы, которые больше не применяются
    for (const name of this._previousClasses) {
      if (!(name in classInfo)) {
        classList.remove(name)
        this._previousClasses.delete(name)
      }
    }

    // Добавляем или удаляем классы на основе их значения в classMap
    for (const name in classInfo) {
      // Мы явно хотим проверять значение на истинность в "слабом" смысле,
      // так как это удобнее, если '' и 0 пропускаются.
      const value = !!classInfo[name]
      if (
        value !== this._previousClasses.has(name) &&
        !this._staticClasses?.has(name)
      ) {
        if (value) {
          classList.add(name)
          this._previousClasses.add(name)
        } else {
          classList.remove(name)
          this._previousClasses.delete(name)
        }
      }
    }
    return noChange
  }
}

/**
 * Директива, которая применяет динамические CSS-классы.
 *
 * Она должна использоваться в атрибуте `class` и должна быть единственной частью
 * в этом атрибуте. Она берет каждое свойство из аргумента `classInfo` и добавляет
 * имя свойства в `classList` элемента, если значение свойства истинно; если значение
 * свойства ложно, имя свойства удаляется из `class` элемента.
 *
 * Например, `{foo: bar}` применяет класс `foo`, если значение `bar` истинно.
 *
 * @param classInfo
 */
export const classMap = directive(ClassMapDirective)