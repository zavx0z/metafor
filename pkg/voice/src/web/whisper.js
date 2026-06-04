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
  userCountText: $("userCountText"),
  userList: $("userList"),
  userNameInput: $("userNameInput"),
  addUserBtn: $("addUserBtn"),
  deleteUserBtn: $("deleteUserBtn"),
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
  userId: "voice.whisper.userId",
};

const DEFAULT_USER_ID = "default";

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
let outboundPcmChunks = [];
let outboundPcmBytes = 0;
let outboundFlushTimer = null;
let lastCommitAt = 0;
let lastCommitBytes = 0;
let waiters = [];
let voiceUsers = [];
let selectedUserId = localStorage.getItem(storageKeys.userId) || DEFAULT_USER_ID;
let savedSessions = [];
let selectedSessionId = null;
let referenceEditorSessionId = null;
let transcriptEditorSessionId = null;
let referenceBusy = false;
let sampleBusyStage = "";
let ttsBusy = false;
let ttsAccentBusy = false;
let captureMode = null;
let captureSaved = false;

const MAX_QUEUED_PCM_BYTES = 8 * 1024 * 1024;
const PCM_FLUSH_BYTES = 4096;
const PCM_FLUSH_MS = 120;
const AUTO_COMMIT_MS = 12_000;
const AUTO_COMMIT_MIN_BYTES = 32_000;

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
  resetTtsTextField();
  normalizeKnownAccentTextareas();
  drawWaveform();
  await loadInfo();
  bindEvents();
  await refreshUsers();
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
  els.addUserBtn.addEventListener("click", () => addUser().catch(showError));
  els.deleteUserBtn.addEventListener("click", () => deleteSelectedUser().catch(showError));
  els.userNameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addUser().catch(showError);
  });
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

