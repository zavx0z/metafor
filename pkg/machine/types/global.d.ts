declare global {
  /**
   * Сообщение для обмена данными между атомами
   * @interface BroadcastMessage
   * @property meta - Метаданные сообщения
   * @property meta.atom - Идентификатор атома
   * @property meta.func - Имя функции
   * @property meta.target - Цель функции
   * @property meta.timestamp - Время отправки сообщения
   * @property patch - Патч для применения к атому
   * @property patch.path - Путь к атому
   * @property patch.op - Операция
   * @property patch.value - Значение
   */
  type BroadcastMessage = {
    meta: {
      atom: string
      func: string
      target: string
      timestamp: number
    }
    patch: Patch
  }
  /**
   * Правило перехода между состояниями
   * @interface QMachineCollapse
   * @property from - Исходное состояние
   * @property action - Действие при переходе
   * @property to - Массив целевых состояний
   * @property to[].state - Целевое состояние
   * @property to[].trigger - Условия для перехода в целевое состояние
   */
  type QMachineCollapse = {
    from: string
    action?: string
    to: Array<{
      state: string
      trigger: Record<string, any>
    }>
  }
  /**
   * Снимок состояния квантового атома
   * @interface QMachineSnapshot
   * @property id - Идентификатор снимка
   * @property title - Заголовок снимка
   * @property description - Описание снимка
   * @property state - Текущее состояние
   * @property states - Список доступных состояний
   * @property context - Данные контекста
   * @property types - Определения типов контекста
   * @property collapses - Правила переходов между состояниями
   * @property collapses[].from - Исходное состояние перехода
   * @property collapses[].action - Действие при переходе
   * @property collapses[].to - Массив целевых состояний
   * @property collapses[].to[].state - Целевое состояние
   * @property collapses[].to[].trigger - Условия для перехода в целевое состояние
   */
  type QMachineSnapshot = {
    id: string
    title?: string
    description?: string
    state: string
    states: string[]
    context: Record<string, any>
    types: Record<string, any>
    collapses: QMachineCollapse[]
  }
  type QAtom = QuantumAtom<any, any, any>
}
export {}
