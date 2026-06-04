const $ = (id) => document.getElementById(id);

const els = {
  mark: document.querySelector(".mark"),
  statusText: $("statusText"),
  remoteUrl: $("remoteUrl"),
  contextText: $("contextText"),
  startBtn: $("startBtn"),
  commitBtn: $("commitBtn"),
  stopSaveBtn: $("stopSaveBtn"),
  saveBtn: $("saveBtn"),
  sampleRate: $("sampleRate"),
  audioBytes: $("audioBytes"),
  partialText: $("partialText"),
  savedCount: $("savedCount"),
  waveform: $("waveform"),
  transcriptText: $("transcriptText"),
  clearTranscriptBtn: $("clearTranscriptBtn"),
  refreshSavedBtn: $("refreshSavedBtn"),
  savedList: $("savedList"),
  selectedSessionText: $("selectedSessionText"),
  sourceAudio: $("sourceAudio"),
  referenceTextEditor: $("referenceTextEditor"),
  ttsText: $("ttsText"),
  ttsSpeed: $("ttsSpeed"),
  ttsSeed: $("ttsSeed"),
  ttsNfeSteps: $("ttsNfeSteps"),
  ttsCrossFade: $("ttsCrossFade"),
  ttsRemoveSilence: $("ttsRemoveSilence"),
  ttsPlanText: $("ttsPlanText"),
  ttsReferenceInfo: $("ttsReferenceInfo"),
  ttsOutputInfo: $("ttsOutputInfo"),
  ttsServiceInfo: $("ttsServiceInfo"),
  prepareReferenceBtn: $("prepareReferenceBtn"),
  generateTtsBtn: $("generateTtsBtn"),
  referenceAudio: $("referenceAudio"),
  ttsAudio: $("ttsAudio"),
  eventLog: $("eventLog"),
  clearLogBtn: $("clearLogBtn"),
};

