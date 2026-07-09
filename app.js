const TEAM_LABELS = {
  affirm: "正方",
  negative: "反方",
};

const BASE_ROUNDS = [
  makeSpeech("aff-1", "affirm", "一辩", "立论", 180),
  makeSpeech("neg-1", "negative", "一辩", "立论", 180),
  makeClash("clash-1", "一辩"),
  makeSpeech("aff-2", "affirm", "二辩", "陈词", 240),
  makeSpeech("neg-2", "negative", "二辩", "陈词", 240),
  makeClash("clash-2", "二辩"),
  makeSpeech("aff-3", "affirm", "三辩", "陈词", 240),
  makeSpeech("neg-3", "negative", "三辩", "陈词", 240),
  makeClash("clash-3", "三辩"),
  makeSpeech("aff-4", "affirm", "四辩", "结辩", 240),
  makeSpeech("neg-4", "negative", "四辩", "结辩", 240),
];

const state = {
  rounds: BASE_ROUNDS.map(cloneRound),
  currentIndex: 0,
  remainingMs: 0,
  clashRemainingMs: {
    affirm: 0,
    negative: 0,
  },
  clashActiveTeam: "affirm",
  running: false,
  lastTick: 0,
  timerId: 0,
  voteStream: null,
  surpriseUsed: {
    affirm: false,
    negative: false,
  },
};

