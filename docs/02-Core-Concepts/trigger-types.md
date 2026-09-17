# Типы проверок в Quantum Atom

## Обзор

Quantum Atom предоставляет мощную систему проверок для определения условий в триггерах. Каждый тип проверки предназначен
для работы с определенным типом данных и имеет свой набор операторов.

## Базовые типы проверок

| Иконка | Тип             | Описание                   | Пример использования                |
|--------|-----------------|----------------------------|-------------------------------------|
| 🎯     | Точное значение | Прямое сравнение значений  | `status: "active"`                  |
| ⚖️     | Числовой        | Математические сравнения   | `count: { gt: 10 }`                 |
| 📝     | Строковый       | Операции со строками       | `name: { include: "test" }`         |
| ✅      | Логический      | Проверка булевых значений  | `enabled: true`                     |
| 📦     | Массив          | Проверка массивов          | `tags: { includes: ["important"] }` |
| ❓      | Null-проверка   | Проверка на null/undefined | `deletedAt: { isNull: true }`       |

## Математические обозначения операторов

### Числовые операторы

| Символ | Оператор | Описание         |
|--------|----------|------------------|
| ⊜      | eq       | Равно            |
| ⊐      | gt       | Больше           |
| ⊒      | gte      | Больше или равно |
| ⊏      | lt       | Меньше           |
| ⊑      | lte      | Меньше или равно |
| ⋈      | between  | Между значениями |

### Строковые операторы

| Символ | Оператор   | Описание             |
|--------|------------|----------------------|
| ⊰      | startsWith | Начинается с         |
| ⊱      | endsWith   | Заканчивается на     |
| ⊆      | include    | Содержит             |
| ⋊      | pattern    | Регулярное выражение |

### Операторы массивов

| Символ | Оператор | Описание         |
|--------|----------|------------------|
| ⊂      | includes | Содержит элемент |
| ⊢      | length   | Длина массива    |
| ⋀      | every    | Все элементы     |
| ⋁      | some     | Хотя бы один     |

### Логические операторы

| Символ | Оператор | Описание |
|--------|----------|----------|
| ⊨      | eq       | Равно    |
| ⊭      | not      | Не равно |

### Операторы проверки на null

| Символ | Оператор | Описание            |
|--------|----------|---------------------|
| ∅      | isNull   | Проверка на null    |
| ¬∅     | notNull  | Проверка на не null |

## Типы проверок

### 1. Строковые проверки (StringTriggerCondition)

```typescript
type StringTriggerCondition = {
  start?: string;      // Начинается с
  end?: string;        // Заканчивается на
  include?: string;    // Содержит подстроку
  pattern?: RegExp;    // Регулярное выражение
  not?: boolean;       // Инвертировать условие
  min?: number;        // Минимальная длина
  max?: number;        // Максимальная длина
  eq?: string;         // Равно
  notEq?: string;      // Не равно
  notInclude?: string; // Не содержит
  notStart?: string;   // Не начинается с
  notEnd?: string;     // Не заканчивается на
  isNull?: boolean;    // Проверка на null/undefined
} | string | RegExp;   // Или прямое значение строки/регулярки
```

### 2. Числовые проверки (NumberTriggerCondition)

```typescript
type NumberTriggerCondition = {
  eq?: number;      // Равно
  gt?: number;      // Больше
  gte?: number;     // Больше или равно
  lt?: number;      // Меньше
  lte?: number;     // Меньше или равно
  min?: number;     // Минимальное значение
  max?: number;     // Максимальное значение
  notEq?: number;   // Не равно
  notGt?: number;   // Не больше
  notGte?: number;  // Не больше или равно
  notLt?: number;   // Не меньше
  notLte?: number;  // Не меньше или равно
  notMin?: number;  // Не минимальное значение
  notMax?: number;  // Не максимальное значение
  isNull?: boolean; // Проверка на null/undefined
} | number;         // Или прямое числовое значение
```

### 3. Логические проверки (BooleanTriggerCondition)

```typescript
type BooleanTriggerCondition = {
  eq?: boolean;     // Равно
  notEq?: boolean;  // Не равно
  isNull?: boolean; // Проверка на null/undefined
} | boolean;        // Или прямое булево значение
```

### 4. Определение контекста и триггеров

```typescript
// Определение типа контекста
export type Context = Record<string, TypeDefinition>;

// Определение типа триггера для контекста
export type TriggerType<C extends Context> = { [K in keyof C]: any } | {};

// Определение перехода состояния
export interface CollapseTo<C extends Context, S extends string> {
  state: S;        // Целевое состояние
  trigger: TriggerType<C>; // Условия перехода
}

// Определение правила коллапса
export interface Collapse<C extends Context, S extends string> {
  from: S;         // Исходное состояние
  to: CollapseTo<C, S>[]; // Возможные переходы
}
```

## Примеры использования

### Проверка заказа

```typescript
interface OrderContext {
  status: string;
  amount: number;
  items: OrderItem[];
  customer: Customer;
}

const orderTrigger: Trigger<OrderContext> = {
  status: "confirmed",
  amount: {gt: 0},
  items: {
    length: {gt: 0},
    every: {
      quantity: {gt: 0}
    }
  },
  customer: {
    verified: true
  }
};
```

### Проверка пользователя

```typescript
interface UserContext {
  email: string;
  role: string;
  permissions: string[];
  lastLogin: Date;
}

const userTrigger: Trigger<UserContext> = {
  email: {endsWith: "@admin.com"},
  role: "manager",
  permissions: {
    includes: "edit",
    length: {gt: 1}
  },
  lastLogin: {gt: new Date('2024-01-01')}
};
```

## Лучшие практики

1. **Простота**
    - Используйте простейшие проверки, которые решают задачу
    - Избегайте излишне сложных регулярных выражений
    - Разбивайте сложные условия на несколько простых

2. **Типобезопасность**
    - Всегда определяйте типы для проверок
    - Используйте TypeScript для валидации на этапе компиляции
    - Документируйте ожидаемые типы данных

3. **Производительность**
    - Избегайте тяжелых проверок на больших массивах
    - Используйте кэширование где возможно
    - Оптимизируйте регулярные выражения

## Заключение

Система проверок в Quantum Atom предоставляет гибкий и мощный инструментарий для создания условий в триггерах.
Правильное использование различных типов проверок позволяет создавать надежные и поддерживаемые системы.
