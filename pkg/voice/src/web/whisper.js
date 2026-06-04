const $ = (id) => document.getElementById(id);

const els = {
  mark: document.querySelector(".mark"),
  statusText: $("statusText"),
  remoteUrl: $("remoteUrl"),
  contextText: $("contextText"),
  startBtn: $("startBtn"),
  stopSaveBtn: $("stopSaveBtn"),
  saveBtn: $("saveBtn"),
  sampleRate: $("sampleRate"),
  audioBytes: $("audioBytes"),
  partialText: $("partialText"),
  savedCount: $("savedCount"),
  waveform: $("waveform"),
  selectedSessionText: $("selectedSessionText"),
  sampleAudioLabel: $("sampleAudioLabel"),
  sampleTextLabel: $("sampleTextLabel"),
  sourceAudio: $("sourceAudio"),
  transcriptText: $("transcriptText"),
  clearTranscriptBtn: $("clearTranscriptBtn"),
  referenceAudio: $("referenceAudio"),
  referenceTextEditor: $("referenceTextEditor"),
  finalizeSampleBtn: $("finalizeSampleBtn"),
  ttsReferenceInfo: $("ttsReferenceInfo"),
  ttsText: $("ttsText"),
  ttsRecordStatus: $("ttsRecordStatus"),
  ttsAccentBtn: $("ttsAccentBtn"),
  ttsRecordBtn: $("ttsRecordBtn"),
  ttsStopBtn: $("ttsStopBtn"),
  ttsPlanText: $("ttsPlanText"),
  ttsServiceInfo: $("ttsServiceInfo"),
  ttsOutputInfo: $("ttsOutputInfo"),
  ttsSpeed: $("ttsSpeed"),
  ttsSeed: $("ttsSeed"),
  ttsNfeSteps: $("ttsNfeSteps"),
  ttsCrossFade: $("ttsCrossFade"),
  generateTtsBtn: $("generateTtsBtn"),
  ttsEmptyHint: $("ttsEmptyHint"),
  ttsAudio: $("ttsAudio"),
  refreshSavedBtn: $("refreshSavedBtn"),
  savedList: $("savedList"),
  eventLog: $("eventLog"),
  clearLogBtn: $("clearLogBtn"),
};

const storageKeys = {
  remoteUrl: "voice.whisper.remoteUrl",
  context: "voice.whisper.context",
};

let info = null;
let ws = null;
let stream = null;
let audioContext = null;
let sourceNode = null;
let captureNode = null;
let sinkNode = null;
let workletUrl = null;
let recordedChunks = [];
let recordedBytes = 0;
let recordedSampleRate = 16000;
let startedAt = 0;
let finalMessages = [];
let receivedSegments = [];
let partialText = "";
let latestWaveform = new Float32Array(0);
let drawQueued = false;
let commitPending = false;
let queuedPcmAfterCommit = [];
let waiters = [];
let savedSessions = [];
let selectedSessionId = null;
let referenceEditorSessionId = null;
let transcriptEditorSessionId = null;
let referenceBusy = false;
let sampleBusyStage = "";
let ttsBusy = false;
let ttsAccentBusy = false;
let captureMode = null;

const MAX_QUEUED_PCM_BYTES = 8 * 1024 * 1024;

globalThis.whisperCaptureDebug = {
  receive: handleServerMessage,
  transcript: () => els.transcriptText.value,
  save: saveSession,
};

init().catch((error) => {
  showError(error);
});

async function init() {
  restoreSettings();
  normalizeKnownAccentTextareas();
  drawWaveform();
  await loadInfo();
  bindEvents();
  await refreshSaved();
  setRunning(false);
}

async function loadInfo() {
  const response = await fetch("/api/info", { cache: "no-store" });
  info = await response.json();
  if (!localStorage.getItem(storageKeys.remoteUrl) && info.remoteAsrUrl) {
    els.remoteUrl.value = info.remoteAsrUrl;
  }
  els.sampleRate.textContent = String(info.defaultSampleRate ?? 16000);
  setStatus("ready", false);
  log("server:ready", {
    sampleRate: info.defaultSampleRate,
    remoteAsrUrl: info.remoteAsrUrl,
    recordings: info.whisperRecordingsRoot,
  });
}

