/**
 * Директива repeat
 * @module HTML
 */
import { type ChildPart, noChange } from "../index.ts"
import { directive, Directive, type PartInfo, PartType } from "../directive.ts"
import {
  insertPart,
  getCommittedValue,
  removePart,
  setCommittedValue,
  setChildPartValue,
} from "../directive-helpers.js"

export type KeyFn<T> = (item: T, index: number) => unknown
export type ItemTemplate<T> = (item: T, index: number) => unknown

// Вспомогательная функция для генерации отображения элемента массива на его индекс по подмножеству массива (используется для ленивого создания newKeyToIndexMap и oldKeyToIndexMap)
const generateMap = (list: unknown[], start: number, end: number) => {
  const map = new Map<unknown, number>()
  for (let i = start; i <= end; i++) {
    map.set(list[i], i)
  }
  return map
}

class RepeatDirective extends Directive {
  private _itemKeys?: unknown[]

  constructor(partInfo: PartInfo) {
    super(partInfo)
    if (partInfo.type !== PartType.CHILD) {
      throw new Error("repeat() может использоваться только в текстовых выражениях")
    }
  }

  private _getValuesAndKeys<T>(
    items: Iterable<T>,
    keyFnOrTemplate: KeyFn<T> | ItemTemplate<T>,
    template?: ItemTemplate<T>
  ) {
    let keyFn: KeyFn<T> | undefined
    if (template === undefined) {
      template = keyFnOrTemplate
    } else if (keyFnOrTemplate !== undefined) {
      keyFn = keyFnOrTemplate as KeyFn<T>
    }
    const keys = []
    const values = []
    let index = 0
    for (const item of items) {
      keys[index] = keyFn ? keyFn(item, index) : index
      values[index] = template!(item, index)
      index++
    }
    return {
      values,
      keys,
    }
  }

  render<T>(items: Iterable<T>, template: ItemTemplate<T>): Array<unknown>
  render<T>(items: Iterable<T>, keyFn: KeyFn<T> | ItemTemplate<T>, template: ItemTemplate<T>): Array<unknown>
  render<T>(items: Iterable<T>, keyFnOrTemplate: KeyFn<T> | ItemTemplate<T>, template?: ItemTemplate<T>) {
    return this._getValuesAndKeys(items, keyFnOrTemplate, template).values
  }

