import { OP, TYPE, type CompiledRules } from "./common"

// Упрощенные типы для представления конфигурации правил.
// В реальном проекте они могут быть более сложными и импортироваться из общего пакета.
type ConditionValue = number | boolean | string | { [key: string]: any }
type Wave = Record<string, ConditionValue>
type Transitions = Record<string, Wave | null | undefined>
type Superposition = Record<string, Transitions | null | undefined>

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
      const stateName = this.states[i]!
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
      fieldCount: Object.keys(this.fields).length,
    }
  }

  private buildFieldMap(schema: Record<string, any>) {
    for (const key in schema) {
      const def = schema[key]
      // Нормализация типа: обрабатываем строку или объект
      // { hp: "number" } или { tags: { type: "array", items: "string" } }
      let typeCode: number = TYPE.UINT
      
      if (typeof def === "string") {
        if (def.includes("number") || def.includes("float")) typeCode = TYPE.FLOAT
        else if (def.includes("boolean") || def.includes("bool")) typeCode = TYPE.BOOL
        else if (def.includes("string")) typeCode = TYPE.STRING
        else typeCode = TYPE.UINT // enum, int, unknown
      } else if (typeof def === "object" && def !== null) {
        if (def.type === "array") typeCode = TYPE.ARRAY
        else if (def.type === "number" || def.type === "float") typeCode = TYPE.FLOAT
        else if (def.type === "boolean" || def.type === "bool") typeCode = TYPE.BOOL
        else if (def.type === "string") typeCode = TYPE.STRING
      }

      if (typeCode === TYPE.FLOAT) {
        this.fields[key] = { type: typeCode, index: this.fieldCounters.float++ }
      } else {
        // UINT, BOOL, STRING, ARRAY используют uint-буфер (или слоты в нём)
        this.fields[key] = { type: typeCode, index: this.fieldCounters.uint++ }
      }
    }
  }

  private compileConditions(wave: Wave) {
    const entries = Object.entries(wave)
    this.bytecode.push(entries.length)
    
    // Мы должны записать все инструкции, а затем, возможно, данные (кучу), 
    // на которые ссылаются инструкции (например, списки для IN).
    // Для этого сначала генерируем все инструкции и данные в буфер.
    
    const blockInstructions: number[] = []
    const blockHeap: number[] = []
    
    // Текущий смещение начала инструкций (относительно всего байткода)
    // this.bytecode.length (header) + 0
    let baseOffset = this.bytecode.length
    
    for (const [key, cond] of entries) {
      const field = this.fields[key]
      if (!field) throw new Error(`Unknown field in conditions: ${key}`)
      const checks = this.parseCondition(cond)
      
      for (const check of checks) {
        blockInstructions.push(field.type)
        blockInstructions.push(field.index)
        blockInstructions.push(check.op)
        
        // Если значение требует кучи (массив), мы должны вычислить указатель
        if (Array.isArray(check.val) && (check.op === OP.IN || check.op === OP.NOT_IN)) {
          // Указатель = baseOffset + размер_всех_инструкций_блока + текущий_размер_кучи
          // Но мы не знаем полный размер всех инструкций заранее, если делаем это в один проход?
          // Мы знаем! Мы просто накапливаем instructions.
          // Но нам нужно знать FINAL length of instructions чтобы дать правильный pointer.
          // Поэтому сначала соберем все check-и, потом закодируем.
        }
      }
    }

    // Второй проход: кодирование с правильными смещениями
    // Считаем полное количество инструкций (слов)
    let totalInstructionsSize = 0
    for (const [key, cond] of entries) {
      const checks = this.parseCondition(cond)
      totalInstructionsSize += checks.length * 4
    }

    const startOfHeap = baseOffset + totalInstructionsSize

    for (const [key, cond] of entries) {
      const field = this.fields[key]
      const checks = this.parseCondition(cond)
      for (const check of checks) {
        this.bytecode.push(field!.type)
        this.bytecode.push(field!.index)
        this.bytecode.push(check.op)
        
        if (Array.isArray(check.val) && (check.op === OP.IN || check.op === OP.NOT_IN)) {
           // Это список значений. Записываем его в heap.
           const ptr = startOfHeap + blockHeap.length
           // Формат списка в хипе: [count, val1, val2...]
           blockHeap.push(check.val.length)
           for (const v of check.val) {
             blockHeap.push(this.encodeValue(field!.type, v))
           }
           this.bytecode.push(ptr)
        } else {
           this.bytecode.push(this.encodeValue(field!.type, check.val))
        }
      }
    }
    
    // Записываем накопленные данные кучи после инструкций
    for (const w of blockHeap) {
      this.bytecode.push(w)
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

        case "in":
          checks.push({ op: OP.IN, val: v })
          break
        case "notIn":
          checks.push({ op: OP.NOT_IN, val: v })
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
      return new Uint32Array(buf.buffer)[0]!
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
