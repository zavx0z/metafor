# Внутренний механизм коммуникации между акторами

## Обзор

Система поддерживает два режима коммуникации между акторами:

1. **Внутренний механизм** - для акторов в том же потоке (быстро) - **РАБОТАЕТ ВСЕГДА**
2. **BroadcastChannel** - для акторов в разных потоках/воркерах - **ВКЛЮЧЕН ПО УМОЛЧАНИЮ**

## Использование

### По умолчанию (рекомендуется)

```typescript
import { Actor } from "./actor"

// Внутренний механизм работает всегда
// BroadcastChannel включен по умолчанию
// Actor.setBroadcastChannel(true) // не нужно - включено по умолчанию

const actor1 = Actor.fromSchema(schema, "actor-1")
const actor2 = Actor.fromSchema(schema, "actor-2")

// Акторы подписываются на оба канала одновременно:
// - Внутренний реестр - для быстрой коммуникации в том же потоке
// - BroadcastChannel - для получения сообщений из других потоков
```

### Для акторов только в одном потоке (редко используется)

```typescript
import { Actor } from "./actor"

// Отключаем BroadcastChannel - только внутренний механизм
Actor.setBroadcastChannel(false)

const actor1 = Actor.fromSchema(schema, "local-actor-1")
const actor2 = Actor.fromSchema(schema, "local-actor-2")

// Акторы подписываются только на внутренний реестр
// Нет межпотоковой коммуникации
```

## Логика работы

### По умолчанию (BroadcastChannel включен):

- ✅ Акторы подписываются на оба канала одновременно
- ✅ Внутренний реестр - для быстрой коммуникации в том же потоке (всегда работает)
- ✅ BroadcastChannel - для получения сообщений из других потоков/воркеров
- ✅ Сообщения отправляются в оба канала
- ✅ В одном потоке акторы общаются через внутренний реестр (быстро)

### Когда BroadcastChannel отключен (редко используется):

- ✅ Внутренний реестр работает всегда
- ❌ Акторы НЕ подписываются на BroadcastChannel
- ✅ Все коммуникация идет через внутренний реестр
- ❌ Нет межпотоковой коммуникации

## API

### Статические методы

```typescript
// Включить/выключить BroadcastChannel
Actor.setBroadcastChannel(enabled: boolean)

// Проверить состояние BroadcastChannel
Actor.isBroadcastChannelEnabled(): boolean

// Получить количество зарегистрированных акторов
Actor.getRegisteredActorsCount(): number

// Очистить реестр акторов (для тестирования)
Actor.clearRegistry()
```

### Методы экземпляра

```typescript
// Очистить ресурсы актора и удалить из реестра
actor.destroy()
```

## Примеры

См. файлы:

- `example-internal-messaging.ts` - пример использования
- `core/test/internal-messaging.spec.ts` - тесты внутреннего механизма
- `core/test/dual-channel-messaging.spec.ts` - тесты двойной отправки
- `core/test/worker-messaging.spec.ts` - тесты для воркеров
