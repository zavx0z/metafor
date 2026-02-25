import { OP, TYPE } from "../opcodes"
import type { CompiledRules, CompiledFieldRules, CompiledEnsemble } from "../index.t"
import type { Field, FieldTypeValue } from "../core/FieldRegistry"
import { fieldTypeToBytecodeType } from "../utils/typeBridge"
import { getStringAtlas } from "../strings/StringAtlas"
import type { FieldTuple } from "../index.t"

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
 * ### Архитектура байт-кода:
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
 * [1] field_id:  числовой идентификатор поля
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
 * * **Поля должны быть переданы** в compileEnsemble.
 * * **Нет проверки циклов** в графе состояний (бесконечные переходы возможны).
 * * **Размер байт-кода не ограничен** (может превысить лимиты GPU-буфера).
 */
export class RulesCompiler {
  private bytecode: number[] = []
  private states: string[] = []
  private fields: Map<number, { fieldId: number; type: number; subType?: number | undefined; enumValues?: any[] | undefined }> = new Map()

  /**
   * Компилирует массив superposition в единый конкатенированный bytecode.
   *
   * Каждая superposition компилируется независимо со своими состояниями и переходами.
   * Поля (fields) общие для всех суперпозиций.
   *
   * ### Использование:
   * * **Одна брана** — одна superposition
   * * **Несколько бран** — массив superpositions (по одной на брану)
   *
   * ### Структура результата:
   * ```
   * bytecode:           [superposition0_bc][superposition1_bc][superposition2_bc]...
   * bytecodeOffsets:    [0, len0, len0+len1, ...]
   * stateMaps:          [{IDLE:0,...}, {IDLE:0,...}, ...]
   * reverseStateMaps:   [["IDLE",...], ["IDLE",...], ...]
   * ```
   *
   * @param superpositions - Массив графов переходов (по одному на брану)
   * @param fields - Поля в формате кортежей [[index, field], ...]
   * @param options - Опции компиляции
   * @param options.debug - Включить debug-логирование
   * @returns Скомпилированный ансамбль с таблицей смещений
   *
   * @example
   * ```ts
   * const compiler = new RulesCompiler()
   * const ensemble = compiler.compileEnsemble(
   *   [
   *     { IDLE: { PATROL: { 0: { gt: 50 } } }, PATROL: null },  // брана 0
   *     { IDLE: { COMBAT: { 0: { gt: 80 } } }, COMBAT: null },  // брана 1
   *   ],
   *   [[0, { type: FieldType.F32 }]]  // общие поля для всех бран
   * )
   * ```
   */
  compileEnsemble(
    superpositions: Superposition[],
    fields: FieldTuple[],
    options: { debug?: boolean } = {},
  ): CompiledEnsemble {
    const { debug = false } = options

    // Сохраняем поля локально
    this.fields.clear()
    for (const [fieldId, field] of fields) {
      const typeCode = fieldTypeToBytecodeType(field.type)
      let subType: number | undefined
      switch (field.elementType) {
        case "number":
          subType = TYPE.FLOAT
          break
        case "string":
          subType = TYPE.STRING
          break
        default:
          subType = undefined
      }
      this.fields.set(fieldId, {
        fieldId,
        type: typeCode,
        ...(subType !== undefined ? { subType } : {}),
        ...(field.enumValues !== undefined ? { enumValues: field.enumValues } : {}),
      })
    }

    if (debug) {
      console.log("[RulesCompiler] Compiling ensemble with", superpositions.length, "superpositions (one per brane)")
    }

    // Компилируем каждую superposition отдельно
    const compiled: CompiledFieldRules[] = []
    for (let i = 0; i < superpositions.length; i++) {
      compiled.push(this.compileSingle(superpositions[i]!))
      if (debug) {
        console.log(
          `[RulesCompiler] Superposition ${i} (brane ${i}): ${compiled[i]!.bytecode.length} words, states=`,
          compiled[i]!.reverseStateMap,
        )
      }
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

    if (debug) {
      console.log("[RulesCompiler] Total bytecode:", bytecode.length, "words")
      console.log("[RulesCompiler] Bytecode offsets:", Array.from(bytecodeOffsets))
    }

    return {
      bytecode,
      bytecodeOffsets,
      stateMaps: compiled.map((c) => c.stateMap),
      reverseStateMaps: compiled.map((c) => c.reverseStateMap),
    }
  }

  /**
   * Компилирует одну superposition в bytecode для отдельного поля.
   *
   * В отличие от `compileEnsemble()`, этот метод возвращает полную информацию
   * о stateMap и reverseStateMap для декодирования результатов.
   *
   * @param superposition - Граф переходов состояний. Ключи условий — числовые индексы.
   * @param fieldsTuple - Поля в формате кортежей [[id, field], ...]
   * @returns Скомпилированные правила с метаданными
   */
  compileSingle(superposition: Superposition, fieldsTuple?: any): CompiledFieldRules {
    // Регистрируем поля если переданы
    if (fieldsTuple && Array.isArray(fieldsTuple)) {
      this.fields.clear()
      for (const [fieldId, field] of fieldsTuple) {
        const typeCode = fieldTypeToBytecodeType(field.type)
        let subType: number | undefined
        switch (field.elementType) {
          case "number":
            subType = TYPE.FLOAT
            break
          case "string":
            subType = TYPE.STRING
            break
          default:
            subType = undefined
        }
        this.fields.set(fieldId, {
          fieldId,
          type: typeCode,
          ...(subType !== undefined ? { subType } : {}),
          ...(field.enumValues !== undefined ? { enumValues: field.enumValues } : {}),
        })
      }
    }

    this.bytecode = []
    this.states = Object.keys(superposition)

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

        // Пушим заглушку для condPtr, заполним позже
        const condPtrIdx = this.bytecode.length
        this.bytecode.push(0)
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

    const result: CompiledRules = {
      bytecode: new Uint32Array(this.bytecode),
      stateTableOffset,
      stateMap: Object.fromEntries(this.states.map((s, i) => [s, i])),
    }

    const reverseStateMap = Object.keys(result.stateMap)

    return {
      bytecode: result.bytecode,
      stateMap: result.stateMap,
      reverseStateMap,
    }
  }

  private compileConditions(wave: CollapseConditions) {
    const entries = Object.entries(wave)
    // Сначала подсчитаем общее количество условий (инструкций)
    let totalConditions = 0
    for (const [key, cond] of entries) {
      const checks = this.parseCondition(cond)
      totalConditions += checks.length
    }
    this.bytecode.push(totalConditions)

    // Считаем полный размер инструкций (4 слова на каждую проверку)
    const totalInstructionsSize = totalConditions * 4

    // Условия в шейдере читаются от базы инструкций конкретного cond-блока
    const blockHeap: number[] = []

    // Генерируем инструкции с правильными указателями на кучу.
    for (const [key, cond] of entries) {
      const fieldId = Number(key)
      const field = this.fields.get(fieldId)
      if (!field) throw new Error(`Unknown field ID: ${fieldId}`)

      const checks = this.parseCondition(cond)
      for (const check of checks) {
        // 1. type
        this.bytecode.push(field.type)
        // 2. field_id
        this.bytecode.push(field.fieldId)
        // 3. оператор
        this.bytecode.push(check.op)
        // 4. значение (или указатель на кучу для массивов)
        if (Array.isArray(check.val) && (check.op === OP.IN || check.op === OP.NOT_IN)) {
          // ptr - смещение от базы инструкций cond-блока
          const ptr = totalInstructionsSize + blockHeap.length
          blockHeap.push(check.val.length)
          for (const v of check.val) {
            const encoded = this.encodeValue(field.type, v, this.getEncodingContextForOp(field, check.op))
            blockHeap.push(encoded)
          }
          this.bytecode.push(ptr)
        } else {
          this.bytecode.push(this.encodeValue(field.type, check.val, this.getEncodingContextForOp(field, check.op)))
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
    field: { fieldId: number; type: number; subType?: number | undefined; enumValues?: any[] | undefined },
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
      return stringId
    }
    return Number(val)
  }
}
