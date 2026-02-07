import { OP, TYPE, type CompiledRules } from "./common"

// Упрощенные типы для представления конфигурации правил.
// В реальном проекте они могут быть более сложными и импортироваться из общего пакета.
type ConditionValue = number | boolean | string | { [key: string]: any }
type Wave = Record<string, ConditionValue>
type Transitions = Record<string, Wave | null>
type Superposition = Record<string, Transitions | null>

/**
 * Компилятор логических правил.
 *
 * **Основная задача:** преобразовать человекочитаемый JSON-объект с правилами
 * (граф состояний) в плоский `Uint32Array` (байт-код), который может быть
 * эффективно исполнен параллельно на GPU в Compute Shader.
 *
 * Этот процесс включает:
 * 1. **Парсинг схемы:** Создание карты полей (`fieldMap`) для трансляции имен (`hp`) в индексы.
 * 2. **Построение карты состояний:** Присвоение уникальных ID каждому состоянию.
 * 3. **Генерация байт-кода:** Формирование инструкций для кастомной виртуальной машины, которая будет работать в шейдере.
 */
export class RulesCompiler {
  private bytecode: number[] = []
  private states: string[] = []
  private fields: Record<string, { type: number; index: number }> = {}
  private fieldCounters = { float: 0, uint: 0 }

  /**
   * Транслирует конфигурацию состояний в байт-код.
   *
   * @param superposition - Граф переходов: `{ State: { Target: { Condition } } }`.
   * @param contextSchema - Схема типов полей (`hp: "number"`). Определяет memory layout.
   *
   * @returns Структура с байт-кодом и картами маппинга.
   */
  compile(superposition: Superposition, contextSchema: Record<string, any>): CompiledRules {
    this.bytecode = []
    this.states = Object.keys(superposition)
    this.buildFieldMap(contextSchema)

    // 1. Резервируем место для таблицы состояний
    const stateTableOffset = this.bytecode.length
    // Заглушка для смещения каждого состояния
    for (let i = 0; i < this.states.length; i++) this.bytecode.push(0)

    // 2. Компилируем каждое состояние
    for (let i = 0; i < this.states.length; i++) {
      const stateName = this.states[i]
      const transitions = superposition[stateName] || {}

      // Сохраняем указатель на этот блок состояния в таблице
      const stateBlockPtr = this.bytecode.length
      this.bytecode[stateTableOffset + i] = stateBlockPtr

      const transitionKeys = Object.keys(transitions)
      this.bytecode.push(transitionKeys.length) // количество переходов (transitionCount)

      for (const targetName of transitionKeys) {
        const targetIdx = this.states.indexOf(targetName)
        if (targetIdx === -1) throw new Error(`Unknown target state: ${targetName}`)

        const conditions = transitions[targetName] || {}

        // Заголовок перехода
        this.bytecode.push(targetIdx)

        // Нам нужно прыгнуть к блоку условий. Пушим заглушку, компилируем условия, потом фиксим.
        // Вообще, можно скомпилировать условия *после* списка переходов, но для локальности кэша
        // лучше поместить их рядом. Добавим условия сразу после.
        // Но формат ожидает [target, condPtr].
        // Так что пушим цель, затем заглушку для condPtr.
        const condPtrIdx = this.bytecode.length
        this.bytecode.push(0)
        // Но так как мы итерируемся, мы не можем легко поместить блоки "после".
        // Использовать отдельный буфер для условий или просто добавить в конец массива байт-кода позже?
        // Проще: Добавить условия СЕЙЧАС и связать.
        // Ой, если добавить сейчас, следующий заголовок перехода будет после условий.
        // Это нормально. Байт-код — это плоский массив, указатели — абсолютные индексы.
      }

      // Теперь заполняем блоки условий для переходов этого состояния
      let transitionIdx = 0
      for (const targetName of transitionKeys) {
        const conditions = transitions[targetName] || {}

        // Местоположение определения перехода:
        // stateBlockPtr + 1 (кол-во) + transitionIdx * 2
        const trBase = stateBlockPtr + 1 + transitionIdx * 2

        // Начало блока условий
        const condBlockPtr = this.bytecode.length
        this.bytecode[trBase + 1] = condBlockPtr // Ссылка с перехода сюда

        this.compileConditions(conditions)
        transitionIdx++
      }
    }

    return {
      bytecode: new Uint32Array(this.bytecode),
      stateTableOffset,
      fieldMap: this.fields,
      stateMap: Object.fromEntries(this.states.map((s, i) => [s, i])),
    }
  }

