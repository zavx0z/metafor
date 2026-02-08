import { OP, TYPE, type CompiledRules } from "./common"

// Упрощенные типы для представления конфигурации правил.
// В реальном проекте они могут быть более сложными и импортироваться из общего пакета.
type ConditionValue = number | boolean | string | { [key: string]: any }
type Wave = Record<string, ConditionValue>
type Transitions = Record<string, Wave | null | undefined>
type Superposition = Record<string, Transitions | null | undefined>

/**
 * Транслятор JSON-правил в байт-код GPU VM.
 * 
 * Решает задачу **сериализации графа переходов** в линейный массив `u32`.
 * 
 * **Особенности реализации:**
 * * **Memory Layout:** Автоматически распределяет поля по типам (`float` vs `uint`) для соответствия архитектуре буферов SoA.
 * * **Constant Folding:** Превращает значения `enum` и строковые литералы в числовые индексы на этапе компиляции.
 * * **Heap Generation:** Статические массивы из условий (`in: [...]`) записываются в конец байт-кода как "куча".
 */
export class RulesCompiler {
  private bytecode: number[] = []
  private states: string[] = []
  private fields: Record<string, { 
    type: number; 
    index: number; 
    subType?: number | undefined; 
    enumValues?: any[] | undefined;
  }> = {}
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
      fieldMap: this.fields as Record<string, { type: number; index: number; subType?: number; enumValues?: any[]; }>,
      stateMap: Object.fromEntries(this.states.map((s, i) => [s, i])),
      fieldCount: Object.keys(this.fields).length,
    }
  }

  private buildFieldMap(schema: Record<string, any>) {
    for (const key in schema) {
      const def = schema[key]
      
      let typeCode: number = TYPE.UINT
      let subType: number | undefined = undefined
      let enumValues: any[] | undefined = undefined

      // Нормализация определения типа
      // Поддержка строк только для обратной совместимости или краткости ('float')
      const typeStr = typeof def === "string" ? def : def.type
      const metaValues = (typeof def === "object" && def !== null) ? (def.values || def.enum) : undefined

      // 1. Парсинг дженериков: array<float>
      const arrayMatch = /^array<(.+)>$/.exec(typeStr)
      const enumMatch = /^enum<(.+)>$/.exec(typeStr) // enum<float>, enum<string> и т.д.

      if (arrayMatch) {
        typeCode = TYPE.ARRAY
        const innerType = arrayMatch[1]
        if (innerType === "float") subType = TYPE.FLOAT
        else if (innerType === "integer") subType = TYPE.UINT
        else if (innerType === "string") subType = TYPE.STRING
        else throw new Error(`Unsupported array subtype: ${innerType}`)
      } 
      else if (typeStr === "enum" || enumMatch || metaValues) {
        typeCode = TYPE.UINT
        enumValues = metaValues
        if (!Array.isArray(enumValues)) throw new Error(`Enum field '${key}' requires 'values' array`)
      }
      else if (typeStr === "float" || typeStr === "number") {
        typeCode = TYPE.FLOAT
      }
      else if (typeStr === "integer") {
        typeCode = TYPE.UINT
      }
      else if (typeStr === "boolean") {
        typeCode = TYPE.BOOL
      }
      else if (typeStr === "string") {
        typeCode = TYPE.STRING
      }
      else {
         // Fallback default
         typeCode = TYPE.UINT
      }

      if (typeCode === TYPE.FLOAT) {
        this.fields[key] = { type: typeCode, index: this.fieldCounters.float++, subType, enumValues }
      } else {
        this.fields[key] = { type: typeCode, index: this.fieldCounters.uint++, subType, enumValues }
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
             // Передаем поле для контекста (Enum values, Array subtype)
             blockHeap.push(this.encodeValue(field!.type, v, field as { subType?: number | undefined; enumValues?: any[] | undefined; } | undefined))
           }
           this.bytecode.push(ptr)
        } else {
           this.bytecode.push(this.encodeValue(field!.type, check.val, field as { subType?: number | undefined; enumValues?: any[] | undefined; } | undefined))
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

  private encodeValue(inputType: number, val: any, contextField?: { subType?: number | undefined; enumValues?: any[] | undefined; }): number {
    // 1. Обработка ENUM: превращаем значение в индекс
    if (contextField?.enumValues) {
      const idx = contextField.enumValues.indexOf(val)
      if (idx === -1) throw new Error(`Value '${val}' not found in enum values: [${contextField.enumValues}]`)
      return idx
    }

    // Если это элемент массива, используем подтип массива как тип значения
    const type = contextField?.subType !== undefined ? contextField.subType : inputType

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
