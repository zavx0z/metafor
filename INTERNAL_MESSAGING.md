# Внутренний механизм коммуникации между акторами

## Обзор

Система поддерживает два режима коммуникации между акторами:

1. **Внутренний механизм** - для акторов в том же потоке (быстро) - **РАБОТАЕТ ВСЕГДА**
2. **BroadcastChannel** - для акторов в разных потоках/воркерах - **ВКЛЮЧЕН ПО УМОЛЧАНИЮ**

## Архитектура

Коммуникации управляются через базовый класс `ActorCommunication`, от которого наследуется класс `Actor`:

```
ActorCommunication (базовый класс)
├── actorsRegistry: Map<string, ActorCommunication>
├── useBroadcastChannel: boolean
├── channel: BroadcastChannel
├── setBroadcastChannel(enabled: boolean)
├── isBroadcastChannelEnabled(): boolean
├── getRegisteredActorsCount(): number
├── clearRegistry()
├── initializeCommunication()
├── destroyCommunication()
└── sendMessage(message: Message)

Actor (наследуется от ActorCommunication)
├── name: string
├── id: string
├── ctx: Context<Schema>
├── state: { current: string; states: StatesConfig }
├── processes: Processes
├── reactions: Reactions
├── hasReactions(): boolean
├── handleReactionMessage(ev: MessageEvent): void
├── update(context: Partial<Values<Schema>>): Partial<Values<Schema>>
├── executeAction(process: Process<any, any>)
├── transition()
└── destroy()
```

**Разделение ответственности:**

- **ActorCommunication** - управление коммуникациями, реестр акторов, BroadcastChannel
- **Actor** - бизнес-логика актора, состояния, процессы, реакции

## Использование

### По умолчанию (рекомендуется)

```typescript
import { Actor } from "./actor"

// Внутренний механизм работает всегда
// BroadcastChannel включен по умолчанию
// Actor.setBroadcastChannel(true) // не нужно - включено по умолчанию

const actor1 = Actor.fromSchema({ meta: schema, id: "actor-1" })
const actor2 = Actor.fromSchema({ meta: schema, id: "actor-2" })

// Акторы подписываются на оба канала одновременно:
// - Внутренний реестр - для быстрой коммуникации в том же потоке
// - BroadcastChannel - для получения сообщений из других потоков
```

### Для акторов только в одном потоке (редко используется)

```typescript
import { Actor } from "./actor"

// Отключаем BroadcastChannel - только внутренний механизм
Actor.setBroadcastChannel(false)

const actor1 = Actor.fromSchema({ meta: schema, id: "local-actor-1" })
const actor2 = Actor.fromSchema({ meta: schema, id: "local-actor-2" })

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

### Базовый класс ActorCommunication

```typescript
// Включить/выключить BroadcastChannel
ActorCommunication.setBroadcastChannel(enabled: boolean)

// Проверить состояние BroadcastChannel
ActorCommunication.isBroadcastChannelEnabled(): boolean

// Получить количество зарегистрированных акторов
ActorCommunication.getRegisteredActorsCount(): number

// Очистить реестр акторов (для тестирования)
ActorCommunication.clearRegistry()
```

### Класс Actor (наследуется от ActorCommunication)

```typescript
// Очистить ресурсы актора и удалить из реестра
actor.destroy()

// Отправить сообщение через доступные каналы
actor.sendMessage(message: Message)

// Проверить, есть ли у актора реакции
actor.hasReactions(): boolean

// Обработать входящие сообщения для реакций
actor.handleReactionMessage(ev: MessageEvent): void
```

## Примеры

См. файлы:

- `example-internal-messaging.ts` - пример использования
- `core/test/internal-messaging.spec.ts` - тесты внутреннего механизма
- `core/test/dual-channel-messaging.spec.ts` - тесты двойной отправки
- `core/test/worker-messaging.spec.ts` - тесты для воркеров
