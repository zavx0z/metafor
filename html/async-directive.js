/**
 * @typedef {import("./types/html.js").Disconnectable} Disconnectable
 * @typedef {import("./types/part.js").Part} Part
 * @typedef {import("./types/directives.js").PartInfo} PartInfo
 * @typedef {import("./html.js").AttributePart} AttributePart
 * @typedef {import("./html.js").ChildPart} ChildPart
 *
 * @typedef {Disconnectable & {
 *    _$disconnectableChildren?: Set<Disconnectable>;
 *    _$parent?: Disconnectable;
 * }} ExtendedDisconnectable
 */

import {isSingleExpression} from "./directives/utils.js"
import {Directive, directive, PartType} from "./directive.js"
import {DEV_MODE} from "./html.js"

export {Directive, directive}

/**
 * Рекурсивно проходит по дереву Parts/TemplateInstances/Directives, чтобы установить
 * состояние подключения директив и запустить колбэки `disconnected`/`reconnected`.
 *
 * @param {ExtendedDisconnectable} parent
 * @param {boolean} isConnected
 * @return {boolean} True, если найдены дочерние элементы для уведомления
 */
const notifyChildrenConnectedChanged = (parent, isConnected) => {
  const children = parent._$disconnectableChildren
  if (children === undefined) {
    return false
  }
  for (const obj of children) {
    // Используем необязательный вызов, чтобы вызвать метод, если он есть
    /** @type {import("./async-directive.js").AsyncDirective} */ (obj)["_$notifyDirectiveConnectionChanged"]?.(isConnected, false)
    // Рекурсивно уведомляем дочерние объекты
    notifyChildrenConnectedChanged(obj, isConnected)
  }
  return true
}

/**
 * Удаляет данного потомка из родительского списка отключаемых потомков и,
 * если список родителя пуст, поднимается вверх по дереву.
 *
 * @param {ExtendedDisconnectable} obj Объект для удаления из родительского списка
 */
const removeDisconnectableFromParent = (obj) => {
  let parent, children
  do {
    parent = obj._$parent
    if (parent === undefined) {
      break
    }
    children = parent._$disconnectableChildren
    if (children) {
      children.delete(obj)
    }
    obj = parent
  } while (children && children.size === 0)
}

/**
 * Добавляет отключаемый объект к родителю.
 *
 * @param {ExtendedDisconnectable} obj Объект для добавления к родителю
 */
const addDisconnectableToParent = (obj) => {
  for (let parent; (parent = obj._$parent); obj = parent) {
    let children = parent._$disconnectableChildren
    if (children === undefined) {
      parent._$disconnectableChildren = new Set()
      children = parent._$disconnectableChildren
    } else if (children.has(obj)) {
      // Если родитель уже содержит этого потомка, прерываем процесс
      break
    }
    children.add(obj)
    installDisconnectAPI(/** @type {ChildPart & ExtendedDisconnectable} */ (parent))
  }
}

/**
 * Изменяет родительскую ссылку у ChildPart и обновляет дерево отключаемых потомков.
 *
 * @this {ChildPart & ExtendedDisconnectable}
 * @param {ExtendedDisconnectable} newParent Новый родитель для ChildPart
 */
function reparentDisconnectables(newParent) {
  if (this._$disconnectableChildren !== undefined) {
    removeDisconnectableFromParent(this)
    this._$parent = newParent
    addDisconnectableToParent(this)
  } else {
    this._$parent = newParent
  }
}

/**
 * Устанавливает состояние подключения для директив внутри ChildPart.
 *
 * @this {ChildPart & ExtendedDisconnectable}
 * @param {boolean} isConnected Состояние подключения
 * @param {boolean} [isClearingValue=false] Флаг очистки значения
 * @param {number} [fromPartIndex=0] Индекс начала для усечения
 */
function notifyChildPartConnectedChanged(
  isConnected,
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
      // Если значение – итерируемый объект, отключаем его части начиная с fromPartIndex
      for (let i = fromPartIndex; i < value.length; i++) {
        notifyChildrenConnectedChanged(value[i], false)
        removeDisconnectableFromParent(/** @type {ExtendedDisconnectable} */ (value[i]))
      }
    } else if (value != null) {
      // Если значение – TemplateInstance, отключаем его целиком
      notifyChildrenConnectedChanged(/** @type {ExtendedDisconnectable} */ (value), false)
      removeDisconnectableFromParent(/** @type {ExtendedDisconnectable} */ (value))
    }
  } else {
    notifyChildrenConnectedChanged(this, isConnected)
  }
}

/**
 * Добавляет API отключения к ChildParts.
 *
 * @param {ChildPart & ExtendedDisconnectable} obj Объект для установки API отключения
 */
const installDisconnectAPI = (obj) => {
  if (obj.type == PartType.CHILD) {
    obj._$notifyConnectionChanged = obj._$notifyConnectionChanged || notifyChildPartConnectedChanged
    obj._$reparentDisconnectables = obj._$reparentDisconnectables || reparentDisconnectables
  }
}

/**
 * Директива, которая отслеживает подключение/отключение.
 */
export class AsyncDirective extends Directive {
  /**
   * Состояние подключения для этой директивы.
   * @type {boolean}
   */
  isConnected = false

  /**
   * Список отключаемых потомков.
   * @type {Set<Disconnectable>|undefined}
   */
  _$disconnectableChildren = undefined

  /**
   * Инициализирует директиву с внутренними полями.
   *
   * @param {Part} part Часть, к которой привязывается директива
   * @param {ExtendedDisconnectable} parent Родительский объект
   * @param {number|undefined} attributeIndex Индекс атрибута (если применимо)
   */
  _$initialize(part, parent, attributeIndex) {
    super._$initialize(part, parent, attributeIndex)
    addDisconnectableToParent(this)
    // Предполагаем, что part имеет поле _$isConnected
    this.isConnected = part._$isConnected ?? false
  }

  /**
   * Уведомляет директиву об изменении состояния подключения.
   *
   * @param {boolean} isConnected Новое состояние подключения
   * @param {boolean} [isClearingDirective=true] Флаг очистки директивы
   */
  _$notifyDirectiveConnectionChanged(isConnected, isClearingDirective = true) {
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
   * Устанавливает значение директивы вне обычного цикла обновления.
   *
   * @param {unknown} value Значение для установки
   */
  setValue(value) {
    if (isSingleExpression(this.__part)) {
      this.__part._$setValue(value, this)
    } else {
      if (DEV_MODE && this.__attributeIndex === undefined) {
        throw new Error(`Ожидалось, что this.__attributeIndex будет числом`)
      }
      // Приводим _committedValue к массиву
      const committedValue = /** @type {Array<unknown>} */ (this.__part._$committedValue)
      const newValues = [...committedValue]
      newValues[/** @type {number} */ (this.__attributeIndex)] = value
      this.__part._$setValue(newValues, this, 0)
    }
  }

  disconnected() {
  }

  reconnected() {
  }
}