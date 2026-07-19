# Runtime contour

Читайте этот файл только при запуске или диагностике development-контура.

## Force health

`GET /health` Force возвращает server state Монады:

```json
{
  "ok": true,
  "domain": "force",
  "state": "running",
  "requiredDomains": ["dark", "boundary", "matrix", "energy", "bulk"],
  "connectedDomains": ["dark", "boundary", "matrix", "energy", "bulk"],
  "error": null
}
```

Identity физического доменного канала передаётся в HTTP Upgrade. После открытия
WebSocket transport несёт только Particle без register/readiness frames. Старый
`z/test force/replay/...` временно поглощается Монадой до relay.

## Карта сервисов

| Домен | Порт | Health |
| --- | ---: | --- |
| Force | 4000 | `GET /health` |
| Boundary | 4001 | `GET /health` |
| Dark | 4002 | `GET /health` |
| Matrix | 4003 | `GET /health` |
| Bulk | 4004 | `GET /health` |
| Energy | 4005 | `GET /health` |

Штатный полный запуск: `bun run dev:world`. Skill запускает его с
`METAFOR_WEAK_BACKEND=gpu` и компактными impulse-логами, если переменные не
переопределены явно.

## Правила владения

- `owner: interpreter` — процессы зарегистрированы Interpreter для текущего
  repository root. Это предпочтительный контур разработки с breakpoint и
  отдельным выводом доменов; использовать его без смены владельца.
- `owner: metafor-dev` — process group запущена MetaFor Dev. Только её разрешено
  останавливать через `run world stop`.
- `owner: external` — отвечающие порты не принадлежат одному подтверждённому
  владельцу. Такой контур автоматически не останавливается.
- `owner: none` — нет ни отвечающих сервисов, ни зарегистрированных процессов
  Interpreter. Только в этом состоянии разрешён `run world start`.
- Смешанный контур, где Interpreter объясняет не все отвечающие домены,
  безопасно классифицируется как `external`.
- Нельзя закрывать Interpreter-процессы только для того, чтобы заменить
  `owner: interpreter` на `owner: metafor-dev`.

## Состояние

- Boundary по умолчанию использует `.metafor/dev.sqlite`.
- `run meta-read <src>` отправляет входной `inflaton/test` через Force и запускает
  чтение корневого `github/<src>/meta.ts` в Dark. Сам `test` остаётся входной
  операцией и не испускается Dark как завершающий маркер.
- Owned-контур передаёт Dark `METAFOR_META_ROOT` на каталог fixtures в skill.
  `run meta-read capsule --fixture capsule` читает его без runtime-копии в
  `github/`; обычный WIMP SRC по-прежнему читается из `github/<src>/meta.ts`.
- Пустой Bulk после успешного запуска является допустимым исходным состоянием.
- Matrix health должен показывать `initialized: true`; основной backend — GPU.
- Structured logs являются диагностикой транспорта, но не источником
  визуальной или онтологической истины.

## Диагностика

1. Запустить `metafor-dev.mjs doctor`.
2. При `partial` проверить listeners `4000–4005` и команды процессов.
3. Если контур принадлежит skill, получить ограниченный хвост через
   `metafor-dev.mjs run world logs 80`.
4. Не перезапускать здоровые сервисы для получения более подробных логов.
5. После исправления повторить health, затем браузерную приёмку.
