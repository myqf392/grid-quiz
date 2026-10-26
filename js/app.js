(function () {
  "use strict";

  /* ---------- 题库结构 ---------- */

  var PART_META = [
    { name: "形势政策", short: "形势", tone: 1 },
    { name: "企业文化", short: "文化", tone: 2 },
    { name: "公司战略", short: "战略", tone: 3 },
    { name: "新型电力系统", short: "新电", tone: 4 },
    { name: "品牌建设", short: "品牌", tone: 5 }
  ];

  var PART_MAP = {};
  PART_META.forEach(function (item) {
    PART_MAP[item.name] = item;
  });

  var TYPE_META = [
    { key: "single", label: "单选" },
    { key: "multiple", label: "多选" },
    { key: "judge", label: "判断" }
  ];

  var TYPE_LABEL = {
    single: "单选题",
    multiple: "多选题",
    judge: "判断题"
  };

  var ICONS = {
    chevron:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    empty:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg>'
  };

  function isValidQuestion(q) {
    if (!q || typeof q !== "object") return false;
    if (typeof q.id !== "number") return false;
    if (!q.part || !PART_MAP[q.part]) return false;
    if (!q.type || !TYPE_LABEL[q.type]) return false;
    if (typeof q.stem !== "string" || !q.stem.trim()) return false;
    if (!Array.isArray(q.options) || q.options.length < 2) return false;
    if (!Array.isArray(q.answer) || !q.answer.length) return false;
    return true;
  }

  var source = Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : [];
  var seenId = {};
  var QUESTIONS = source.filter(function (q) {
    if (!isValidQuestion(q)) return false;
    if (seenId[q.id]) return false;
    seenId[q.id] = true;
    return true;
  });

  var TOTAL = QUESTIONS.length;
  var BY_ID = new Map();
  var ALL_IDS = [];
  var PART_QUESTIONS = {};
  var PART_TYPE_IDS = {};

  PART_META.forEach(function (meta) {
    PART_QUESTIONS[meta.name] = [];
    PART_TYPE_IDS[meta.name] = { single: [], multiple: [], judge: [] };
  });

  QUESTIONS.forEach(function (q) {
    BY_ID.set(q.id, q);
    ALL_IDS.push(q.id);
    PART_QUESTIONS[q.part].push(q.id);
    PART_TYPE_IDS[q.part][q.type].push(q.id);
  });

  /* ---------- 本地存储（不可用时退化为内存） ---------- */

  var KEYS = {
    records: "gridquiz.v2.records",
    wrong: "gridquiz.v2.wrong",
    last: "gridquiz.v2.last",
    theme: "gridquiz.theme.v1"
  };

  var storage = (function () {
    var mem = {};
    var usable = true;
    try {
      var probe = "__gridquiz_probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
    } catch (e) {
      usable = false;
    }
    return {
      get: function (key, fallback) {
        if (usable) {
          try {
            var raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
          } catch (e) {
            return fallback;
          }
        }
        return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : fallback;
      },
      set: function (key, value) {
        if (usable) {
          try {
            localStorage.setItem(key, JSON.stringify(value));
            return;
          } catch (e) {
            /* 存储写满时退回内存 */
          }
        }
        mem[key] = value;
      }
    };
  })();

  var records = storage.get(KEYS.records, {});
  if (!records || typeof records !== "object" || Array.isArray(records)) {
    records = {};
  }

  var savedWrong = storage.get(KEYS.wrong, []);
  if (!Array.isArray(savedWrong)) savedWrong = [];
  var wrongIds = [];
  var wrongSet = new Set();
  savedWrong.forEach(function (id) {
    if (BY_ID.has(id) && !wrongSet.has(id)) {
      wrongSet.add(id);
      wrongIds.push(id);
    }
  });

  var lastPos = storage.get(KEYS.last, {});
  if (!lastPos || typeof lastPos !== "object" || Array.isArray(lastPos)) {
    lastPos = {};
  }

  /* ---------- 主题 ---------- */

  var themeMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var savedTheme = storage.get(KEYS.theme, null);
  var currentTheme = savedTheme || (themeMedia && themeMedia.matches ? "dark" : "light");
  document.documentElement.dataset.theme = currentTheme;

  function toggleTheme() {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = currentTheme;
    storage.set(KEYS.theme, currentTheme);
  }

  /* ---------- 工具 ---------- */

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clampIndex(value, length) {
    if (!length) return 0;
    var n = parseInt(value, 10);
    if (isNaN(n) || n < 0) return 0;
    return Math.min(n, length - 1);
  }

  var toastTimer = null;

  function toast(message) {
    var node = $("#toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      node.classList.remove("show");
    }, 1800);
  }

  /* ---------- 页面切换 ---------- */

  function showScreen(name) {
    $$(".screen").forEach(function (screen) {
      screen.classList.toggle("active", screen.id === "screen-" + name);
    });
    $$(".home-main, .part-main, .session-main, .wrong-main").forEach(function (node) {
      node.scrollTop = 0;
    });
  }

  /* ---------- 状态与统计 ---------- */

  var currentPart = null;
  var selectedType = "all";
  var wrongFilter = { part: "all", type: "all" };

  function partMeta(name) {
    return PART_MAP[name] || PART_META[0];
  }

  function idsFor(part, type) {
    if (type === "all") return PART_QUESTIONS[part] || [];
    return (PART_TYPE_IDS[part] && PART_TYPE_IDS[part][type]) || [];
  }

  function wrongIdsFor(part, type) {
    return wrongIds.filter(function (id) {
      var q = BY_ID.get(id);
      if (!q) return false;
      if (part !== "all" && q.part !== part) return false;
      if (type !== "all" && q.type !== type) return false;
      return true;
    });
  }

  function countWrong(part, type) {
    var count = 0;
    wrongIds.forEach(function (id) {
      var q = BY_ID.get(id);
      if (!q) return;
      if (part !== "all" && q.part !== part) return;
      if (type !== "all" && q.type !== type) return;
      count += 1;
    });
    return count;
  }

  function getStats(ids) {
    var attempted = 0;
    var attempts = 0;
    var correct = 0;
    ids.forEach(function (id) {
      var rec = records[id];
      if (!rec) return;
      attempted += 1;
      attempts += rec.attempts || 0;
      correct += rec.correct || 0;
    });
    return {
      total: ids.length,
      attempted: attempted,
      attempts: attempts,
      correct: correct,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : null
    };
  }

  function saveState() {
    storage.set(KEYS.records, records);
    storage.set(KEYS.wrong, wrongIds);
    storage.set(KEYS.last, lastPos);
  }

  function addWrong(id) {
    if (wrongSet.has(id)) return;
    wrongSet.add(id);
    wrongIds.unshift(id);
  }

  function removeWrong(id) {
    if (!wrongSet.has(id)) return;
    wrongSet.delete(id);
    wrongIds = wrongIds.filter(function (item) {
      return item !== id;
    });
  }

  function posKey(mode, part, type) {
    return mode + "|" + part + "|" + type;
  }

  function getPos(mode, part, type, length) {
    return clampIndex(lastPos[posKey(mode, part, type)], length);
  }

  function setPos(mode, part, type, index) {
    lastPos[posKey(mode, part, type)] = index;
    saveState();
  }

  function clearPos(mode, part, type) {
    delete lastPos[posKey(mode, part, type)];
    saveState();
  }

  /* ---------- 首页 ---------- */

  function renderHome() {
    $("#bank-summary").textContent = "2027版题库 · " + TOTAL + " 道题";

    var stats = getStats(ALL_IDS);
    var ratio = TOTAL ? stats.attempted / TOTAL : 0;
    var percent = Math.round(ratio * 100);

    $("#stat-attempted").textContent = String(stats.attempted);
    $("#stat-accuracy").textContent = stats.accuracy === null ? "--" : stats.accuracy + "%";
    $("#stat-wrong").textContent = String(wrongIds.length);
    $("#home-progress").textContent = percent + "%";

    var circumference = 2 * Math.PI * 52;
    $("#ring-fg").style.strokeDashoffset = String(circumference * (1 - ratio));

    var badge = $("#wrong-badge");
    badge.textContent = String(wrongIds.length);
    badge.hidden = wrongIds.length === 0;

    renderPartList();
  }

  function renderPartList() {
    var list = $("#part-list");
    list.innerHTML = "";

    PART_META.forEach(function (meta) {
      var ids = PART_QUESTIONS[meta.name];
      var stats = getStats(ids);
      var wrongCount = countWrong(meta.name, "all");
      var types = PART_TYPE_IDS[meta.name];
      var percent = ids.length ? Math.round((stats.attempted / ids.length) * 100) : 0;

      var card = el("button", "part-card tone-" + meta.tone);
      card.type = "button";
      card.dataset.part = meta.name;

      card.appendChild(el("span", "part-badge", meta.short));

      var body = el("span", "part-body");
      body.appendChild(el("span", "part-name", meta.name));
      body.appendChild(
        el(
          "span",
          "part-meta",
          "单选 " + types.single.length + " · 多选 " + types.multiple.length + " · 判断 " + types.judge.length
        )
      );

      var bar = el("span", "part-bar");
      var fill = document.createElement("i");
      fill.style.width = percent + "%";
      bar.appendChild(fill);
      body.appendChild(bar);

      var foot = el("span", "part-foot");
      foot.appendChild(el("span", "", "已练 " + stats.attempted + "/" + ids.length));
      foot.appendChild(el("span", wrongCount ? "part-wrong" : "", wrongCount ? "错题 " + wrongCount : "暂无错题"));
      body.appendChild(foot);

      card.appendChild(body);

      var chevron = el("span", "part-chevron");
      chevron.innerHTML = ICONS.chevron;
      card.appendChild(chevron);

      list.appendChild(card);
    });
  }

  /* ---------- 部分练习页 ---------- */

  function openPart(name) {
    if (!PART_MAP[name]) return;
    currentPart = name;
    selectedType = "all";
    showScreen("part");
    renderPart();
  }

  function renderPart() {
    if (!currentPart) return;
    var meta = partMeta(currentPart);
    var allIds = PART_QUESTIONS[currentPart];
    var ids = idsFor(currentPart, selectedType);
    var stats = getStats(ids);
    var wrongCount = countWrong(currentPart, selectedType);
    var percent = ids.length ? Math.round((stats.attempted / ids.length) * 100) : 0;

    $("#part-title").textContent = meta.name;
    $("#part-subtitle").textContent = "共 " + allIds.length + " 题";

    var hero = $("#part-hero");
    hero.className = "part-hero tone-" + meta.tone;
    $("#part-hero-badge").textContent = meta.short;
    $("#part-hero-name").textContent = meta.name;
    $("#part-hero-desc").textContent =
      (selectedType === "all" ? "全部题型" : TYPE_LABEL[selectedType]) + " · 共 " + ids.length + " 题";
    $("#part-percent").textContent = percent + "%";
    $("#part-progress-bar").style.width = percent + "%";
    $("#part-attempted").textContent = String(stats.attempted);
    $("#part-accuracy").textContent = stats.accuracy === null ? "--" : stats.accuracy + "%";
    $("#part-wrong-stat").textContent = String(wrongCount);

    renderTypeChips();

    var answerPos = getPos("answer", currentPart, selectedType, ids.length);
    $("#part-answer-desc").textContent =
      answerPos > 0
        ? "继续上次 · 第 " + (answerPos + 1) + " 题，共 " + ids.length + " 题"
        : "共 " + ids.length + " 题 · 答错自动进入错题本";
    $("#part-answer-cta").textContent =
      answerPos > 0 ? "继续 · 第 " + (answerPos + 1) + " 题" : "从头开始 · 共 " + ids.length + " 题";

    var studyPos = getPos("study", currentPart, selectedType, ids.length);
    $("#part-study-desc").textContent =
      studyPos > 0
        ? "题目与答案同屏 · 上次第 " + (studyPos + 1) + " 题"
        : "题目与答案同屏，快速过一遍";

    $("#part-wrong-desc").textContent =
      (selectedType === "all" ? "本部分" : "当前题型") + " " + wrongCount + " 道错题 · 仅手动移除";

    var badge = $("#part-wrong-badge");
    badge.textContent = String(wrongCount);
    badge.hidden = wrongCount === 0;
  }

  function renderTypeChips() {
    var items = [
      { value: "all", label: "全部", count: PART_QUESTIONS[currentPart].length }
    ];
    TYPE_META.forEach(function (type) {
      items.push({
        value: type.key,
        label: type.label,
        count: PART_TYPE_IDS[currentPart][type.key].length
      });
    });
    buildChips($("#type-chips"), items, selectedType, "type");
  }

  function buildChips(container, items, activeValue, dataKey) {
    container.innerHTML = "";
    items.forEach(function (item) {
      var chip = el("button", "chip" + (item.value === activeValue ? " active" : ""));
      chip.type = "button";
      chip.dataset[dataKey] = item.value;
      chip.appendChild(document.createTextNode(item.label));
      if (item.count !== undefined) {
        chip.appendChild(el("span", "chip-count", String(item.count)));
      }
      container.appendChild(chip);
    });
  }

  /* ---------- 练习会话 ---------- */

  var session = null;

  function currentQuestion() {
    return session ? BY_ID.get(session.queue[session.index]) : null;
  }

  function startSession(mode, part, type, options) {
    var opts = options || {};
    var queue = opts.queue ? opts.queue.slice() : idsFor(part, type);
    if (!queue.length) {
      toast("当前筛选暂无题目");
      return;
    }

    var index = typeof opts.index === "number" ? opts.index : getPos(mode, part, type, queue.length);

    session = {
      mode: mode,
      part: part,
      type: type,
      queue: queue,
      index: clampIndex(index, queue.length),
      wrongPractice: Boolean(opts.wrongPractice),
      judged: false,
      selected: new Set(),
      lastCorrect: null
    };

    showScreen("session");
    renderSession();
    persistPosition();
  }

  function sessionTitle() {
    if (session.mode === "study") {
      return "背题模式" + (session.part !== "all" ? " · " + session.part : "");
    }
    if (session.wrongPractice) {
      return "错题重练" + (session.part !== "all" ? " · " + session.part : "");
    }
    return "答题模式" + (session.part !== "all" ? " · " + session.part : "");
  }

  function renderSession() {
    var q = currentQuestion();
    if (!q) return;

    $("#session-mode-title").textContent = sessionTitle();
    $("#session-progress-text").textContent =
      "第 " + (session.index + 1) + " / " + session.queue.length + " 题";
    $("#session-progress-bar").style.width =
      ((session.index + 1) / session.queue.length) * 100 + "%";

    $("#q-part").textContent = q.part;
    $("#q-type").textContent = TYPE_LABEL[q.type];
    $("#q-index").textContent = "第 " + (session.index + 1) + " 题";
    $("#q-stem").textContent = q.stem;

    renderOptions();
    renderFeedback();
    renderFooter();
  }

  function renderOptions() {
    var q = currentQuestion();
    var container = $("#options");
    container.innerHTML = "";

    var isStudy = session.mode === "study";
    var judged = session.mode === "answer" && session.judged;

    q.options.forEach(function (opt) {
      var btn = el("button", "option");
      btn.type = "button";
      btn.dataset.key = opt.key;

      btn.appendChild(el("span", "option-key", opt.key));
      btn.appendChild(el("span", "option-text", opt.text));

      if (isStudy) {
        if (q.answer.indexOf(opt.key) !== -1) btn.classList.add("is-correct");
      } else if (judged) {
        if (q.answer.indexOf(opt.key) !== -1) {
          btn.classList.add("is-correct");
        } else if (session.selected.has(opt.key)) {
          btn.classList.add("is-wrong");
        } else {
          btn.classList.add("is-dim");
        }
        btn.disabled = true;
      } else if (session.selected.has(opt.key)) {
        btn.classList.add("is-selected");
      }

      btn.addEventListener("click", function () {
        handleOption(opt.key);
      });
      container.appendChild(btn);
    });
  }

  function answerText(q, keys) {
    var sorted = keys.slice().sort();
    if (q.type === "judge") {
      return sorted
        .map(function (key) {
          var found = null;
          q.options.forEach(function (opt) {
            if (opt.key === key) found = opt;
          });
          return found ? found.text : key;
        })
        .join("、");
    }
    return sorted.join("、");
  }

  function renderFeedback() {
    var node = $("#feedback");
    var q = currentQuestion();
    if (!node || !q) return;

    node.className = "feedback";
    node.innerHTML = "";

    if (session.mode === "study") {
      node.classList.add("show", "study");
      node.appendChild(el("div", "feedback-title", "正确答案：" + answerText(q, q.answer)));
      node.appendChild(el("div", "feedback-detail", "背题模式 · 答案已直接标出"));
      return;
    }

    if (!session.judged) return;

    var isCorrect = session.lastCorrect;
    node.classList.add("show", isCorrect ? "correct" : "wrong");
    node.appendChild(el("div", "feedback-title", isCorrect ? "回答正确" : "回答错误"));

    var mine = session.selected.size ? answerText(q, Array.from(session.selected)) : "未作答";
    var detail = isCorrect
      ? "正确答案：" + answerText(q, q.answer)
      : "正确答案：" + answerText(q, q.answer) + "　你的答案：" + mine;
    node.appendChild(el("div", "feedback-detail", detail));
  }

  function renderFooter() {
    var q = currentQuestion();
    if (!q) return;

    var prevBtn = $("#prev-btn");
    var nextBtn = $("#next-btn");
    var submitBtn = $("#submit-btn");

    prevBtn.disabled = session.index === 0;

    var isLast = session.index === session.queue.length - 1;
    nextBtn.textContent = isLast ? "完成本轮" : "下一题";

    var needsSubmit = session.mode === "answer" && q.type === "multiple" && !session.judged;
    submitBtn.hidden = !needsSubmit;
    submitBtn.disabled = session.selected.size === 0;
    nextBtn.hidden = needsSubmit;
    nextBtn.disabled = session.mode === "answer" && !session.judged;
  }

  function handleOption(key) {
    if (!session || session.mode !== "answer" || session.judged) return;

    var q = currentQuestion();
    if (!q) return;

    if (q.type === "multiple") {
      if (session.selected.has(key)) {
        session.selected.delete(key);
      } else {
        session.selected.add(key);
      }
      renderOptions();
      renderFooter();
    } else {
      session.selected = new Set([key]);
      judge();
    }
  }

  function judge() {
    if (!session || session.judged) return;
    var q = currentQuestion();
    if (!q) return;

    var selected = Array.from(session.selected).sort();
    var answer = q.answer.slice().sort();
    var isCorrect =
      selected.length === answer.length &&
      selected.every(function (key) {
        return answer.indexOf(key) !== -1;
      });

    session.judged = true;
    session.lastCorrect = isCorrect;
    updateRecord(q, isCorrect, selected);

    renderOptions();
    renderFeedback();
    renderFooter();

    if (!isCorrect) {
      toast(session.wrongPractice ? "已记录，继续巩固" : "答错了，已记录到错题本");
    } else if (session.wrongPractice) {
      toast("回答正确，错题仍保留");
    }
  }

  /* 答错才写入错题本；答对不会移除，只能在错题本中手动移除 */
  function updateRecord(question, isCorrect, selected) {
    var rec = records[question.id] || { attempts: 0, correct: 0, wrong: 0 };
    rec.attempts = (rec.attempts || 0) + 1;
    if (isCorrect) {
      rec.correct = (rec.correct || 0) + 1;
    } else {
      rec.wrong = (rec.wrong || 0) + 1;
      addWrong(question.id);
    }
    rec.lastCorrect = isCorrect;
    rec.lastSelected = selected;
    rec.lastAt = Date.now();
    records[question.id] = rec;
    saveState();
  }

  function resetTurn() {
    if (!session) return;
    session.judged = false;
    session.selected = new Set();
    session.lastCorrect = null;
  }

  function persistPosition() {
    if (!session || session.wrongPractice) return;
    setPos(session.mode, session.part, session.type, session.index);
  }

  function goPrev() {
    if (!session || session.index === 0) return;
    session.index -= 1;
    resetTurn();
    renderSession();
    persistPosition();
  }

  function goNext() {
    if (!session) return;
    if (session.mode === "answer" && !session.judged) return;

    if (session.index < session.queue.length - 1) {
      session.index += 1;
      resetTurn();
      renderSession();
      persistPosition();
    } else {
      finishSession();
    }
  }

  function finishSession() {
    if (!session) return;
    var finished = session;

    if (!finished.wrongPractice) {
      clearPos(finished.mode, finished.part, finished.type);
    }

    session = null;

    if (finished.wrongPractice) {
      showScreen("wrong");
      renderWrong();
      toast("本轮重练完成");
    } else {
      currentPart = finished.part;
      showScreen("part");
      renderPart();
      renderHome();
      toast("本轮已完成");
    }
  }

  function leaveSession() {
    if (!session) return;
    var leaving = session;
    persistPosition();
    session = null;

    if (leaving.wrongPractice) {
      showScreen("wrong");
      renderWrong();
    } else {
      currentPart = leaving.part;
      showScreen("part");
      renderPart();
      renderHome();
    }
  }

  /* ---------- 错题本 ---------- */

  function openWrong(part, type) {
    wrongFilter.part = part && PART_MAP[part] ? part : "all";
    wrongFilter.type = type && TYPE_LABEL[type] ? type : "all";
    showScreen("wrong");
    renderWrong();
  }

  function renderWrong() {
    var allCount = wrongIds.length;
    $("#wrong-count-text").textContent = allCount + " 道";
    $("#wrong-summary-count").textContent = String(allCount);

    var partItems = [{ value: "all", label: "全部", count: allCount }];
    PART_META.forEach(function (meta) {
      partItems.push({
        value: meta.name,
        label: meta.name,
        count: countWrong(meta.name, "all")
      });
    });
    buildChips($("#wrong-part-chips"), partItems, wrongFilter.part, "part");

    var typeItems = [
      {
        value: "all",
        label: "全部题型",
        count: countWrong(wrongFilter.part, "all")
      }
    ];
    TYPE_META.forEach(function (type) {
      typeItems.push({
        value: type.key,
        label: type.label,
        count: countWrong(wrongFilter.part, type.key)
      });
    });
    buildChips($("#wrong-type-chips"), typeItems, wrongFilter.type, "type");

    var filtered = wrongIdsFor(wrongFilter.part, wrongFilter.type);
    var practiceBtn = $("#start-wrong-practice");
    practiceBtn.disabled = filtered.length === 0;
    practiceBtn.textContent = filtered.length
      ? "开始重练 · " + filtered.length + " 道"
      : "暂无可重练错题";

    var clearBtn = $("#clear-wrong");
    clearBtn.hidden = allCount === 0;
    clearBtn.textContent =
      wrongFilter.part === "all" && wrongFilter.type === "all" ? "清空错题本" : "清空当前筛选";

    renderWrongList(filtered, allCount);
  }

  function renderWrongList(filtered, allCount) {
    var list = $("#wrong-list");
    list.innerHTML = "";

    if (!filtered.length) {
      var empty = el("div", "empty");
      empty.innerHTML = ICONS.empty;
      if (!allCount) {
        empty.appendChild(el("h3", "", "还没有错题"));
        empty.appendChild(el("p", "", "答题时答错的题目会自动收进来"));
      } else {
        empty.appendChild(el("h3", "", "当前筛选下没有错题"));
        empty.appendChild(el("p", "", "换个部分或题型看看"));
      }
      list.appendChild(empty);
      return;
    }

    if (wrongFilter.part === "all") {
      PART_META.forEach(function (meta) {
        var partIds = filtered.filter(function (id) {
          var q = BY_ID.get(id);
          return q && q.part === meta.name;
        });
        if (partIds.length) renderWrongGroup(meta, partIds);
      });
    } else {
      renderWrongGroup(partMeta(wrongFilter.part), filtered);
    }
  }

  function renderWrongGroup(meta, ids) {
    var group = el("section", "wrong-group");

    var head = el("div", "wrong-group-head");
    head.appendChild(el("span", "part-badge small tone-" + meta.tone, meta.short));
    head.appendChild(el("span", "wrong-group-title", meta.name));
    head.appendChild(el("span", "wrong-group-count", ids.length + " 道"));
    group.appendChild(head);

    ids.forEach(function (id, index) {
      var q = BY_ID.get(id);
      if (!q) return;
      var rec = records[id] || {};

      var item = el("div", "wrong-item");

      var main = el("button", "wrong-item-main");
      main.type = "button";
      main.appendChild(el("span", "wrong-item-index", String(index + 1)));

      var body = el("span", "wrong-item-body");
      body.appendChild(el("span", "wrong-item-stem", q.stem));
      body.appendChild(
        el(
          "span",
          "wrong-item-meta",
          TYPE_LABEL[q.type] + " · 错 " + (rec.wrong || 1) + " 次"
        )
      );
      main.appendChild(body);

      main.addEventListener("click", function () {
        startSession("answer", wrongFilter.part, wrongFilter.type, {
          queue: ids,
          index: index,
          wrongPractice: true
        });
      });

      var remove = el("button", "wrong-remove", "移除");
      remove.type = "button";
      remove.setAttribute("aria-label", "从错题本中移除这道题");
      remove.addEventListener("click", function () {
        removeWrong(q.id);
        saveState();
        renderWrong();
        renderHome();
        toast("已从错题本移除");
      });

      item.appendChild(main);
      item.appendChild(remove);
      group.appendChild(item);
    });

    $("#wrong-list").appendChild(group);
  }

  /* ---------- 事件绑定 ---------- */

  function bindEvents() {
    $$("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", toggleTheme);
    });

    $("#part-list").addEventListener("click", function (event) {
      var card = event.target.closest ? event.target.closest(".part-card") : null;
      if (card && card.dataset.part) openPart(card.dataset.part);
    });

    $("#part-back").addEventListener("click", function () {
      currentPart = null;
      showScreen("home");
      renderHome();
    });

    $("#type-chips").addEventListener("click", function (event) {
      var chip = event.target.closest ? event.target.closest(".chip") : null;
      if (!chip || !currentPart) return;
      selectedType = chip.dataset.type || "all";
      renderPart();
    });

    $("#part-answer").addEventListener("click", function () {
      if (!currentPart) return;
      startSession("answer", currentPart, selectedType);
    });

    $("#part-study").addEventListener("click", function () {
      if (!currentPart) return;
      startSession("study", currentPart, selectedType);
    });

    $("#part-wrong").addEventListener("click", function () {
      if (!currentPart) return;
      openWrong(currentPart, selectedType);
    });

    $("#start-wrong").addEventListener("click", function () {
      openWrong("all", "all");
    });

    $("#wrong-back").addEventListener("click", function () {
      if (wrongFilter.part !== "all") {
        currentPart = wrongFilter.part;
        selectedType = wrongFilter.type;
        showScreen("part");
        renderPart();
      } else {
        showScreen("home");
        renderHome();
      }
    });

    $("#wrong-part-chips").addEventListener("click", function (event) {
      var chip = event.target.closest ? event.target.closest(".chip") : null;
      if (!chip) return;
      wrongFilter.part = chip.dataset.part || "all";
      renderWrong();
    });

    $("#wrong-type-chips").addEventListener("click", function (event) {
      var chip = event.target.closest ? event.target.closest(".chip") : null;
      if (!chip) return;
      wrongFilter.type = chip.dataset.type || "all";
      renderWrong();
    });

    $("#start-wrong-practice").addEventListener("click", function () {
      var filtered = wrongIdsFor(wrongFilter.part, wrongFilter.type);
      if (!filtered.length) return;
      startSession("answer", wrongFilter.part, wrongFilter.type, {
        queue: filtered,
        index: 0,
        wrongPractice: true
      });
    });

    $("#clear-wrong").addEventListener("click", function () {
      var filtered = wrongIdsFor(wrongFilter.part, wrongFilter.type);
      if (!filtered.length) return;
      var allScope = wrongFilter.part === "all" && wrongFilter.type === "all";
      var message = allScope
        ? "确定清空全部错题吗？此操作不可恢复。"
        : "确定清空当前筛选下的 " + filtered.length + " 道错题吗？";
      if (!window.confirm(message)) return;

      var removing = new Set(filtered);
      wrongIds = wrongIds.filter(function (id) {
        return !removing.has(id);
      });
      removing.forEach(function (id) {
        wrongSet.delete(id);
      });
      saveState();
      renderWrong();
      renderHome();
      toast(allScope ? "错题本已清空" : "已清空当前筛选");
    });

    $("#session-back").addEventListener("click", leaveSession);
    $("#prev-btn").addEventListener("click", goPrev);
    $("#next-btn").addEventListener("click", goNext);

    $("#submit-btn").addEventListener("click", function () {
      if (!session || session.mode !== "answer") return;
      if (session.selected.size === 0) return;
      judge();
    });

    document.addEventListener("keydown", function (event) {
      if (!session) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (event.repeat) return;
        var q = currentQuestion();
        if (
          session.mode === "answer" &&
          !session.judged &&
          q &&
          q.type === "multiple" &&
          session.selected.size > 0
        ) {
          judge();
        } else {
          goNext();
        }
        return;
      }

      if (
        event.key.length === 1 &&
        /[a-dA-D]/.test(event.key) &&
        session.mode === "answer" &&
        !session.judged
      ) {
        event.preventDefault();
        handleOption(event.key.toUpperCase());
      }
    });
  }

  /* ---------- 初始化 ---------- */

  renderHome();
  renderWrong();
  bindEvents();
})();
