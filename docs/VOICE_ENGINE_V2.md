# MetaFor Voice Engine V2

Voice Engine V2 is the voice-input runtime used by the interpreter Message composer.

## Invariants

1. Browser capture owns the microphone. ASR and transport never own capture lifecycle.
2. Silero VAD is authoritative while its result is fresh; energy is a degraded fallback only.
3. Chunk, paragraph and whole-turn boundaries are independent local events.
4. Every closed chunk is journaled in IndexedDB until its recognized text is acknowledged by the composer.
5. Partial recognition is preview-only and cannot route, send or destructively rewrite the composer.
6. Manual microphone stop cancels auto-send before sealing the current chunk and leaves the result as a draft.
7. Auto-send reads the current composer, including typed text, manual edits and attachments.
8. WebRTC is primary: audio media track plus ordered `voice-asr` DataChannel. WebSocket is a compatible fallback.
9. A transport failure changes transport state but does not close capture or delete queued audio.
10. Reload restores unfinished chunks for retry in draft mode; restored content is never auto-sent.

## Operating modes

### Activation mode

The microphone waits quietly for a final wake recognition. Partial wake results never activate routing.
After a completed turn, the runtime returns to quiet wake waiting.

### Continuous dictation

The mode is enabled on the General voice-settings page. Auto-send is mandatory in this mode.
Local speech starts a turn without a wake phrase; final local silence seals the turn, drains ASR chunks,
sends the current composer and immediately arms a new turn without recreating capture or the RTC connection.
A manual microphone click suspends continuous dictation and leaves the current turn in the composer.

## UI indication

- no ring: quiet waiting or continuous mode suspended;
- thin cyan ring: continuous mode armed;
- radial meter: locally confirmed speech;
- rotating segments: recognition/queue processing;
- protocol dot: green WebRTC, cyan WebSocket fallback, orange connecting, red unavailable, gray off.

The microphone and protocol dot intentionally have no tooltips. Runtime diagnostics are shown on the General settings page.

## Server contract

The browser POSTs an SDP offer to the signal origin at `/voice/offer` with:

- `peerId`, `serverPeerId`, `description`;
- ASR WebSocket URL;
- supported audio modes (`media-track`, `pcm-datachannel`);
- ordered control channel name `voice-asr`.

The answer selects an audio mode and returns an SDP answer. Control messages are wrapped as `asr-control` on the DataChannel.
If WebRTC fails, the same ASR start/audio/commit stream resumes through `/hud/voice/asr/ws`.

## Known physical limitation

Generic VAD distinguishes speech from non-speech, not one human speaker from another.
Strict rejection of television or nearby human speech requires a future target-speaker gate with enrollment;
the current engine prevents background energy from holding speech open but does not claim speaker identity.