const els = {
  currentTeam: document.querySelector("#currentTeam"),
  currentPhase: document.querySelector("#currentPhase"),
  currentTitle: document.querySelector("#currentTitle"),
  currentSpeaker: document.querySelector("#currentSpeaker"),
  timerReadout: document.querySelector("#timerReadout"),
  progressFill: document.querySelector("#progressFill"),
  clashBoard: document.querySelector("#clashBoard"),
  affirmClashCard: document.querySelector("#affirmClashCard"),
  negativeClashCard: document.querySelector("#negativeClashCard"),
  affirmClashTime: document.querySelector("#affirmClashTime"),
  negativeClashTime: document.querySelector("#negativeClashTime"),
  startBtn: document.querySelector("#startBtn"),
  pauseBtn: document.querySelector("#pauseBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  finishBtn: document.querySelector("#finishBtn"),
  switchClashBtn: document.querySelector("#switchClashBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  restartMatchBtn: document.querySelector("#restartMatchBtn"),
  affirmSurpriseBtn: document.querySelector("#affirmSurpriseBtn"),
  negativeSurpriseBtn: document.querySelector("#negativeSurpriseBtn"),
  timeline: document.querySelector("#timeline"),
  matchStatus: document.querySelector("#matchStatus"),
  affirmVotes1: document.querySelector("#affirmVotes1"),
  negativeVotes1: document.querySelector("#negativeVotes1"),
  margin1: document.querySelector("#margin1"),
  totalMargin: document.querySelector("#totalMargin"),
  winnerText: document.querySelector("#winnerText"),
  resultBox: document.querySelector(".result-box"),
  liveStatus: document.querySelector("#liveStatus"),
  voteLink: document.querySelector("#voteLink"),
  refreshVotesBtn: document.querySelector("#refreshVotesBtn"),
  resetLiveVotesBtn: document.querySelector("#resetLiveVotesBtn"),
  stageCanvas: document.querySelector("#stageCanvas"),
};

function makeSpeech(id, team, speaker, phase, seconds) {
  return {
    id,
    type: "speech",
    team,
    teamLabel: TEAM_LABELS[team],
    speaker,
    phase,
    seconds,
    title: `${TEAM_LABELS[team]}${speaker}${phase}`,
  };
}

function makeClash(id, speaker) {
  return {
    id,
    type: "clash",
    team: "affirm",
    teamLabel: "双方",
    speaker,
    phase: "开杠",
    secondsPerSide: 120,
    title: `${speaker}开杠`,
  };
}

function makeSurprise(team) {
  return {
    id: `${team}-surprise-${Date.now()}`,
    type: "surprise",
    team,
    teamLabel: TEAM_LABELS[team],
    speaker: "四辩",
    phase: "奇袭",
    seconds: 60,
    title: `${TEAM_LABELS[team]}四辩奇袭卡`,
  };
}

function cloneRound(round) {
  return { ...round };
}

function getCurrentRound() {
  return state.rounds[state.currentIndex] || null;
}

function isClash(round = getCurrentRound()) {
  return round?.type === "clash";
}

function getOtherTeam(team) {
  return team === "affirm" ? "negative" : "affirm";
}

function loadCurrentRound() {
  const round = getCurrentRound();
  if (!round) {
    state.remainingMs = 0;
    state.clashRemainingMs = { affirm: 0, negative: 0 };
    return;
  }

  if (isClash(round)) {
    const ms = round.secondsPerSide * 1000;
    state.clashRemainingMs = { affirm: ms, negative: ms };
    state.clashActiveTeam = "affirm";
    state.remainingMs = ms;
    return;
  }

  state.remainingMs = round.seconds * 1000;
  state.clashRemainingMs = { affirm: 0, negative: 0 };
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatShort(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function getActiveRemainingMs() {
  const round = getCurrentRound();
  if (!round) return 0;
  if (isClash(round)) return state.clashRemainingMs[state.clashActiveTeam];
  return state.remainingMs;
}

function getTotalProgress() {
  const round = getCurrentRound();
  if (!round) return 0;

  if (isClash(round)) {
    const initial = round.secondsPerSide * 2 * 1000;
    const remaining = state.clashRemainingMs.affirm + state.clashRemainingMs.negative;
    return Math.max(0, Math.min(1, remaining / initial));
  }

  return Math.max(0, Math.min(1, state.remainingMs / (round.seconds * 1000)));
}

function isCurrentRoundComplete() {
  const round = getCurrentRound();
  if (!round) return true;
  if (isClash(round)) {
    return state.clashRemainingMs.affirm === 0 && state.clashRemainingMs.negative === 0;
  }
  return state.remainingMs === 0;
}

function render() {
  const round = getCurrentRound();

  if (!round) {
    stopTimer();
    els.clashBoard.hidden = true;
    els.currentTeam.textContent = "完赛";
    els.currentTeam.className = "team-pill neutral";
    els.currentPhase.textContent = "投票";
    els.currentTitle.textContent = "比赛结束";
    els.currentSpeaker.textContent = "观众投票";
    els.timerReadout.textContent = "00:00";
    els.timerReadout.className = "timer-readout done";
    els.progressFill.style.width = "0%";
    els.matchStatus.textContent = "比赛结束 · 计算观众投票";
    els.startBtn.disabled = true;
    els.pauseBtn.disabled = true;
    els.resetBtn.disabled = true;
    els.finishBtn.disabled = true;
    els.switchClashBtn.disabled = true;
    els.nextBtn.disabled = true;
    renderTimeline();
    updateSurpriseButtons();
    return;
  }

  if (isClash(round)) {
    renderClash(round);
  } else {
    renderSpeech(round);
  }

  const complete = isCurrentRoundComplete();
  els.progressFill.style.width = `${getTotalProgress() * 100}%`;
  els.matchStatus.textContent = `${state.currentIndex + 1} / ${state.rounds.length}`;
  els.startBtn.disabled = state.running || complete;
  els.pauseBtn.disabled = !state.running;
  els.resetBtn.disabled = false;
  els.finishBtn.disabled = complete;
  els.finishBtn.textContent = isClash(round) ? "结束开杠" : "结束发言";
  els.switchClashBtn.disabled = !isClash(round) || complete;
  els.nextBtn.disabled = state.running || !complete;
  renderTimeline();
  updateSurpriseButtons();
  drawStage(round);
}

function renderSpeech(round) {
  els.clashBoard.hidden = true;
  els.currentTeam.textContent = round.teamLabel;
  els.currentTeam.className = `team-pill ${round.team}`;
  els.currentPhase.textContent = round.phase;
  els.currentTitle.textContent = round.title;
  els.currentSpeaker.textContent = `${round.speaker} · ${Math.floor(round.seconds / 60)} 分钟`;
  renderReadout(state.remainingMs);
}

function renderClash(round) {
  const activeTeam = state.clashActiveTeam;
  const activeLabel = TEAM_LABELS[activeTeam];
  els.clashBoard.hidden = false;
  els.currentTeam.textContent = activeLabel;
  els.currentTeam.className = `team-pill ${activeTeam}`;
  els.currentPhase.textContent = round.phase;
  els.currentTitle.textContent = round.title;
  els.currentSpeaker.textContent = `${round.speaker} · ${activeLabel}发言中 · 双方各 2 分钟`;
  els.affirmClashTime.textContent = formatTime(state.clashRemainingMs.affirm);
  els.negativeClashTime.textContent = formatTime(state.clashRemainingMs.negative);
  els.affirmClashCard.classList.toggle("active", activeTeam === "affirm");
  els.negativeClashCard.classList.toggle("active", activeTeam === "negative");
  renderReadout(state.clashRemainingMs[activeTeam]);
}

function renderReadout(ms) {
  els.timerReadout.textContent = formatTime(ms);
  els.timerReadout.className = "timer-readout";
  if (ms === 0) {
    els.timerReadout.classList.add("done");
  } else if (ms <= 30 * 1000) {
    els.timerReadout.classList.add("warning");
  }
}

function renderTimeline() {
  els.timeline.innerHTML = "";
  state.rounds.forEach((round, index) => {
    const item = document.createElement("li");
    item.className = "timeline-item";
    if (index === state.currentIndex) item.classList.add("active");
    if (index < state.currentIndex) item.classList.add("done");

    const number = document.createElement("span");
    number.className = "timeline-number";
    number.textContent = index + 1;

    const textWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "timeline-title";
    title.textContent = round.title;
    const sub = document.createElement("div");
    sub.className = "timeline-sub";
    sub.textContent = isClash(round)
      ? `${round.speaker} · 双方各 ${formatShort(round.secondsPerSide)}`
      : `${round.speaker} · ${round.phase}`;
    textWrap.append(title, sub);

    const time = document.createElement("div");
    time.className = "timeline-time";
    time.textContent = isClash(round) ? `${formatShort(round.secondsPerSide)}/方` : formatShort(round.seconds);

    item.append(number, textWrap, time);
    els.timeline.appendChild(item);
  });
}

function updateSurpriseButtons() {
  const round = getCurrentRound();
  const canUse = Boolean(round) && !state.running && isCurrentRoundComplete() && round.type !== "surprise";
  els.affirmSurpriseBtn.disabled = !canUse || state.surpriseUsed.affirm;
  els.negativeSurpriseBtn.disabled = !canUse || state.surpriseUsed.negative;
  els.affirmSurpriseBtn.querySelector("span").textContent = state.surpriseUsed.affirm ? "已用" : "1:00";
  els.negativeSurpriseBtn.querySelector("span").textContent = state.surpriseUsed.negative ? "已用" : "1:00";
}

function startTimer() {
  const round = getCurrentRound();
  if (state.running || isCurrentRoundComplete() || !round) return;
  if (isClash(round) && state.clashRemainingMs[state.clashActiveTeam] === 0) {
    state.clashActiveTeam = state.clashRemainingMs.affirm > 0 ? "affirm" : "negative";
  }
  state.running = true;
  state.lastTick = performance.now();
  state.timerId = window.setInterval(tick, 200);
  render();
}

function stopTimer() {
  state.running = false;
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = 0;
  }
}

function pauseTimer() {
  stopTimer();
  render();
}

function tick() {
  const now = performance.now();
  const elapsed = now - state.lastTick;
  state.lastTick = now;
  consumeElapsed(elapsed);
  render();
}

function consumeElapsed(elapsed) {
  const round = getCurrentRound();
  if (!round) {
    stopTimer();
    return;
  }

  if (isClash(round)) {
    const activeTeam = state.clashActiveTeam;
    const nextValue = Math.max(0, state.clashRemainingMs[activeTeam] - elapsed);
    state.clashRemainingMs[activeTeam] = nextValue;

    if (nextValue === 0) {
      const otherTeam = getOtherTeam(activeTeam);
      playFinishTone();
      if (state.clashRemainingMs[otherTeam] > 0) {
        state.clashActiveTeam = otherTeam;
      } else {
        stopTimer();
      }
    }
    return;
  }

  state.remainingMs = Math.max(0, state.remainingMs - elapsed);
  if (state.remainingMs === 0) {
    stopTimer();
    playFinishTone();
  }
}

function resetCurrentRound() {
  stopTimer();
  loadCurrentRound();
  render();
}

function finishCurrentRound() {
  const round = getCurrentRound();
  if (!round || isCurrentRoundComplete()) return;
  stopTimer();
  if (isClash(round)) {
    state.clashRemainingMs = { affirm: 0, negative: 0 };
  } else {
    state.remainingMs = 0;
  }
  playFinishTone();
  render();
}

function switchClashSide() {
  const round = getCurrentRound();
  if (!isClash(round) || isCurrentRoundComplete()) return;

  if (state.running) {
    const now = performance.now();
    consumeElapsed(now - state.lastTick);
    state.lastTick = now;
  }

  const otherTeam = getOtherTeam(state.clashActiveTeam);
  if (state.clashRemainingMs[otherTeam] > 0) {
    state.clashActiveTeam = otherTeam;
  }
  render();
}

function goNext() {
  if (state.running || !isCurrentRoundComplete()) return;
  if (state.currentIndex < state.rounds.length) {
    state.currentIndex += 1;
  }
  loadCurrentRound();
  render();
}

function restartMatch() {
  stopTimer();
  state.rounds = BASE_ROUNDS.map(cloneRound);
  state.currentIndex = 0;
  state.surpriseUsed = {
    affirm: false,
    negative: false,
  };
  loadCurrentRound();
  render();
}

function activateSurprise(team) {
  if (state.surpriseUsed[team] || state.running || !isCurrentRoundComplete()) return;
  state.rounds.splice(state.currentIndex + 1, 0, makeSurprise(team));
  state.surpriseUsed[team] = true;
  goNext();
}

function readVote(input) {
  const value = Number.parseInt(input.value, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function updateVotes() {
  const margin = readVote(els.affirmVotes1) - readVote(els.negativeVotes1);
  els.margin1.textContent = signed(margin);
  els.totalMargin.textContent = signed(margin);

  els.resultBox.classList.remove("negative", "tie");
  if (margin > 0) {
    els.winnerText.textContent = "正方胜";
  } else if (margin < 0) {
    els.winnerText.textContent = "反方胜";
    els.resultBox.classList.add("negative");
  } else {
    els.winnerText.textContent = "平局";
    els.resultBox.classList.add("tie");
  }
}

function applyLiveVotes(votes) {
  if (!votes) return;
  els.affirmVotes1.value = votes.affirm ?? 0;
  els.negativeVotes1.value = votes.negative ?? 0;
  updateVotes();
}

function setLiveStatus(text, mode = "") {
  els.liveStatus.textContent = text;
  els.liveStatus.classList.remove("connected", "error");
  if (mode) els.liveStatus.classList.add(mode);
}

async function refreshVotesFromServer() {
  try {
    const response = await fetch("/api/votes", { cache: "no-store" });
    if (!response.ok) throw new Error("vote endpoint unavailable");
    const votes = await response.json();
    applyLiveVotes(votes);
    setLiveStatus("实时票数已连接", "connected");
  } catch {
    setLiveStatus("未连接服务器", "error");
  }
}

async function resetServerVotes() {
  try {
    const response = await fetch("/api/reset", { method: "POST" });
    if (!response.ok) throw new Error("reset failed");
    const votes = await response.json();
    applyLiveVotes(votes);
    setLiveStatus("服务器票数已清空", "connected");
  } catch {
    setLiveStatus("清空失败", "error");
  }
}

function initLiveVoting() {
  const voteUrl = `${window.location.origin}/vote.html`;
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    els.voteLink.href = voteUrl;
    els.voteLink.textContent = voteUrl;
  }

  if (!window.EventSource || window.location.protocol === "file:") {
    setLiveStatus("手动计票");
    return;
  }

  refreshVotesFromServer();
  state.voteStream = new EventSource("/api/votes/stream");
  state.voteStream.onopen = () => setLiveStatus("实时票数已连接", "connected");
  state.voteStream.onmessage = (event) => {
    applyLiveVotes(JSON.parse(event.data));
    setLiveStatus("实时票数已连接", "connected");
  };
  state.voteStream.onerror = () => setLiveStatus("等待投票服务器", "error");
}

function drawStage(round = getCurrentRound()) {
  const canvas = els.stageCanvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const activeTeam = isClash(round) ? state.clashActiveTeam : round?.team;
  const bg = ctx.createLinearGradient(0, 0, rect.width, rect.height);
  bg.addColorStop(0, "#223844");
  bg.addColorStop(0.55, "#314b5f");
  bg.addColorStop(1, "#6f2530");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#f7f2df";
  for (let i = 0; i < 8; i += 1) {
    const x = (rect.width / 7) * i;
    ctx.beginPath();
    ctx.ellipse(x, 34, 52, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawPodium(ctx, rect.width * 0.2, rect.height * 0.66, "#0f766e", activeTeam === "affirm");
  drawPodium(ctx, rect.width * 0.8, rect.height * 0.66, "#b4232c", activeTeam === "negative");

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.beginPath();
  ctx.ellipse(rect.width * 0.5, rect.height * 0.78, rect.width * 0.22, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e0a331";
  ctx.fillRect(rect.width * 0.48, rect.height * 0.28, rect.width * 0.04, rect.height * 0.42);
  ctx.beginPath();
  ctx.arc(rect.width * 0.5, rect.height * 0.25, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "700 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("一寸欢喜深圳辩论队", rect.width * 0.5, rect.height - 18);
  ctx.restore();
}

function drawPodium(ctx, x, y, color, active) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = active ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.ellipse(0, 46, 76, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-44, -14, 88, 72, 8);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.beginPath();
  ctx.roundRect(-28, 4, 56, 12, 6);
  ctx.fill();

  ctx.fillStyle = "#f3ddbd";
  ctx.beginPath();
  ctx.arc(0, -42, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#19272e";
  ctx.beginPath();
  ctx.arc(-8, -50, 16, 0, Math.PI * 2);
  ctx.arc(8, -50, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function playFinishTone() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.42);
}

els.startBtn.addEventListener("click", startTimer);
els.pauseBtn.addEventListener("click", pauseTimer);
els.resetBtn.addEventListener("click", resetCurrentRound);
els.finishBtn.addEventListener("click", finishCurrentRound);
els.switchClashBtn.addEventListener("click", switchClashSide);
els.nextBtn.addEventListener("click", goNext);
els.restartMatchBtn.addEventListener("click", restartMatch);
els.affirmSurpriseBtn.addEventListener("click", () => activateSurprise("affirm"));
els.negativeSurpriseBtn.addEventListener("click", () => activateSurprise("negative"));
els.affirmVotes1.addEventListener("input", updateVotes);
els.negativeVotes1.addEventListener("input", updateVotes);
els.refreshVotesBtn.addEventListener("click", refreshVotesFromServer);
els.resetLiveVotesBtn.addEventListener("click", resetServerVotes);
window.addEventListener("resize", () => drawStage());

loadCurrentRound();
render();
updateVotes();
initLiveVoting();
