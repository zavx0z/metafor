# MetaFor Plan

Рабочий план для текущей разработки. HUD Plan читает этот файл и показывает
только ближайшие незакрытые задачи.

## 1. Dark / Bulk Browser Shell

- [.50] Связать Matrix photons и Bulk visual update в основном browser shell без чтения Boundary из Matrix/Bulk.

## 2. Source / Entanglement

- [ ] Решить, хватает ли общего `actor_value.value` для source/entanglement.

## 3. Документация DSL

- [ ] Привести раздел `Reactions` к реальному API.
- [ ] Уточнить структуру process action.

## 4. Interpreter / HUD / Space
- [100] Сделать MVP Browser Agent Chat для Qwen в interpreter HUD.
- [ ] Доработать быстрые Space display tools: авто-сетка по количеству display, максимально плотный fit/приближение камеры и удобные пресеты раскладки.
- [100] Показывать в Browser Agent Chat отдельный blocked status, когда remote chat упёрся в дневной лимит/usage quota.
- [100] Довести Browser Agent Chat sessions: persist Qwen/DeepSeek state, sync browser tabs, DeepSeek mode/deep toggle and independent voice indicator.
- [100] Отполировать Browser Agent docs/API: documented provider sessions, persisted state, browser_chat.configure/activate and DeepSeek modes.
- [ ] Переименовать agent-facing Plan tools/API: добавить plan.* alias/contract поверх TODO.md storage и убрать путаницу с todo.* в инструкциях.
- [100] Добавить voice activation routing для Browser Agent sessions: фразы Qwen/DeepSeek выбирают нужную session и voice target в общем Message composer без активации Chrome-вкладки; реальная browser tab переключается только ручным кликом по target switcher.
- [100] Переработать voice activation/deactivation noise policy: поднять надежность wake при тихом микрофоне/слабой сети, меньше ложных срабатываний на шум, короче ожидание на пустом шуме, явные состояния wake/listening/commit.
- [100] Исправить voice wake target routing: Завхоз/Метафор всегда возвращает voice target в Codex host, Qwen/DeepSeek оставляют Browser Agent session.
- [100] Ввести VoiceSessionManager: локальная voice session/queue, composer-as-source-of-truth, не-fatal ASR failure, безопасный wake routing.
- [100] Доскачать Silero VAD assets и подключить browser-side Silero local VAD с fallback на adaptive noise-floor.
- [100] Стабилизировать voice input: local chunk/session manager, ASR-independent capture/VAD, composer/auto-send policy.
- [100] Довести voice realtime preview и reactivation: ASR/Whisper live partial во время dictation, без Vosk-текста в composer, без потери ASR chunks.
- [100] Сделать Silero VAD authoritative для индикатора/сегментации: fresh low probability не перебивается energy fallback.

## 5. Browser Agent Chat: изображения

- [100] MVP передаёт изображения в Qwen как текстовые пути через composer message.
- [ ] Выбрать следующий transport для настоящего vision-ввода: Qwen API или headed browser upload.
- [100] Объединить Codex message и Browser Agent message в один общий composer с target кнопками Codex/Qwen/DeepSeek, отдельными drafts/attachments и submit routing по выбранной цели.
- [100] Разделить Agent/Message HUD: окно Agent показывает историю и provider-specific controls активного Qwen/DeepSeek, окно Message содержит единый ввод и только переключатели Codex/Qwen/DeepSeek слева плюс общие send/image/voice controls справа.
