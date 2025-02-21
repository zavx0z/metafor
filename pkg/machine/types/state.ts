/**
 * Слушатель сигналов
 * @interface SignalListener
 * @template T
 * @property preview - Предыдущее состояние
 * @property current - Текущее состояние
 */
type SignalListener<T extends string> = (preview: T, current: T) => void
/**
 * Тип сигнала
 * @interface SignalType
 * @template T
 * @property value - Получить текущее значение
 * @property setValue - Установить новое значение
 * @property onChange - Добавить слушатель изменения
 * @property clear - Очистить слушателей
 */
export type SignalType<T extends string> = {
  value: () => T
  setValue: (state: T) => void
  onChange: (listener: SignalListener<T>) => () => void
  clear: () => void
}