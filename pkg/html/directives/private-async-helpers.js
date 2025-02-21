/**
 * Вспомогательная функция для итерации AsyncIterable в собственном замыкании.
 * @template T
 * @param {AsyncIterable<T>} iterable Итерируемый объект для обхода
 * @param {(value: T) => Promise<boolean>} callback Функция обратного вызова для каждого значения. Если callback возвращает `false`, цикл будет прерван.
 */
export const forAwaitOf = async (iterable, callback) => {
  for await (const v of iterable) {
    if ((await callback(v)) === false) {
      return
    }
  }
}

/**
 * Хранит ссылку на экземпляр, который может быть отключен и переподключен,
 * чтобы замыкание над ссылкой (например, в then-функции промиса) не удерживало
 * жестко ссылку на экземпляр. Аппроксимирует WeakRef, но должен быть вручную
 * подключен и отключен от базового экземпляра.
 * @template T
 */
export class PseudoWeakRef {
  /** @type {T | undefined} */
  #ref
  /**
   * @param {T} ref
   */
  constructor(ref) {
    this.#ref = ref
  }
  /** Отключает ссылку от базового экземпляра. */
  disconnect() {
    this.#ref = undefined
  }
  /** Переподключает ссылку к базовому экземпляру.
   * @param {T} ref */
  reconnect(ref) {
    this.#ref = ref
  }
  /** Получает базовый экземпляр (будет undefined при отключении)
   * @returns {T | undefined} */
  deref() {
    return this.#ref
  }
}

/** Вспомогательный класс для приостановки и возобновления ожидания условия в асинхронной функции */
export class Pauser {
  /** @type {Promise<void> | undefined} */
  #promise = undefined
  /** @type {(() => void) | undefined} */
  #resolve = undefined
  /**
   * Когда приостановлено, возвращает промис для ожидания; когда не приостановлено,
   * возвращает undefined. Обратите внимание, что в микротаске между возобновлением
   * pauser и разрешением этого промиса, pauser может быть снова приостановлен,
   * поэтому вызывающие должны проверять промис в цикле при ожидании.
   * @returns {Promise<void> | undefined} Промис для ожидания когда приостановлено или undefined
   */
  get() {
    return this.#promise
  }
  /** Создает промис для ожидания */
  pause() {
    this.#promise ??= new Promise(resolve => (this.#resolve = resolve))
  }
  /** Разрешает промис, который может ожидаться */
  resume() {
    this.#resolve?.()
    this.#promise = this.#resolve = undefined
  }
}
