import { OP, TYPE, type CompiledRules, type CompiledFieldRules, type CompiledEnsemble } from "./common"
import { GlobalFieldRegistry, FieldType } from "./context"
import { fieldTypeToBytecodeType, getStringAtlas } from "./typeBridge"

// Типы для представления конфигурации правил суперпозиции.
type ConditionValue = number | boolean | string | { [key: string]: any }
/** Условия коллапса — набор проверок компонент браны для перехода между состояниями */
type CollapseConditions = Record<string, ConditionValue>
type Transitions = Record<string, CollapseConditions | null | undefined>
/** Суперпозиция — граф возможных состояний и условий переходов */
type Superposition = Record<string, Transitions | null | undefined>

/**
 * Транслятор JSON-правил в байт-код для кастомной VM на GPU.
 *
 * ### Архитектура байт-кода (v2.x):
 *
 * **Структура памяти (линейный массив u32):**
 * 1. Таблица состояний (State Table) — массив указателей на блоки состояний.
 * 2. Блоки состояний (State Blocks) — количество переходов + пары [targetState, conditionPtr].
 * 3. Блоки условий (Condition Blocks) — количество условий + инструкции [type, field_id, op, value].
 * 4. Куча (Heap) — статические данные (списки для операторов IN/NOT_IN).
 *
 * ### Формат инструкции условия (4 слова):
 * ```
 * [0] type:      TYPE.FLOAT, TYPE.UINT, TYPE.BOOL, TYPE.ARRAY
 * [1] field_id:  числовой идентификатор поля из GlobalFieldRegistry
 * [2] op:        OP.EQ, OP.GT, OP.IN, OP.INCLUDE, ...
 * [3] value:     закодированное значение или указатель на кучу
 * ```
 *
 * ### Особенности реализации:
 * * **Constant Folding:** Значения enum преобразуются в индексы на этапе компиляции.
 * * **Bitcast для float:** Числа с плавающей точкой кодируются через bitcast в u32.
 * * **Куча в байт-коде:** Списки значений для операторов IN/NOT_IN хранятся в конце байт-кода.
 * * **Расширенные операторы:** Поддержка атомарных условий (between, notGt, notLte).
 *
 * ### Важные ограничения:
 * * **Все состояния-цели** должны быть объявлены в корне superposition (даже если null).
 * * **Поля должны быть зарегистрированы** в GlobalFieldRegistry до компиляции.
 * * **Нет проверки циклов** в графе состояний (бесконечные переходы возможны).
 * * **Размер байт-кода не ограничен** (может превысить лимиты GPU-буфера).
 */
export class RulesCompiler {
  private bytecode: number[] = []
  private states: string[] = []
  private fields: Record<
    string,
    {
      fieldId: number
      type: number
      subType?: number | undefined
      enumValues?: any[] | undefined
    }
  > = {}

