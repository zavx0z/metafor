/**
 * Класс для представления цвета в формате RGB.
 */
export class Color {
  /**
   * @min 0
   * @max 1
   */
  public r: number = 1.0

  /**
   * @min 0
   * @max 1
   */
  public g: number = 1.0

  /**
   * @min 0
   * @max 1
   */
  public b: number = 1.0

  /**
   * @min 0
   * @max 1
   */
  public a: number = 1.0

  /**
   * Создает экземпляр Color.
   * @param r - Значение красного (0-255 или 0-1), шестнадцатеричное значение (число или строка), или другой экземпляр Color.
   * @param g - Значение зеленого (0-255 или 0-1).
   * @param b - Значение синего (0-255 или 0-1).
   * @param a - Значение альфа/прозрачности (0-1).
   * @note Если значения RGB больше 1, они автоматически делятся на 255 для нормализации.
   *       Строки вида "#3147ea" или "#fff" также поддерживаются.
   */
  constructor(r?: number | string | Color, g?: number, b?: number, a: number = 1.0) {
    if (r instanceof Color) {
      this.copy(r)
    } else if (typeof r === 'string') {
      if (r.startsWith('rgba(')) {
        this.setRGBAString(r)
        // Альфа уже установлена из строки, не перезаписываем параметром 'a'
        return
      } else {
        this.setHexString(r)
      }
    } else if (g === undefined && b === undefined) {
      this.setHex(r ?? 0xffffff)
    } else {
      // Автоматически нормализуем значения, если они больше 1
      const normalize = (value: number) => value > 1 ? value / 255 : value;
      this.setRGB(normalize(r as number), normalize(g!), normalize(b!))
    }
    this.a = a
  }

  /**
   * Копирует значения из другого объекта Color.
   * @param color - Объект Color, из которого копируются значения.
   * @returns Возвращает этот экземпляр для чейнинга.
   */
  public copy(color: Color): this {
    this.r = color.r
    this.g = color.g
    this.b = color.b
    this.a = color.a
    return this
  }

  /**
   * Клонирует данный объект Color.
   * @returns Новый объект Color.
   */
  public clone(): Color {
    return new Color(this.r, this.g, this.b, this.a)
  }

  /**
   * Устанавливает цвет из RGB компонентов.
   * @param r - Красный компонент (0-1).
   * @param g - Зеленый компонент (0-1).
   * @param b - Синий компонент (0-1).
   * @returns Возвращает этот экземпляр для чейнинга.
   */
  public setRGB(r: number, g: number, b: number): this {
    this.r = r
    this.g = g
    this.b = b
    return this
  }

  /**
   * Устанавливает цвет из RGBA компонентов.
   * @param r - Красный компонент (0-1).
   * @param g - Зеленый компонент (0-1).
   * @param b - Синий компонент (0-1).
   * @param a - Альфа компонент (0-1).
   * @returns Возвращает этот экземпляр для чейнинга.
   */
  public setRGBA(r: number, g: number, b: number, a: number): this {
    this.r = r
    this.g = g
    this.b = b
    this.a = a
    return this
  }

  /**
   * Устанавливает цвет из шестнадцатеричного значения.
   * @param hex - Шестнадцатеричное значение цвета (например, 0xff0000 для красного).
   * @returns Возвращает этот экземпляр для чейнинга.
   */
  public setHex(hex: number): this {
    hex = Math.floor(hex)
    this.r = ((hex >> 16) & 255) / 255
    this.g = ((hex >> 8) & 255) / 255
    this.b = (hex & 255) / 255
    this.a = 1.0
    return this
  }

  /**
   * Устанавливает цвет из строки шестнадцатеричного значения.
   * @param hexString - Строка шестнадцатеричного значения (например, "#ff0000" или "#fff").
   * @returns Возвращает этот экземпляр для чейнинга.
   */
  public setHexString(hexString: string): this {
    // Удаляем символ # если есть
    hexString = hexString.replace(/^#/, '')

    // Обработка короткой формы (3 символа)
    if (hexString.length === 3) {
      hexString = hexString.split('').map(ch => ch + ch).join('')
    }

    // Конвертируем строку в число
    const hex = parseInt(hexString, 16)
    if (isNaN(hex)) {
      console.warn(`Invalid hex color string: ${hexString}, falling back to white`)
      return this.setHex(0xffffff)
    }

    return this.setHex(hex)
  }

  /**
   * Устанавливает цвет из строки формата rgba().
   * @param rgbaString - Строка формата "rgba(r, g, b, a)".
   * @returns Возвращает этот экземпляр для чейнинга.
   */
  public setRGBAString(rgbaString: string): this {
    // Удаляем "rgba(" и ")" и разделяем по запятым
    const matches = rgbaString.match(/rgba\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/)
    
    if (!matches) {
      console.warn(`Invalid rgba string: ${rgbaString}, falling back to white`)
      this.setHex(0xffffff)
      this.a = 1.0
      return this
    }

    const r = parseFloat(matches[1])
    const g = parseFloat(matches[2])
    const b = parseFloat(matches[3])
    const a = parseFloat(matches[4])

    // Нормализуем значения RGB, если они больше 1
    const normalize = (value: number) => value > 1 ? value / 255 : value
    
    this.r = normalize(r)
    this.g = normalize(g)
    this.b = normalize(b)
    this.a = a
    
    return this
  }

  /**
   * Возвращает массив [r, g, b, a] (RGBA) в виде Float32Array.
   * @returns Массив со значениями цвета.
   */
  public toArray(): Float32Array {
    return new Float32Array([this.r, this.g, this.b, this.a])
  }
}