const storageKeys = {
  remoteUrl: "voice.whisper.remoteUrl",
  context: "voice.whisper.context",
  ttsText: "voice.whisper.ttsText",
  ttsSpeed: "voice.whisper.ttsSpeed",
  ttsSeed: "voice.whisper.ttsSeed",
  ttsNfeSteps: "voice.whisper.ttsNfeSteps",
  ttsCrossFade: "voice.whisper.ttsCrossFade",
  ttsRemoveSilence: "voice.whisper.ttsRemoveSilence",
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
let ttsBusy = false;
let referenceEditorSessionId = null;

const MAX_QUEUED_PCM_BYTES = 8 * 1024 * 1024;

globalThis.whisperCaptureDebug = {
  receive: handleServerMessage,
  transcript: () => els.transcriptText.value,
  save: saveSession,
  generateTts,
};

init().catch((error) => {
  showError(error);
});

async function init() {
  restoreSettings();
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
  if (!localStorage.getItem(storageKeys.ttsSpeed) && info.tts?.speed) {
    els.ttsSpeed.value = String(info.tts.speed);
  }
  if (!localStorage.getItem(storageKeys.ttsSeed) && Number.isFinite(Number(info.tts?.seed))) {
    els.ttsSeed.value = String(info.tts.seed);
  }
  if (!localStorage.getItem(storageKeys.ttsNfeSteps) && Number.isFinite(Number(info.tts?.nfeSteps))) {
    els.ttsNfeSteps.value = String(info.tts.nfeSteps);
  }
  if (!localStorage.getItem(storageKeys.ttsCrossFade) && Number.isFinite(Number(info.tts?.crossFadeDuration))) {
    els.ttsCrossFade.value = String(info.tts.crossFadeDuration);
  }
  if (!localStorage.getItem(storageKeys.ttsRemoveSilence) && typeof info.tts?.removeSilence === "boolean") {
    els.ttsRemoveSilence.checked = info.tts.removeSilence;
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
  els.startBtn.addEventListener("click", () => start().catch(showError));
  els.commitBtn.addEventListener("click", () => requestCommit().catch(showError));
  els.stopSaveBtn.addEventListener("click", () => stopAndSave().catch(showError));
  els.saveBtn.addEventListener("click", () => saveSession().catch(showError));
  els.remoteUrl.addEventListener("input", saveSettings);
  els.contextText.addEventListener("input", saveSettings);
  els.ttsText.addEventListener("input", () => {
    saveSettings();
    renderTtsPanel();
  });
  els.referenceTextEditor.addEventListener("input", () => renderTtsPanel());
  for (const input of [els.ttsSpeed, els.ttsSeed, els.ttsNfeSteps, els.ttsCrossFade]) {
    input.addEventListener("input", () => {
      saveSettings();
      renderTtsPanel();
    });
  }
  els.ttsRemoveSilence.addEventListener("change", () => {
    saveSettings();
    renderTtsPanel();
  });
  els.clearTranscriptBtn.addEventListener("click", () => {
    finalMessages = [];
    receivedSegments = [];
    partialText = "";
    renderTranscript();
  });
  els.refreshSavedBtn.addEventListener("click", () => refreshSaved().catch(showError));
  els.prepareReferenceBtn.addEventListener("click", () => prepareReference().catch(showError));
  els.generateTtsBtn.addEventListener("click", () => generateTts().catch(showError));
  els.clearLogBtn.addEventListener("click", () => {
    els.eventLog.textContent = "";
  });
}

function restoreSettings() {
  els.remoteUrl.value = localStorage.getItem(storageKeys.remoteUrl) || els.remoteUrl.value;
  els.contextText.value = localStorage.getItem(storageKeys.context) || els.contextText.value;
  els.ttsText.value = localStorage.getItem(storageKeys.ttsText) || els.ttsText.value;
  els.ttsSpeed.value = localStorage.getItem(storageKeys.ttsSpeed) || els.ttsSpeed.value;
  els.ttsSeed.value = localStorage.getItem(storageKeys.ttsSeed) || els.ttsSeed.value;
  els.ttsNfeSteps.value = localStorage.getItem(storageKeys.ttsNfeSteps) || els.ttsNfeSteps.value;
  els.ttsCrossFade.value = localStorage.getItem(storageKeys.ttsCrossFade) || els.ttsCrossFade.value;
  const storedRemoveSilence = localStorage.getItem(storageKeys.ttsRemoveSilence);
  if (storedRemoveSilence !== null) {
    els.ttsRemoveSilence.checked = storedRemoveSilence === "1";
  }
}

function saveSettings() {
  localStorage.setItem(storageKeys.remoteUrl, els.remoteUrl.value.trim());
  localStorage.setItem(storageKeys.context, els.contextText.value.trim());
  localStorage.setItem(storageKeys.ttsText, els.ttsText.value.trim());
  localStorage.setItem(storageKeys.ttsSpeed, els.ttsSpeed.value.trim());
  localStorage.setItem(storageKeys.ttsSeed, els.ttsSeed.value.trim());
  localStorage.setItem(storageKeys.ttsNfeSteps, els.ttsNfeSteps.value.trim());
  localStorage.setItem(storageKeys.ttsCrossFade, els.ttsCrossFade.value.trim());
  localStorage.setItem(storageKeys.ttsRemoveSilence, els.ttsRemoveSilence.checked ? "1" : "0");
}

async function start() {
  if (stream) return;

  saveSettings();
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
  setStatus("recording", true);
  log("audio:start", { sampleRate: audioContext.sampleRate });
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
    els.partialText.textContent = partialText || "-";
    renderTranscript();
    return;
  }

  if (msg.type === "result" || msg.type === "final") {
    partialText = "";
    els.partialText.textContent = "-";
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
    if (stream) setStatus("recording", true);
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
}

async function refreshSaved(preferredSessionId = selectedSessionId) {
  const response = await fetch("/api/whisper/sessions", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `List failed: ${response.status}`);
  }
  savedSessions = data.sessions || [];
  const preferred = savedSessions.find((session) => session.id === preferredSessionId);
  const previous = savedSessions.find((session) => session.id === selectedSessionId);
  selectedSessionId = (preferred || previous || savedSessions[0] || null)?.id ?? null;
  renderSavedSessions(savedSessions);
  renderTtsPanel();
}

function renderSavedSessions(sessions) {
  els.savedList.textContent = "";
  els.savedCount.textContent = String(sessions.length);

  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Нет записей";
    els.savedList.append(empty);
    return;
  }

  for (const session of sessions) {
    const item = document.createElement("article");
    item.className = `item savedItem${session.id === selectedSessionId ? " isSelected" : ""}`;

    const title = document.createElement("strong");
    title.textContent = firstLine(session.transcript) || session.id;

    const meta = document.createElement("span");
    meta.textContent = `${formatDate(session.createdAt)} · ${formatBytes(session.audioBytes || 0)} · ${formatDuration(session.durationMs)}`;

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.src = session.audioUrl;

    const controls = document.createElement("div");
    controls.className = "savedActions";
    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.textContent = session.id === selectedSessionId ? "Используется" : "Использовать";
    selectBtn.disabled = session.id === selectedSessionId;
    selectBtn.addEventListener("click", () => selectSession(session.id));
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "deleteButton";
    deleteBtn.textContent = "Удалить";
    deleteBtn.addEventListener("click", () => deleteSession(session.id).catch(showError));
    controls.append(selectBtn, deleteBtn);

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

    item.append(title, meta, audio, controls, links);
    els.savedList.append(item);
  }
}

