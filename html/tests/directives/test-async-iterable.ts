const nextFrame = () => new Promise(r => requestAnimationFrame(r))

/**
 * Асинхронный итератор для тестирования, в который можно добавлять значения
 * для проверки кода, использующего асинхронные итераторы. Этот итератор может
 * безопасно использоваться только одним слушателем.
 */
export class TestAsyncIterable<T> implements AsyncIterable<T> {
  /**
   * Promise, который разрешается следующим значением, возвращаемым
   * асинхронным итератором из метода iterable()
   */
  private _nextValue = new Promise<T>(resolve => (this._resolveNextValue = resolve))
  private _resolveNextValue!: (value: T) => void

  async *[Symbol.asyncIterator]() {
    while (true) {
      yield await this._nextValue
    }
  }

  /**
   * Добавляет новое значение и возвращает Promise, который разрешается, когда значение
   * было отправлено итератором. push() нельзя вызывать до того, как завершится
   * предыдущий вызов, поэтому всегда используйте await для вызова push().
   */
  async push(value: T): Promise<void> {
    const currentValue = this._nextValue
    const currentResolveValue = this._resolveNextValue
    this._nextValue = new Promise(resolve => (this._resolveNextValue = resolve))
    // Разрешает предыдущее значение _nextValue (теперь currentValue в этой
    // области видимости), заставляя выполниться `yield await this._nextValue`
    currentResolveValue(value)
    // Ожидает, пока значение будет отправлено
    await currentValue
    // Поскольку это используется в тестах, ожидание rAF здесь является удобным способом
    // пройти любой асинхронный код в директивах, используемый для разрешения/фиксации
    // значения итератора; когда это возвращается, оно должно быть отрендерено
    await nextFrame()
  }
}
