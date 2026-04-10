# Web

```bash
bun run dev
```

Открой `http://localhost:3000`.

- `app/web/client.ts` только импортирует `../../bulk`, а серверный runtime поднимает `dark`/`boundary`/`bulk` worker-ы отдельно от браузерного viewport
- `dark/web.ts` загружает dark-домен в worker и открывает browser `IndexedDB` backend
- `boundary/web.ts` загружает boundary-домен в worker, открывает browser `IndexedDB` backend и поднимает protocol subscriptions внутри worker
- `app/web/server.ts` поднимает server-side `boundary`, `dark` и `bulk` worker-ы поверх общего file-backed SQLite backend (`app/web/tmp/metafor-app.sqlite`) c `WAL`, зеркалит protocol channels в UI, принимает входные `gluon/higgs` patches через `/ws` и исполняет `Bulk × Weak` процессы по `Photon -> Z/W`
- Подробный разбор materialize/protocol/process handoff: `app/web/INTERACTION_FLOW.md`