function selectSession(id) {
  selectedSessionId = id;
  renderSavedSessions(savedSessions);
  renderTtsPanel();
}

function renderTtsPanel() {
  const session = selectedSession();
  els.selectedSessionText.textContent = session ? shortId(session.id) : "запись не выбрана";

  if (session?.id !== referenceEditorSessionId) {
    els.referenceTextEditor.value = session?.referenceText || session?.transcript || "";
    referenceEditorSessionId = session?.id ?? null;
  }

  els.prepareReferenceBtn.disabled = !session || ttsBusy;
  els.generateTtsBtn.disabled = !session || ttsBusy || !els.ttsText.value.trim() || !els.referenceTextEditor.value.trim();
  renderTtsInfo(session);

  if (session?.audioUrl) {
    els.sourceAudio.src = cacheBust(session.audioUrl);
  } else {
    els.sourceAudio.removeAttribute("src");
  }

  if (session?.referenceUrl) {
    els.referenceAudio.src = cacheBust(session.referenceUrl);
  } else {
    els.referenceAudio.removeAttribute("src");
  }

  if (session?.ttsUrl) {
    els.ttsAudio.src = cacheBust(session.ttsUrl);
    if (session.ttsText && !localStorage.getItem(storageKeys.ttsText)) {
      els.ttsText.value = session.ttsText;
    }
  } else {
    els.ttsAudio.removeAttribute("src");
  }
}

function renderTtsInfo(session) {
  const summary = summarizeProsodyText(els.ttsText.value, Number(els.ttsSpeed.value));
  els.ttsPlanText.textContent = summary.label;

  if (!session) {
    els.ttsReferenceInfo.textContent = "запись не выбрана";
    els.ttsOutputInfo.textContent = "-";
  } else {
    const referenceState = session.referenceUrl ? "готов" : "нужно обновить";
    els.ttsReferenceInfo.textContent = `образец ${referenceState} · ${formatBytes(session.audioBytes || 0)}`;
    els.ttsOutputInfo.textContent = session.ttsUrl
      ? `tts.wav · ${formatBytes(session.ttsAudioBytes || 0)}`
      : "нет";
  }

  const tts = info?.tts;
  els.ttsServiceInfo.textContent = tts?.enabled
    ? `${tts.sshHost || "remote"} · NFE ${Number(els.ttsNfeSteps.value) || tts.nfeSteps || 32}`
    : "выключен";
}

function selectedSession() {
  return savedSessions.find((session) => session.id === selectedSessionId) || null;
}

async function deleteSession(id) {
  const session = savedSessions.find((item) => item.id === id);
  const label = firstLine(session?.transcript) || shortId(id);
  if (!window.confirm(`Удалить образец?\n\n${label}`)) return;

  const response = await fetch(`/api/whisper/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Delete failed: ${response.status}`);
  }
  log("sample:delete", { id });
  if (selectedSessionId === id) selectedSessionId = null;
  await refreshSaved();
}

async function prepareReference() {
  const session = selectedSession();
  if (!session) throw new Error("Сначала выбери запись");

  ttsBusy = true;
  renderTtsPanel();
  setStatus("reference", false);
  try {
    const response = await fetch(`/api/whisper/sessions/${encodeURIComponent(session.id)}/reference`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referenceText: els.referenceTextEditor.value.trim() }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Reference failed: ${response.status}`);
    }
    log("reference:ok", { id: session.id });
    await refreshSaved(session.id);
  } finally {
    ttsBusy = false;
    renderTtsPanel();
  }
}

async function generateTts() {
  const session = selectedSession();
  if (!session) throw new Error("Сначала выбери запись");
  const text = els.ttsText.value.trim();
  if (!text) throw new Error("Нет текста для синтеза");
  const referenceText = els.referenceTextEditor.value.trim();
  if (!referenceText) throw new Error("Нет текста референса");

  saveSettings();
  ttsBusy = true;
  renderTtsPanel();
  setStatus("tts generating", true);
  try {
    const response = await fetch(`/api/whisper/sessions/${encodeURIComponent(session.id)}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        referenceText,
        speed: Number(els.ttsSpeed.value),
        seed: Number(els.ttsSeed.value),
        nfeSteps: Number(els.ttsNfeSteps.value),
        crossFadeDuration: Number(els.ttsCrossFade.value),
        removeSilence: els.ttsRemoveSilence.checked,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `TTS failed: ${response.status}`);
    }
    log("tts:ok", { id: session.id, bytes: data.session?.ttsAudioBytes });
    setStatus("tts ready", false);
    await refreshSaved(session.id);
  } finally {
    ttsBusy = false;
    renderTtsPanel();
  }
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
  els.transcriptText.value = lines.join("\n\n");
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