function resetTtsTextField() {
  els.ttsText.value = "";
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
    els.saveBtn.disabled = recordedBytes === 0 || captureSaved;
    enqueuePcm(chunk);
    maybeAutoCommit();
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
    clearOutboundPcm();
    if (stream) {
      const mode = captureMode;
      stopAudioOnly();
      setRunning(false);
      if (mode === "reference" && recordedBytes > 0 && !captureSaved) {
        els.saveBtn.disabled = false;
        setStatus("asr closed; можно сохранить", false);
      } else if (mode === "tts") {
        els.ttsRecordStatus.textContent = els.ttsText.value.trim()
          ? "соединение закрыто, текст можно править"
          : "соединение закрыто";
        setStatus("asr closed", false);
      } else {
        setStatus("offline", false);
      }
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
    partialText = trimStableTranscriptPrefix(cleanupTranscriptText(msg.text));
    setLivePartial(partialText);
    renderTranscript();
    return;
  }

  if (msg.type === "result" || msg.type === "final") {
    partialText = "";
    setLivePartial("");
    if (Array.isArray(msg.segments)) receivedSegments.push(...msg.segments);
    const messages = transcriptMessagesFrom(msg.text, msg.messages, msg.segments);
    appendFinalMessages(messages);
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

async function requestCommit(options = {}) {
  if (ws?.readyState !== WebSocket.OPEN || commitPending) return;
  flushOutboundPcm();
  commitPending = true;
  lastCommitAt = Date.now();
  lastCommitBytes = recordedBytes;
  send({ type: "commit" });
  if (!options.silent) setStatus("committing", true);
  await waitForServer(["committed", "result", "final", "close"], 1800);
  if (stream && !options.silent) setRecordingStatus();
}

function maybeAutoCommit() {
  if (!stream || ws?.readyState !== WebSocket.OPEN || commitPending) return;
  if (Date.now() - lastCommitAt < AUTO_COMMIT_MS) return;
  if (recordedBytes - lastCommitBytes < AUTO_COMMIT_MIN_BYTES) return;
  void requestCommit({ silent: true }).catch(showError);
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
  clearOutboundPcm();
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

  captureSaved = true;
  setRunning(Boolean(stream));
  setStatus("saved", false);
  log("save:ok", { id: data.session?.id, bytes: data.session?.audioBytes });
  await refreshSaved(data.session?.id);
  if (data.session?.id) {
    await prepareSample(data.session.id, transcript || data.session.transcript || "");
  }
}

async function refreshUsers(preferredUserId = selectedUserId) {
  const response = await fetch("/api/whisper/users", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Users failed: ${response.status}`);
  }
  voiceUsers = data.users || [];
  if (!voiceUsers.length) {
    voiceUsers = [{ id: DEFAULT_USER_ID, name: "Основной" }];
  }
  const preferred = voiceUsers.find((user) => user.id === preferredUserId);
  selectedUserId = (preferred || voiceUsers[0])?.id || DEFAULT_USER_ID;
  localStorage.setItem(storageKeys.userId, selectedUserId);
  renderUsers();
}

async function addUser() {
  const name = els.userNameInput.value.trim();
  if (!name) throw new Error("Введи имя пользователя");

  const response = await fetch("/api/whisper/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Add user failed: ${response.status}`);
  }
  els.userNameInput.value = "";
  voiceUsers = data.users || voiceUsers;
  selectedUserId = data.user?.id || selectedUserId;
  localStorage.setItem(storageKeys.userId, selectedUserId);
  renderUsers();
  renderSavedSessions(readySessions());
  renderSelectedSession();
}

async function deleteSelectedUser() {
  const user = selectedUser();
  if (!user || user.id === DEFAULT_USER_ID) return;
  const readyCount = readySessionsForUser(user.id).length;
  const suffix = readyCount
    ? `\n\n${pluralRu(readyCount, "готовый образец будет перенесен", "готовых образца будут перенесены", "готовых образцов будут перенесены")} в Основной.`
    : "";
  if (!window.confirm(`Удалить пользователя "${user.name}"?${suffix}`)) return;

  const response = await fetch(`/api/whisper/users/${encodeURIComponent(user.id)}`, {
    method: "DELETE",
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Delete user failed: ${response.status}`);
  }
  voiceUsers = data.users || [];
  selectedUserId = DEFAULT_USER_ID;
  localStorage.setItem(storageKeys.userId, selectedUserId);
  selectedSessionId = null;
  await refreshSaved(null);
  renderUsers();
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
  renderUsers();
  renderSelectedSession();
}

function renderUsers() {
  els.userList.textContent = "";
  els.userCountText.textContent = pluralRu(voiceUsers.length, "пользователь", "пользователя", "пользователей");

  for (const user of voiceUsers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "userItem";
    button.classList.toggle("isSelected", user.id === selectedUserId);
    button.addEventListener("click", () => selectUser(user.id));

    const name = document.createElement("strong");
    name.textContent = user.name;

    const count = document.createElement("span");
    count.textContent = pluralRu(readySessionsForUser(user.id).length, "готовый", "готовых", "готовых");

    button.append(name, count);
    els.userList.append(button);
  }

  els.deleteUserBtn.disabled = selectedUserId === DEFAULT_USER_ID || !selectedUser();
}

function selectUser(userId) {
  if (!voiceUsers.some((user) => user.id === userId)) return;
  selectedUserId = userId;
  localStorage.setItem(storageKeys.userId, selectedUserId);
  selectedSessionId = null;
  renderUsers();
  renderSavedSessions(readySessions());
  renderSelectedSession();
}

function renderSavedSessions(sessions) {
  els.savedList.textContent = "";

  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Нет готовых образцов для пользователя";
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

function selectedUser() {
  return voiceUsers.find((user) => user.id === selectedUserId) || null;
}

function readySessions() {
  return readySessionsForUser(selectedUserId);
}

function readySessionsForUser(userId) {
  return savedSessions.filter((session) => isReadySample(session) && sessionUserId(session) === userId);
}

function latestReadySession() {
  return readySessions()[0] || null;
}

function isReadySample(session) {
  return Boolean(session?.readyAt && session?.referenceUrl && session?.referenceText && looksAccented(session.referenceText));
}

function sessionUserId(session) {
  return session?.userId || DEFAULT_USER_ID;
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
  const userName = selectedUser()?.name || "Основной";
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
      ? `${pluralRu(readyCount, "готовый", "готовых", "готовых")} · ${userName}`
      : `${userName}: нет образцов`;
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: selectedUserId }),
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

function enqueuePcm(chunk) {
  if (ws?.readyState !== WebSocket.OPEN) return;
  outboundPcmChunks.push(chunk);
  outboundPcmBytes += chunk.byteLength;
  if (outboundPcmBytes >= PCM_FLUSH_BYTES) {
    flushOutboundPcm();
    return;
  }
  if (outboundFlushTimer === null) {
    outboundFlushTimer = window.setTimeout(flushOutboundPcm, PCM_FLUSH_MS);
  }
}

function flushOutboundPcm() {
  if (outboundFlushTimer !== null) {
    window.clearTimeout(outboundFlushTimer);
    outboundFlushTimer = null;
  }
  if (outboundPcmBytes <= 0) return;

  const payload = new Uint8Array(outboundPcmBytes);
  let offset = 0;
  for (const chunk of outboundPcmChunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  outboundPcmChunks = [];
  outboundPcmBytes = 0;
  sendPcm(payload);
}

function clearOutboundPcm() {
  if (outboundFlushTimer !== null) {
    window.clearTimeout(outboundFlushTimer);
    outboundFlushTimer = null;
  }
  outboundPcmChunks = [];
  outboundPcmBytes = 0;
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
  const text = formatTranscriptText(finalMessages, partialText);
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

function formatTranscriptText(stableChunks, draftText) {
  const stable = stableChunks.join(" ");
  const draft = String(draftText || "");
  return formatTranscriptSentences(cleanupTranscriptText(`${stable} ${draft}`));
}

function formatTranscriptSentences(text) {
  const source = cleanupTranscriptText(text);
  if (!source) return "";

  const lines = [];
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (!isSentenceEnd(char)) continue;

    const next = source[index + 1] || "";
    if (next && !/\s/.test(next)) continue;

    const sentence = source.slice(start, index + 1).trim();
    if (sentence) lines.push(sentence);
    start = index + 1;
    while (start < source.length && /\s/.test(source[start])) start += 1;
    index = start - 1;
  }

  const tail = source.slice(start).trim();
  if (tail) lines.push(tail);
  return lines.join("\n");
}

function isSentenceEnd(char) {
  return char === "." || char === "!" || char === "?" || char === "…";
}

function appendFinalMessages(messages) {
  for (const message of messages) {
    appendFinalMessage(message);
  }
}

function appendFinalMessage(message) {
  const cleaned = cleanupTranscriptText(message);
  if (!cleaned) return;

  const tail = trimStableTranscriptPrefix(cleaned);
  if (!tail) return;

  const last = finalMessages[finalMessages.length - 1] || "";
  const lastKey = normalizeTranscriptForCompare(last);
  const tailKey = normalizeTranscriptForCompare(tail);
  if (!tailKey || tailKey === lastKey) return;
  if (lastKey && lastKey.includes(tailKey)) return;

  finalMessages.push(tail);
}

function transcriptMessagesFrom(text, serverMessages, segments) {
  const cleanText = cleanupTranscriptText(text);
  if (cleanText) return [cleanText];

  const messageText = Array.isArray(serverMessages)
    ? cleanupTranscriptText(serverMessages.join(" "))
    : "";
  if (messageText) return [messageText];

  const segmentText = Array.isArray(segments)
    ? cleanupTranscriptText(segments.map((segment) => segment?.text || "").join(" "))
    : "";
  return segmentText ? [segmentText] : [];
}

function splitBlankLineParagraphs(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map(cleanupTranscriptText)
    .filter(Boolean);
}

function cleanupTranscriptText(text) {
  const cleaned = String(text || "")
    .replace(/(?:^|[\n.!?…]\s*)субтитры[^\n.!?…]*/giu, " ")
    .replace(/(?:^|[\n.!?…]\s*)редактор\s+субтитров[^\n.!?…]*/giu, " ")
    .replace(/(?:^|[\n.!?…]\s*)продолжение\s+следует[^\n.!?…]*/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return isNoiseTranscript(cleaned) ? "" : cleaned;
}

function isNoiseTranscript(text) {
  const normalized = normalizeTranscriptForCompare(text);
  return normalized === "продолжение следует"
    || normalized.includes("dimatorzok")
    || normalized.startsWith("субтитры")
    || normalized.startsWith("редактор субтитров")
    || normalized.startsWith("subtitles");
}

function trimStableTranscriptPrefix(text) {
  const cleaned = cleanupTranscriptText(text);
  if (!cleaned || !finalMessages.length) return cleaned;

  const stableKey = normalizeTranscriptForCompare(finalMessages.join(" "));
  const textKey = normalizeTranscriptForCompare(cleaned);
  if (!textKey || (stableKey && stableKey.includes(textKey))) return "";

  const overlap = stableTranscriptOverlap(cleaned);
  return removeFirstTranscriptWords(cleaned, overlap);
}

function stableTranscriptOverlap(text) {
  const stableTokens = transcriptTokens(finalMessages.join(" "));
  const textTokens = transcriptTokens(text);
  const max = Math.min(80, stableTokens.length, textTokens.length);
  for (let count = max; count > 0; count -= 1) {
    let same = true;
    for (let index = 0; index < count; index += 1) {
      if (stableTokens[stableTokens.length - count + index]?.value !== textTokens[index]?.value) {
        same = false;
        break;
      }
    }
    if (same) return count;
  }
  return 0;
}

function removeFirstTranscriptWords(text, count) {
  if (count <= 0) return text;
  const tokens = transcriptTokens(text);
  if (count >= tokens.length) return "";
  return text.slice(tokens[count].start).replace(/^[\s,.;:!?…—-]+/, "").trim();
}

function normalizeTranscriptForCompare(text) {
  return transcriptTokens(text).map((token) => token.value).join(" ");
}

function transcriptTokens(text) {
  const tokens = [];
  const source = String(text || "");
  const pattern = /[\p{L}\p{N}]+/gu;
  for (const match of source.matchAll(pattern)) {
    const raw = match[0] || "";
    const value = raw
      .toLocaleLowerCase("ru")
      .replace(/ё/g, "е")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "");
    if (!value) continue;
    tokens.push({
      value,
      start: match.index || 0,
      end: (match.index || 0) + raw.length,
    });
  }
  return tokens;
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
  clearOutboundPcm();
  lastCommitAt = Date.now();
  lastCommitBytes = 0;
  captureSaved = false;
  els.audioBytes.textContent = "0 KB";
  setLivePartial("");
  renderTranscript();
}

function setRunning(running) {
  const referenceRunning = running && captureMode === "reference";
  const ttsRunning = running && captureMode === "tts";
  const canSaveReference = recordedBytes > 0 && !captureSaved && (referenceRunning || (!running && !stream));
  els.startBtn.disabled = running || ttsAccentBusy;
  els.stopSaveBtn.disabled = !referenceRunning;
  els.saveBtn.disabled = !canSaveReference;
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

function pluralRu(count, one, few, many) {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? one
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? few
      : many;
  return `${count} ${word}`;
}

function time() {
  return new Date().toLocaleTimeString("ru-RU", { hour12: false });
}
