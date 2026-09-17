declare global {
  /**
   * Сообщение для обмена данными между частицами
   * @interface BroadcastMessage
   * @property meta - Метаданные сообщения
   * @property meta.name - Имя частицы
   * @property meta.func - Имя функции
   * @property meta.target - Цель функции
   * @property meta.timestamp - Время отправки сообщения
   * @property patch - Патч для применения к частице
   * @property patch.path - Путь к частице
   * @property patch.op - Операция
   * @property patch.value - Значение
   */
  type BroadcastMessage = {
    meta: {
      name: string
      func: string
      target: string
      timestamp: number
    }
    patch: Patch
  }
  /**
   * Правило перехода между состояниями
   * @interface MetaForTransition
   * @property from - Исходное состояние
   * @property action - Действие при переходе
   * @property to - Массив целевых состояний
   * @property to[].state - Целевое состояние
   * @property to[].trigger - Условия для перехода в целевое состояние
   */
  type MetaForTransition = {
    from: string
    action?: string
    to: Array<{
      state: string
      trigger: Record<string, any>
    }>
  }
  /**
   * Снимок состояния частицы
   * @interface MetaForSnapshot
   * @property id - Идентификатор снимка
   * @property title - Заголовок снимка
   * @property description - Описание снимка
   * @property state - Текущее состояние
   * @property states - Список доступных состояний
   * @property context - Данные контекста
   * @property types - Определения типов контекста
   * @property transitions - Правила переходов между состояниями
   * @property transitions[].from - Исходное состояние перехода
   * @property transitions[].action - Действие при переходе
   * @property transitions[].to - Массив целевых состояний
   * @property transitions[].to[].state - Целевое состояние
   * @property transitions[].to[].trigger - Условия для перехода в целевое состояние
   */
  type MetaForSnapshot = {
    id: string
    title?: string
    description?: string
    state: string
    states: string[]
    context: Record<string, any>
    types: Record<string, any>
    transitions: MetaForTransition[]
  }
}
export {}