function summarizeProsodyText(rawText, defaultSpeed) {
  const segments = clientProsodySegments(rawText, defaultSpeed);
  const speechCount = segments.filter((segment) => segment.kind === "speech").length;
  if (!speechCount) return { label: "нет текста" };

  const pauseMs = segments
    .filter((segment) => segment.kind === "pause")
    .reduce((total, segment) => total + segment.ms, 0);
  const speeds = [
    ...new Set(
      segments
        .filter((segment) => segment.kind === "speech")
        .map((segment) => Number(segment.speed).toFixed(2).replace(/\.?0+$/, "")),
    ),
  ];
  const pauseLabel = pauseMs ? `паузы ${formatPauseMs(pauseMs)}` : "без пауз";
  return {
    label: `${speechCount} фрагм. · ${pauseLabel} · ${speeds.join("/")}x`,
  };
}

function clientProsodySegments(rawText, defaultSpeed) {
  const baseSpeed = Number.isFinite(defaultSpeed) && defaultSpeed > 0 ? defaultSpeed : 1;
  const source = String(rawText || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n\s*\n+/g, " [[pause:650]] ")
    .replace(/\n+/g, " ");
  const marker = /\[\[\s*(pause|speed)\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*\]\]/gi;
  const segments = [];
  let currentSpeed = baseSpeed;
  let lastIndex = 0;

  for (const match of source.matchAll(marker)) {
    const markerIndex = match.index ?? 0;
    pushClientSpeechSegment(segments, source.slice(lastIndex, markerIndex), currentSpeed);

    const kind = (match[1] ?? "").toLowerCase();
    const value = Number(match[2] ?? "");
    if (kind === "pause") {
      pushClientPauseSegment(segments, clamp(value, 0, 5000, 650));
    } else if (kind === "speed") {
      currentSpeed = clamp(value, 0.3, 2, currentSpeed);
    }
    lastIndex = markerIndex + match[0].length;
  }

  pushClientSpeechSegment(segments, source.slice(lastIndex), currentSpeed);
  return segments;
}

function pushClientSpeechSegment(segments, text, speed) {
  const cleaned = cleanupTranscriptText(text);
  if (!cleaned) return;
  const previous = segments.at(-1);
  if (previous?.kind === "speech" && previous.speed === speed) {
    previous.text = cleanupTranscriptText(`${previous.text} ${cleaned}`);
    return;
  }
  segments.push({ kind: "speech", text: cleaned, speed });
}

function pushClientPauseSegment(segments, ms) {
  const value = Math.round(ms);
  if (value <= 0) return;
  const previous = segments.at(-1);
  if (previous?.kind === "pause") {
    previous.ms = Math.min(5000, previous.ms + value);
    return;
  }
  segments.push({ kind: "pause", ms: value });
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
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

  context.strokeStyle = "rgba(244, 246, 241, 0.1)";
  context.lineWidth = 1;
  for (let y = 24; y < height; y += 24) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.strokeStyle = "#7db7c6";
  context.lineWidth = 2;
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
  els.partialText.textContent = "-";
  renderTranscript();
}

function setRunning(running) {
  els.startBtn.disabled = running;
  els.commitBtn.disabled = !running;
  els.stopSaveBtn.disabled = !running;
  els.saveBtn.disabled = recordedBytes === 0;
  els.remoteUrl.disabled = running;
  els.contextText.disabled = running;
  renderTtsPanel();
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

function formatPauseMs(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "0 с";
  if (value < 1000) return `${Math.round(value)} мс`;
  return `${(value / 1000).toFixed(1)} с`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleString("ru-RU", { hour12: false });
}

function time() {
  return new Date().toLocaleTimeString("ru-RU", { hour12: false });
}