function bindEvents() {
  els.startBtn.addEventListener("click", () => startCapture("reference").catch(showError));
  els.stopSaveBtn.addEventListener("click", () => stopAndSave().catch(showError));
  els.saveBtn.addEventListener("click", () => saveSession().catch(showError));
  els.ttsAccentBtn.addEventListener("click", () => accentTtsText(els.ttsText.value.trim()).catch(showError));
  els.ttsRecordBtn.addEventListener("click", () => startCapture("tts").catch(showError));
  els.ttsStopBtn.addEventListener("click", () => stopTtsDictation().catch(showError));
  els.remoteUrl.addEventListener("input", saveSettings);
  els.contextText.addEventListener("input", saveSettings);
  els.ttsText.addEventListener("input", renderSelectedSession);
  for (const input of [els.ttsSpeed, els.ttsSeed, els.ttsNfeSteps, els.ttsCrossFade]) {
    input.addEventListener("input", renderSelectedSession);
    input.addEventListener("change", renderSelectedSession);
  }
  els.referenceTextEditor.addEventListener("input", renderSelectedSession);
  els.clearTranscriptBtn.addEventListener("click", () => {
    finalMessages = [];
    receivedSegments = [];
    partialText = "";
    els.referenceTextEditor.value = "";
    renderTranscript();
    renderSelectedSession();
  });
  els.refreshSavedBtn.addEventListener("click", () => refreshSaved().catch(showError));
  els.finalizeSampleBtn.addEventListener("click", () => finalizeSample().catch(showError));
  els.generateTtsBtn.addEventListener("click", () => generateTts().catch(showError));
  els.clearLogBtn.addEventListener("click", () => {
    els.eventLog.textContent = "";
  });
}

function restoreSettings() {
  els.remoteUrl.value = localStorage.getItem(storageKeys.remoteUrl) || els.remoteUrl.value;
  els.contextText.value = localStorage.getItem(storageKeys.context) || els.contextText.value;
}

function saveSettings() {
  localStorage.setItem(storageKeys.remoteUrl, els.remoteUrl.value.trim());
  localStorage.setItem(storageKeys.context, els.contextText.value.trim());
}

async function startCapture(mode) {
  if (stream) return;

  saveSettings();
  if (mode === "reference") clearPreparation();
  captureMode = mode;
  resetCaptureState();
  await connectWs();

  const desiredSampleRate = Number(info?.defaultSampleRate ?? 16000);
  try {
    audioContext = new AudioContext({ sampleRate: desiredSampleRate });
  } catch {
    audioContext = new AudioContext();
  }

  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  sourceNode = audioContext.createMediaStreamSource(stream);
  captureNode = await createCaptureNode(audioContext);
  sinkNode = audioContext.createGain();
  sinkNode.gain.value = 0;
  recordedSampleRate = audioContext.sampleRate;
  startedAt = Date.now();

  captureNode.port.onmessage = (event) => {
    const samples = event.data;
    if (!(samples instanceof Float32Array)) return;

    latestWaveform = samples;
    scheduleWaveformDraw();

    const pcm = floatToPcm16(samples);
    const chunk = new Uint8Array(pcm);
    recordedChunks.push(chunk);
    recordedBytes += chunk.byteLength;
    els.audioBytes.textContent = formatBytes(recordedBytes);
    els.saveBtn.disabled = recordedBytes === 0;
    sendPcm(pcm);
  };

  sourceNode.connect(captureNode);
  captureNode.connect(sinkNode);
  sinkNode.connect(audioContext.destination);

  send({
    type: "start",
    sampleRate: audioContext.sampleRate,
    language: "ru",
    format: false,
    context: els.contextText.value.trim(),
    prompt: els.contextText.value.trim(),
  });

  els.sampleRate.textContent = String(audioContext.sampleRate);
  setRunning(true);
  setRecordingStatus();
  log("audio:start", { mode, sampleRate: audioContext.sampleRate });
}

async function connectWs() {
  if (ws?.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(els.remoteUrl.value.trim());
  ws.binaryType = "arraybuffer";

  ws.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    handleServerMessage(msg);
  });

  ws.addEventListener("close", (event) => {
    notifyWaiters("close");
    log("ws:close", { code: event.code, reason: event.reason });
    if (stream) {
      stopAudioOnly();
      setRunning(false);
      setStatus("offline", false);
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("WebSocket failed")), { once: true });
  });
}

