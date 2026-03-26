# Web

```bash
bun run dev
```

Открой `http://localhost:3000`.

- `app/web/client.ts` только импортирует `../../bulk` и поднимает два worker-а
- `dark/web.ts` загружает dark-домен в worker и открывает browser `IndexedDB` backend
- `boundary/web.ts` загружает boundary-домен в worker, открывает browser `IndexedDB` backend и поднимает protocol subscriptions внутри worker
