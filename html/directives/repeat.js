import {directive, Directive, PartType} from "../directive.js"
import {
  getCommittedValue,
  insertPart,
  removePart,
  setChildPartValue,
  setCommittedValue
} from "../directive-helpers.js"
import {noChange} from "../html.js"

/**
 * Вспомогательная функция для создания отображения элемента массива в его индекс
 * для подмножества массива (используется для ленивой генерации `newKeyToIndexMap`
 * и `oldKeyToIndexMap`)
 * @param {unknown[]} list - Массив, который будет использоваться для создания отображения.
 * @param {number} start - Начальный индекс для подмножества.
 * @param {number} end - Конечный индекс для подмножества.
 * @returns {Map<unknown, number>} - Отображение, сопоставляющее элементы массива с их индексами.
 */
const generateMap = (list, start, end) => {
  const map = new Map()
  for (let i = start; i <= end; i++) {
    map.set(list[i], i)
  }
  return map
}
/**
 * @template {unknown} T
 */
class RepeatDirective extends Directive {
  /** @type {unknown[]|undefined} */
  _itemKeys

  /** @param {import("../types/directives.js").PartInfo} partInfo */
  constructor(partInfo) {
    super(partInfo)
    if (partInfo.type !== PartType.CHILD) {
      throw new Error("repeat() can only be used in text expressions")
    }
  }

  /**
   * @param {Iterable<T>} items
   * @param {import("../types/directives.js").KeyFn<T> | import("../types/directives.js").ItemTemplate<T>} keyFnOrTemplate
   * @param {import("../types/directives.js").ItemTemplate<T>} [template]
   * @returns {{values: unknown[], keys: unknown[]}}
   */
  _getValuesAndKeys(items, keyFnOrTemplate, template) {
    let keyFn
    if (template === undefined) {
      template = keyFnOrTemplate
    } else if (keyFnOrTemplate !== undefined) {
      keyFn = keyFnOrTemplate
    }
    const keys = []
    const values = []
    let index = 0
    for (const item of items) {
      keys[index] = keyFn ? keyFn(item, index) : index
      values[index] = template(item, index)
      index++
    }
    return { values, keys }
  }

  /**
   * @param {Iterable<T>} items
   * @param {import("../types/directives.js").KeyFn<T> | import("../types/directives.js").ItemTemplate<T>} keyFnOrTemplate
   * @param {import("../types/directives.js").ItemTemplate<T>} [template]
   * @returns {unknown[]}
   */
  render(items, keyFnOrTemplate, template) {
    return this._getValuesAndKeys(items, keyFnOrTemplate, template).values
  }

