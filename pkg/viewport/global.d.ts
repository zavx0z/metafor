declare global {
  /**
   * Состояние viewport, определяющее его текущее положение и масштаб
   * @interface QViewportState
   * @property scale - Текущий масштаб viewport (1 = 100%)
   * @property translateX - Смещение по оси X в пикселях от начального положения
   * @property translateY - Смещение по оси Y в пикселях от начального положения
   * @property offset - Смещение viewport относительно начального положения
   * @property offset.x - Смещение по оси X в пикселях
   * @property offset.y - Смещение по оси Y в пикселях
   */
  interface QViewportState {
    scale: number
    translateX: number
    translateY: number
    offset: {
      x: number
      y: number
    }
  }

  /**
   * Настройки отображения координатной сетки
   * @interface QViewportGridOptions
   * @property size - Размер ячейки сетки в пикселях
   * @property color - Цвет линий сетки (CSS color)
   * @property lineWidth - Толщина линий сетки в пикселях
   * @property mainColor - Цвет основных линий сетки (CSS color)
   * @property mainLineWidth - Толщина основных линий сетки в пикселях
   */
  interface QViewportGridOptions {
    size: number
    color: string
    lineWidth: number
    mainColor: string
    mainLineWidth: number
  }

  /**
   * Состояние перетаскивания элемента
   * @interface QViewportDragState
   * @property element - Перетаскиваемый HTML элемент
   * @property startX - Начальная позиция курсора по X в момент начала перетаскивания
   * @property startY - Начальная позиция курсора по Y в момент начала перетаскивания
   * @property elementX - Текущая позиция элемента по X
   * @property elementY - Текущая позиция элемента по Y
   */
  interface QViewportDragState {
    element: HTMLElement | null
    startX: number
    startY: number
    elementX: number
    elementY: number
  }

  /**
   * Размер может быть задан числом (пиксели) или строкой с процентами
   * @example
   * 100 // 100 пикселей
   * "50%" // 50 процентов
   */
  type SizeValue = number | `${number}%`

  /**
   * Опции для центрирования на элементе
   * @interface QViewportCenterOptions
   * @property duration - Длительность анимации в миллисекундах
   * @property easing - Функция плавности (CSS easing)
   * @property maxWidth - Максимальная ширина в пикселях или процентах
   * @property maxHeight - Максимальная высота в пикселях или процентах
   * @property minWidth - Минимальная ширина в пикселях или процентах
   * @property minHeight - Минимальная высота в пикселях или процентах
   */
  interface QViewportCenterOptions {
    duration?: number
    easing?: string
    maxWidth?: SizeValue
    maxHeight?: SizeValue
    minWidth?: SizeValue
    minHeight?: SizeValue
  }

  /**
   * Конфигурация viewport
   * @interface QViewportConfig
   * @property debug - Режим отладки для вывода служебной информации
   * @property grid - Настройки координатной сетки
   * @property handlers - Настройки обработчиков событий
   * @property handlers.gesture - Настройки жестов масштабирования
   * @property handlers.gesture.scale - Параметры масштабирования
   * @property handlers.gesture.scale.min - Минимальный масштаб (0.1 = 10%)
   * @property handlers.gesture.scale.max - Максимальный масштаб (20 = 2000%)
   * @property handlers.gesture.scale.step - Шаг изменения масштаба при прокрутке
   * @property handlers.gesture.scale.speed - Скорость изменения масштаба при жестах
   * @property handlers.gesture.wheelZoomEnabled - Разрешить масштабирование колесиком мыши
   * @property handlers.drag - Настройки перетаскивания
   * @property handlers.drag.enabled - Включить возможность перетаскивания
   * @property handlers.drag.middleButton - Разрешить перетаскивание средней кнопкой мыши
   * @property handlers.drag.spaceKey - Разрешить перетаскивание при зажатом пробеле
   * @property handlers.drag.dragSelectors - Разрешить перетаскивание элементов с data-drag-selector
   * @property handlers.transform - Настройки трансформации
   * @property handlers.transform.resizeDebounce - Задержка обновления при изменении размера в мс
   * @property handlers.transform.animationDuration - Длительность анимации трансформации в мс
   * @property handlers.transform.animationEasing - Функция плавности анимации трансформации
   * @property animation - Настройки анимации по умолчанию
   * @property animation.duration - Длительность анимации в миллисекундах
   * @property animation.easing - Функция плавности по умолчанию (CSS easing)
   */
  interface QViewportConfig {
    debug: boolean
    grid: QViewportGridOptions
    handlers: {
      gesture: {
        scale: {
          min: number
          max: number
          step: number
          speed: number
        }
        wheelZoomEnabled: boolean
      }
      drag: {
        enabled: boolean
        middleButton: boolean
        spaceKey: boolean
        dragSelectors: boolean
      }
      transform: {
        resizeDebounce: number
        animationDuration: number
        animationEasing: string
      }
    }
    animation: {
      duration: number
      easing: string
    }
  }

  /**
   * Canvas для viewport
   * @interface QViewportCanvasAxis
   * @property applyPatch - Обновление соединений патчем
   */
  interface QViewportCanvasAxis {
    applyPatch(patch: PatchEdge): void
  }

  /**
   * Quantum Viewport - компонент для создания бесконечной области просмотра
   * @interface QViewportElement
   * @property state - Текущее состояние viewport (масштаб и позиция)
   * @property state.scale - Текущий масштаб
   * @property state.translateX - Смещение по оси X
   * @property state.translateY - Смещение по оси Y
   * @property setPosition - Устанавливает абсолютную позицию viewport в пикселях
   * @property centerOnElement - Центрирует viewport на указанном элементе с анимацией
   * @property addElement - Добавляет новый элемент в контент viewport
   * @property debug - Режим отладки для вывода служебной информации
   * @property getCanvasBB - Возвращает координаты холста элемента
   * @property getViewportBB - Возвращает координаты вьюпорта элемента
   */
  type QViewport = {
    state: QViewportState
    content: HTMLElement
    setPosition(x: number, y: number): void
    centerOnElement(element: HTMLElement | Element, options?: QViewportCenterOptions): Promise<void>
    addElement(element: HTMLElement | DocumentFragment): HTMLElement
    canvas: QViewportCanvasAxis
    debug: boolean
    getCanvasBB(element: HTMLElement): CanvasBB
    getViewportBB(element: HTMLElement): ViewportBB
  }

  /**
   * Событие жеста масштабирования
   * @interface GestureEvent
   * @extends UIEvent
   * @property scale - Текущий масштаб жеста
   * @property rotation - Текущий угол поворота жеста
   * @property clientX - Позиция курсора по X
   * @property clientY - Позиция курсора по Y
   */
  interface GestureEvent extends UIEvent {
    scale: number
    rotation: number
    clientX: number
    clientY: number
  }

  /**
   * Обработчик жестов для viewport
   * @interface QViewportGestureHandler
   * @property viewport - Ссылка на элемент viewport
   * @property config - Конфигурация viewport
   * @property gestureStartScale - Начальный масштаб при старте жеста
   * @property gestureStartTranslateX - Начальное смещение по X при старте жеста
   * @property gestureStartTranslateY - Начальное смещение по Y при старте жеста
   * @property gestureStartX - Начальная позиция жеста по X
   * @property gestureStartY - Начальная позиция жеста по Y
   * @property init - Инициализация обработчика
   * @property destroy - Удаление обработчика
   * @property handleGestureStart - Обработчик начала жеста
   * @property handleGestureChange - Обработчик изменения жеста
   * @property handleGestureEnd - Обработчик окончания жеста
   * @property handleWheel - Обработчик прокрутки колесика мыши
   */
  interface QViewportGestureHandler {
    viewport: QViewport
    config: QViewportConfig
    gestureStartScale: number
    gestureStartTranslateX: number
    gestureStartTranslateY: number
    gestureStartX: number
    gestureStartY: number
    init(): void
    destroy(): void
    handleGestureStart(e: GestureEvent): void
    handleGestureChange(e: GestureEvent): void
    handleGestureEnd(e: GestureEvent): void
    handleWheel(e: WheelEvent): void
  }

  /**
   * Обработчик перетаскивания для viewport
   * @interface QViewportDragHandler
   * @property viewport - Ссылка на элемент viewport
   * @property config - Конфигурация viewport
   * @property init - Инициализация обработчика
   * @property destroy - Удаление обработчика
   */
  interface QViewportDragHandler {
    viewport: QViewport
    config: QViewportConfig
    init(): void
    destroy(): void
  }

  /**
   * Обработчик трансформации для viewport
   * @interface QViewportTransformHandler
   * @property viewport - Ссылка на элемент viewport
   * @property config - Конфигурация viewport
   * @property init - Инициализация обработчика
   * @property destroy - Удаление обработчика
   * @property updateTransform - Обновление CSS трансформации viewport
   */
  interface QViewportTransformHandler {
    viewport: QViewport
    config: QViewportConfig
    init(): void
    destroy(): void
    updateTransform(): void
  }

  /**
   * Расширяем стандартный интерфейс HTMLElementEventMap
   * @interface HTMLElementEventMap
   * @property gesturestart - Событие начала жеста
   * @property gesturechange - Событие изменения жеста
   * @property gestureend - Событие окончания жеста
   */
  interface HTMLElementEventMap {
    gesturestart: GestureEvent
    gesturechange: GestureEvent
    gestureend: GestureEvent
  }

  /**
   * Расширяем карту HTML элементов для поддержки quantum-viewport
   * @interface HTMLElementTagNameMap
   * @property quantum-viewport - Кастомный элемент quantum-viewport
   */
  interface HTMLElementTagNameMap {
    "quantum-viewport": HTMLElement & QViewport
  }

  type Point = {
    x: number
    y: number
  }

  /**
   * Ребро
   * @interface Edge
   * @property source - Начальная точка
   * @property source.x - Позиция по X
   * @property source.y - Позиция по Y
   * @property target - Конечная точка
   * @property target.x - Позиция по X
   * @property target.y - Позиция по Y
   * @property color - Цвет соединения
   * @property width - Толщина соединения
   */
  interface Edge {
    source: {
      x: number
      y: number
    }
    target: {
      x: number
      y: number
    }
    color: string
    width: number
  }
  /**
   * Ребро
   * @interface InternalExternalEdge
   * @property source - Начальная точка
   * @property source.x - Позиция по X
   * @property source.y - Позиция по Y
   * @property target - Конечная точка
   * @property target.x - Позиция по X
   * @property target.y - Позиция по Y
   * @property color - Цвет соединения
   * @property width - Толщина соединения
   */
  interface InternalExternalEdge {
    internal: {
      source: {
        x: number
        y: number
      }
      target: {
        x: number
        y: number
      }
    }
    external: {
      source: {
        x: number
        y: number
      }
      target: {
        x: number
        y: number
      }
    }
    color: string
    width: number
  }
  /**
   * Патч для обновления соединений
   * @interface PatchEdge
   * @property op - Операция (add, remove, replace)
   * @property path - Путь к соединению (sourceId > targetId)
   * @property value - Значение соединения
   * @property value.source - Начальная точка соединения
   * @property value.target - Конечная точка соединения
   * @property value.color - Цвет соединения
   * @property value.width - Толщина соединения
   */
  interface PatchEdge {
    op: "add" | "remove" | "replace"
    path: string
    value: Partial<Edge>
  }
}
export {}