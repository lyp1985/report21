(function () {
  const STORAGE_KEY = "poetryTangChinaProgress";
  const MAP_WIDTH = 1000;
  const MAP_HEIGHT = 650;

  const sourceData = window.GAME_DATA || (typeof GAME_DATA !== "undefined" ? GAME_DATA : null);
  if (!sourceData) {
    throw new Error("GAME_DATA 未加载，请确认 data.js 在 game.js 之前引入。");
  }

  const regions = [...sourceData.regions].sort((a, b) => a.unlockOrder - b.unlockOrder);
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const POET_IMAGES = {
    "李白": "image_node_16.png",
    "王维": "image_node_18.png",
    "杜甫": "image_node_20.png",
    "白居易": "image_node_19.png",
    "王之涣": "image_node_18.png",
    "崔颢": "image_node_16.png",
    "张继": "image_node_20.png",
    "刘禹锡": "image_node_19.png"
  };

  const labelOffsets = {
    changan: { x: -24, y: -50 },
    luoyang: { x: 36, y: -44 },
    yangzhou: { x: 52, y: 0 },
    huanghelou: { x: -50, y: 46 },
    lushan: { x: 52, y: 40 },
    taishan: { x: 42, y: -44 },
    chengdu: { x: -42, y: 44 },
    kuizhou: { x: -44, y: 42 },
    suzhou: { x: 52, y: -22 },
    hangzhou: { x: 56, y: 38 },
    liangzhou: { x: 0, y: -48 },
    yumenguan: { x: -4, y: 50 },
    jiangling: { x: 30, y: 50 },
    dongting: { x: 68, y: 18 },
    weicheng: { x: -44, y: -42 }
  };

  const els = {
    scoreText: document.getElementById("scoreText"),
    stampText: document.getElementById("stampText"),
    progressText: document.getElementById("progressText"),
    resetBtn: document.getElementById("resetBtn"),
    routeLayer: document.getElementById("routeLayer"),
    nodeLayer: document.getElementById("nodeLayer"),
    stampGrid: document.getElementById("stampGrid"),
    modalBackdrop: document.getElementById("modalBackdrop"),
    closeModalBtn: document.getElementById("closeModalBtn"),
    quizView: document.getElementById("quizView"),
    resultView: document.getElementById("resultView"),
    regionName: document.getElementById("regionName"),
    questionCount: document.getElementById("questionCount"),
    modalTitle: document.getElementById("modalTitle"),
    introText: document.getElementById("introText"),
    upperLine: document.getElementById("upperLine"),
    reciteBtn: document.getElementById("reciteBtn"),
    voiceStatus: document.getElementById("voiceStatus"),
    modalPoetImage: document.getElementById("modalPoetImage"),
    poetSeal: document.getElementById("poetSeal"),
    optionGrid: document.getElementById("optionGrid"),
    feedbackText: document.getElementById("feedbackText"),
    resultStamp: document.getElementById("resultStamp"),
    resultTitle: document.getElementById("resultTitle"),
    resultSummary: document.getElementById("resultSummary"),
    resultHint: document.getElementById("resultHint"),
    backMapBtn: document.getElementById("backMapBtn")
  };

  const session = {
    region: null,
    questionIndex: 0,
    correctCount: 0,
    earnedScore: 0,
    locked: false,
    awaitingRecitation: false,
    speaking: false,
    practice: false
  };

  let state = loadState();
  let advanceTimer = null;
  const speechState = {
    voices: [],
    runId: 0,
    startTimer: null,
    watchdogTimer: null
  };

  const speechSupported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  if (speechSupported) {
    refreshVoices();
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    } else {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
  }

  function loadState() {
    const base = {
      score: 0,
      combo: 0,
      completed: []
    };

    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!stored || typeof stored !== "object") return base;

      return {
        score: Number.isFinite(stored.score) ? stored.score : 0,
        combo: Number.isFinite(stored.combo) ? stored.combo : 0,
        completed: Array.isArray(stored.completed)
          ? stored.completed.filter((id) => regionById.has(id))
          : []
      };
    } catch (error) {
      return base;
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function orderedCompletedCount() {
    let count = 0;
    for (const region of regions) {
      if (!state.completed.includes(region.id)) break;
      count += 1;
    }
    return count;
  }

  function nextUnlockOrder() {
    return Math.min(orderedCompletedCount() + 1, regions.length);
  }

  function statusFor(region) {
    if (state.completed.includes(region.id)) return "completed";
    if (region.unlockOrder <= nextUnlockOrder()) return "unlocked";
    return "locked";
  }

  function coords(region) {
    return {
      x: Math.round(region.mapPos.x * MAP_WIDTH),
      y: Math.round(region.mapPos.y * MAP_HEIGHT)
    };
  }

  function render() {
    renderHud();
    renderRoute();
    renderNodes();
    renderStamps();
  }

  function renderHud() {
    const completedCount = state.completed.length;
    const nextRegion = regions.find((region) => statusFor(region) === "unlocked");

    els.scoreText.textContent = state.score;
    els.stampText.textContent = `${completedCount}/${regions.length}`;
    els.progressText.textContent = nextRegion
      ? `第${nextRegion.unlockOrder}站 ${nextRegion.name}`
      : "诗路全通关";
  }

  function renderRoute() {
    els.routeLayer.innerHTML = "";

    regions.slice(0, -1).forEach((region, index) => {
      const next = regions[index + 1];
      const start = coords(region);
      const end = coords(next);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2 - 42;

      path.setAttribute("d", `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`);
      path.setAttribute("class", `route-line ${index < orderedCompletedCount() ? "completed" : ""}`);
      els.routeLayer.appendChild(path);
    });
  }

  function renderNodes() {
    els.nodeLayer.innerHTML = "";

    regions.forEach((region) => {
      const point = coords(region);
      const offset = labelOffsets[region.id] || { x: 0, y: -46 };
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const status = statusFor(region);

      group.setAttribute("class", `map-node ${status}`);
      group.setAttribute("tabindex", status === "locked" ? "-1" : "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", `${region.name}，${region.poet}，${statusText(status)}`);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("class", "node-button");
      circle.setAttribute("cx", point.x);
      circle.setAttribute("cy", point.y);
      circle.setAttribute("r", status === "completed" ? "22" : "20");

      const shortText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      shortText.setAttribute("class", "node-short");
      shortText.setAttribute("x", point.x);
      shortText.setAttribute("y", point.y + 1);
      shortText.textContent = region.name.replace(/（.*?）/g, "").slice(0, 1);

      const avatarX = point.x + offset.x;
      const avatarY = point.y + offset.y - 34;
      const avatarBg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      avatarBg.setAttribute("class", "poet-avatar-bg");
      avatarBg.setAttribute("cx", avatarX);
      avatarBg.setAttribute("cy", avatarY);
      avatarBg.setAttribute("r", "25");

      const avatarImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
      avatarImage.setAttribute("class", "poet-avatar-img");
      avatarImage.setAttribute("href", poetImage(region.poet));
      avatarImage.setAttribute("x", avatarX - 24);
      avatarImage.setAttribute("y", avatarY - 24);
      avatarImage.setAttribute("width", "48");
      avatarImage.setAttribute("height", "48");
      avatarImage.setAttribute("preserveAspectRatio", "xMidYMid slice");

      const avatarText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      avatarText.setAttribute("class", "poet-avatar-text");
      avatarText.setAttribute("x", avatarX);
      avatarText.setAttribute("y", avatarY + 32);
      avatarText.textContent = region.poet.slice(0, 1);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "node-label");
      label.setAttribute("x", point.x + offset.x);
      label.setAttribute("y", point.y + offset.y);
      label.textContent = region.name;

      const poet = document.createElementNS("http://www.w3.org/2000/svg", "text");
      poet.setAttribute("class", "node-poet");
      poet.setAttribute("x", point.x + offset.x);
      poet.setAttribute("y", point.y + offset.y + 22);
      poet.textContent = region.poet;

      group.append(avatarBg, avatarImage, avatarText, circle, shortText, label, poet);
      group.addEventListener("click", () => openRegion(region));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openRegion(region);
        }
      });

      els.nodeLayer.appendChild(group);
    });
  }

  function renderStamps() {
    els.stampGrid.innerHTML = "";

    regions.forEach((region) => {
      const stamp = document.createElement("div");
      const collected = state.completed.includes(region.id);
      stamp.className = `stamp-tile ${collected ? "collected" : ""}`;
      stamp.innerHTML = `<img src="${poetImage(region.poet)}" alt="${region.poet}画像"><span>${region.poet}</span><small>${collected ? "已盖章" : region.name}</small>`;
      els.stampGrid.appendChild(stamp);
    });
  }

  function poetImage(poet) {
    return POET_IMAGES[poet] || "image_node_16.png";
  }

  function statusText(status) {
    if (status === "completed") return "已收集印章，可重游练习";
    if (status === "unlocked") return "已解锁，可挑战";
    return "尚未解锁";
  }

  function openRegion(region) {
    const status = statusFor(region);
    if (status === "locked") return;
    clearAdvanceTimer();

    session.region = region;
    session.questionIndex = 0;
    session.correctCount = 0;
    session.earnedScore = 0;
    session.locked = false;
    session.awaitingRecitation = false;
    session.speaking = false;
    session.practice = status === "completed";

    els.modalBackdrop.hidden = false;
    els.quizView.hidden = false;
    els.resultView.hidden = true;
    renderQuestion();
  }

  function closeModal() {
    clearAdvanceTimer();
    stopRecitation();
    els.modalBackdrop.hidden = true;
    session.locked = false;
    session.awaitingRecitation = false;
    session.speaking = false;
  }

  function renderQuestion() {
    const region = session.region;
    const question = region.questions[session.questionIndex];

    session.locked = false;
    els.regionName.textContent = `${region.name} · ${region.poet}${session.practice ? " · 重游练习" : ""}`;
    els.questionCount.textContent = `${session.questionIndex + 1}/${region.questions.length}`;
    els.modalTitle.textContent = `《${question.title}》`;
    els.introText.textContent = region.intro;
    els.upperLine.textContent = question.upper;
    els.modalPoetImage.src = poetImage(region.poet);
    els.modalPoetImage.alt = `${region.poet}画像`;
    els.poetSeal.textContent = region.poet;
    els.poetSeal.classList.remove("stamping");
    els.feedbackText.textContent = session.practice ? "此站已通关，本次练习不再计入总分。" : "先听诗句，再选择正确下句。";
    els.feedbackText.className = "feedback";
    els.optionGrid.innerHTML = "";
    session.awaitingRecitation = true;
    session.speaking = false;

    updateVoiceControls("ready");

    question.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-btn waiting";
      button.disabled = true;
      button.textContent = option;
      button.addEventListener("click", () => chooseAnswer(button, option, question));
      els.optionGrid.appendChild(button);
    });

    playRecitation(question);
  }

  function chooseAnswer(button, selected, question) {
    if (session.locked || session.awaitingRecitation || session.speaking) return;
    session.locked = true;
    stopRecitation();

    const isCorrect = selected === question.lower;
    const buttons = [...els.optionGrid.querySelectorAll(".option-btn")];
    buttons.forEach((optionButton) => {
      optionButton.disabled = true;
      if (optionButton.textContent === question.lower) optionButton.classList.add("correct");
    });

    if (isCorrect) {
      session.correctCount += 1;
      state.combo += 1;

      const gained = session.practice ? 0 : 10 * Math.min(state.combo, 3);
      session.earnedScore += gained;
      state.score += gained;

      els.feedbackText.textContent = session.practice
        ? `答对了。原句正是“${question.lower}”。`
        : `答对了，连击 ${state.combo}，本题 +${gained} 分。`;
      els.feedbackText.className = "feedback good";
      els.poetSeal.classList.add("stamping");
    } else {
      button.classList.add("wrong");
      state.combo = 0;
      els.feedbackText.textContent = `答错了。正确下句是“${question.lower}”。${question.hint}`;
      els.feedbackText.className = "feedback bad";
    }

    saveState();
    renderHud();

    advanceTimer = window.setTimeout(() => {
      advanceTimer = null;
      session.questionIndex += 1;
      if (session.questionIndex >= session.region.questions.length) {
        showResult();
      } else {
        renderQuestion();
      }
    }, isCorrect ? 1200 : 2000);
  }

  function clearAdvanceTimer() {
    if (!advanceTimer) return;
    window.clearTimeout(advanceTimer);
    advanceTimer = null;
  }

  function refreshVoices() {
    speechState.voices = window.speechSynthesis.getVoices();
  }

  function selectGentleFemaleVoice() {
    const voices = refreshAndGetVoices();
    const chineseVoices = voices.filter((voice) => {
      return /zh|cmn|yue/i.test(voice.lang) || /Chinese|Mandarin|中文|普通话|中國|中国|粤|台灣|台湾/i.test(voice.name);
    });
    const femaleHints = /female|女|Xiaoxiao|Xiaoyi|Xiaomeng|Xiaohan|Xiaomo|Xiaoqiu|Xiaorui|Xiaoshuang|Xiaoxuan|Xiaochen|Huihui|Yaoyao|Ting[- ]?Ting|Mei[- ]?Jia|Sin[- ]?ji|Yu[- ]?shu|Li[- ]?mu|Hanhan|Jiajia/i;

    return chineseVoices.find((voice) => femaleHints.test(voice.name))
      || chineseVoices[0]
      || voices.find((voice) => /female|女/i.test(voice.name))
      || null;
  }

  function refreshAndGetVoices() {
    if (!speechSupported) return [];
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) speechState.voices = voices;
    return speechState.voices;
  }

  function recitationText(question) {
    return `《${question.title}》。${question.upper}。`;
  }

  function currentQuestion() {
    if (!session.region) return null;
    return session.region.questions[session.questionIndex] || null;
  }

  function playRecitation(question) {
    if (!question || session.locked) return;

    stopRecitation();
    session.awaitingRecitation = true;
    session.speaking = true;
    setAnswerReady(false);

    if (!speechSupported) {
      finishRecitation("unsupported");
      return;
    }

    const runId = ++speechState.runId;
    const text = recitationText(question);
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = selectGentleFemaleVoice();
    utterance.lang = voice ? voice.lang : "zh-CN";
    utterance.rate = 0.82;
    utterance.pitch = 1.12;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;

    updateVoiceControls("speaking");

    utterance.onend = () => {
      if (runId === speechState.runId && currentQuestion() === question) finishRecitation("done");
    };
    utterance.onerror = (event) => {
      if (runId !== speechState.runId || currentQuestion() !== question) return;
      if (event.error === "canceled" || event.error === "interrupted") return;
      finishRecitation("error");
    };

    window.speechSynthesis.speak(utterance);
    speechState.startTimer = window.setTimeout(() => {
      if (runId === speechState.runId && currentQuestion() === question && session.speaking && !window.speechSynthesis.speaking) {
        finishRecitation("error");
      }
    }, 900);
    speechState.watchdogTimer = window.setTimeout(() => {
      if (runId === speechState.runId && currentQuestion() === question && session.speaking) {
        finishRecitation("done");
      }
    }, Math.min(9000, Math.max(3600, text.length * 320 + 1200)));
  }

  function stopRecitation() {
    speechState.runId += 1;
    clearSpeechTimers();
    if (speechSupported) window.speechSynthesis.cancel();
  }

  function finishRecitation(status) {
    speechState.runId += 1;
    clearSpeechTimers();
    session.awaitingRecitation = false;
    session.speaking = false;
    setAnswerReady(true);
    updateVoiceControls(status);
  }

  function clearSpeechTimers() {
    if (speechState.startTimer) {
      window.clearTimeout(speechState.startTimer);
      speechState.startTimer = null;
    }
    if (speechState.watchdogTimer) {
      window.clearTimeout(speechState.watchdogTimer);
      speechState.watchdogTimer = null;
    }
  }

  function setAnswerReady(ready) {
    const buttons = [...els.optionGrid.querySelectorAll(".option-btn")];
    buttons.forEach((button) => {
      button.disabled = !ready || session.locked;
      button.classList.toggle("waiting", !ready && !session.locked);
    });
  }

  function updateVoiceControls(status) {
    if (status === "ready") {
      els.reciteBtn.disabled = false;
      els.reciteBtn.textContent = "温柔女声朗读";
      els.voiceStatus.textContent = "请先听朗读，听完后开始答题。";
      return;
    }

    if (status === "speaking") {
      els.reciteBtn.disabled = true;
      els.reciteBtn.textContent = "朗读中";
      els.voiceStatus.textContent = "温柔女声正在朗读，稍后解锁答题。";
      return;
    }

    els.reciteBtn.disabled = false;
    els.reciteBtn.textContent = "重听朗读";

    if (status === "unsupported") {
      els.voiceStatus.textContent = "此浏览器不支持自动朗读，可由教师朗读后答题。";
    } else if (status === "error") {
      els.voiceStatus.textContent = "朗读未成功播放，可重听或直接答题。";
    } else {
      els.voiceStatus.textContent = "朗读完成，请选择正确下句。";
    }
  }

  function showResult() {
    const passed = session.correctCount >= 3;
    const alreadyCompleted = state.completed.includes(session.region.id);

    if (passed && !alreadyCompleted) {
      state.completed.push(session.region.id);
      state.completed.sort((a, b) => regionById.get(a).unlockOrder - regionById.get(b).unlockOrder);
      saveState();
    }

    els.quizView.hidden = true;
    els.resultView.hidden = false;
    els.resultStamp.textContent = passed ? "盖章" : "再试";
    els.resultTitle.textContent = passed ? `${session.region.name} 通关` : `${session.region.name} 未通关`;
    els.resultSummary.textContent = `答对 ${session.correctCount}/${session.region.questions.length} 题，本次获得 ${session.earnedScore} 分。`;

    if (session.practice) {
      els.resultHint.textContent = "这是已通关地区的重游练习，印章与积分不会重复获得。";
    } else if (passed) {
      const next = regions.find((region) => statusFor(region) === "unlocked" && region.id !== session.region.id);
      els.resultHint.textContent = next
        ? `已收集 ${session.region.poet} 印章，下一站解锁：${next.name}。`
        : "十五站诗路全部通关，盛唐诗卷已经集齐。";
    } else {
      els.resultHint.textContent = "答对至少 3 题即可盖章通关，本地区仍保持解锁，可立即再挑战。";
    }

    render();
  }

  function resetGame() {
    const ok = window.confirm("确定要清空积分、印章和解锁进度吗？");
    if (!ok) return;

    state = { score: 0, combo: 0, completed: [] };
    saveState();
    closeModal();
    render();
  }

  els.resetBtn.addEventListener("click", resetGame);
  els.closeModalBtn.addEventListener("click", closeModal);
  els.reciteBtn.addEventListener("click", () => playRecitation(currentQuestion()));
  els.backMapBtn.addEventListener("click", closeModal);
  els.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === els.modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.modalBackdrop.hidden) closeModal();
  });

  render();
})();
