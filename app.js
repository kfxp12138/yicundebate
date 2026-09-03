const TEAM_LABELS = {
  affirm: "正方",
  negative: "反方",
};

const BASE_ROUNDS = [
  makeSpeech("aff-1-speech", "affirm", "一辩", "陈词", 180),
  makeSpeech("neg-2-question", "negative", "二辩", "质询", 90),
  makeSpeech("neg-1-speech", "negative", "一辩", "陈词", 180),
  makeSpeech("aff-2-question", "affirm", "二辩", "质询", 90),
  makeSpeech("neg-2-speech", "negative", "二辩", "陈词", 90),
  makeSpeech("aff-2-speech", "affirm", "二辩", "陈词", 90),
  makeFreeDebate(),
  makeSpeech("neg-3-close", "negative", "三辩", "结辩", 180),
  makeSpeech("aff-3-close", "affirm", "三辩", "结辩", 180),
];

const state = {
  rounds: BASE_ROUNDS.map(cloneRound),
  currentIndex: 0,
  remainingMs: 0,
  freeDebateRemainingMs: {
    affirm: 0,
    negative: 0,
  },
  freeDebateActiveTeam: "affirm",
  running: false,
  lastTick: 0,
  timerId: 0,
  voteStream: null,
  currentVoteDetail: {
    affirm: 0,
    negative: 0,
    voters: [],
  },
  voteSnapshots: [],
  finalResultVisible: false,
  warningKeys: new Set(),
  warningTimeoutId: 0,
};