  override update<T>(
    containerPart: ChildPart,
    [items, keyFnOrTemplate, template]: [Iterable<T>, KeyFn<T> | ItemTemplate<T>, ItemTemplate<T>]
  ) {
    // Старые списки частей и ключей извлекаются из последнего обновления (которое может быть инициализировано гидратацией)
    const oldParts = getCommittedValue(containerPart) as Array<ChildPart | null>
    const { values: newValues, keys: newKeys } = this._getValuesAndKeys(items, keyFnOrTemplate, template)

    // Проверяем, что oldParts (зафиксированное значение) — это массив, что указывает на то, что предыдущее значение пришло из вызова repeat(). Если oldParts не массив, значит это первый рендер: возвращаем массив для обработки lit-html и запоминаем ключи.
    if (!Array.isArray(oldParts)) {
      this._itemKeys = newKeys
      return newValues
    }

    // В SSR-гидратации возможно, что oldParts — массив, но у нас нет item keys, потому что update() ещё не вызывался. Устанавливаем ключи в пустой массив. Это приведёт к тому, что все сравнения oldKey/newKey не пройдут, и выполнение перейдёт к последней вложенной ветке ниже, которая повторно использует oldPart.
    const oldKeys = (this._itemKeys ??= [])

    // Новый список частей будет формироваться по мере выполнения (либо повторно используя старые части, либо создавая новые для новых ключей в этом обновлении). В конце обновления сохраняется в кэше выше.
    const newParts: ChildPart[] = []

    // Отображения ключ-индекс для текущего и предыдущего обновления; создаются лениво только при необходимости как оптимизация производительности, так как требуются только для нескольких не-смежных изменений в списке, что встречается редко.
    let newKeyToIndexMap!: Map<unknown, number>
    let oldKeyToIndexMap!: Map<unknown, number>

    // Head and tail pointers to old parts and new values
    let oldHead = 0
    let oldTail = oldParts.length - 1
    let newHead = 0
    let newTail = newValues.length - 1

    // Обзор O(n) алгоритма согласования (общий подход основан на идеях из ivi, vue, snabbdom и др.):
    //
    // * Начинаем со списка старых частей и новых значений (и массивов их ключей), указателей head/tail для каждого, и формируем новый список частей, обновляя (и при необходимости перемещая) старые части или создавая новые.
    //   Начальная ситуация может выглядеть так (для краткости в диаграммах числа в массиве отражают ключи, связанные со старыми частями или новыми значениями, хотя ключи и части/значения фактически хранятся в параллельных массивах с использованием одних и тех же указателей head/tail):
    //
    //      oldHead v                 v oldTail
    //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
    //   newParts: [ ,  ,  ,  ,  ,  ,  ]
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6] <- отражает новый порядок элементов пользователя
    //      newHead ^                 ^ newTail
    //
    // * Итерируем старые и новые списки с обеих сторон, обновляя, меняя местами или удаляя части в позициях head/tail, пока ни head, ни tail не могут быть сдвинуты.
    //
    // * Пример ниже: ключи в head совпадают, поэтому обновляем старую часть 0 на месте (перемещать не нужно) и записываем часть 0 в список newParts. Последнее, что делаем — увеличиваем указатели oldHead и newHead (будет отражено в следующей диаграмме).
    //
    //      oldHead v                 v oldTail
    //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
    //   newParts: [0,  ,  ,  ,  ,  ,  ] <- heads совпали: обновить 0 и сдвинуть oldHead и newHead
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]
    //      newHead ^                 ^ newTail
    //
    // * Пример ниже: указатели head не совпадают, но tail совпадают, поэтому обновляем часть 6 на месте (перемещать не нужно) и записываем часть 6 в список newParts. Затем увеличиваем указатели oldTail и oldHead.
    //
    //         oldHead v              v oldTail
    //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
    //   newParts: [0,  ,  ,  ,  ,  , 6] <- tails совпали: обновить 6 и сдвинуть oldTail и newTail
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]
    //         newHead ^              ^ newTail
    //
    // * Если ни head, ни tail не совпадают, далее проверяем, был ли один из старых элементов head/tail удалён. Сначала нужно создать обратное отображение новых ключей в индексы (newKeyToIndexMap), что делается один раз лениво как оптимизация производительности, так как этот случай возникает только при нескольких не-смежных изменениях. Обратите внимание, что для смежных удалений где угодно в списке указатели head и tail сдвинутся друг к другу и пересекутся до того, как мы дойдём до этого случая, а удаления будут обработаны в финальном цикле while без необходимости создавать отображение.
    //
    // * Пример ниже: ключ в oldTail был удалён (больше нет в newKeyToIndexMap), поэтому удаляем эту часть из DOM и увеличиваем только указатель oldTail.
    //
    //         oldHead v           v oldTail
    //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
    //   newParts: [0,  ,  ,  ,  ,  , 6] <- 5 нет в новой карте: удалить 5 и сдвинуть oldTail
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]
    //         newHead ^           ^ newTail
    //
    // * Как только head и tail не могут быть сдвинуты, любые несоответствия связаны либо с новыми, либо с перемещёнными элементами; если новый ключ есть в предыдущей карте "старый ключ — старый индекс", переместить старую часть на новую позицию, иначе создать и вставить новую часть. При перемещении старой части мы зануляем её позицию в массиве oldParts, если она находится между head и tail, чтобы пропустить её при последующих итерациях.
    //
    // * Пример ниже: ни head, ни tail не совпадают, и ни один не был удалён; ищем ключ newHead в oldKeyToIndexMap и перемещаем DOM старой части в новую позицию (перед oldParts[oldHead]). Затем зануляем часть в массиве oldPart, так как она находилась среди оставшихся oldParts для сканирования (между head и tail), чтобы пропустить её в будущем.
    //
    //         oldHead v        v oldTail
    //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
    //   newParts: [0, 2,  ,  ,  ,  , 6] <- застряли: обновить и переместить 2
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]    на место и сдвинуть newHead
    //                                      newHead
    //         newHead ^           ^ newTail
    //
    // * Обратите внимание: для перемещений/вставок, как выше, часть, вставляемая в позицию head, вставляется перед текущим oldParts[oldHead], а часть, вставляемая в позицию tail — перед newParts[newTail+1]. Кажущееся несоответствие связано с тем, что новые части перемещаются снаружи внутрь, поэтому справа от head — старые части, а справа от tail — новые части.
    //
    // * Мы всегда возвращаемся к началу алгоритма, чтобы продолжить сопоставление и простые обновления на месте...
    //
    // * Пример ниже: указатели head снова совпадают, просто обновляем часть 1 и записываем её в массив newParts. Затем увеличиваем оба указателя head.
    //
    //         oldHead v        v oldTail
    //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
    //   newParts: [0, 2, 1,  ,  ,  , 6] <- heads совпали: обновить 1 и сдвинуть оба head
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]
    //            newHead ^        ^ newTail
    //
    // * Как указано выше, элементы, перемещённые из-за застревания (финальная else-ветка ниже), помечаются как null, поэтому мы всегда сдвигаем старые указатели через них, чтобы сравнивать следующий реальный старый элемент с обеих сторон.
    //
    // * Пример ниже: oldHead — null (уже размещён в newParts), поэтому сдвигаем oldHead.
    //
    //            oldHead v     v oldTail
    //   oldKeys:  [0, 1, -, 3, 4, 5, 6] <- old head уже использован: сдвинуть oldHead
    //   newParts: [0, 2, 1,  ,  ,  , 6]
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]
    //               newHead ^     ^ newTail
    //
    // * Не критично помечать старые части как null при их перемещении с head на tail или наоборот, так как они будут вне диапазона указателей и больше не будут посещаться.
    //
    // * Пример ниже: ключ старого tail совпадает с новым head, поэтому часть в позиции oldTail перемещается в новую позицию head (перед oldParts[oldHead]). Затем увеличиваем oldTail и newHead.
    //
    //               oldHead v  v oldTail
    //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
    //   newParts: [0, 2, 1, 4,  ,  , 6] <- old tail совпадает с новым head: обновить и переместить 4, сдвинуть oldTail и newHead
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]
    //               newHead ^     ^ newTail
    //
    // * Пример ниже: ключи old и new head совпадают, обновляем старую часть на месте и сдвигаем oldHead и newHead.
    //
    //               oldHead v oldTail
    //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
    //   newParts: [0, 2, 1, 4, 3,   ,6] <- heads совпали: обновить 3 и сдвинуть oldHead и newHead
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]
    //                  newHead ^  ^ newTail
    //
    // * Как только новые или старые указатели пересекаются, остаются только добавления (если старый список исчерпан) или удаления (если новый список исчерпан). Они обрабатываются в финальных циклах while в конце.
    //
    // * Пример ниже: oldHead превысил oldTail, значит основной цикл завершён. Создаём оставшуюся часть и вставляем её в позицию newHead, обновление завершено.
    //
    //                   (oldHead > oldTail)
    //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
    //   newParts: [0, 2, 1, 4, 3, 7 ,6] <- создать и вставить 7
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]
    //                     newHead ^ newTail
    //
    // * Порядок if/else-веток не критичен для алгоритма, главное, чтобы проверки на null были первыми (чтобы всегда работать с валидными старыми частями), а финальная else-ветка — последней (там происходят дорогие перемещения). Порядок остальных веток — просто предположение о наиболее частых случаях.
    //
    // * Можно было бы вычислять наибольшую возрастающую подпоследовательность (LIS) старых элементов в новых позициях и перемещать только те, что не входят в LIS. Однако это стоит O(nlogn) времени и добавляет кода, а помогает только для редких типов мутаций. Описанный выше алгоритм обрабатывает удаления, добавления, реверсы, перестановки и одиночные перемещения смежных элементов за линейное время и минимальное число перемещений. По мере увеличения числа множественных перемещений, где LIS мог бы помочь, до случайной перестановки, оптимизация LIS становится менее полезной, поэтому пока не реализована. Можно пересмотреть, если появится убедительный кейс.

    while (oldHead <= oldTail && newHead <= newTail) {
      if (oldParts[oldHead] === null) {
        // `null` означает, что старая часть в head уже была использована ниже; пропустить
        oldHead++
      } else if (oldParts[oldTail] === null) {
        // `null` означает, что старая часть в tail уже была использована ниже; пропустить
        oldTail--
      } else if (oldKeys[oldHead] === newKeys[newHead]) {
        // Старый head совпадает с новым head; обновить на месте
        newParts[newHead] = setChildPartValue(oldParts[oldHead]!, newValues[newHead])
        oldHead++
        newHead++
      } else if (oldKeys[oldTail] === newKeys[newTail]) {
        // Старый tail совпадает с новым tail; обновить на месте
        newParts[newTail] = setChildPartValue(oldParts[oldTail]!, newValues[newTail])
        oldTail--
        newTail--
      } else if (oldKeys[oldHead] === newKeys[newTail]) {
        // Старый head совпадает с новым tail; обновить и переместить в новый tail
        newParts[newTail] = setChildPartValue(oldParts[oldHead]!, newValues[newTail])
        insertPart(containerPart, newParts[newTail + 1], oldParts[oldHead]!)
        oldHead++
        newTail--
      } else if (oldKeys[oldTail] === newKeys[newHead]) {
        // Старый tail совпадает с новым head; обновить и переместить в новый head
        newParts[newHead] = setChildPartValue(oldParts[oldTail]!, newValues[newHead])
        insertPart(containerPart, oldParts[oldHead]!, oldParts[oldTail]!)
        oldTail--
        newHead++
      } else {
        if (newKeyToIndexMap === undefined) {
          // Лениво создаём отображения ключ-индекс, используемые для удалений и перемещений ниже
          newKeyToIndexMap = generateMap(newKeys, newHead, newTail)
          oldKeyToIndexMap = generateMap(oldKeys, oldHead, oldTail)
        }
        if (!newKeyToIndexMap.has(oldKeys[oldHead])) {
          // Старый head больше не в новом списке; удалить
          removePart(oldParts[oldHead]!)
          oldHead++
        } else if (!newKeyToIndexMap.has(oldKeys[oldTail])) {
          // Старый tail больше не в новом списке; удалить
          removePart(oldParts[oldTail]!)
          oldTail--
        } else {
          // Any mismatches at this point are due to additions or
          // moves; see if we have an old part we can reuse and move
          // into place
          const oldIndex = oldKeyToIndexMap.get(newKeys[newHead])
          const oldPart = oldIndex !== undefined ? oldParts[oldIndex] : null
          if (oldPart === null) {
            // Нет старой части для этого значения; создать новую и вставить
            const newPart = insertPart(containerPart, oldParts[oldHead]!)
            setChildPartValue(newPart, newValues[newHead])
            newParts[newHead] = newPart
          } else {
            // Повторно используем старую часть
            newParts[newHead] = setChildPartValue(oldPart!, newValues[newHead])
            insertPart(containerPart, oldParts[oldHead]!, oldPart)
            // Это помечает старую часть как использованную, чтобы пропустить её в первых двух проверках выше
            oldParts[oldIndex as number] = null
          }
          newHead++
        }
      }
    }
    // Add parts for any remaining new values
    while (newHead <= newTail) {
      // Для всех оставшихся добавлений вставляем перед последним новым tail, так как старые указатели больше не валидны
      const newPart = insertPart(containerPart, newParts[newTail + 1])
      setChildPartValue(newPart, newValues[newHead])
      newParts[newHead++] = newPart
    }
    // Remove any remaining unused old parts
    while (oldHead <= oldTail) {
      const oldPart = oldParts[oldHead++]
      if (oldPart !== null && oldPart !== undefined) {
        removePart(oldPart)
      }
    }

    // Синхронизируем позиции всех meta-* акторов в контейнере после манипуляций
    try {
      const container = containerPart._$startNode.parentNode as Element | null
      if (container) {
        const all = Array.from(container.querySelectorAll("*"))
        for (const el of all) {
          const tag = (el as Element).tagName?.toLowerCase?.() || ""
          if (tag.startsWith("meta-")) {
            try {
              ;(el as any).__syncLocation?.()
            } catch {}
          }
        }
      }
    } catch {}

    // Сохраняем порядок новых частей для следующего прохода
    this._itemKeys = newKeys
    // Прямо устанавливаем значение части, обходя её dirty-checking
    setCommittedValue(containerPart, newParts)
    return noChange
  }
}

