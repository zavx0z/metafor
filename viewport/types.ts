/**
 * Глобальные координаты элемента
 * @interface CanvasBB
 * @property x - Позиция по X
 * @property y - Позиция по Y
 * @property width - Ширина
 * @property height - Высота
 * @property center - Центр
 * @property center.x - Позиция по X
 * @property center.y - Позиция по Y
 */
export interface CanvasBB {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Внутренние координаты элемента
 * @interface ViewportBB
 * @property x - Позиция по X
 * @property y - Позиция по Y
 * @property width - Ширина
 * @property height - Высота
 * @property center - Центр
 * @property center.x - Позиция по X
 * @property center.y - Позиция по Y
 * @property scale - Масштаб
 */
export interface ViewportBB {
  x: number
  y: number
  width: number
  height: number
  center: {
    x: number
    y: number
  }
  scale: number
}
export {}