  /**
   * Транслирует конфигурацию состояний в байт-код для GPU.
   *
   * ### Алгоритм компиляции:
   * 1. Регистрация полей из схемы в GlobalFieldRegistry (получение field_id).
   * 2. Построение таблицы состояний с резервированием места для указателей.
   * 3. Для каждого состояния:
   *    * Запись количества переходов.
   *    * Для каждого перехода: запись targetState + указателя на блок условий (позже заполняется).
   *    * Компиляция условий перехода в блок инструкций.
   * 4. Заполнение указателей на блоки условий в переходах.
   *
   * ### Структура результата:
   * * `bytecode: Uint32Array` — плоский массив с программой VM.
   * * `stateTableOffset: number` — смещение таблицы состояний в байт-коде (всегда 0).
   * * `stateMap: Record<string, number>` — маппинг имён состояний на числовые ID.
   *
   * @param superposition - Граф переходов. Формат:
   * ```ts
   * {
   *   "IDLE": { "PATROL": { hp: { gt: 50 } } },
   *   "PATROL": null // Обязательно объявить все состояния
   * }
   * ```
   * @param branes - Схема типов данных. Если не передана, предполагается,
   * что поля уже зарегистрированы в GlobalFieldRegistry.
   * @param options - Дополнительные опции компиляции.
   * @param options.preserveRegistry - Если true, не очищает GlobalFieldRegistry перед регистрацией.
   *
   * @returns {CompiledRules} Скомпилированные правила, готовые для загрузки в GPUBackend.
   *
   * @throws {Error} Если:
   * * Обнаружено состояние-цель, не объявленное в superposition.
   * * Поле из условий не зарегистрировано в GlobalFieldRegistry.
   * * Значение enum не найдено в списке допустимых значений.
   *
   * @example
   * ```ts
   * const compiler = new RulesCompiler();
   * const rules = compiler.compile(
   *   { IDLE: { PATROL: { hp: { gt: 50 } } }, PATROL: null },
   *   { hp: "number" }
   * );
   * ```
   */
  compile(
    superposition: Superposition,
    branes: Record<string, any> = {},
    options: { preserveRegistry?: boolean } = {},
  ): CompiledRules {
    this.bytecode = []
    this.states = Object.keys(superposition)
    this.fields = {}

    // Вместо SoA fieldMap используем GlobalFieldRegistry для получения field_id
    // Поля должны быть уже зарегистрированы через branes в QuantumFieldSystem.init()
    // Если схема передана, регистрируем поля, но не строим SoA маппинг
    if (Object.keys(branes).length > 0) {
      if (!options.preserveRegistry) {
        GlobalFieldRegistry.clear()
      }
      this.registerFieldsFromSchema(branes)
    } else {
      // Поля должны быть уже зарегистрированы
      this.validateFieldsFromSuperposition(superposition)
      this.loadFieldsFromRegistry()
    }
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
      let elementType: string | undefined
      let enumValues: any[] | undefined = undefined

      // Маппинг человекопонятных типов -> FieldType
      switch (typeStr) {
        case "number":
          fieldType = FieldType.F32
          break
        case "boolean":
          fieldType = FieldType.BOOL
          break
        case "string":
          fieldType = FieldType.STRING_PTR
          break
        case "array<string>":
          fieldType = FieldType.ARRAY_PTR
          elementType = "string"
          break
        case "array<number>":
          fieldType = FieldType.ARRAY_PTR
          elementType = "number"
          break
        case "enum<string>":
        case "enum<number>":
          fieldType = FieldType.U32
          enumValues = typeof defTyped !== "string" && "values" in defTyped ? defTyped.values : []
          break
        default:
          throw new Error(`Unknown field type: ${typeStr}`)
      }

      // Регистрируем поле, если еще не зарегистрировано
      if (!registry.has(name)) {
        const registerOptions = {
          ...(elementType !== undefined ? { elementType } : {}),
          ...(enumValues !== undefined ? { enumValues } : {}),
        }
        registry.register(name, fieldType, registerOptions)
      }

      // Получаем fieldId и сохраняем информацию о поле
      const fieldId = registry.getId(name)
      const typeCode = fieldTypeToBytecodeType(fieldType)

      // Вычисляем subType для array (для кодирования значений в байткоде)
      let subType: number | undefined = undefined
      if (elementType === "string") subType = TYPE.STRING
      else if (elementType === "number") subType = TYPE.FLOAT

      this.fields[name] = { fieldId, type: typeCode, subType, enumValues }
    }
  }

  private loadFieldsFromRegistry() {
    const registry = GlobalFieldRegistry.getInstance()
    for (const meta of registry.getAll()) {
      const typeCode = fieldTypeToBytecodeType(meta.type)

      let subType: number | undefined
      switch (meta.elementType) {
        case "number":
          subType = TYPE.FLOAT
          break
        case "string":
          subType = TYPE.STRING
          break
        default:
          subType = undefined
      }

      this.fields[meta.name] = { fieldId: meta.componentId, type: typeCode, subType, enumValues: meta.enumValues }
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

  private compileConditions(wave: CollapseConditions) {
    const entries = Object.entries(wave)
    // Сначала подсчитаем общее количество условий (инструкций)
    // Для { value: { gte: 10, lte: 20 } } будет 2 инструкции
    let totalConditions = 0
    for (const [key, cond] of entries) {
      const checks = this.parseCondition(cond)
      totalConditions += checks.length
    }
    this.bytecode.push(totalConditions)
    // Генерируем инструкции: [type, field_id, op, value] (4 слова на условие)
    // Для массивов (IN/NOT_IN) value = указатель на кучу со списком значений.
    const blockHeap: number[] = []
    // Считаем полный размер инструкций (4 слова на каждую проверку)
    const totalInstructionsSize = totalConditions * 4
    // Условия в шейдере читаются от базы инструкций конкретного cond-блока
    // (bytecode_base + cond_ptr + 1), поэтому для списков кодируем
    // смещение относительно этой базы.
    // Генерируем инструкции с правильными указателями на кучу.
    for (const [key, cond] of entries) {
      const field = this.fields[key]
      if (!field) throw new Error(`Unknown field in conditions: ${key}`)
      const checks = this.parseCondition(cond)
      for (const check of checks) {
        // 1. type
        this.bytecode.push(field.type)
        // 2. field_id
        this.bytecode.push(field.fieldId)
        // 3. оператор.
        this.bytecode.push(check.op)
        // 4. значение (или указатель на кучу для массивов).
        if (Array.isArray(check.val) && (check.op === OP.IN || check.op === OP.NOT_IN)) {
          // ptr - смещение от базы инструкций cond-блока.
          // [count, item1, item2, ...] лежит после всех инструкций блока.
          const ptr = totalInstructionsSize + blockHeap.length
          console.log(`[Compiler] IN/NOT_IN for field ${key}: ptr=${ptr}, totalInstructionsSize=${totalInstructionsSize}, blockHeap.length=${blockHeap.length}`)
          blockHeap.push(check.val.length)
          for (const v of check.val) {
            const encoded = this.encodeValue(
              field.type,
              v,
              this.getEncodingContextForOp(field, check.op),
            )
            console.log(`[Compiler]   List item: "${v}" -> encoded=${encoded}`)
            blockHeap.push(encoded)
          }
          this.bytecode.push(ptr)
        } else {
          this.bytecode.push(
            this.encodeValue(
              field.type,
              check.val,
              this.getEncodingContextForOp(field, check.op),
            ),
          )
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
          if (typeof v === "number") {
            checks.push({ op: OP.LENGTH, val: v })
            break
          }

          if (typeof v === "object" && v !== null) {
            for (const [lengthOp, lengthVal] of Object.entries(v)) {
              switch (lengthOp) {
                case "eq":
                  checks.push({ op: OP.LENGTH, val: lengthVal })
                  break
                case "gt":
                  checks.push({ op: OP.GT, val: lengthVal })
                  break
                case "lt":
                  checks.push({ op: OP.LT, val: lengthVal })
                  break
                case "gte":
                  checks.push({ op: OP.GTE, val: lengthVal })
                  break
                case "lte":
                  checks.push({ op: OP.LTE, val: lengthVal })
                  break
              }
            }
          }
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

  private getEncodingContextForOp(
    field: { type: number; subType?: number | undefined; enumValues?: any[] | undefined },
    op: number,
  ): { subType?: number | undefined; enumValues?: any[] | undefined } | undefined {
    // Для массивов include/notInclude значение нужно кодировать в тип элемента.
    if (field.type === TYPE.ARRAY) {
      if (op === OP.INCLUDE || op === OP.NOT_INCLUDE) {
        return field
      }
      // Для length/isEmpty и скалярных сравнений по длине используем чисто UINT/BOOL.
      return undefined
    }

    return field
  }

  private encodeValue(
    inputType: number,
    val: any,
    contextField?: { subType?: number | undefined; enumValues?: any[] | undefined },
  ): number {
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
      // Интернируем строку через StringAtlas
      const atlas = getStringAtlas()
      const stringId = atlas.intern(val)
      console.log(`[Compiler] Interned string "${val}" -> ID ${stringId}`)
      return stringId
    }
    return Number(val)
  }

  /**
   * Компилирует одну superposition в bytecode для отдельного поля.
   *
   * В отличие от `compile()`, этот метод возвращает полную информацию
   * о stateMap и reverseStateMap для декодирования результатов.
   *
   * @param superposition - Граф переходов состояний
   * @param branes - Схема типов данных браны
   * @param options - Опции компиляции
   * @returns Скомпилированные правила с метаданными
   */
  compileSingle(
    superposition: Superposition,
    branes: Record<string, any> = {},
    options: { preserveRegistry?: boolean } = {},
  ): CompiledFieldRules {
    const result = this.compile(superposition, branes, options)
    const reverseStateMap = Object.keys(result.stateMap)

    return {
      bytecode: result.bytecode,
      stateMap: result.stateMap,
      reverseStateMap,
    }
  }

  /**
   * Компилирует массив superposition в единый конкатенированный bytecode.
   *
   * Каждое поле получает свой независимый bytecode со своей таблицей состояний.
   * Это позволяет полям иметь разные графы переходов с разными условиями.
   *
   * ### Структура результата:
   * ```
   * bytecode:           [field0_bc][field1_bc][field2_bc]...
   * bytecodeOffsets:    [0, len0, len0+len1, ...]
   * stateMaps:          [{IDLE:0,...}, {IDLE:0,...}, ...]
   * reverseStateMaps:   [["IDLE",...], ["IDLE",...], ...]
   * ```
   *
   * @param superpositions - Массив графов переходов (по одному на поле)
   * @param branes - Схема типов данных браны (общая для всех полей)
   * @returns Скомпилированный ансамбль с таблицей смещений
   *
   * @example
   * ```ts
   * const compiler = new RulesCompiler()
   * const ensemble = compiler.compileEnsemble(
   *   [
   *     { IDLE: { COMBAT: { hp: { gt: 80 } } }, COMBAT: null },
   *     { IDLE: { MEDITATE: { mana: { lt: 20 } } }, MEDITATE: null },
   *   ],
   *   { hp: "number", mana: "number" }
   * )
   * ```
   */
  compileEnsemble(
    superpositions: Superposition[],
    branes: Record<string, any> = {},
  ): CompiledEnsemble {
    // Очищаем реестр перед первой компиляцией
    GlobalFieldRegistry.clear()

    // Компилируем каждую superposition отдельно
    const compiled: CompiledFieldRules[] = []
    for (let i = 0; i < superpositions.length; i++) {
      // preserveRegistry=true для всех кроме первой, чтобы сохранить зарегистрированные поля
      compiled.push(
        this.compileSingle(superpositions[i]!, branes, { preserveRegistry: i > 0 }),
      )
    }

    // Вычисляем общий размер bytecode
    const totalLength = compiled.reduce((sum, c) => sum + c.bytecode.length, 0)

    // Создаём конкатенированный bytecode и таблицу смещений
    const bytecode = new Uint32Array(totalLength)
    const bytecodeOffsets = new Uint32Array(superpositions.length)

    let offset = 0
    for (let i = 0; i < compiled.length; i++) {
      bytecodeOffsets[i] = offset
      bytecode.set(compiled[i]!.bytecode, offset)
      offset += compiled[i]!.bytecode.length
    }

    return {
      bytecode,
      bytecodeOffsets,
      stateMaps: compiled.map((c) => c.stateMap),
      reverseStateMaps: compiled.map((c) => c.reverseStateMap),
    }
  }
}