export interface RepeatDirectiveFn {
  <T>(items: Iterable<T>, keyFnOrTemplate: KeyFn<T> | ItemTemplate<T>, template?: ItemTemplate<T>): unknown
  <T>(items: Iterable<T>, template: ItemTemplate<T>): unknown
  <T>(items: Iterable<T>, keyFn: KeyFn<T> | ItemTemplate<T>, template: ItemTemplate<T>): unknown
}

/**
 * Директива, которая повторяет серию значений (обычно `TemplateResults`),
 * сгенерированных из итерируемого объекта, и эффективно обновляет эти элементы при изменении итерируемого объекта на основе предоставленных пользователем `keys`, связанных с каждым элементом.
 *
 * Если предоставлен `keyFn`, поддерживается строгая привязка ключа к DOM: предыдущий DOM для данного ключа перемещается в новую позицию при необходимости, и DOM никогда не будет повторно использоваться для разных ключей (новый DOM всегда создаётся для новых ключей). Это, как правило, наиболее эффективный способ использования `repeat`, так как выполняется минимум лишней работы при вставках и удалениях.
 *
 * `keyFn` принимает два параметра: элемент и его индекс, и возвращает уникальное значение ключа.
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
 * **Важно**: если передан `keyFn`, ключи *должны* быть уникальными для всех элементов в одном вызове `repeat`. Поведение при совпадении ключей для двух и более элементов не определено.
 *
 * Если `keyFn` не передан, директива будет работать аналогично сопоставлению элементов со значениями, и DOM может быть повторно использован для разных элементов.
 */
export const repeat = directive(RepeatDirective) as RepeatDirectiveFn

/**
 * Тип класса, реализующего эту директиву. Необходим для именования типа возвращаемого значения директивы.
 */
export type { RepeatDirective }
