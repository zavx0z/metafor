/**
 * Обзор:
 *
 * Этот модуль предназначен для добавления поддержки асинхронного API `setValue` и
 * колбэка `disconnected` для директив с минимальным влиянием на основной рантайм
 * или размер бандла, если эта возможность не используется.
 *
 * Стратегия заключается во введении подкласса `AsyncDirective` от
 * `Directive`, который поднимается по дереву "parent" в своём конструкторе, чтобы отметить,
 * какие ветки "логического дерева" структур данных @metafor/html содержат такие
 * директивы и, следовательно, должны быть обработаны при очистке поддерева (или
 * ручном отключении), чтобы вызвать колбэк `disconnected`.
 *
 * "Узлы" логического дерева включают Parts, TemplateInstances (когда
 * TemplateResult коммитится в значение ChildPart), и Directives; все они реализуют
 * общий интерфейс `DisconnectableChild`. У каждого есть ссылка `_$parent`, которая
 * устанавливается при создании в основном коде, и поле `_$disconnectableChildren`,
 * которое изначально undefined.
 *
 * Разреженное дерево создаётся с помощью конструктора AsyncDirective, который
 * поднимается по дереву `_$parent` и размещает Set `_$disconnectableChildren` на каждом
 * родителе, включающем каждого потомка, который содержит AsyncDirective напрямую или
 * транзитивно через своих детей. Для уведомления об изменении состояния соединения и
 * отключения (или повторного подключения) дерева, API `_$notifyConnectionChanged`
 * патчится в ChildParts по мере подъёма директивы по дереву родителей, и вызывается
 * ядром при очистке части, если он существует. При вызове этот метод итерирует по
 * разреженному дереву Set<DisconnectableChildren>, построенному AsyncDirectives, и
 * вызывает `_$notifyDirectiveConnectionChanged` на всех директивах, встреченных в этом
 * дереве, выполняя необходимые колбэки.
 *
 * Пример "логического дерева" структур данных @metafor/html может выглядеть так:
 *
 *  ChildPart(N1) _$dC=[D2,T3]
 *   ._directive
 *     AsyncDirective(D2)
 *   ._value // пользовательское значение было TemplateResult
 *     TemplateInstance(T3) _$dC=[A4,A6,N10,N12]
 *      ._$parts[]
 *        AttributePart(A4) _$dC=[D5]
 *         ._directives[]
 *           AsyncDirective(D5)
 *        AttributePart(A6) _$dC=[D7,D8]
 *         ._directives[]
 *           AsyncDirective(D7)
 *           Directive(D8) _$dC=[D9]
 *            ._directive
 *              AsyncDirective(D9)
 *        ChildPart(N10) _$dC=[D11]
 *         ._directive
 *           AsyncDirective(D11)
 *         ._value
 *           string
 *        ChildPart(N12) _$dC=[D13,N14,N16]
 *         ._directive
 *           AsyncDirective(D13)
 *         ._value // пользовательское значение было iterable
 *           Array<ChildPart>
 *             ChildPart(N14) _$dC=[D15]
 *              ._value
 *                string
 *             ChildPart(N16) _$dC=[D17,T18]
 *              ._directive
 *                AsyncDirective(D17)
 *              ._value // пользовательское значение было TemplateResult
 *                TemplateInstance(T18) _$dC=[A19,A21,N25]
 *                 ._$parts[]
 *                   AttributePart(A19) _$dC=[D20]
 *                    ._directives[]
 *                      AsyncDirective(D20)
 *                   AttributePart(A21) _$dC=[22,23]
 *                    ._directives[]
 *                      AsyncDirective(D22)
 *                      Directive(D23) _$dC=[D24]
 *                       ._directive
 *                         AsyncDirective(D24)
 *                   ChildPart(N25) _$dC=[D26]
 *                    ._directive
 *                      AsyncDirective(D26)
 *                    ._value
 *                      string
 *
 * Пример 1: Директива в ChildPart(N12) обновляется и возвращает `nothing`. ChildPart
 * вызовет _clear() для себя, и нам нужно отключить "value" этой части (но не её директиву).
 * В этом случае, когда `_clear()` вызывает `_$notifyConnectionChanged()`, мы не итерируем
 * все `_$disconnectableChildren`, а делаем отключение только для значения: если _value был
 * Array<ChildPart> (т.к. был закоммичен iterable), мы итерируем массив ChildParts (N14, N16)
 * и вызываем setConnected для них (что рекурсивно проходит по всему дереву disconnectableChildren
 * ниже), а также удаляет N14 и N16 из disconnectableChildren N12. После отключения значений
 * проверяем, пуста ли disconnectableChildren у ChildPart(N12) (и если да — удаляем его из
 * родителя TemplateInstance(T3)), но так как там всё ещё есть директива D13, он остаётся в дереве.
 *
 * Пример 2: В ходе Примера 1 setConnected дойдёт до ChildPart(N16); в этом случае вся часть
 * отключается, поэтому мы просто итерируем все disconnectableChildren N16 (D17,T18) и рекурсивно
 * вызываем setConnected для них. Обратите внимание, что мы удаляем детей из disconnectableChildren
 * только для верхнеуровневых значений при очистке; делать это глубже неэффективно, так как всё
 * равно всё дерево удаляется.
 *
 * Пример 3: Если LitElement, содержащий всё дерево выше, отключается, он вызовет
 * childPart.setConnected() (что вызывает childPart._$notifyConnectionChanged(), если он есть);
 * в этом случае мы рекурсивно вызываем setConnected() по всему дереву, не удаляя детей из
 * disconnectableChildren, так как это дерево потребуется для повторного подключения, что делает
 * ту же операцию, просто передавая isConnected: true вниз по дереву, сигнализируя какой колбэк вызывать.
 */

