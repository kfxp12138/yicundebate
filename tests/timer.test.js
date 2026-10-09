const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Run the real browser controller with a small DOM and a controllable clock.
function setup() {
  const elements = new Map();
  function element() {
    const node = { style: {}, value: "0", children: [], className: "", hidden: false, addEventListener() {} };
    node.append = (...children) => node.children.push(...children);
    node.appendChild = (child) => node.append(child);
    Object.defineProperty(node, "innerHTML", { set() { node.children = []; } });
    node.classList = {
      contains: (name) => node.className.split(" ").includes(name),
      add: (...names) => { node.className = [...new Set([...node.className.split(" "), ...names])].join(" "); },
      remove: (...names) => { node.className = node.className.split(" ").filter((name) => !names.includes(name)).join(" "); },
      toggle(name, force) { (force ? this.add : this.remove)(name); },
    };
    return node;
  }
  let now = 0;
  let interval;
  const context = vm.createContext({
    console,
    performance: { now: () => now },
    document: {
      createElement: element,
      querySelector: (selector) => {
        if (!elements.has(selector)) elements.set(selector, element());
        return elements.get(selector);
      },
    },
    window: {
      location: { protocol: "file:", origin: "null" },
      setInterval: (fn) => { interval = fn; return 1; },
      clearInterval: () => { interval = null; },
      setTimeout: () => 1,
      clearTimeout() {},
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app.js"), "utf8"), context);
  const run = (code) => vm.runInContext(code, context);
  return {
    run,
    el: (id) => elements.get(`#${id}`),
    advance: (ms, deliverTick = true) => { now += ms; if (deliverTick && interval) interval(); },
    round: (index) => run(`stopTimer(); state.currentIndex = ${index}; loadCurrentRound(); render();`),
  };
}

test("all 17 rounds follow the requested sequence, sides and durations", () => {
  const app = setup();
  const actual = JSON.parse(app.run("JSON.stringify(BASE_ROUNDS.map(r => [r.title, r.team, r.seconds ?? r.secondsPerSide]))"));
  assert.deepEqual(actual, [
    ["正方一辩立论", "affirm", 240],
    ["反方四辩质询正方一辩", "negative", 90],
    ["反方一辩立论", "negative", 240],
    ["正方四辩质询反方一辩", "affirm", 90],
    ["正方二辩驳论", "affirm", 180],
    ["反方二辩驳论", "negative", 180],
    ["双方二辩对辩", "affirm", 120],
    ["反方三辩质询正方", "negative", 180],
    ["正方三辩质询反方", "affirm", 180],
    ["反方三辩质询小结", "negative", 120],
    ["正方三辩质询小结", "affirm", 120],
    ["中场 · 战术暂停", "neutral", 180],
    ["反方一辩补充陈词", "negative", 180],
    ["正方一辩补充陈词", "affirm", 180],
    ["自由辩论", "affirm", 240],
    ["反方四辩结辩", "negative", 300],
    ["正方四辩结辩", "affirm", 300],
  ]);
  assert.equal(app.el("timeline").children.length, 17);
});

test("each question clock excludes answer time, including pauses between ticks", () => {
  for (const index of [1, 3, 7, 8]) {
    const app = setup();
    app.round(index);
    const initial = app.run("state.remainingMs");
    assert.equal(app.el("startBtn").textContent, "质询方计时");
    assert.equal(app.el("pauseBtn").textContent, "接质回答 · 暂停");
    assert.equal(app.el("switchSideBtn").hidden, true);
    app.run("startTimer()");
    app.advance(149, false);
    app.run("pauseTimer()");
    assert.equal(app.run("state.remainingMs"), initial - 149);
    app.advance(15000);
    assert.equal(app.run("state.remainingMs"), initial - 149);
    app.run("startTimer()");
    app.advance(1000);
    assert.equal(app.run("state.remainingMs"), initial - 1149);
  }
});

for (const [index, seconds] of [[6, 120], [14, 240]]) {
  test(`dual clock ${seconds}s: switching preserves both budgets and the dial follows the active side`, () => {
    const app = setup();
    app.round(index);
    assert.equal(app.el("switchSideBtn").hidden, false);
    assert.match(app.el("currentSpeaker").textContent, new RegExp(`双方各 ${seconds / 60} 分钟`));
    app.run("startTimer()");
    app.advance(1250, false);
    app.run("switchDebateSide()");
    assert.equal(app.run("state.dualRemainingMs.affirm"), seconds * 1000 - 1250);
    assert.equal(app.run("state.dualRemainingMs.negative"), seconds * 1000);
    assert.equal(Number(app.el("dialProgress").style.strokeDashoffset), 0);
    app.advance(5000);
    assert.equal(app.run("state.dualRemainingMs.affirm"), seconds * 1000 - 1250);
    assert.equal(app.run("state.dualRemainingMs.negative"), seconds * 1000 - 5000);
    assert.ok(Math.abs(Number(app.el("dialProgress").style.strokeDashoffset) - 500 / seconds) < 1e-9);
    app.run("pauseTimer()");
    app.advance(10000);
    assert.equal(app.run("state.dualRemainingMs.negative"), seconds * 1000 - 5000);
    app.run("startTimer()");
    app.advance(seconds * 1000);
    assert.equal(app.run("state.activeTeam"), "affirm");
    assert.equal(app.run("isCurrentRoundComplete()"), false);
    app.advance(seconds * 1000);
    assert.equal(app.run("isCurrentRoundComplete()"), true);
    assert.equal(app.run("state.running"), false);
    assert.equal(app.el("nextBtn").disabled, false);
    assert.equal(app.el("timerReadout").textContent, "00:00");
  });
}

test("30-second warnings identify the correct round and fire once per side", () => {
  const app = setup();
  app.round(6);
  app.run("startTimer()");
  app.advance(90000);
  assert.equal(app.el("timeWarningTitle").textContent, "正方二辩对辩");
  assert.equal(app.el("timeWarningModal").hidden, false);
  app.run("hideTimeWarning()");
  app.advance(1000);
  assert.equal(app.el("timeWarningModal").hidden, true);
  app.run("switchDebateSide()");
  app.advance(90000);
  assert.equal(app.el("timeWarningTitle").textContent, "反方二辩对辩");
  assert.equal(app.el("timerDial").classList.contains("warning"), true);
  app.run("resetCurrentRound()");
  assert.equal(app.el("timeWarningModal").hidden, true);
  assert.equal(app.run("state.warningKeys.size"), 0);
  assert.equal(app.el("timerReadout").textContent, "02:00");
});

test("tactical break is a neutral three-minute round and all rounds can finish and restart", () => {
  const app = setup();
  app.round(11);
  assert.equal(app.el("timerReadout").textContent, "03:00");
  assert.equal(app.el("currentTeam").textContent, "双方");
  assert.equal(app.el("finishBtn").textContent, "结束暂停环节");
  app.run("restartMatch(); goNext()");
  assert.equal(app.run("state.currentIndex"), 0, "cannot skip unfinished clock");
  for (let index = 0; index < 17; index++) {
    assert.equal(app.run("state.currentIndex"), index);
    app.run("finishCurrentRound(); goNext()");
  }
  assert.equal(app.el("currentTitle").textContent, "比赛结束");
  assert.equal(app.el("startBtn").disabled, true);
  assert.equal(Number(app.el("dialProgress").style.strokeDashoffset), 100);
  app.run("goPrevious()");
  assert.equal(app.el("timerReadout").textContent, "05:00");
  app.run("restartMatch()");
  assert.equal(app.el("currentTitle").textContent, "正方一辩立论");
  assert.equal(app.el("timerReadout").textContent, "04:00");
});
