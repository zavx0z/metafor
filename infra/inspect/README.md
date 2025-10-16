# Inspect (web)

Web component `meta-inspect` for step-by-step debugging of actors in the browser.

[← Home](../../README.md) **English** | [Русский](README.ru.md)

## TODO

- [ ] pause/resume
- [ ] step
- [x] reload
- [ ] slow-motion (slow‑mo)
- [x] breakpoint on start (`brk`)
- [ ] logger integration in debugger
- [ ] breakpoints by message parameters (meta, actor, path, timestamp, src, patches)

## What's working

- Control element: fixed panel with buttons — "reload", "pause/resume", "step"
- Pause/resume global actor system (`Actor.break()` / `Actor.resume()`)
- Step-by-step execution of next message (`Actor.step()`)
- Optional stop on start via `brk` attribute (analog of `--inspect-brk`)
- Button indicator shows ACTION on click: ▶ (resume), ⏸ (pause)

## Usage

1. Import web component module (ESM)

   ```html
   <script type="module">
     import "./web/debugger.ts"
   </script>
   ```

2. Insert component on page

   ```html
   <!-- start with pause on first "line" (like --inspect-brk) -->
   <meta-inspect brk></meta-inspect>

   <!-- or without pause on start -->
   <meta-inspect></meta-inspect>
   ```

## Attributes

- `brk` — when present, pauses the system immediately after component connection. Removing the attribute unpauses

---

[← Home](../../README.md) **English** | [Русский](README.ru.md)
