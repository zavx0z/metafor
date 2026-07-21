# Текущий milestone: cold start Bulk через Force RPC

Этот файл задаёт текущую узкую проверку и не заменяет каноническую концепцию.

## Результат

Обязательный домен Bulk получает полный текущий канонический projection через
service-plane, рождает постоянный Store до открытия своего realtime-канала и
может сразу подготовить браузеру первый содержательный кадр:

```text
Boundary Monad
→ Boundary MonadChannel
→ Force MonadRouter
→ Bulk MonadChannel
→ Bulk Monad
→ permanent Bulk Store
→ Bulk ForceChannel

Browser POST /initial
→ Bulk projection snapshot + BulkManifest + throughTs + session
→ browser Store hydration
→ first frame
→ session WebSocket
→ buffered Particle once
→ ordinary live Particle
```

Текущий initial projection полный: Viewpoint-выборки нет. Фильтрация по
Viewpoint, Dark reconnect и WebRTC находятся вне milestone.

## Ownership и порядок рождения

- `boundary.initialProjection.read` возвращает через RPC текущие канонические
  projection entries без `ts` и `by`; это service data, а не Force replay.
- `bulk/monad.ts` загружает entries, рождает один постоянный Bulk Store и только
  после этого разрешает создать `Force("bulk")`.
- `bulk/server.ts` собирает Monad transport, Store, Force transport и HTTP/WS
  границу наблюдателя.
- `bulk/projection.ts` владеет сериализуемым snapshot/hydration-контрактом,
  позволяющим браузеру продолжить обычные incremental Particle.
- `bulk/handoff.ts` хранит только ограниченные Particle между initial cut и
  присоединением WebSocket; session одноразовая и имеет TTL.
- `bulk/client.ts` сначала гидратирует Store и применяет готовый manifest, затем
  открывает realtime transport с session identity.
- Matrix ждёт готовности Dark, Boundary, Energy и уже подготовленного Bulk,
  поэтому остаётся последним обязательным runtime-доменом.

Постоянный Bulk Store является состоянием домена, а не отдельной серверной
картиной мира клиента. После handoff все дальнейшие manifestation и
пересчёты принадлежат браузеру.

## Неподвижная Particle-граница

По WebSocket передаётся только одна типизированная Particle. Initial package,
RPC envelope и render vocabulary не входят в Force protocol. Observer session
передаётся только как transport identity во время HTTP Upgrade.

## Автоматическое доказательство

```bash
bun test boundary bulk shared force matrix
bun test ./pkg/ui
bun run typecheck
bun run check
```

Тесты должны доказать:

- Boundary exposes Matrix initial state и полный Bulk projection как разные RPC
  methods одного постоянного MonadChannel;
- projection entries не содержат искусственные `ts` или `by`;
- Bulk не открывает observer до рождения постоянного Store и Force runtime;
- snapshot гидратирует новый browser Store, который продолжает обычные
  add/replace/remove Particle;
- handoff принимает только Particle после initial cut, передаёт их один раз и
  удаляет просроченную session;
- observer identity находится только в Upgrade query, без service frames в
  realtime channel;
- прежний Matrix birth order, Force routing и CPU/WebGPU parity остаются
  зелёными.

## Живая приёмка

1. Перезапустить только контур с `owner: metafor-dev` целиком.
2. Проверить `healthy: 6`, `ready: 6`, Bulk `initialized: true`, Bulk
   `rpc: ready`, Matrix `initialized: true`.
3. Перезагрузить `http://localhost:4004/` без отправки нового Particle:
   сохранённый Atom должен быть виден в первом содержательном кадре.
4. Выполнить `run inflaton-add`: свежий Atom должен проявиться в уже открытом
   Bulk без reload.
5. Выполнить `run meta-read capsule --fixture capsule` и подтвердить обычный
   причинный Particle-путь.

Первый кадр и последующий realtime считаются одной непрерывной
последовательностью. Пустой cold-start при непустом Boundary является ошибкой.