  /**
   * @param {import("../html.js").ChildPart} containerPart
   * @param {[Iterable<T>, import("../types/directives.js").KeyFn<T> | import("../types/directives.js").ItemTemplate<T>, import("../types/directives.js").ItemTemplate<T>]} args
   */
  update(containerPart, [items, keyFnOrTemplate, template]) {
    // Старые списки частей и ключей получены из последнего обновления (которое может быть инициализировано гидратацией)
    const oldParts = getCommittedValue(/** @type {import("../html.js").ChildPart} */ (containerPart))
    const {values: newValues, keys: newKeys} = this._getValuesAndKeys(items, keyFnOrTemplate, template)

    // Мы проверяем, что oldParts (сохраненное значение) является массивом, как
    // индикатор того, что предыдущее значение пришло из вызова repeat(). Если
    // oldParts не является массивом, то это первый рендер и мы возвращаем
    // массив для обработки массивов @pkg/html для рендеринга и запоминаем
    // ключи.
    if (!Array.isArray(oldParts)) {
      this._itemKeys = newKeys
      return newValues
    }

    // При гидратации SSR возможно, что oldParts будет массивом, но у нас
    // не будет ключей элементов, потому что update() еще не выполнялся. Мы устанавливаем
    // ключи в пустой массив. Это приведет к тому, что все сравнения oldKey/newKey
    // не пройдут, и выполнение перейдет к последней вложенной ветви ниже, которая
    // повторно использует oldPart.
    const oldKeys = (this._itemKeys ??= [])
    /**
     * Новый список частей будет создаваться по мере продвижения (либо повторно
     * используя старые части, либо создавая новые для новых ключей в этом
     * обновлении). Этот список сохраняется в кэше выше в конце обновления.
     * @type {import("../html.js").ChildPart[]}
     */
    const newParts = []

    // Отображения из ключа в индекс для текущего и предыдущего обновления;
    // они генерируются лениво только когда необходимы, в качестве
    // оптимизации производительности, так как они требуются только для
    // множественных несмежных изменений в списке, которые встречаются реже.

    let newKeyToIndexMap = /** @type {Map<unknown, number>} */ undefined
    let oldKeyToIndexMap = /** @type {Map<unknown, number>} */ undefined

    // Указатели на начало и конец старых частей и новых значений
    let oldHead = 0
    let oldTail = oldParts.length - 1
    let newHead = 0
    let newTail = newValues.length - 1

    // Обзор алгоритма согласования O(n) (общий подход основан на идеях из ivi, vue, snabbdom и других):
    //
    // * Мы начинаем со списка старых частей и новых значений (и массивов их ключей),
    //   указателей на начало/конец каждого списка и строим новый список частей, обновляя
    //   (и при необходимости перемещая) старые части или создавая новые.
    //   Начальная ситуация может выглядеть так (для краткости в диаграммах числа в массиве
    //   представляют ключи, ассоциированные со старыми частями или новыми значениями, хотя ключи
    //   и части/значения фактически хранятся в параллельных массивах, индексируемых с помощью тех же указателей):
    //
    //      oldHead v                 v oldTail
    //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
    //   newParts: [ ,  ,  ,  ,  ,  ,  ]
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6] <- отражает новый порядок элементов пользователя
    //      newHead ^                 ^ newTail
    //
    // * Итерация по старым и новым спискам с обеих сторон: обновление,
    //   обмен или удаление частей на позициях начала/конца до тех пор, пока указатели
    //   начала и конца не перестанут двигаться.
    //
    // * Пример ниже: ключи на указателях начала совпадают, поэтому обновляем старую
    //   часть 0 на месте (не нужно перемещать её) и записываем часть 0 в список `newParts`.
    //   Последнее, что мы делаем — сдвигаем указатели `oldHead` и `newHead`
    //   (это будет отражено в следующей диаграмме).
    //
    //      oldHead v                 v oldTail
    //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
    //   newParts: [0,  ,  ,  ,  ,  ,  ] <- совпали: обновляем 0
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]    и сдвигаем oldHead и newHead
    //      newHead ^                 ^ newTail
    //
    // * Пример ниже: указатели начала не совпадают, но совпадают указатели конца,
    //   поэтому обновляем часть 6 на месте (не нужно перемещать её) и записываем
    //   часть 6 в список `newParts`. Затем сдвигаем указатели `oldTail` и `newTail`.
    //
    //         oldHead v              v oldTail
    //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
    //   newParts: [0,  ,  ,  ,  ,  , 6] <- совпали: обновляем 6
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]    и сдвигаем oldTail и newTail
    //         newHead ^              ^ newTail
    //
    // * Если ни начало, ни конец не совпадают, проверяем, был ли один из элементов
    //   на старом начале/конце удалён. Для этого нужно создать обратную карту новых ключей
    //   к их индексам (`newKeyToIndexMap`). Это делается лениво, чтобы сэкономить производительность,
    //   так как этот случай возникает только при множественных неконтинуальных изменениях списка.
    //   Обратите внимание, что для континуальных удалений указатели начала и конца продвигаются
    //   друг к другу и проходят друг мимо друга до этого случая, а удаления обрабатываются в
    //   финальном цикле `while` без необходимости создавать карту.
    //
    // * Пример ниже: ключ на позиции `oldTail` был удалён (больше не содержится в `newKeyToIndexMap`),
    //   поэтому удаляем эту часть из DOM и сдвигаем только указатель `oldTail`.
    //
    //         oldHead v           v oldTail
    //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
    //   newParts: [0,  ,  ,  ,  ,  , 6] <- 5 отсутствует в новой карте: удаляем
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]    5 и сдвигаем oldTail
    //         newHead ^           ^ newTail
    //
    // * После того как ни начало, ни конец не могут двигаться, любые несоответствия
    //   связаны либо с новыми элементами, либо с перемещёнными элементами. Если новый ключ
    //   есть в предыдущей карте "старый ключ к старому индексу", перемещаем старую часть
    //   в новое место, иначе создаём и вставляем новую часть. Обратите внимание, что при
    //   перемещении старой части её позиция в массиве `oldParts` становится null, если
    //   она находится между указателями начала и конца, чтобы мы знали, что пропустить её
    //   при достижении этих указателей.
    //
    // * Пример ниже: ни начало, ни конец не совпадают, и ни один из них не был удалён,
    //   поэтому находим ключ `newHead` в `oldKeyToIndexMap` и перемещаем DOM старой части
    //   на новую начальную позицию (перед `oldParts[oldHead]`). В конце отмечаем эту часть
    //   как null в массиве `oldParts`, так как она где-то между оставшимися элементами,
    //   которые будут проверяться (между указателями начала и конца), чтобы мы знали,
    //   что пропустить её на будущих итерациях.
    //
    //         oldHead v        v oldTail
    //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
    //   newParts: [0, 2,  ,  ,  ,  , 6] <- заморожено: обновляем и перемещаем 2
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]    на место и сдвигаем newHead
    //         newHead ^           ^ newTail
    //
    // * Пример ниже: здесь старый ключ конца совпадает с новым ключом начала, поэтому перемещаем
    //   DOM части с позиции `oldTail` на новую позицию начала (перед `oldParts[oldHead]`).
    //   В конце сдвигаем указатели `oldTail` и `newHead`.
    //
    //               oldHead v  v oldTail
    //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
    //   newParts: [0, 2, 1, 4,  ,  , 6] <- старый конец совпадает с новым началом: обновляем и перемещаем 4,
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]   сдвигаем oldTail и newHead
    //               newHead ^     ^ newTail
    //
    // * Как только указатели нового или старого выходят за пределы друг друга,
    //   остаются только добавления (если старый список исчерпан) или удаления
    //   (если новый список исчерпан). Они обрабатываются в финальных циклах `while`.
    //
    // * Пример ниже: `oldHead` превысил `oldTail`, так что мы закончили с основным циклом.
    //   Создаём оставшуюся часть и вставляем её на новую начальную позицию, и обновление завершено.
    //
    //                   (oldHead > oldTail)
    //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
    //   newParts: [0, 2, 1, 4, 3, 7 ,6] <- создаём и вставляем 7
    //   newKeys:  [0, 2, 1, 4, 3, 7, 6]
    //                     newHead ^ newTail
    //
    // * Порядок условий if/else не критичен для алгоритма, пока проверки на null
    //   выполняются первыми (чтобы работать только с действующими частями), а последний
    //   блок else остаётся в конце (так как именно там выполняются дорогие перемещения).
    //   Остальные условия расположены с учётом того, какие случаи будут наиболее частыми.
    //
    // * Мы могли бы вычислить самую длинную возрастающую подпоследовательность (LIS)
    //   старых элементов в новом порядке и перемещать только те элементы, которые не
    //   входят в LIS. Однако это потребует O(nlogn) времени и добавит больше кода,
    //   а помогает лишь в редких случаях. Текущий алгоритм справляется с удалениями,
    //   добавлениями, реверсами, перестановками и единичными перемещениями элементов
    //   за линейное время с минимальным количеством перемещений.

    while (oldHead <= oldTail && newHead <= newTail) {
      if (oldParts[oldHead] === null) {
        // `null` означает, что старая часть в хвосте уже была использована ниже; пропустить
        oldHead++
      } else if (oldParts[oldTail] === null) {
        // `null` означает, что старая часть в хвосте уже была использована ниже; пропустить
        oldTail--
      } else if (oldKeys[oldHead] === newKeys[newHead]) {
        // Старый голова совпадает с новой головой; обновить на месте
        newParts[newHead] = setChildPartValue(oldParts[oldHead], newValues[newHead])
        oldHead++
        newHead++
      } else if (oldKeys[oldTail] === newKeys[newTail]) {
        // Старый хвост совпадает с новой хвостом; обновить на месте
        newParts[newTail] = setChildPartValue(oldParts[oldTail], newValues[newTail])
        oldTail--
        newTail--
      } else if (oldKeys[oldHead] === newKeys[newTail]) {
        // Старый голова совпадает с новой хвостом; обновить и переместить в новую хвост
        newParts[newTail] = setChildPartValue(oldParts[oldHead], newValues[newTail])
        insertPart(containerPart, newParts[newTail + 1], oldParts[oldHead])
        oldHead++
        newTail--
      } else if (oldKeys[oldTail] === newKeys[newHead]) {
        // Старый хвост совпадает с новой головой; обновить и переместить в новую голову
        newParts[newHead] = setChildPartValue(oldParts[oldTail], newValues[newHead])
        insertPart(containerPart, oldParts[oldHead], oldParts[oldTail])
        oldTail--
        newHead++
      } else {
        if (newKeyToIndexMap === undefined) {
          // Лениво генерируем карты ключей к индексам, используемые для удалений и перемещений ниже
          newKeyToIndexMap = generateMap(newKeys, newHead, newTail)
          oldKeyToIndexMap = generateMap(oldKeys, oldHead, oldTail)
        }
        if (!newKeyToIndexMap.has(oldKeys[oldHead])) {
          // Старая голова больше не в новом списке; удалить
          removePart(oldParts[oldHead])
          oldHead++
        } else if (!newKeyToIndexMap.has(oldKeys[oldTail])) {
          // Старая хвост больше не в новом списке; удалить
          removePart(oldParts[oldTail])
          oldTail--
        } else {
          // Любые несоответствия в этой точке вызваны добавлениями или перемещениями;
          // проверяем, есть ли у нас старая часть, которую можно переместить и использовать
          const oldIndex = /** @type {number} */ (
            /** @type {Map<unknown, number>} */ (oldKeyToIndexMap).get(newKeys[newHead])
          )
          const oldPart = oldIndex !== undefined ? oldParts[oldIndex] : null
          if (oldPart === null) {
            // Нет старой части для этого значения; создать новую и вставить её
            const newPart = insertPart(containerPart, oldParts[oldHead])
            setChildPartValue(newPart, newValues[newHead])
            newParts[newHead] = newPart
          } else {
            // Переиспользовать старую часть
            newParts[newHead] = setChildPartValue(oldPart, newValues[newHead])
            insertPart(containerPart, oldParts[oldHead], oldPart)
            // Это отмечает старую часть как использованную, чтобы она была пропущена в первых двух проверках выше
            oldParts[oldIndex] = null
          }
          newHead++
        }
      }
    }
    // Добавляем части для любых оставшихся новых значений
    while (newHead <= newTail) {
      // Для всех оставшихся добавлений мы вставляем перед последней новой хвостом,
      // так как старые указатели больше не действительны
      const newPart = insertPart(containerPart, newParts[newTail + 1])
      setChildPartValue(newPart, newValues[newHead])
      newParts[newHead++] = newPart
    }
    // Удаляем любые оставшиеся неиспользуемые старые части
    while (oldHead <= oldTail) {
      const oldPart = oldParts[oldHead++]
      if (oldPart !== null) {
        removePart(oldPart)
      }
    }

    // Сохраняем порядок новых частей для следующего раунда
    this._itemKeys = newKeys
    // Прямо устанавливаем значение части, пропуская его грязную проверку
    setCommittedValue(containerPart, newParts)
    return noChange
  }
}

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
export const repeat = directive(RepeatDirective)
// @template T
// @type {import("../types/directives").RepeatDirectiveFn<T>}