import type { AttributePart, ChildPart } from "./html"
import type { Disconnectable, Part } from "./html.t"
import { isSingleExpression } from "./directive-helpers"
import { Directive } from "./directive"
import { type PartInfo, PartType } from "./directive.t"
export * from "./directive.js"

/**
 * Рекурсивно проходит по дереву частей/TemplateInstances/Directives, чтобы установить
 * состояние соединения директив и запустить их колбэки `disconnected`/ `reconnected`.
 *
 * @return True, если были отключены дети; false в противном случае
 */
const notifyChildrenConnectedChanged = (parent: Disconnectable, isConnected: boolean): boolean => {
  const children = parent._$disconnectableChildren
  if (children === undefined) {
    return false
  }
  for (const obj of children) {
    // Существование `_$notifyDirectiveConnectionChanged` используется как "бренд" для
    // различения AsyncDirectives от других DisconnectableChildren
    // (вместо использования проверки instanceof, чтобы знать, когда вызывать его);
    // избыточность "Directive" в имени API является попыткой избежать конфликтов с
    // `_$notifyConnectionChanged`, который существует в `ChildParts`, которые также находятся
    // в этом списке
    // Отключить директиву (и любые вложенные директивы, содержащиеся в ней)
    // Это свойство должно оставаться неминифицированным.
    ;(obj as AsyncDirective)["_$notifyDirectiveConnectionChanged"]?.(isConnected, false)
    // Отключить часть/TemplateInstance
    notifyChildrenConnectedChanged(obj, isConnected)
  }
  return true
}

/**
 * Удаляет указанного потомка из списка отключаемых детей его родителя и, если список
 * родителей становится пустым в результате, удаляет родителя из его родителя, и так далее
 * вверх по дереву, пока это не приводит к тому, что последующие списки родителей становятся пустыми.
 */
const removeDisconnectableFromParent = (obj: Disconnectable) => {
  let parent, children
  do {
    if ((parent = obj._$parent) === undefined) {
      break
    }
    children = parent._$disconnectableChildren!
    children.delete(obj)
    obj = parent
  } while (children?.size === 0)
}