function handleServerMessage(msg) {
  notifyWaiters(msg.type);
  if (msg.type !== "partial") log(`rx:${msg.type}`, compact(msg));

  if (msg.type === "ready") {
    if (!stream) setStatus("connected", false);
    return;
  }

  if (msg.type === "started") {
    if (msg.sampleRate) {
      recordedSampleRate = Number(msg.sampleRate);
      els.sampleRate.textContent = String(msg.sampleRate);
    }
    return;
  }

  if (msg.type === "partial") {
    partialText = cleanupTranscriptText(msg.text);
    setLivePartial(partialText);
    renderTranscript();
    return;
  }

  if (msg.type === "result" || msg.type === "final") {
    partialText = "";
    setLivePartial("");
    if (Array.isArray(msg.segments)) receivedSegments.push(...msg.segments);
    const messages = transcriptMessagesFrom(msg.text, msg.messages, msg.segments);
    for (const message of messages) {
      if (message) finalMessages.push(message);
    }
    renderTranscript();
    return;
  }

  if (msg.type === "committed") {
    commitPending = false;
    flushQueuedPcm();
    if (stream) setRecordingStatus();
    return;
  }

  if (msg.type === "error") {
    showError(new Error(msg.error || "Unknown server error"));
  }
}

async function requestCommit() {
  if (ws?.readyState !== WebSocket.OPEN || commitPending) return;
  commitPending = true;
  send({ type: "commit" });
  setStatus("committing", true);
  await waitForServer(["committed", "result", "final", "close"], 1800);
}

async function stopAndSave() {
  if (captureMode && captureMode !== "reference") return;
  if (stream && ws?.readyState === WebSocket.OPEN && recordedBytes > 0) {
    await requestCommit();
  }

  if (ws?.readyState === WebSocket.OPEN) {
    send({ type: "stop" });
    await waitForServer(["stopped", "final", "close"], 800);
  }

  stopAudioOnly();
  setRunning(false);
  if (recordedBytes > 0) {
    await saveSession();
  } else {
    setStatus("ready", false);
  }
}

async function stopTtsDictation() {
  if (captureMode && captureMode !== "tts") return;
  if (stream && ws?.readyState === WebSocket.OPEN && recordedBytes > 0) {
    await requestCommit();
  }

  if (ws?.readyState === WebSocket.OPEN) {
    send({ type: "stop" });
    await waitForServer(["stopped", "final", "close"], 800);
  }

  stopAudioOnly();
  setRunning(false);

  const text = els.ttsText.value.trim() || els.transcriptText.value.trim();
  if (!text) {
    els.ttsRecordStatus.textContent = "текст не распознан";
    setStatus("ready", false);
    return;
  }

  await accentTtsText(text);
}

function stopAudioOnly() {
  if (captureNode) captureNode.disconnect();
  if (sourceNode) sourceNode.disconnect();
  if (sinkNode) sinkNode.disconnect();
  for (const track of stream?.getTracks() ?? []) track.stop();
  if (audioContext) void audioContext.close();
  if (workletUrl) URL.revokeObjectURL(workletUrl);

  stream = null;
  audioContext = null;
  sourceNode = null;
  captureNode = null;
  sinkNode = null;
  workletUrl = null;
  captureMode = null;
  latestWaveform = new Float32Array(0);
  scheduleWaveformDraw();
}

