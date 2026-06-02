const $ = (id) => document.getElementById(id);

const els = {
  mark: document.querySelector(".mark"),
  statusText: $("statusText"),
  engineSelect: $("engineSelect"),
  remoteUrl: $("remoteUrl"),
  contextText: $("contextText"),
  grammarToggle: $("grammarToggle"),
  startBtn: $("startBtn"),
  stopBtn: $("stopBtn"),
  resetBtn: $("resetBtn"),
  sampleRate: $("sampleRate"),
  pcmBytes: $("pcmBytes"),
  partialText: $("partialText"),
  waveform: $("waveform"),
  transcriptList: $("transcriptList"),
  commandList: $("commandList"),
  commandCount: $("commandCount"),
  eventLog: $("eventLog"),
  clearTranscriptBtn: $("clearTranscriptBtn"),
  clearLogBtn: $("clearLogBtn"),
};

let ws = null;
let stream = null;
let audioContext = null;
let sourceNode = null;
let captureNode = null;
let sinkNode = null;
let workletUrl = null;
let info = null;
let pcmBytes = 0;
let commandCount = 0;
let latestWaveform = new Float32Array(0);
let drawQueued = false;
let commitPending = false;
let hasSpeechSinceCommit = false;
let lastSpeechAt = 0;
let lastCommitAt = 0;
let pcmSinceCommitBytes = 0;
let queuedPcmAfterCommit = [];

const VOICE_RMS_THRESHOLD = 0.012;
const SILENCE_COMMIT_MS = 1200;
const MIN_COMMIT_AUDIO_MS = 900;
const MIN_COMMIT_INTERVAL_MS = 1800;
const MAX_QUEUED_PCM_BYTES = 8 * 1024 * 1024;

const storageKeys = {
  engine: "voice.playground.engine",
  remoteUrl: "voice.playground.remoteUrl",
  context: "voice.playground.context",
};

globalThis.voicePlaygroundDebug = {
  receive: handleServerMessage,
  transcript: () => [...els.transcriptList.children].map((item) => item.innerText),
};

init().catch((error) => {
  setStatus(`error: ${error.message}`, false);
  log("init:error", { message: error.message });
});

async function init() {
  restoreSettings();
  drawWaveform();
  await loadInfo();
  bindEvents();
  renderEmptyStates();
}

async function loadInfo() {
  const response = await fetch("/api/info", { cache: "no-store" });
  info = await response.json();
  els.sampleRate.textContent = String(info.defaultSampleRate ?? 16000);
  setStatus("ready", false);
  log("server:ready", {
    sampleRate: info.defaultSampleRate,
    grammar: info.grammar,
    phrases: info.phrases?.length ?? 0,
  });
}

function bindEvents() {
  els.startBtn.addEventListener("click", () => start().catch(showError));
  els.stopBtn.addEventListener("click", () => stop());
  els.resetBtn.addEventListener("click", () => send({ type: "reset" }));
  els.engineSelect.addEventListener("change", saveSettings);
  els.remoteUrl.addEventListener("input", saveSettings);
  els.contextText.addEventListener("input", saveSettings);
  els.clearTranscriptBtn.addEventListener("click", () => {
    els.transcriptList.textContent = "";
    renderEmptyStates();
  });
  els.clearLogBtn.addEventListener("click", () => {
    els.eventLog.textContent = "";
  });
}

function restoreSettings() {
  els.engineSelect.value = localStorage.getItem(storageKeys.engine) || "remote";
  els.remoteUrl.value = localStorage.getItem(storageKeys.remoteUrl) || els.remoteUrl.value;
  els.contextText.value = localStorage.getItem(storageKeys.context) || els.contextText.value;
}

function saveSettings() {
  localStorage.setItem(storageKeys.engine, els.engineSelect.value);
  localStorage.setItem(storageKeys.remoteUrl, els.remoteUrl.value.trim());
  localStorage.setItem(storageKeys.context, els.contextText.value.trim());
}

async function start() {
  if (stream) return;

  pcmBytes = 0;
  resetCommitState();
  els.pcmBytes.textContent = "0 KB";
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

  captureNode.port.onmessage = (event) => {
    const samples = event.data;
    if (!(samples instanceof Float32Array)) return;
    latestWaveform = samples;
    scheduleWaveformDraw();
    const pcm = floatToPcm16(samples);
    pcmBytes += pcm.byteLength;
    pcmSinceCommitBytes += pcm.byteLength;
    els.pcmBytes.textContent = formatBytes(pcmBytes);
    trackSpeechAndMaybeCommit(samples);
    sendPcm(pcm);
  };

  sourceNode.connect(captureNode);
  captureNode.connect(sinkNode);
  sinkNode.connect(audioContext.destination);
  send({
    type: "start",
    sampleRate: audioContext.sampleRate,
    useGrammar: els.grammarToggle.checked,
    language: "ru",
    format: false,
    context: els.contextText.value.trim(),
    prompt: els.contextText.value.trim(),
  });

  els.sampleRate.textContent = String(audioContext.sampleRate);
  setRunning(true);
  setStatus("listening", true);
  log("audio:start", { sampleRate: audioContext.sampleRate });
}

async function connectWs() {
  if (ws?.readyState === WebSocket.OPEN) return;

  const url = recognitionSocketUrl();
  ws = new WebSocket(url);
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
    log("ws:close", { code: event.code, reason: event.reason });
    stopAudioOnly();
    setStatus("offline", false);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("WebSocket failed")), {
      once: true,
    });
  });
}

