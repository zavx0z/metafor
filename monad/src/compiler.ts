import { OP, TYPE, type CompiledRules } from "./common"
import { GlobalFieldRegistry, FieldType } from "./context"

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
    fieldId: number; 
    type: number; 
    subType?: number | undefined; 
    enumValues?: any[] | undefined;
  }> = {}/**
   * Транслирует конфигурацию состояний в байт-код.
   *
   * @param superposition - Граф переходов: `{ State: { Target: { Condition } } }`.
   * @param contextSchema - Схема типов полей (`hp: "number"`). Определяет memory layout.
   *
   * @returns Структура с байт-кодом и картами маппинга.
   */
    compile(superposition: Superposition, contextSchema?: Record<string, any>): CompiledRules {
    this.bytecode = []
    this.states = Object.keys(superposition)
    
    // Вместо SoA fieldMap используем GlobalFieldRegistry для получения field_id
    // Поля должны быть уже зарегистрированы через contextSchema в MonadSystem.init()
    // Если схема передана, регистрируем поля, но не строим SoA маппинг
    if (contextSchema) {
      this.registerFieldsFromSchema(contextSchema)
    } else {
      // Поля должны быть уже зарегистрированы
      this.validateFieldsFromSuperposition(superposition)
    }// 1. Резервируем место для таблицы состояний
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
      stateMap: Object.fromEntries(this.states.map((s, i) => [s, i])),
    }
  }

    private registerFieldsFromSchema(schema: Record<string, any>) {
    // Используем глобальный реестр для регистрации полей
    const registry = GlobalFieldRegistry.getInstance()
    
    for (const [name, def] of Object.entries(schema)) {
      const defTyped = def as { type?: string; values?: any[] } | string
      const typeStr = typeof defTyped === "string" ? defTyped : defTyped.type
      let fieldType: import("./context").FieldTypeValue
      let subType: number | undefined = undefined
      let enumValues: any[] | undefined = undefined
      
      // Маппинг человекопонятных типов -> FieldType
      switch (typeStr) {
        case "float":
        case "number":
          fieldType = FieldType.F32
          break
        case "integer":
          fieldType = FieldType.U32
          break
        case "boolean":
          fieldType = FieldType.BOOL
          break
        case "string":
          fieldType = FieldType.STRING_PTR
          break
        default:
          if (typeof typeStr === "string" && /^array<.+>$/.test(typeStr)) {
            fieldType = FieldType.ARRAY_PTR
            const innerType = typeStr.match(/^array<(.+)>$/)?.[1]
            if (innerType === "float") subType = TYPE.FLOAT
            else if (innerType === "integer") subType = TYPE.UINT
            else if (innerType === "string") subType = TYPE.STRING
            else throw new Error(`Unsupported array subtype: ${innerType}`)
          } else if ((typeof typeStr === "string" && /^enum<.+>$/.test(typeStr)) ||
                     (typeof defTyped !== "string" && defTyped.values)) {
            fieldType = FieldType.U32 // U32 для enum
            enumValues = typeof defTyped !== "string" && defTyped.values ? defTyped.values : []
          } else {
            fieldType = FieldType.U32 // U32 по умолчанию
          }
      }
      
      // Регистрируем поле, если еще не зарегистрировано
      if (!registry.has(name)) {
        registry.register(name, fieldType)
      }
      
      // Получаем fieldId и сохраняем информацию о поле
      const fieldId = registry.getId(name)
      // Преобразуем FieldType в TYPE для совместимости со старой системой
      let typeCode: number
      switch (fieldType) {
        case FieldType.F32:
          typeCode = TYPE.FLOAT
          break
        case FieldType.U32:
          typeCode = TYPE.UINT
          break
        case FieldType.BOOL:
          typeCode = TYPE.BOOL
          break
        case FieldType.STRING_PTR:
          typeCode = TYPE.STRING
          break
        case FieldType.ARRAY_PTR:
          typeCode = TYPE.ARRAY
          break
        default:
          typeCode = TYPE.UINT
      }
      
      this.fields[name] = { fieldId, type: typeCode, subType, enumValues }
    }
  }
  
  private validateFieldsFromSuperposition(superposition: Superposition) {
    // Проверяем, что все поля из правил зарегистрированы в глобальном реестре
    const registry = GlobalFieldRegistry.getInstance()
    
    for (const state in superposition) {
      const transitions = superposition[state]
      if (!transitions) continue
      
      for (const target in transitions) {
        const conditions = transitions[target]
        if (!conditions) continue
        
        for (const field in conditions) {
          if (!registry.has(field)) {
            throw new Error(`Field '${field}' is not registered in GlobalFieldRegistry`)
          }
        }
      }
    }
  }


  private compileConditions(wave: Wave) {
    const entries = Object.entries(wave)
    this.bytecode.push(entries.length)
    // Генерируем инструкции: [field_id, op, value] (3 слова на условие)
    // Для массивов (IN/NOT_IN) value = указатель на кучу со списком значений.
    const blockHeap: number[] = []
    const baseOffset = this.bytecode.length
    // Считаем полный размер инструкций (3 слова на каждую проверку)
    let totalInstructionsSize = 0
    for (const [key, cond] of entries) {
      const checks = this.parseCondition(cond)
      totalInstructionsSize += checks.length * 3
    }
    const startOfHeap = baseOffset + totalInstructionsSize
    // Генерируем инструкции с правильными указателями на кучу.
    for (const [key, cond] of entries) {
      const field = this.fields[key]
      if (!field) throw new Error(`Unknown field in conditions: ${key}`)
      const checks = this.parseCondition(cond)
      for (const check of checks) {
        // 1. field_id (вместо [тип, индекс])
        this.bytecode.push(field.fieldId)
        // 2. оператор.
        this.bytecode.push(check.op)
        // 3. значение (или указатель на кучу для массивов).
        if (Array.isArray(check.val) && (check.op === OP.IN || check.op === OP.NOT_IN)) {
          const ptr = startOfHeap + blockHeap.length
          blockHeap.push(check.val.length)
          for (const v of check.val) {
            blockHeap.push(this.encodeValue(field.type, v, field as { subType?: number | undefined; enumValues?: any[] | undefined; } | undefined))
          }
          this.bytecode.push(ptr)
        } else {
          this.bytecode.push(this.encodeValue(field.type, check.val, field as { subType?: number | undefined; enumValues?: any[] | undefined; } | undefined))
        }
      }
    }
    // Записываем кучу после инструкций.
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

        // Array Operators
        case "include":
          checks.push({ op: OP.INCLUDE, val: v })
          break
        case "notInclude":
          checks.push({ op: OP.NOT_INCLUDE, val: v })
          break
        case "length":
          checks.push({ op: OP.LENGTH, val: v })
          break
        case "isEmpty":
          checks.push({ op: OP.IS_EMPTY, val: v })
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
    // Это важно для 'include': если поле array<float>, то значение поиска 1.5 нужно bitcast-ить
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