async function saveSession() {
  if (recordedBytes <= 0) {
    throw new Error("Нет записанного аудио");
  }

  setStatus("saving", false);
  const transcript = els.transcriptText.value.trim();
  const wav = pcmChunksToWav(recordedChunks, recordedSampleRate);
  const meta = {
    sampleRate: recordedSampleRate,
    durationMs: startedAt ? Date.now() - startedAt : null,
    remoteUrl: els.remoteUrl.value.trim(),
    context: els.contextText.value.trim(),
    chunks: recordedChunks.length,
    recordedBytes,
    savedAt: new Date().toISOString(),
  };

  const form = new FormData();
  form.append("audio", wav, "audio.wav");
  form.append("transcript", transcript);
  form.append("messages", JSON.stringify(finalMessages));
  form.append("segments", JSON.stringify(receivedSegments));
  form.append("meta", JSON.stringify(meta));

  const response = await fetch("/api/whisper/sessions", {
    method: "POST",
    body: form,
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Save failed: ${response.status}`);
  }

  setStatus("saved", false);
  log("save:ok", { id: data.session?.id, bytes: data.session?.audioBytes });
  await refreshSaved(data.session?.id);
  if (data.session?.id) {
    await prepareSample(data.session.id, transcript || data.session.transcript || "");
  }
}

async function refreshSaved(preferredSessionId = selectedSessionId) {
  const response = await fetch("/api/whisper/sessions", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `List failed: ${response.status}`);
  }
  savedSessions = data.sessions || [];
  els.savedCount.textContent = String(savedSessions.length);
  if (preferredSessionId === null) {
    selectedSessionId = null;
  } else {
    const preferred = savedSessions.find((session) => session.id === preferredSessionId);
    const previous = savedSessions.find((session) => session.id === selectedSessionId);
    selectedSessionId = (preferred || previous || savedSessions[0] || null)?.id ?? null;
  }
  renderSavedSessions(readySessions());
  renderSelectedSession();
}

function renderSavedSessions(sessions) {
  els.savedList.textContent = "";

  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Нет готовых образцов";
    els.savedList.append(empty);
    return;
  }

  for (const session of sessions) {
    const item = document.createElement("article");
    item.className = "item savedItem";

    const meta = document.createElement("span");
    meta.className = "savedMeta";
    meta.textContent = `${formatDate(session.createdAt)} · ${formatBytes(session.audioBytes || 0)} · ${formatDuration(session.durationMs)}`;

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.src = session.referenceUrl || session.audioUrl;

    const referenceEditor = document.createElement("textarea");
    referenceEditor.className = "savedReferenceEditor";
    referenceEditor.spellcheck = true;
    referenceEditor.value = session.referenceText || session.transcript || "";
    referenceEditor.setAttribute("aria-label", "Текст образца с ударениями");

    const controls = document.createElement("div");
    controls.className = "savedActions";

    const saveReferenceBtn = document.createElement("button");
    saveReferenceBtn.type = "button";
    saveReferenceBtn.textContent = "Сохранить ударения";
    saveReferenceBtn.addEventListener("click", () => {
      updateSessionReference(session.id, referenceEditor.value, false).catch(showError);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "deleteButton";
    deleteBtn.textContent = "Удалить";
    deleteBtn.addEventListener("click", () => deleteSession(session.id).catch(showError));
    controls.append(saveReferenceBtn, deleteBtn);

    const links = document.createElement("div");
    links.className = "savedLinks";
    links.append(
      fileLink(session.audioUrl, "audio.wav"),
      fileLink(session.transcriptUrl, "transcript.txt"),
      fileLink(session.metaUrl, "meta.json"),
    );
    if (session.referenceUrl) {
      links.append(fileLink(session.referenceUrl, "reference.wav"));
    }
    if (session.ttsUrl) {
      links.append(fileLink(session.ttsUrl, "tts.wav"));
    }

    item.append(meta, audio, referenceEditor, controls, links);
    els.savedList.append(item);
  }
}

function selectSession(id) {
  selectedSessionId = id;
  renderSavedSessions(readySessions());
  renderSelectedSession();
}

function selectedSession() {
  return savedSessions.find((session) => session.id === selectedSessionId) || null;
}

function readySessions() {
  return savedSessions.filter(isReadySample);
}

function latestReadySession() {
  return readySessions()[0] || null;
}

function isReadySample(session) {
  return Boolean(session?.readyAt && session?.referenceUrl && session?.referenceText && looksAccented(session.referenceText));
}

function looksAccented(text) {
  return /\+[аеёиоуыэюяАЕЁИОУЫЭЮЯ]/.test(String(text || ""));
}

function renderSelectedSession() {
  const session = selectedSession();
  const sessionId = session?.id ?? null;
  const ttsSample = latestReadySession();
  const ttsText = els.ttsText.value.trim();
  const readyCount = readySessions().length;
  els.selectedSessionText.textContent = session ? shortId(session.id) : "образец не выбран";

  if (sessionId !== transcriptEditorSessionId) {
    els.transcriptText.value = session?.transcript || "";
    transcriptEditorSessionId = sessionId;
  }
  if (sessionId !== referenceEditorSessionId) {
    els.referenceTextEditor.value = session?.referenceText || session?.transcript || "";
    referenceEditorSessionId = sessionId;
  }

  const hasReference = Boolean(session?.referenceUrl);
  if (session?.audioUrl) {
    els.sourceAudio.src = cacheBust(session.audioUrl);
    els.sourceAudio.hidden = hasReference;
  } else {
    els.sourceAudio.removeAttribute("src");
    els.sourceAudio.hidden = true;
  }
  if (session?.referenceUrl) {
    els.referenceAudio.src = cacheBust(session.referenceUrl);
    els.referenceAudio.hidden = false;
  } else {
    els.referenceAudio.removeAttribute("src");
    els.referenceAudio.hidden = true;
  }
  els.sampleAudioLabel.textContent = hasReference ? "Обрезанный звук" : "Записанный звук";
  els.sampleTextLabel.textContent = hasReference ? "Текст с ударениями" : "Распознанный текст";

  const referenceText = els.referenceTextEditor.value.trim();
  const transcriptText = els.transcriptText.value.trim();
  const sourceText = referenceText || transcriptText;
  const sampleBusy = Boolean(sampleBusyStage || referenceBusy);
  const anyCaptureRunning = Boolean(stream);
  els.finalizeSampleBtn.textContent = sampleBusy ? sampleBusyStage || "Готовлю..." : "Готово";
  els.finalizeSampleBtn.disabled = !session || sampleBusy || !sourceText;
  els.ttsAccentBtn.disabled = ttsBusy || ttsAccentBusy || anyCaptureRunning || !ttsText;
  els.generateTtsBtn.disabled = ttsBusy || ttsAccentBusy || anyCaptureRunning || !ttsSample || !ttsText;
  els.ttsReferenceInfo.textContent = sampleStatusText(session);
  els.ttsServiceInfo.textContent = ttsBusy
    ? "синтез..."
    : ttsAccentBusy
      ? "автоударения..."
    : readyCount
      ? `${readyCount} готов. · ${shortId(ttsSample.id)}`
      : "нет готовых образцов";
  els.ttsOutputInfo.textContent = ttsSample?.ttsUrl ? `tts.wav · ${formatBytes(ttsSample.ttsAudioBytes || 0)}` : "-";
  els.ttsPlanText.textContent = summarizeProsodyText(els.ttsText.value);

  const hint = !ttsSample
    ? "Нужен готовый образец"
    : !ttsText
      ? "Нужен текст для синтеза"
      : ttsBusy
        ? "Синтез выполняется"
        : ttsAccentBusy
          ? "Ставлю ударения"
        : "Готово к синтезу";
  els.ttsEmptyHint.textContent = hint;

  if (ttsSample?.ttsUrl) {
    els.ttsAudio.hidden = false;
    els.ttsAudio.src = cacheBust(ttsSample.ttsUrl);
    els.ttsEmptyHint.hidden = true;
  } else {
    els.ttsAudio.hidden = true;
    els.ttsAudio.removeAttribute("src");
    els.ttsEmptyHint.hidden = false;
  }
}

function sampleStatusText(session) {
  if (sampleBusyStage) return sampleBusyStage;
  if (!session) return "образец не выбран";
  if (isReadySample(session)) {
    return `образец готов · ${formatBytes(session.referenceAudioBytes || session.audioBytes || 0)}`;
  }
  if (session.referenceUrl && looksAccented(session.referenceText || els.referenceTextEditor.value)) {
    return `подготовлен · нажми Готово · ${formatBytes(session.referenceAudioBytes || session.audioBytes || 0)}`;
  }
  const sourceText = els.referenceTextEditor.value.trim() || els.transcriptText.value.trim();
  if (sourceText) return `готов к обработке · ${formatBytes(session.audioBytes || 0)}`;
  return "нет текста для образца";
}

async function finalizeSample() {
  const session = selectedSession();
  if (!session) throw new Error("Сначала выбери запись");
  const sourceText =
    els.referenceTextEditor.value.trim() ||
    els.transcriptText.value.trim() ||
    session?.referenceText ||
    session?.transcript ||
    "";
  if (!sourceText) throw new Error("Нет текста для образца");

  const needsPreparation = !session.referenceUrl || !looksAccented(sourceText);
  if (needsPreparation) {
    await prepareSample(session.id, sourceText);
  } else if (sourceText !== session.referenceText) {
    sampleBusyStage = "обновляю...";
    renderSelectedSession();
    await updateSessionReference(session.id, sourceText, false, false);
  }

  sampleBusyStage = "сохраняю...";
  renderSelectedSession();
  try {
    await markSessionReady(session.id);
    log("sample:ready", { id: session.id });
    clearPreparation();
    await refreshSaved(null);
    setStatus("ready", false);
  } finally {
    sampleBusyStage = "";
    renderSelectedSession();
  }
}

async function prepareSample(sessionId, sourceText) {
  if (!sourceText) throw new Error("Нет текста для образца");

  sampleBusyStage = "автоударения...";
  renderSelectedSession();
  setStatus("accent", true);

  try {
    const accentedText = await accentText(sourceText);
    els.referenceTextEditor.value = accentedText;
    log("accent:ok", { id: sessionId });

    sampleBusyStage = "обрезка...";
    renderSelectedSession();
    await updateSessionReference(sessionId, accentedText, false, false);
    setStatus("ready", false);
  } finally {
    sampleBusyStage = "";
    renderSelectedSession();
  }
}

async function accentTtsText(text) {
  if (!text) throw new Error("Нет текста для ударений");
  ttsAccentBusy = true;
  els.ttsRecordStatus.textContent = "автоударения...";
  setStatus("accent", true);
  renderSelectedSession();

  try {
    const accentedText = await accentText(text);
    els.ttsText.value = accentedText;
    els.ttsRecordStatus.textContent = "текст с ударениями";
    log("tts:accent:ok");
    setStatus("ready", false);
    renderSelectedSession();
  } finally {
    ttsAccentBusy = false;
    setRunning(Boolean(stream));
    renderSelectedSession();
  }
}

async function accentText(text) {
  const response = await fetch("/api/whisper/accent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Accent failed: ${response.status}`);
  }
  return data.text || text;
}