function recognitionSocketUrl() {
  if (els.engineSelect.value === "remote") return els.remoteUrl.value.trim();
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

function handleServerMessage(msg) {
  if (msg.type !== "partial") log(`rx:${msg.type}`, compact(msg));

  if (msg.type === "ready") {
    if (!stream) setStatus("connected", false);
    return;
  }

  if (msg.type === "started") {
    els.sampleRate.textContent = String(msg.sampleRate);
    return;
  }

  if (msg.type === "partial") {
    els.partialText.textContent = msg.text || "-";
    return;
  }

  if (msg.type === "result" || msg.type === "final") {
    els.partialText.textContent = "-";
    if (msg.text) {
      const messages = transcriptMessagesFrom(msg.text, msg.messages, msg.segments);
      addTranscriptMessages(msg.type, messages);
      if (els.engineSelect.value === "remote") {
        for (const message of messages) void matchCommand(message);
      }
    }
    return;
  }

  if (msg.type === "committed") {
    commitPending = false;
    if (stream) {
      flushQueuedPcm();
      setStatus("listening", true);
    }
    return;
  }

  if (msg.type === "command") {
    addCommand(msg.match);
    return;
  }

  if (msg.type === "stopped") {
    setRunning(false);
    setStatus("ready", false);
    return;
  }

  if (msg.type === "error") {
    showError(new Error(msg.error || "Unknown server error"));
  }
}

async function matchCommand(text) {
  const response = await fetch("/api/match", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await response.json();
  if (data.match) addCommand(data.match);
}

function stop() {
  if (ws?.readyState === WebSocket.OPEN) send({ type: "stop" });
  stopAudioOnly();
  setRunning(false);
  setStatus("ready", false);
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
  resetCommitState();
}

function trackSpeechAndMaybeCommit(samples) {
  if (els.engineSelect.value !== "remote" || !stream) return;

  const now = performance.now();
  const rms = rmsLevel(samples);
  if (rms >= VOICE_RMS_THRESHOLD) {
    hasSpeechSinceCommit = true;
    lastSpeechAt = now;
  }

  const minCommitBytes = Math.round((audioContext?.sampleRate ?? 16000) * 2 * (MIN_COMMIT_AUDIO_MS / 1000));
  const shouldCommit =
    hasSpeechSinceCommit &&
    !commitPending &&
    ws?.readyState === WebSocket.OPEN &&
    pcmSinceCommitBytes >= minCommitBytes &&
    now - lastSpeechAt >= SILENCE_COMMIT_MS &&
    now - lastCommitAt >= MIN_COMMIT_INTERVAL_MS;

  if (!shouldCommit) return;

  commitPending = true;
  hasSpeechSinceCommit = false;
  lastCommitAt = now;
  pcmSinceCommitBytes = 0;
  send({ type: "commit" });
  setStatus("committing", true);
}

function rmsLevel(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
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

function resetCommitState() {
  commitPending = false;
  hasSpeechSinceCommit = false;
  lastSpeechAt = performance.now();
  lastCommitAt = 0;
  pcmSinceCommitBytes = 0;
  queuedPcmAfterCommit = [];
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

function addTranscript(kind, text) {
  removeEmpty(els.transcriptList);
  const item = document.createElement("article");
  item.className = "item";
  item.innerHTML = "<strong></strong><span></span>";
  item.querySelector("strong").textContent = text;
  item.querySelector("span").textContent = `${time()} · ${kind}`;
  els.transcriptList.append(item);
  item.scrollIntoView({ block: "nearest" });
}

function addTranscriptMessages(kind, messages) {
  const cleaned = messages.map((message) => message.trim()).filter(Boolean);
  for (const message of cleaned) {
    addTranscript(kind, message);
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

function addCommand(match) {
  if (!match) return;
  removeEmpty(els.commandList);
  commandCount += 1;
  els.commandCount.textContent = String(commandCount);

  const item = document.createElement("article");
  item.className = "item command";
  item.innerHTML = "<strong></strong><span></span>";
  item.querySelector("strong").textContent = match.id;
  item.querySelector("span").textContent =
    `${match.phrase} · ${match.kind} · ${match.normalizedText}`;
  els.commandList.prepend(item);
}

function renderEmptyStates() {
  if (!els.transcriptList.children.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Нет фраз";
    els.transcriptList.append(empty);
  }
  if (!els.commandList.children.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Нет команд";
    els.commandList.append(empty);
  }
}

function removeEmpty(parent) {
  for (const child of [...parent.querySelectorAll(".empty")]) child.remove();
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

function setRunning(running) {
  els.startBtn.disabled = running;
  els.stopBtn.disabled = !running;
  els.resetBtn.disabled = !ws || ws.readyState !== WebSocket.OPEN;
  els.grammarToggle.disabled = running;
  els.engineSelect.disabled = running;
  els.remoteUrl.disabled = running;
  els.contextText.disabled = running;
}

function setStatus(text, live) {
  els.statusText.textContent = text;
  els.mark.classList.toggle("isLive", live);
}

function send(payload) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function log(event, data = null) {
  const line = data ? `${time()} ${event} ${JSON.stringify(data)}` : `${time()} ${event}`;
  els.eventLog.textContent = `${line}\n${els.eventLog.textContent}`.slice(0, 14000);
}

function compact(msg) {
  if (msg.type === "ready") return { id: msg.id };
  if (msg.type === "command") return msg.match;
  if (msg.type === "result" || msg.type === "final") return { text: msg.text };
  if (msg.type === "stopped") return { bytes: msg.bytes, chunks: msg.chunks };
  return msg;
}

function showError(error) {
  setStatus(`error: ${error.message}`, false);
  log("error", { message: error.message });
  stopAudioOnly();
  setRunning(false);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function time() {
  return new Date().toLocaleTimeString("ru-RU", { hour12: false });
}