  private buildFieldMap(schema: Record<string, any>) {
    // Наивный маппинг схемы. В реальности нужно парсить zavx0z Schema.
    // Полагаем, что схема { key: "number" | "boolean" | ... }
    for (const key in schema) {
      const typeStr = String(schema[key]) // упрощенно
      if (typeStr.includes("number")) {
        this.fields[key] = { type: TYPE.FLOAT, index: this.fieldCounters.float++ }
      } else {
        // булевы, строки (интернированные), перечисления -> UINT
        this.fields[key] = { type: TYPE.UINT, index: this.fieldCounters.uint++ }
      }
    }
  }

  private compileConditions(wave: Wave) {
    const entries = Object.entries(wave)
    this.bytecode.push(entries.length)
    for (const [key, cond] of entries) {
      const field = this.fields[key]
      if (!field) throw new Error(`Unknown field in conditions: ${key}`)

      const checks = this.parseCondition(cond)
      for (const check of checks) {
        this.bytecode.push(field.type)
        this.bytecode.push(field.index)
        this.bytecode.push(check.op)
        this.bytecode.push(this.encodeValue(field.type, check.val))
      }
    }
  }

  private parseCondition(cond: ConditionValue): { op: number; val: any }[] {
    if (typeof cond !== "object" || cond === null) {
      return [{ op: OP.EQ, val: cond }]
    }
    const checks: { op: number; val: any }[] = []
    // Обработка сложного объекта { gt: 5, lte: 10 }
    for (const [k, v] of Object.entries(cond)) {
      switch (k) {
        case "eq":
          checks.push({ op: OP.EQ, val: v })
          break
        case "ne":
        case "notEq":
        case "neq":
          checks.push({ op: OP.NEQ, val: v })
          break
        case "gt":
          checks.push({ op: OP.GT, val: v })
          break
        case "lt":
          checks.push({ op: OP.LT, val: v })
          break
        case "gte":
          checks.push({ op: OP.GTE, val: v })
          break
        case "lte":
          checks.push({ op: OP.LTE, val: v })
          break
        // Atom-like extended conditions
        case "notGt":
          checks.push({ op: OP.LTE, val: v }) // ! >  == <=
          break
        case "notGte":
          checks.push({ op: OP.LT, val: v }) // ! >= == <
          break
        case "notLt":
          checks.push({ op: OP.GTE, val: v }) // ! <  == >=
          break
        case "notLte":
          checks.push({ op: OP.GT, val: v }) // ! <= == >
          break
        case "between":
          if (Array.isArray(v) && v.length === 2) {
            checks.push({ op: OP.GTE, val: v[0] })
            checks.push({ op: OP.LTE, val: v[1] })
          }
          break
      }
    }
    return checks
  }

  private encodeValue(type: number, val: any): number {
    if (type === TYPE.FLOAT) {
      const buf = new Float32Array([Number(val)])
      return new Uint32Array(buf.buffer)[0]
    }
    if (type === TYPE.BOOL) {
      return val ? 1 : 0
    }
    // UINT / Строки
    if (typeof val === "string") {
      // TODO: Реализовать интернирование строк или HashMap
      return 0 // Заглушка
    }
    return Number(val)
  }
}