async function updateSessionReference(sessionId, referenceText, clearAfter, ready) {
  referenceBusy = true;
  renderSelectedSession();
  setStatus("reference", false);
  try {
    const payload = { referenceText: String(referenceText || "").trim() };
    if (typeof ready === "boolean") payload.ready = ready;
    const response = await fetch(`/api/whisper/sessions/${encodeURIComponent(sessionId)}/reference`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Reference failed: ${response.status}`);
    }
    log("reference:ok", { id: sessionId });
    if (clearAfter) clearPreparation();
    await refreshSaved(clearAfter ? null : sessionId);
  } finally {
    referenceBusy = false;
    renderSelectedSession();
  }
}

async function markSessionReady(sessionId) {
  const response = await fetch(`/api/whisper/sessions/${encodeURIComponent(sessionId)}/ready`, {
    method: "POST",
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Ready failed: ${response.status}`);
  }
  return data.session;
}

async function generateTts() {
  const session = latestReadySession();
  if (!session) throw new Error("Нет готового образца");

  normalizeKnownAccentTextareas();
  const text = els.ttsText.value.trim();
  if (!text) throw new Error("Нет текста для синтеза");

  ttsBusy = true;
  renderSelectedSession();
  setStatus("tts", true);

  try {
    const response = await fetch(`/api/whisper/sessions/${encodeURIComponent(session.id)}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        referenceText: session.referenceText || session.transcript || "",
        speed: numberInputValue(els.ttsSpeed, 1),
        seed: Math.round(numberInputValue(els.ttsSeed, 42)),
        nfeSteps: Math.round(numberInputValue(els.ttsNfeSteps, 32)),
        crossFadeDuration: numberInputValue(els.ttsCrossFade, 0.15),
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `TTS failed: ${response.status}`);
    }
    log("tts:ok", { id: session.id, bytes: data.session?.ttsAudioBytes });
    await refreshSaved(session.id);
    setStatus("ready", false);
  } finally {
    ttsBusy = false;
    renderSelectedSession();
  }
}

function clearPreparation() {
  selectedSessionId = null;
  referenceEditorSessionId = null;
  transcriptEditorSessionId = null;
  els.sourceAudio.removeAttribute("src");
  els.referenceAudio.removeAttribute("src");
  els.transcriptText.value = "";
  els.referenceTextEditor.value = "";
}

async function deleteSession(id) {
  const session = savedSessions.find((item) => item.id === id);
  const label = firstLine(session?.referenceText || session?.transcript) || shortId(id);
  if (!window.confirm(`Удалить образец?\n\n${label}`)) return;

  const response = await fetch(`/api/whisper/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Delete failed: ${response.status}`);
  }
  log("sample:delete", { id });
  if (selectedSessionId === id) clearPreparation();
  await refreshSaved();
}

function fileLink(url, label) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  return link;
}

function sendPcm(pcm) {
  if (ws?.readyState !== WebSocket.OPEN) return;

  if (commitPending) {
    queuedPcmAfterCommit.push(pcm);
    trimQueuedPcm();
    return;
  }

  ws.send(pcm);
}

function flushQueuedPcm() {
  if (ws?.readyState !== WebSocket.OPEN) {
    queuedPcmAfterCommit = [];
    return;
  }

  for (const pcm of queuedPcmAfterCommit) ws.send(pcm);
  queuedPcmAfterCommit = [];
}

function trimQueuedPcm() {
  let total = queuedPcmAfterCommit.reduce((size, pcm) => size + pcm.byteLength, 0);
  while (total > MAX_QUEUED_PCM_BYTES && queuedPcmAfterCommit.length) {
    const dropped = queuedPcmAfterCommit.shift();
    total -= dropped?.byteLength ?? 0;
  }
}

function send(payload) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

async function createCaptureNode(context) {
  const code = `
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    const frameCount = input[0].length;
    const mono = new Float32Array(frameCount);
    for (let channel = 0; channel < input.length; channel += 1) {
      const samples = input[channel];
      for (let index = 0; index < frameCount; index += 1) {
        mono[index] += samples[index] / input.length;
      }
    }
    this.port.postMessage(mono, [mono.buffer]);
    return true;
  }
}
registerProcessor("voice-capture", VoiceCaptureProcessor);
`;
  workletUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  await context.audioWorklet.addModule(workletUrl);
  return new AudioWorkletNode(context, "voice-capture");
}

function floatToPcm16(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

function pcmChunksToWav(chunks, sampleRate) {
  const dataBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  const bytes = new Uint8Array(buffer, 44);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function renderTranscript() {
  const lines = [...finalMessages];
  if (partialText) lines.push(partialText);
  const text = lines.join("\n\n");
  els.transcriptText.value = text;
  if (captureMode === "tts") {
    els.ttsText.value = text;
    els.ttsRecordStatus.textContent = partialText ? "распознаю..." : text ? "текст получен" : "запись...";
    renderSelectedSession();
    return;
  }
  if (stream || !selectedSession()) {
    els.referenceTextEditor.value = text;
    renderSelectedSession();
  }
}

function transcriptMessagesFrom(text, serverMessages, segments) {
  const serverParagraphs = Array.isArray(serverMessages)
    ? serverMessages.flatMap(splitBlankLineParagraphs)
    : [];
  if (serverParagraphs.length > 1) return serverParagraphs;

  const segmentMessages = segmentPauseMessages(segments);
  if (segmentMessages.length > 1) return segmentMessages;

  const textParagraphs = splitBlankLineParagraphs(text);
  return textParagraphs.length ? textParagraphs : [cleanupTranscriptText(text)].filter(Boolean);
}

function splitBlankLineParagraphs(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map(cleanupTranscriptText)
    .filter(Boolean);
}

function segmentPauseMessages(segments) {
  if (!Array.isArray(segments) || segments.length < 2) return [];

  const messages = [];
  let current = "";
  let lastEnd = null;

  for (const segment of segments) {
    const text = cleanupTranscriptText(segment?.text);
    if (!text) continue;

    const start = Number(segment?.start);
    const end = Number(segment?.end);
    const hasPause =
      current &&
      Number.isFinite(start) &&
      Number.isFinite(lastEnd) &&
      start - lastEnd >= 1.1;

    if (hasPause) {
      messages.push(current);
      current = text;
    } else {
      current = current ? `${current} ${text}` : text;
    }

    if (Number.isFinite(end)) lastEnd = end;
  }

  if (current) messages.push(current);
  return messages;
}

function cleanupTranscriptText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function waitForServer(types, timeoutMs) {
  return new Promise((resolve) => {
    const waiter = {
      types: new Set(types),
      resolve,
      timeout: window.setTimeout(() => {
        waiters = waiters.filter((item) => item !== waiter);
        resolve(null);
      }, timeoutMs),
    };
    waiters.push(waiter);
  });
}

function notifyWaiters(type) {
  for (const waiter of [...waiters]) {
    if (!waiter.types.has(type)) continue;
    window.clearTimeout(waiter.timeout);
    waiters = waiters.filter((item) => item !== waiter);
    waiter.resolve(type);
  }
}

function drawWaveform() {
  const canvas = els.waveform;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#13211d";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(244, 246, 241, 0.12)";
  context.lineWidth = 1;
  for (let y = 40; y < height; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.strokeStyle = "#2a9d8f";
  context.lineWidth = 3;
  context.beginPath();
  const samples = latestWaveform;
  if (samples.length) {
    for (let x = 0; x < width; x += 1) {
      const index = Math.floor((x / width) * samples.length);
      const y = height / 2 + samples[index] * (height * 0.42);
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
  } else {
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
  }
  context.stroke();
}

function scheduleWaveformDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    drawWaveform();
  });
}

function resetCaptureState() {
  recordedChunks = [];
  recordedBytes = 0;
  recordedSampleRate = Number(info?.defaultSampleRate ?? 16000);
  startedAt = 0;
  finalMessages = [];
  receivedSegments = [];
  partialText = "";
  commitPending = false;
  queuedPcmAfterCommit = [];
  els.audioBytes.textContent = "0 KB";
  setLivePartial("");
  renderTranscript();
}

function setRunning(running) {
  const referenceRunning = running && captureMode === "reference";
  const ttsRunning = running && captureMode === "tts";
  els.startBtn.disabled = running || ttsAccentBusy;
  els.stopSaveBtn.disabled = !referenceRunning;
  els.saveBtn.disabled = !referenceRunning || recordedBytes === 0;
  els.ttsRecordBtn.disabled = running || ttsAccentBusy;
  els.ttsAccentBtn.disabled = running || ttsAccentBusy || !els.ttsText.value.trim();
  els.ttsStopBtn.disabled = !ttsRunning;
  els.remoteUrl.disabled = running;
  els.contextText.disabled = running;
  renderSelectedSession();
}

function setRecordingStatus() {
  if (captureMode === "tts") {
    els.ttsRecordStatus.textContent = "запись...";
    setStatus("tts recording", true);
    return;
  }
  setStatus("recording", true);
}

function setLivePartial(text) {
  const value = String(text || "");
  if (captureMode === "tts") {
    els.ttsRecordStatus.textContent = value || (stream ? "запись..." : "готов к диктовке");
  } else {
    els.partialText.textContent = value || "-";
  }
}

function setStatus(text, live) {
  els.statusText.textContent = text;
  els.mark.classList.toggle("isLive", live);
}

function showError(error) {
  setStatus(`error: ${error.message}`, false);
  log("error", { message: error.message });
  stopAudioOnly();
  setRunning(false);
}

function log(event, data = null) {
  const line = data ? `${time()} ${event} ${JSON.stringify(data)}` : `${time()} ${event}`;
  els.eventLog.textContent = `${line}\n${els.eventLog.textContent}`.slice(0, 14000);
}

function compact(msg) {
  if (msg.type === "ready") return { id: msg.id };
  if (msg.type === "result" || msg.type === "final") return { text: msg.text };
  if (msg.type === "stopped") return { bytes: msg.bytes, chunks: msg.chunks };
  return msg;
}

function normalizeKnownAccentTextareas() {
  for (const textarea of [els.ttsText, els.referenceTextEditor]) {
    if (!textarea) continue;
    textarea.value = normalizeKnownAccents(textarea.value);
  }
}

function normalizeKnownAccents(text) {
  return String(text || "").replace(/([Мм])едл\+еннее/g, "$1+едленнее");
}

function firstLine(text) {
  return String(text || "").split(/\n+/)[0]?.trim() || "";
}

function shortId(id) {
  return String(id || "").replace(/^(\d{8}T\d{6}Z)-/, "$1 ");
}

function cacheBust(url) {
  if (!url) return "";
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}

function summarizeProsodyText(text) {
  const source = String(text || "");
  const speech = source
    .replace(/\[\[\s*(pause|speed)\s*:\s*[0-9]+(?:\.[0-9]+)?\s*\]\]/gi, " ")
    .trim();
  if (!speech) return "нет текста";
  const pauseCount = [...source.matchAll(/\[\[\s*pause\s*:/gi)].length;
  const speedCount = [...source.matchAll(/\[\[\s*speed\s*:/gi)].length;
  const parts = [`${speech.split(/\n\s*\n+/).filter(Boolean).length} фрагм.`];
  if (pauseCount) parts.push(`${pauseCount} пауз`);
  if (speedCount) parts.push(`${speedCount} темп`);
  return parts.join(" · ");
}

function numberInputValue(input, fallback) {
  const number = Number(String(input.value || "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "0.0 s";
  return `${(value / 1000).toFixed(1)} s`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleString("ru-RU", { hour12: false });
}

function time() {
  return new Date().toLocaleTimeString("ru-RU", { hour12: false });
}
