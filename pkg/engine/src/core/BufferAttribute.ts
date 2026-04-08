/**
 * Низкоуровневый контейнер для вершинных данных (позиции, нормали, цвета).
 * Данные передаются в GPU "как есть".
 * @see https://threejs.org/docs/#api/en/core/BufferAttribute
 */
export class BufferAttribute {
  /**
   * Служебный флаг для быстрой проверки типа в рендер-лупе.
   */
  public readonly isBufferAttribute: true = true

  /**
   * Сырые данные буфера (обычно TypedArray: Float32Array, Uint16Array и т.д.).
   * Изменение содержимого требует установки флага `needsUpdate = true`.
   */
  public array: any

  /**
   * Количество компонентов на одну вершину.
   * Например: 3 для позиций (x, y, z), 2 для UV (u, v).
   */
  public itemSize: number

  /**
   * Определяет трактовку целочисленных данных GPU.
   * * `true`: Данные маппятся в диапазон [-1.0 ... 1.0] (или [0.0 ... 1.0]).
   * * `false`: Данные интерпретируются как есть.
   */
  public normalized: boolean

  /**
   * Флаг, указывающий, что данные атрибута изменились и требуют обновления на GPU.
   */
  public needsUpdate: boolean = false

  /**
   * @param array - TypedArray с данными.
   * @param itemSize - Компонентов на вершину. Ограничение: `[1 ... 4]`.
   * @param normalized - Авто-нормализация значений GPU.
   */
  constructor(array: any, itemSize: number, normalized = false) {
    this.array = array
    this.itemSize = itemSize
    this.normalized = normalized
  }

  /**
   * Количество вершин в атрибуте (длина массива / itemSize).
   */
  get count(): number {
    return this.array.length / this.itemSize
  }
}

/**
 * Хелпер для создания атрибута строго на базе Float32Array.
 * Используется для позиций, нормалей и большинства вычислений.
 */
export class Float32BufferAttribute extends BufferAttribute {
  /**
   * @param array - Обычный массив `number[]` (будет конвертирован) или готовый `Float32Array`.
   * @param itemSize - Компонентов на вершину.
   */
  constructor(array: number[] | Float32Array, itemSize: number, normalized = false) {
    super(new Float32Array(array), itemSize, normalized)
  }
}