const addDisconnectableToParent = (obj: Disconnectable) => {
  // Поднимаемся по дереву родителей, создавая разреженное дерево детей, которые нуждаются
  // в отключении
  for (let parent; (parent = obj._$parent); obj = parent) {
    let children = parent._$disconnectableChildren
    if (children === undefined) {
      parent._$disconnectableChildren = children = new Set()
    } else if (children.has(obj)) {
      // Как только мы достигаем родителя, который уже содержит этого потомка, мы
      // можем прерваться
      break
    }
    children.add(obj)
    installDisconnectAPI(parent)
  }
}

/**
 * Изменяет родительскую ссылку ChildPart, и обновляет разреженное дерево
 * Disconnectable детей соответственно.
 *
 * Обратите внимание, что этот метод будет патчиться на экземпляры ChildPart и вызываться
 * из основного кода, когда части перемещаются между разными родителями.
 */
function reparentDisconnectables(this: ChildPart, newParent: Disconnectable) {
  if (this._$disconnectableChildren !== undefined) {
    removeDisconnectableFromParent(this)
    this._$parent = newParent
    addDisconnectableToParent(this)
  } else {
    this._$parent = newParent
  }
}

/**
 * Устанавливает состояние соединения на любых директивах, содержащихся в закоммиченном
 * значении этой части (т.е. в TemplateInstance или итерируемом массиве
 * ChildParts) и запускает их `disconnected`/`reconnected`s, а также в любых директивах,
 * сохранённых на ChildPart (когда `valueOnly` равно false).
 *
 * `isClearingValue` должен передаваться как `true` для верхней части, которая очищается
 * сама, а не как результат рекурсивного отключения директив в качестве части
 * `clear` операции выше по дереву. Это гарантирует, что любая директива на этой
 * ChildPart, которая вызвала операцию очистки, не отключается, и также служит
 * оптимизацией для избегания ненужного учета, когда поддерево уходит; при очистке
 * поддерева достаточно, чтобы верхняя часть удаляла себя из родителя.
 *
 * `fromPartIndex` передается только в случае частичного `_clear`, который запускается
 * как результат усечения итератора.
 *
 * Обратите внимание, что этот метод будет патчиться на экземпляры ChildPart и вызываться
 * из основного кода, когда части очищаются или состояние соединения изменяется пользователем.
 */
function notifyChildPartConnectedChanged(
  this: ChildPart,
  isConnected: boolean,
  isClearingValue = false,
  fromPartIndex = 0
) {
  const value = this._$committedValue
  const children = this._$disconnectableChildren
  if (children === undefined || children.size === 0) {
    return
  }
  if (isClearingValue) {
    if (Array.isArray(value)) {
      // Случай итератора: любые ChildParts, созданные итератором, должны быть
      // отключены и удалены из disconnectableChildren этой ChildPart (начиная с
      // `fromPartIndex` в случае усечения)
      for (let i = fromPartIndex; i < value.length; i++) {
        notifyChildrenConnectedChanged(value[i], false)
        removeDisconnectableFromParent(value[i])
      }
    } else if (value != null) {
      // Случай TemplateInstance: если значение имеет disconnectableChildren (будет
      // только в случае, если это TemplateInstance), мы отключаем его и удаляем
      // из disconnectableChildren этой ChildPart
      notifyChildrenConnectedChanged(value as Disconnectable, false)
      removeDisconnectableFromParent(value as Disconnectable)
    }
  } else {
    notifyChildrenConnectedChanged(this, isConnected)
  }
}

/**
 * Патчит API отключения в ChildParts.
 */
const installDisconnectAPI = (obj: Disconnectable) => {
  if ((obj as ChildPart).type == PartType.CHILD) {
    ;(obj as ChildPart)._$notifyConnectionChanged ??= notifyChildPartConnectedChanged
    ;(obj as ChildPart)._$reparentDisconnectables ??= reparentDisconnectables
  }
}