const els = {
  currentTeam: document.querySelector("#currentTeam"),
  currentPhase: document.querySelector("#currentPhase"),
  currentTitle: document.querySelector("#currentTitle"),
  currentSpeaker: document.querySelector("#currentSpeaker"),
  timerReadout: document.querySelector("#timerReadout"),
  progressFill: document.querySelector("#progressFill"),
  debateBoard: document.querySelector("#debateBoard"),
  affirmDebateCard: document.querySelector("#affirmDebateCard"),
  negativeDebateCard: document.querySelector("#negativeDebateCard"),
  affirmDebateTime: document.querySelector("#affirmDebateTime"),
  negativeDebateTime: document.querySelector("#negativeDebateTime"),
  startBtn: document.querySelector("#startBtn"),
  pauseBtn: document.querySelector("#pauseBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  finishBtn: document.querySelector("#finishBtn"),
  switchSideBtn: document.querySelector("#switchSideBtn"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  restartMatchBtn: document.querySelector("#restartMatchBtn"),
  timeline: document.querySelector("#timeline"),
  matchStatus: document.querySelector("#matchStatus"),
  affirmVotes1: document.querySelector("#affirmVotes1"),
  negativeVotes1: document.querySelector("#negativeVotes1"),
  margin1: document.querySelector("#margin1"),
  totalMargin: document.querySelector("#totalMargin"),
  winnerText: document.querySelector("#winnerText"),
  resultBox: document.querySelector(".result-box"),
  recordInitialBtn: document.querySelector("#recordInitialBtn"),
  recordStageBtn: document.querySelector("#recordStageBtn"),
  initialTotalVotes: document.querySelector("#initialTotalVotes"),
  currentTotalVotes: document.querySelector("#currentTotalVotes"),
  newVotesTotal: document.querySelector("#newVotesTotal"),
  netSwingTotal: document.querySelector("#netSwingTotal"),
  voteLedgerBody: document.querySelector("#voteLedgerBody"),
  finalizeVotesBtn: document.querySelector("#finalizeVotesBtn"),
  finalVoteResult: document.querySelector("#finalVoteResult"),
  liveStatus: document.querySelector("#liveStatus"),
  voteLink: document.querySelector("#voteLink"),
  refreshVotesBtn: document.querySelector("#refreshVotesBtn"),
  resetLiveVotesBtn: document.querySelector("#resetLiveVotesBtn"),
  stageCanvas: document.querySelector("#stageCanvas"),
  timeWarningModal: document.querySelector("#timeWarningModal"),
  timeWarningCloseBtn: document.querySelector("#timeWarningCloseBtn"),
  timeWarningTitle: document.querySelector("#timeWarningTitle"),
  timeWarningMessage: document.querySelector("#timeWarningMessage"),
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

function makeFreeDebate() {
  return {
    id: "free-debate",
    type: "free-debate",
    team: "affirm",
    teamLabel: "双方",
    speaker: "双方",
    phase: "自由辩论",
    secondsPerSide: 240,
    title: "自由辩论",
  };
}

function cloneRound(round) {
  return { ...round };
}

function getCurrentRound() {
  return state.rounds[state.currentIndex] || null;
}

function isFreeDebate(round = getCurrentRound()) {
  return round?.type === "free-debate";
}

function getOtherTeam(team) {
  return team === "affirm" ? "negative" : "affirm";
}

function getWarningKey(round, team = "") {
  return team ? `${round.id}:${team}` : round.id;
}

function clearWarningsForRound(round) {
  if (!round) return;
  state.warningKeys.delete(getWarningKey(round));
  state.warningKeys.delete(getWarningKey(round, "affirm"));
  state.warningKeys.delete(getWarningKey(round, "negative"));
}

function loadCurrentRound() {
  const round = getCurrentRound();
  hideTimeWarning();
  clearWarningsForRound(round);
  if (!round) {
    state.remainingMs = 0;
    state.freeDebateRemainingMs = { affirm: 0, negative: 0 };
    return;
  }

  if (isFreeDebate(round)) {
    const ms = round.secondsPerSide * 1000;
    state.freeDebateRemainingMs = { affirm: ms, negative: ms };
    state.freeDebateActiveTeam = "affirm";
    state.remainingMs = ms;
    return;
  }

  state.remainingMs = round.seconds * 1000;
  state.freeDebateRemainingMs = { affirm: 0, negative: 0 };
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

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (!remainingSeconds) return `${minutes} 分钟`;
  if (!minutes) return `${remainingSeconds} 秒`;
  return `${minutes} 分 ${remainingSeconds} 秒`;
}

function getActiveRemainingMs() {
  const round = getCurrentRound();
  if (!round) return 0;
  if (isFreeDebate(round)) return state.freeDebateRemainingMs[state.freeDebateActiveTeam];
  return state.remainingMs;
}

function getTotalProgress() {
  const round = getCurrentRound();
  if (!round) return 0;

  if (isFreeDebate(round)) {
    const initial = round.secondsPerSide * 2 * 1000;
    const remaining = state.freeDebateRemainingMs.affirm + state.freeDebateRemainingMs.negative;
    return Math.max(0, Math.min(1, remaining / initial));
  }

  return Math.max(0, Math.min(1, state.remainingMs / (round.seconds * 1000)));
}

function isCurrentRoundComplete() {
  const round = getCurrentRound();
  if (!round) return true;
  if (isFreeDebate(round)) {
    return state.freeDebateRemainingMs.affirm === 0 && state.freeDebateRemainingMs.negative === 0;
  }
  return state.remainingMs === 0;
}

function render() {
  const round = getCurrentRound();

  if (!round) {
    stopTimer();
    els.debateBoard.hidden = true;
    els.currentTeam.textContent = "完赛";
    els.currentTeam.className = "team-pill neutral";
    els.currentPhase.textContent = "投票";
    els.currentTitle.textContent = "比赛结束";
    els.currentSpeaker.textContent = "观众投票";
    els.timerReadout.textContent = "00:00";
    els.timerReadout.className = "timer-readout done";
    els.progressFill.style.width = "0%";
    els.matchStatus.textContent = "比赛结束 · 等待公布观众投票";
    els.startBtn.disabled = true;
    els.pauseBtn.disabled = true;
    els.resetBtn.disabled = true;
    els.finishBtn.disabled = true;
    els.switchSideBtn.disabled = true;
    els.prevBtn.disabled = state.currentIndex === 0;
    els.nextBtn.disabled = true;
    renderTimeline();
    renderVoteLedger();
    return;
  }

  if (isFreeDebate(round)) {
    renderFreeDebate(round);
  } else {
    renderSpeech(round);
  }

  const complete = isCurrentRoundComplete();
  els.progressFill.style.width = `${getTotalProgress() * 100}%`;
  els.matchStatus.textContent = `三辩制 · 第 ${state.currentIndex + 1} / ${state.rounds.length} 环节`;
  els.startBtn.disabled = state.running || complete;
  els.pauseBtn.disabled = !state.running;
  els.resetBtn.disabled = false;
  els.finishBtn.disabled = complete;
  els.finishBtn.textContent = isFreeDebate(round) ? "结束自由辩论" : "结束发言";
  els.switchSideBtn.disabled = !isFreeDebate(round) || complete;
  els.prevBtn.disabled = state.running || state.currentIndex === 0;
  els.nextBtn.disabled = state.running || !complete;
  renderTimeline();
  renderVoteLedger();
  drawStage(round);
}

function renderSpeech(round) {
  els.debateBoard.hidden = true;
  els.currentTeam.textContent = round.teamLabel;
  els.currentTeam.className = `team-pill ${round.team}`;
  els.currentPhase.textContent = round.phase;
  els.currentTitle.textContent = round.title;
  els.currentSpeaker.textContent = `${round.speaker} · ${formatDuration(round.seconds)}`;
  renderReadout(state.remainingMs);
}

function renderFreeDebate(round) {
  const activeTeam = state.freeDebateActiveTeam;
  const activeLabel = TEAM_LABELS[activeTeam];
  els.debateBoard.hidden = false;
  els.currentTeam.textContent = activeLabel;
  els.currentTeam.className = `team-pill ${activeTeam}`;
  els.currentPhase.textContent = round.phase;
  els.currentTitle.textContent = round.title;
  els.currentSpeaker.textContent = `${activeLabel}发言中 · 双方各 4 分钟`;
  els.affirmDebateTime.textContent = formatTime(state.freeDebateRemainingMs.affirm);
  els.negativeDebateTime.textContent = formatTime(state.freeDebateRemainingMs.negative);
  els.affirmDebateCard.classList.toggle("active", activeTeam === "affirm");
  els.negativeDebateCard.classList.toggle("active", activeTeam === "negative");
  renderReadout(state.freeDebateRemainingMs[activeTeam]);
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

function maybeTriggerThirtySecondWarning(round, team, previousMs, nextMs) {
  const thresholdMs = 30 * 1000;
  if (previousMs <= thresholdMs || nextMs > thresholdMs || nextMs === 0) return;

  const key = getWarningKey(round, team);
  if (state.warningKeys.has(key)) return;
  state.warningKeys.add(key);

  const title = team ? `${TEAM_LABELS[team]}自由辩论` : round.title;
  showTimeWarning(title);
  playWarningTone();
}

function showTimeWarning(title) {
  if (state.warningTimeoutId) window.clearTimeout(state.warningTimeoutId);
  els.timeWarningTitle.textContent = title;
  els.timeWarningMessage.textContent = "还剩 30 秒";
  els.timeWarningModal.hidden = false;
  state.warningTimeoutId = window.setTimeout(hideTimeWarning, 4500);
}

function hideTimeWarning() {
  if (state.warningTimeoutId) {
    window.clearTimeout(state.warningTimeoutId);
    state.warningTimeoutId = 0;
  }
  els.timeWarningModal.hidden = true;
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
    sub.textContent = isFreeDebate(round)
      ? `双方各 ${formatShort(round.secondsPerSide)} · 交替计时`
      : `${round.speaker} · ${round.phase}`;
    textWrap.append(title, sub);

    const time = document.createElement("div");
    time.className = "timeline-time";
    time.textContent = isFreeDebate(round)
      ? `${formatShort(round.secondsPerSide)}/方`
      : formatShort(round.seconds);

    item.append(number, textWrap, time);
    els.timeline.appendChild(item);
  });
}

function startTimer() {
  const round = getCurrentRound();
  if (state.running || isCurrentRoundComplete() || !round) return;
  if (isFreeDebate(round) && state.freeDebateRemainingMs[state.freeDebateActiveTeam] === 0) {
    state.freeDebateActiveTeam = state.freeDebateRemainingMs.affirm > 0 ? "affirm" : "negative";
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

  if (isFreeDebate(round)) {
    const activeTeam = state.freeDebateActiveTeam;
    const previousValue = state.freeDebateRemainingMs[activeTeam];
    const nextValue = Math.max(0, previousValue - elapsed);
    state.freeDebateRemainingMs[activeTeam] = nextValue;
    maybeTriggerThirtySecondWarning(round, activeTeam, previousValue, nextValue);

    if (nextValue === 0) {
      const otherTeam = getOtherTeam(activeTeam);
      playFinishTone();
      if (state.freeDebateRemainingMs[otherTeam] > 0) {
        state.freeDebateActiveTeam = otherTeam;
      } else {
        stopTimer();
      }
    }
    return;
  }

  const previousValue = state.remainingMs;
  state.remainingMs = Math.max(0, previousValue - elapsed);
  maybeTriggerThirtySecondWarning(round, "", previousValue, state.remainingMs);
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
  if (isFreeDebate(round)) {
    state.freeDebateRemainingMs = { affirm: 0, negative: 0 };
  } else {
    state.remainingMs = 0;
  }
  playFinishTone();
  render();
}

function switchDebateSide() {
  const round = getCurrentRound();
  if (!isFreeDebate(round) || isCurrentRoundComplete()) return;

  if (state.running) {
    const now = performance.now();
    consumeElapsed(now - state.lastTick);
    state.lastTick = now;
  }

  const otherTeam = getOtherTeam(state.freeDebateActiveTeam);
  if (state.freeDebateRemainingMs[otherTeam] > 0) {
    state.freeDebateActiveTeam = otherTeam;
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

function goPrevious() {
  if (state.running || state.currentIndex === 0) return;
  state.currentIndex = Math.max(0, state.currentIndex - 1);
  loadCurrentRound();
  render();
}

function restartMatch() {
  stopTimer();
  hideTimeWarning();
  state.rounds = BASE_ROUNDS.map(cloneRound);
  state.currentIndex = 0;
  state.voteSnapshots = [];
  state.finalResultVisible = false;
  state.warningKeys.clear();
  loadCurrentRound();
  render();
}

function readVote(input) {
  const value = Number.parseInt(input.value, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function getTotalVotes(votes) {
  return (votes.affirm ?? 0) + (votes.negative ?? 0);
}

function normalizeVoteDetail(votes, label = "", type = "stage") {
  const voters = Array.isArray(votes?.voters)
    ? votes.voters.filter((voter) => voter?.id && ["affirm", "negative"].includes(voter.choice))
    : [];
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    label,
    affirm: Number(votes?.affirm || 0),
    negative: Number(votes?.negative || 0),
    voters,
    identityTracking:
      typeof votes?.identityTracking === "boolean"
        ? votes.identityTracking
        : Array.isArray(votes?.voters),
    createdAt: new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

function votersToMap(snapshot) {
  return new Map((snapshot?.voters || []).map((voter) => [voter.id, voter.choice]));
}

function calculateVoteDelta(current, previous) {
  if (!previous) {
    return {
      newVotes: 0,
      netSwing: 0,
    };
  }

  const currentVoters = votersToMap(current);
  const previousVoters = votersToMap(previous);
  let newVotes = 0;
  let netSwing = 0;

  if (current.identityTracking && previous.identityTracking) {
    for (const [id, choice] of currentVoters.entries()) {
      const previousChoice = previousVoters.get(id);
      if (!previousChoice) newVotes += 1;
      if (previousChoice === "affirm" && choice === "negative") netSwing -= 1;
      if (previousChoice === "negative" && choice === "affirm") netSwing += 1;
    }
  } else {
    newVotes = Math.max(0, getTotalVotes(current) - getTotalVotes(previous));
  }

  return {
    newVotes,
    netSwing,
  };
}

function getRecordedSnapshot(index) {
  const snapshot = state.voteSnapshots[index];
  if (!snapshot) return null;
  return {
    ...snapshot,
    delta: calculateVoteDelta(snapshot, state.voteSnapshots[index - 1]),
  };
}

function getRecordingLabel() {
  const round = getCurrentRound();
  if (!round) return "赛后终局";
  if (isCurrentRoundComplete()) return `${round.title}后`;
  if (state.currentIndex > 0) return `${state.rounds[state.currentIndex - 1].title}后`;
  return "赛前";
}

function getCurrentManualVotes() {
  return {
    affirm: readVote(els.affirmVotes1),
    negative: readVote(els.negativeVotes1),
    voters: [],
    identityTracking: false,
  };
}

async function getVoteDetailForRecord() {
  if (window.location.protocol === "file:") return getCurrentManualVotes();

  try {
    const response = await fetch("/api/votes/detail", { cache: "no-store" });
    if (!response.ok) throw new Error("detail unavailable");
    return await response.json();
  } catch {
    return getCurrentManualVotes();
  }
}

async function recordInitialSnapshot() {
  const votes = await getVoteDetailForRecord();
  state.voteSnapshots = [normalizeVoteDetail(votes, "初始投票", "initial")];
  state.finalResultVisible = false;
  renderVoteLedger();
}

async function recordStageSnapshot() {
  if (!state.voteSnapshots.length) {
    setLiveStatus("请先记录初始投票", "error");
    return;
  }

  const votes = await getVoteDetailForRecord();
  const label = getRecordingLabel();
  state.voteSnapshots.push(normalizeVoteDetail(votes, label, getCurrentRound() ? "stage" : "final"));
  renderVoteLedger();
}

async function finalizeVotes() {
  if (!state.voteSnapshots.length) return;
  const votes = await getVoteDetailForRecord();
  const finalSnapshot = normalizeVoteDetail(votes, "最终投票", "final");
  state.voteSnapshots = state.voteSnapshots.filter((snapshot) => snapshot.type !== "final");
  state.voteSnapshots.push(finalSnapshot);
  state.finalResultVisible = true;
  renderVoteLedger();
}

function resetLocalVoteLedger() {
  state.voteSnapshots = [];
  state.finalResultVisible = false;
  renderVoteLedger();
}

function getLedgerTotals() {
  const initial = state.voteSnapshots[0] || null;
  const latest = state.voteSnapshots[state.voteSnapshots.length - 1] || null;
  let newVotes = 0;
  let netSwing = 0;
  let identityTracking = false;

  if (initial && latest) {
    const initialVoters = votersToMap(initial);
    const latestVoters = votersToMap(latest);
    identityTracking = Boolean(initial.identityTracking && latest.identityTracking);
    if (identityTracking) {
      for (const [id, choice] of latestVoters.entries()) {
        const initialChoice = initialVoters.get(id);
        if (!initialChoice) newVotes += 1;
        if (initialChoice === "affirm" && choice === "negative") netSwing -= 1;
        if (initialChoice === "negative" && choice === "affirm") netSwing += 1;
      }
    } else {
      newVotes = Math.max(0, getTotalVotes(latest) - getTotalVotes(initial));
    }
  }

  return {
    initial,
    latest,
    newVotes,
    netSwing,
    identityTracking,
  };
}

function renderVoteLedger() {
  const currentTotal = readVote(els.affirmVotes1) + readVote(els.negativeVotes1);
  const { initial, latest, newVotes, netSwing, identityTracking } = getLedgerTotals();

  els.initialTotalVotes.textContent = initial ? getTotalVotes(initial) : "0";
  els.currentTotalVotes.textContent = String(currentTotal);
  els.newVotesTotal.textContent = String(newVotes);
  els.netSwingTotal.textContent = signed(netSwing);
  els.recordStageBtn.disabled = !state.voteSnapshots.length || !getCurrentRound();
  els.finalizeVotesBtn.hidden = Boolean(getCurrentRound()) || !state.voteSnapshots.length;
  els.finalizeVotesBtn.textContent = state.finalResultVisible
    ? "重新记录最终投票"
    : "记录最终投票并公布结果";

  els.voteLedgerBody.innerHTML = "";
  if (!state.voteSnapshots.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "尚未记录初始投票";
    row.appendChild(cell);
    els.voteLedgerBody.appendChild(row);
  } else {
    state.voteSnapshots.forEach((snapshot, index) => {
      const withDelta = getRecordedSnapshot(index);
      const row = document.createElement("tr");
      [
        `${snapshot.label} · ${snapshot.createdAt}`,
        snapshot.affirm,
        snapshot.negative,
        getTotalVotes(snapshot),
        withDelta.delta.newVotes,
        signed(withDelta.delta.netSwing),
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      els.voteLedgerBody.appendChild(row);
    });
  }

  renderFinalVoteResult(initial, latest, newVotes, netSwing, identityTracking);
}

function renderFinalVoteResult(initial, latest, newVotes, netSwing, identityTracking) {
  els.finalVoteResult.hidden = !state.finalResultVisible || !initial || !latest;
  els.finalVoteResult.classList.remove("negative", "tie");
  if (els.finalVoteResult.hidden) return;

  if (!identityTracking) {
    els.finalVoteResult.classList.add("tie");
    els.finalVoteResult.innerHTML = [
      "<strong>暂时无法计算最终结果</strong>",
      "请连接实时投票服务器后重新记录初始投票和最终投票。",
      "只有带观众身份记录的投票才能排除中途新增票。",
    ].join("<br>");
    return;
  }

  const winner = netSwing > 0 ? "正方胜" : netSwing < 0 ? "反方胜" : "平局";
  if (netSwing < 0) els.finalVoteResult.classList.add("negative");
  if (netSwing === 0) els.finalVoteResult.classList.add("tie");
  els.finalVoteResult.innerHTML = [
    `<strong>最终结果：${winner}</strong>`,
    `初始投票：正方 ${initial.affirm} / 反方 ${initial.negative}`,
    `最终投票：正方 ${latest.affirm} / 反方 ${latest.negative}`,
    `有效净跑票（+正/-反）：${signed(netSwing)}`,
    `中途新增票：${newVotes}（不计入结果）`,
  ].join("<br>");
}

function updateVotes() {
  const margin = readVote(els.affirmVotes1) - readVote(els.negativeVotes1);
  els.margin1.textContent = signed(margin);
  els.totalMargin.textContent = signed(margin);

  els.resultBox.classList.remove("negative", "tie");
  if (margin > 0) {
    els.winnerText.textContent = "正方票数较多";
  } else if (margin < 0) {
    els.winnerText.textContent = "反方票数较多";
    els.resultBox.classList.add("negative");
  } else {
    els.winnerText.textContent = "票数相同";
    els.resultBox.classList.add("tie");
  }
  renderVoteLedger();
}

function applyLiveVotes(votes) {
  if (!votes) return;
  state.currentVoteDetail = {
    affirm: votes.affirm ?? 0,
    negative: votes.negative ?? 0,
    voters: votes.voters ?? state.currentVoteDetail.voters ?? [],
  };
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
    resetLocalVoteLedger();
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

  const activeTeam = isFreeDebate(round) ? state.freeDebateActiveTeam : round?.team;
  ctx.fillStyle = "#172628";
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.fillStyle = "#d7a63f";
  ctx.beginPath();
  ctx.arc(rect.width * 0.76, 44, 23, 0, Math.PI * 2);
  ctx.fill();

  drawMountain(ctx, rect.width, rect.height, "#314a45", 0.64, 0.28);
  drawMountain(ctx, rect.width, rect.height, "#233a38", 0.76, 0.12);

  ctx.strokeStyle = "#d7a63f";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(rect.width * 0.08, rect.height * 0.82);
  ctx.bezierCurveTo(
    rect.width * 0.28,
    rect.height * 0.7,
    rect.width * 0.42,
    rect.height * 0.88,
    rect.width * 0.58,
    rect.height * 0.5,
  );
  ctx.stroke();

  drawPositionMarker(ctx, rect.width * 0.15, rect.height * 0.64, "移山", "#17756d", activeTeam === "affirm");
  drawPositionMarker(ctx, rect.width * 0.85, rect.height * 0.64, "搬家", "#b54a45", activeTeam === "negative");

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "800 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("一寸欢喜（深圳）辩论队", rect.width * 0.5, rect.height - 16);
  ctx.restore();
}

function drawMountain(ctx, width, height, color, baseline, offset) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, height * baseline);
  ctx.lineTo(width * (0.16 + offset), height * 0.31);
  ctx.lineTo(width * (0.31 + offset), height * 0.66);
  ctx.lineTo(width * (0.46 + offset), height * 0.38);
  ctx.lineTo(width, height * 0.72);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

function drawPositionMarker(ctx, x, y, label, color, active) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = active ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 15px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 1);
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

function playWarningTone() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  try {
    const context = new AudioContext();
    [0, 0.28].forEach((delay, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + delay;
      oscillator.type = "sine";
      oscillator.frequency.value = index === 0 ? 660 : 880;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.2);
    });
    window.setTimeout(() => context.close().catch(() => {}), 800);
  } catch {
    // Some browsers block sound until the first direct user interaction.
  }
}

els.startBtn.addEventListener("click", startTimer);
els.pauseBtn.addEventListener("click", pauseTimer);
els.resetBtn.addEventListener("click", resetCurrentRound);
els.finishBtn.addEventListener("click", finishCurrentRound);
els.switchSideBtn.addEventListener("click", switchDebateSide);
els.prevBtn.addEventListener("click", goPrevious);
els.nextBtn.addEventListener("click", goNext);
els.restartMatchBtn.addEventListener("click", restartMatch);
els.affirmVotes1.addEventListener("input", updateVotes);
els.negativeVotes1.addEventListener("input", updateVotes);
els.recordInitialBtn.addEventListener("click", recordInitialSnapshot);
els.recordStageBtn.addEventListener("click", recordStageSnapshot);
els.finalizeVotesBtn.addEventListener("click", finalizeVotes);
els.refreshVotesBtn.addEventListener("click", refreshVotesFromServer);
els.resetLiveVotesBtn.addEventListener("click", resetServerVotes);
els.timeWarningCloseBtn.addEventListener("click", hideTimeWarning);
els.timeWarningModal.addEventListener("click", (event) => {
  if (event.target === els.timeWarningModal) hideTimeWarning();
});
window.addEventListener("resize", () => drawStage());

loadCurrentRound();
render();
updateVotes();
initLiveVoting();