/**
 * Абстрактный базовый класс `Directive`, который будет вызываться, когда часть,
 * содержащая директиву, очищается в результате перерендеринга или когда пользователь
 * вызывает `part.setConnected(false)` на части, которая была ранее отрендерена
 * содержащая директиву (как происходит, когда LitElement отключается от DOM).
 *
 * Если `part.setConnected(true)` вызывается затем на части, содержащей директиву,
 * колбэк `reconnected` директивы будет вызываться перед её следующими
 * `update`/`render` колбэками. При реализации `disconnected`, `reconnected`
 * также должен быть реализован для совместимости с повторным подключением.
 *
 * Обратите внимание, что обновления могут происходить, когда директива отключена.
 * Поэтому директивы должны в целом проверять флаг `this.isConnected` во время
 * `render`/`update`, чтобы определить, безопасно ли подписываться на ресурсы,
 * которые могут помешать сборке мусора.
 */
export abstract class AsyncDirective extends Directive {
  // В отличие от других Disconnectable, AsyncDirectives всегда уведомляются
  // при изменении состояния соединения RootPart, поэтому публичный `isConnected`
  // является локальной переменной, инициализированной через его часть, синхронизированной
  // через `_$notifyDirectiveConnectionChanged`. Это дешевле, чем использование
  // _$isConnected getter, который должен снова подняться по дереву каждый раз.
  /**
   * Состояние соединения для этой директивы.
   */
  isConnected!: boolean

  // @internal
  override _$disconnectableChildren?: Set<Disconnectable> = undefined
  /**
   * Инициализирует часть внутренними полями
   * @param part
   * @param parent
   * @param attributeIndex
   */
  override _$initialize(part: Part, parent: Disconnectable, attributeIndex: number | undefined) {
    super._$initialize(part, parent, attributeIndex)
    addDisconnectableToParent(this)
    this.isConnected = part._$isConnected
  }
  // Это свойство должно оставаться неминифицированным.
  /**
   * Вызывается из основного кода, когда директива уходит от части (в этом случае
   * `shouldRemoveFromParent` должно быть true), и из вспомогательной функции
   * `setChildrenConnected` при рекурсивном изменении состояния соединения дерева (в
   * этом случае `shouldRemoveFromParent` должно быть false).
   *
   * @param isConnected
   * @param isClearingDirective - True, когда директива сама удаляется; false, когда
   *     дерево отключается
   * @internal
   */
  override ["_$notifyDirectiveConnectionChanged"](isConnected: boolean, isClearingDirective = true) {
    if (isConnected !== this.isConnected) {
      this.isConnected = isConnected
      if (isConnected) {
        this.reconnected?.()
      } else {
        this.disconnected?.()
      }
    }
    if (isClearingDirective) {
      notifyChildrenConnectedChanged(this, isConnected)
      removeDisconnectableFromParent(this)
    }
  }

  /**
   * Устанавливает значение Part директивы вне обычного жизненного цикла директивы.
   *
   * Этот метод не должен вызываться синхронно из `update`
   * или `render` директивы.
   *
   * @param value Значение для установки
   */
  setValue(value: unknown) {
    if (isSingleExpression(this.__part as unknown as PartInfo)) {
      this.__part._$setValue(value, this)
    } else {
      // В этом случае this.__attributeIndex будет определено, но
      // убедитесь, что это в dev-режиме
      if (global.MetaForHtmlDebug && this.__attributeIndex === undefined) {
        throw new Error(`Expected this.__attributeIndex to be a number`)
      }
      const committedValue = this.__part._$committedValue as Array<unknown>
      const newValues = [...committedValue]
      newValues[this.__attributeIndex!] = value as unknown
      ;(this.__part as AttributePart)._$setValue(newValues, this, 0)
    }
  }

  /**
   * Колбэки пользователя для реализации логики освобождения любых ресурсов/подписок,
   * которые могли быть удержаны этой директивой. Поскольку директивы также могут быть
   * повторно подключены, `reconnected` также должен быть реализован для восстановления
   * рабочего состояния директивы перед следующим рендерингом.
   */
  protected disconnected() {}
  protected reconnected() {}
}
