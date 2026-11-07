/* =========================================================
   篮球系统训练计划 — interactions, local persistence, exports
   ========================================================= */

(function () {
  "use strict";

  const DATA = window.PLAN_DATA;
  if (!DATA || !Array.isArray(DATA.days)) {
    document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif;">计划数据没有加载成功，请刷新页面。</p>';
    return;
  }

  const KEY = "basketball-plan-v1";
  const EPS = DATA.episodes;
  const DAYS = DATA.days;
  const WEEKS = DATA.weeks;
  const EP_BY_N = new Map(EPS.map(function (e) { return [e.n, e]; }));
  const DAY_BY_N = new Map(DAYS.map(function (d) { return [d.day, d]; }));
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

  const $ = function (selector, root) {
    return (root || document).querySelector(selector);
  };
  const $$ = function (selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function todayISO() {
    const now = new Date();
    return now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
  }

  function parseISO(iso) {
    const parts = String(iso || "").split("-").map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }

  function isValidISO(iso) {
    if (!ISO_RE.test(String(iso || ""))) return false;
    const parts = String(iso).split("-").map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return d.getUTCFullYear() === parts[0] && d.getUTCMonth() === parts[1] - 1 && d.getUTCDate() === parts[2];
  }

  function fmtDate(iso, offset) {
    if (!isValidISO(iso)) return "—";
    const d = parseISO(iso);
    d.setUTCDate(d.getUTCDate() + (offset || 0));
    const weekdays = "日一二三四五六";
    return (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日 周" + weekdays[d.getUTCDay()];
  }

  function diffDays(fromISO, toISO) {
    return Math.round((parseISO(toISO).getTime() - parseISO(fromISO).getTime()) / 86400000);
  }

  function timeNow() {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date());
  }

  function defaultState() {
    return {
      version: 1,
      startDate: todayISO(),
      videos: {},
      practice: {},
      notes: {},
      updatedAt: ""
    };
  }

  function cleanBoolMap(input, isValidKey) {
    const output = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) return output;
    Object.keys(input).forEach(function (key) {
      const n = Number(key);
      if (isValidKey(n) && input[key] === true) output[n] = true;
    });
    return output;
  }

  function cleanNotes(input) {
    const output = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) return output;
    Object.keys(input).forEach(function (key) {
      const day = Number(key);
      const note = input[key];
      if (!DAY_BY_N.has(day) || !note || typeof note !== "object" || Array.isArray(note)) return;
      const reflection = typeof note.reflection === "string" ? note.reflection.slice(0, 20000) : "";
      const confusion = typeof note.confusion === "string" ? note.confusion.slice(0, 20000) : "";
      output[day] = { reflection: reflection, confusion: confusion };
    });
    return output;
  }

  function normalizeState(input) {
    const base = defaultState();
    if (!input || typeof input !== "object") return base;
    return {
      version: 1,
      startDate: isValidISO(input.startDate) ? input.startDate : base.startDate,
      videos: cleanBoolMap(input.videos, function (n) { return EP_BY_N.has(n); }),
      practice: cleanBoolMap(input.practice, function (n) { return DAY_BY_N.has(n); }),
      notes: cleanNotes(input.notes),
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : ""
    };
  }

  let storageOk = true;
  let hadSaved = false;
  let state = loadState();
  let activeWeek = "all";
  let saveTimer = null;

  function loadState() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return defaultState();
      hadSaved = true;
      return normalizeState(JSON.parse(raw));
    } catch (err) {
      storageOk = false;
      return defaultState();
    }
  }

  function setSaveStatus(text, isError) {
    const el = $("#saveStatus");
    const label = $("#saveText");
    if (!el || !label) return;
    label.textContent = text;
    el.classList.toggle("error", !!isError);
  }

  function saveState(showStatus) {
    if (!storageOk) {
      setSaveStatus("无法保存，请导出备份", true);
      return;
    }
    try {
      state.updatedAt = new Date().toISOString();
      window.localStorage.setItem(KEY, JSON.stringify(state));
      if (showStatus) setSaveStatus("已自动保存 · " + timeNow());
    } catch (err) {
      storageOk = false;
      setSaveStatus("无法保存，请导出备份", true);
    }
  }

  function scheduleSave() {
    setSaveStatus("保存中…");
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveTimer = null;
      saveState(true);
    }, 240);
  }

  function flushSave() {
    if (!saveTimer) return;
    window.clearTimeout(saveTimer);
    saveTimer = null;
    saveState(false);
  }

  function safeStart() {
    return isValidISO(state.startDate) ? state.startDate : todayISO();
  }

  function currentDayNumber() {
    const n = diffDays(safeStart(), todayISO()) + 1;
    return n >= 1 && n <= DAYS.length ? n : null;
  }

  function dayVideosDone(day) {
    return day.videos.reduce(function (sum, n) {
      return sum + (state.videos[n] ? 1 : 0);
    }, 0);
  }

  function isDayComplete(day) {
    return dayVideosDone(day) === day.videos.length && state.practice[day.day] === true;
  }

  function dayUnits(day) {
    return day.videos.length + 1;
  }

  function dayUnitsDone(day) {
    return dayVideosDone(day) + (state.practice[day.day] ? 1 : 0);
  }

  function statusInfo(day) {
    if (isDayComplete(day)) return { label: "已完成", cls: "done" };
    if (dayUnitsDone(day) > 0) return { label: "进行中", cls: "active" };
    return { label: "未开始", cls: "" };
  }

  function hasNotes(day) {
    const note = state.notes[day.day];
    return !!(note && ((note.reflection && note.reflection.trim()) || (note.confusion && note.confusion.trim())));
  }

  function totalUnits() {
    return DAYS.reduce(function (sum, d) { return sum + dayUnits(d); }, 0);
  }

  function totalUnitsDone() {
    return DAYS.reduce(function (sum, d) { return sum + dayUnitsDone(d); }, 0);
  }

  function overallPercent() {
    const total = totalUnits();
    return total ? Math.round((totalUnitsDone() / total) * 100) : 0;
  }

  function completedDayCount() {
    return DAYS.filter(isDayComplete).length;
  }

  function videosDoneCount() {
    return EPS.reduce(function (sum, e) { return sum + (state.videos[e.n] ? 1 : 0); }, 0);
  }

  function notesDayCount() {
    return DAYS.filter(hasNotes).length;
  }

  /* ---------------- render plan ---------------- */

  function renderWeekNav() {
    const items = [{ key: "all", label: "全部 28 天" }].concat(
      WEEKS.map(function (w) { return { key: String(w.week), label: "第" + w.week + "周" }; })
    );
    $("#weekNav").innerHTML = items.map(function (item) {
      const active = activeWeek === item.key;
      return '<button type="button" class="week-chip' + (active ? " active" : "") +
        '" data-week="' + item.key + '" role="tab" aria-selected="' + active + '">' +
        esc(item.label) + "</button>";
    }).join("");
  }

  function renderWeekBars() {
    $("#weekBars").innerHTML = WEEKS.map(function (w) {
      return '<div class="week-bar" data-week-bar="' + w.week + '">' +
        "<span>W" + w.week + "</span>" +
        '<span class="bar"><i></i></span>' +
        '<span class="count">0/7</span>' +
        "</div>";
    }).join("");
  }

  function renderDay(day) {
    const date = fmtDate(safeStart(), day.day - 1);
    const done = dayVideosDone(day);
    const complete = isDayComplete(day);
    const status = statusInfo(day);
    const note = state.notes[day.day] || { reflection: "", confusion: "" };
    const open = day.day === currentDayNumber();

    const videoRows = day.videos.map(function (n) {
      const ep = EP_BY_N.get(n);
      if (!ep) return "";
      const checked = state.videos[n] ? " checked" : "";
      return '<div class="video-row' + (checked ? " done" : "") + '">' +
        '<label class="check">' +
        '<input type="checkbox" data-ep="' + n + '"' + checked + ' aria-label="标记第' + n + '集已看完">' +
        '<span class="box" aria-hidden="true"></span>' +
        "</label>" +
        '<div class="v-main">' +
        '<div class="v-title-line">' +
        '<span class="ep-tag">EP ' + pad2(n) + "</span>" +
        '<span class="v-title">' + esc(ep.title) + "</span>" +
        '<span class="v-dur">' + esc(ep.duration) + "</span>" +
        (ep.dupe ? '<span class="dupe-tag">重复课</span>' : "") +
        '<a class="v-link" href="' + esc(ep.url) + '" target="_blank" rel="noopener" aria-label="在 Bilibili 打开第' + n + '集">↗</a>' +
        "</div>" +
        '<p class="v-summary">' + esc(ep.summary) + "</p>" +
        "</div>" +
        "</div>";
    }).join("");

    const practiceList = day.practice.map(function (item) {
      return "<li>" + esc(item) + "</li>";
    }).join("");

    const meta = day.review
      ? "复盘日 · 练习约 " + day.practice_min + " 分钟 · 共约 " + day.estimated_min + " 分钟"
      : '<span data-video-count-for="' + day.day + '">' + done + "/" + day.videos.length + "</span> 集 · 视频 " +
        esc(day.video_time) + " · 练习约 " + day.practice_min + " 分钟 · 共约 " + day.estimated_min + " 分钟";

    return '<details class="day-card' + (complete ? " is-complete" : "") + '" data-day="' + day.day +
      '" id="day-' + day.day + '"' + (open ? " open" : "") + ">" +
      "<summary>" +
      '<span class="day-num">' + pad2(day.day) + "</span>" +
      '<span class="day-info">' +
      '<span class="day-kicker">' +
      "<span>DAY " + pad2(day.day) + "</span>" +
      '<span class="kicker-dot">·</span>' +
      '<span data-date-for="' + day.day + '">' + esc(date) + "</span>" +
      '<span data-today-slot="' + day.day + '"></span>' +
      (day.review ? '<span class="review-badge">复盘日</span>' : "") +
      "</span>" +
      '<span class="day-title">' + esc(day.title) + "</span>" +
      '<span class="day-meta">' + meta + "</span>" +
      "</span>" +
      '<span class="day-side"><span class="status-pill ' + status.cls + '" data-status-for="' + day.day + '">' + status.label + "</span></span>" +
      '<span class="chevron" aria-hidden="true">⌄</span>' +
      "</summary>" +
      '<div class="day-body">' +
      '<p class="day-focus">' + esc(day.focus) + "</p>" +
      (day.review ? '<p class="review-note">今天不安排新视频，完成下面的复盘练习即可。</p>' : '<div class="video-list">' + videoRows + "</div>") +
      '<div class="practice-box">' +
      '<div class="practice-head"><h4>今日练习</h4><span class="practice-time">约 ' + day.practice_min + " 分钟</span></div>" +
      '<ul class="practice-list">' + practiceList + "</ul>" +
      '<label class="practice-check">' +
      '<input type="checkbox" data-practice="' + day.day + '"' + (state.practice[day.day] ? " checked" : "") + ">" +
      '<span class="box" aria-hidden="true"></span>' +
      "<span>完成今日练习</span>" +
      "</label>" +
      "</div>" +
      '<div class="notes-grid">' +
      '<label class="note-field"><span>练习感悟</span><textarea data-note="reflection" data-day="' + day.day +
      '" placeholder="' + esc(day.prompt) + '">' + esc(note.reflection || "") + "</textarea></label>" +
      '<label class="note-field"><span>困惑 / 待解决</span><textarea data-note="confusion" data-day="' + day.day +
      '" placeholder="例如：变向时总掉球，是重心太高还是手型不对？">' + esc(note.confusion || "") + "</textarea></label>" +
      "</div>" +
      '<div class="day-foot"><span>' +
      (day.review ? "复盘日 · 无新视频" : "视频 " + esc(day.video_time) + " · 练习约 " + day.practice_min + " 分钟") +
      "</span><span>" + (day.review ? "复盘日" : "学习日") + " · 预计 " + day.estimated_min + " 分钟</span></div>" +
      "</div>" +
      "</details>";
  }

  function renderDays() {
    $("#planDays").innerHTML = WEEKS.map(function (week) {
      const days = DAYS.filter(function (d) { return d.week === week.week; });
      return '<section class="week-block" data-week-block="' + week.week + '">' +
        '<div class="week-heading">' +
        '<span class="week-no">WEEK ' + week.week + "</span>" +
        "<h3>" + esc(week.title) + "</h3>" +
        '<span class="week-count" data-week-count="' + week.week + '">0/7 完成</span>' +
        "</div>" +
        days.map(renderDay).join("") +
        "</section>";
    }).join("");
  }

  function renderIndex() {
    $("#courseIndex").innerHTML = DATA.modules.map(function (module) {
      const rows = module.episodes.map(function (n) {
        const ep = EP_BY_N.get(n);
        if (!ep) return "";
        const haystack = (n + " " + ep.title + " " + ep.summary + " " + ep.module).toLowerCase();
        return '<div class="course-row" data-course-ep="' + n + '" data-search="' + esc(haystack) + '">' +
          '<span class="course-ep">' + pad2(n) + "</span>" +
          "<div><strong>" + esc(ep.title) + "</strong><p>" + esc(ep.summary) + "</p></div>" +
          '<span class="course-dur">' + esc(ep.duration) + "</span>" +
          '<span class="watch-dot" data-watch="' + n + '" role="img" aria-label="第' + n + '集未观看" title="未观看"></span>' +
          "</div>";
      }).join("");
      return '<section class="course-module">' +
        "<h3>" + esc(module.name) + "<span>" + module.episodes.length + " 集</span></h3>" +
        rows +
        "</section>";
    }).join("");
    updateIndexStatus();
  }

  function renderBrief(weekKey) {
    const el = $("#weekBrief");
    if (!el) return;
    if (weekKey === "all") {
      el.innerHTML = "<div>" +
        "<h3>28 天怎么练</h3>" +
        "<p>每天先看 2–4 集短视频，再完成 25–45 分钟练习，最后写 2 句话。第 7、14、21、28 天是复盘日，不排新视频。</p>" +
        '<p class="brief-outcome">第 34–37 集与第 30–33 集内容重复，已安排在 Day 13 作为复习课，不计入新进度。</p>' +
        "</div>" +
        '<div class="brief-progress"><strong>' + completedDayCount() + '/28</strong><span>已完成训练日</span></div>';
      return;
    }
    const week = WEEKS.filter(function (w) { return String(w.week) === String(weekKey); })[0];
    if (!week) return;
    const days = DAYS.filter(function (d) { return d.week === week.week; });
    const done = days.filter(isDayComplete).length;
    el.innerHTML = "<div>" +
      "<h3>第" + week.week + "周 · " + esc(week.title) + "</h3>" +
      "<p>" + esc(week.focus) + "</p>" +
      '<p class="brief-outcome">本周目标：' + esc(week.outcome) + "</p>" +
      "</div>" +
      '<div class="brief-progress"><strong>' + done + '/7</strong><span>本周完成</span></div>';
  }

  /* ---------------- updates ---------------- */

  function updateDateLabels(openTodayCard) {
    const start = safeStart();
    const current = currentDayNumber();
    DAYS.forEach(function (day) {
      const card = document.getElementById("day-" + day.day);
      if (!card) return;
      const dateEl = card.querySelector("[data-date-for]");
      if (dateEl) dateEl.textContent = fmtDate(start, day.day - 1);
      const slot = card.querySelector("[data-today-slot]");
      if (slot) slot.innerHTML = day.day === current ? '<span class="today-badge">今天</span>' : "";
      card.classList.toggle("today", day.day === current);
    });
    if (openTodayCard && current) openDay(current, false);
  }

  function updateAllDayCards() {
    DAYS.forEach(function (day) {
      const card = document.getElementById("day-" + day.day);
      if (!card) return;
      const complete = isDayComplete(day);
      const status = statusInfo(day);
      card.classList.toggle("is-complete", complete);
      const pill = card.querySelector("[data-status-for]");
      if (pill) {
        pill.textContent = status.label;
        pill.classList.remove("active", "done");
        if (status.cls) pill.classList.add(status.cls);
      }
      const count = card.querySelector("[data-video-count-for]");
      if (count) count.textContent = dayVideosDone(day) + "/" + day.videos.length;
      $$("[data-ep]", card).forEach(function (input) {
        const n = Number(input.getAttribute("data-ep"));
        input.checked = !!state.videos[n];
        const row = input.closest(".video-row");
        if (row) row.classList.toggle("done", input.checked);
      });
      const practice = card.querySelector("[data-practice]");
      if (practice) practice.checked = state.practice[day.day] === true;
    });
  }

  function updateWeekBars() {
    WEEKS.forEach(function (week) {
      const days = DAYS.filter(function (d) { return d.week === week.week; });
      const done = days.filter(isDayComplete).length;
      const bar = $('[data-week-bar="' + week.week + '"]');
      if (bar) {
        bar.querySelector("i").style.width = ((done / days.length) * 100) + "%";
        bar.querySelector(".count").textContent = done + "/" + days.length;
        bar.classList.toggle("done", done === days.length);
      }
      const heading = $('[data-week-count="' + week.week + '"]');
      if (heading) heading.textContent = done + "/" + days.length + " 完成";
    });
  }

  function updateStats() {
    const vDone = videosDoneCount();
    const dDone = completedDayCount();
    const nDone = notesDayCount();
    const total = totalUnits();
    const done = totalUnitsDone();
    const pct = overallPercent();

    $("#statVideos").innerHTML = vDone + "<span>/" + EPS.length + "</span>";
    $("#statDays").innerHTML = dDone + "<span>/" + DAYS.length + "</span>";
    $("#statNotes").innerHTML = nDone + "<span>/" + DAYS.length + "</span>";
    $("#sidePercent").textContent = pct + "%";
    $("#overallBar").style.width = pct + "%";

    const caption = $("#overallCaption");
    if (done === 0) {
      caption.textContent = "还没有开始。先看完第 1 天的视频，再完成练习。";
    } else if (done === total) {
      caption.textContent = "28 天全部完成。可以回看复盘，制定下一阶段目标。";
    } else {
      caption.textContent = "已打卡 " + done + " / " + total + " 项（视频 + 练习）。继续保持。";
    }
    updateWeekBars();
  }

  function updateTodayCard() {
    const start = safeStart();
    const diff = diffDays(start, todayISO());
    const day = DAY_BY_N.get(diff + 1);
    const card = $("#todayCard");
    const dateEl = $("#todayDate");
    const dayEl = $("#todayDay");
    const titleEl = $("#todayTitle");
    const metaEl = $("#todayMeta");
    const hintEl = $("#todayHint");
    const bar = $("#todayBar");
    const button = $("#goToday");

    dateEl.textContent = fmtDate(todayISO(), 0);

    if (!day) {
      if (diff < 0) {
        const wait = Math.abs(diff);
        card.classList.remove("is-done");
        dayEl.textContent = "DAY —";
        titleEl.textContent = "距离开练还有 " + wait + " 天";
        metaEl.textContent = "计划从 " + fmtDate(start, 0) + " 开始。";
        hintEl.textContent = "先把球、球鞋、水和第一天的视频准备好。";
        bar.style.width = "0%";
        button.dataset.target = "1";
        button.innerHTML = '查看第 1 天 <span aria-hidden="true">→</span>';
      } else {
        const dDone = completedDayCount();
        const vDone = videosDoneCount();
        card.classList.toggle("is-done", dDone === DAYS.length);
        dayEl.textContent = "28 / 28";
        titleEl.textContent = "28 天计划已结束";
        metaEl.textContent = "已完成 " + dDone + "/28 天 · 已看 " + vDone + "/" + EPS.length + " 集。";
        hintEl.textContent = "回看复盘，给自己定下一个 28 天目标。";
        bar.style.width = overallPercent() + "%";
        button.dataset.target = "28";
        button.innerHTML = '回看第 28 天 <span aria-hidden="true">→</span>';
      }
      return;
    }

    const done = dayUnitsDone(day);
    const total = dayUnits(day);
    const complete = isDayComplete(day);
    card.classList.toggle("is-done", complete);
    dayEl.textContent = "DAY " + pad2(day.day);
    titleEl.textContent = day.title;
    metaEl.textContent = day.review
      ? "复盘日 · 练习约 " + day.practice_min + " 分钟"
      : day.videos.length + " 集视频 · 练习约 " + day.practice_min + " 分钟";
    bar.style.width = ((done / total) * 100) + "%";

    if (complete) {
      hintEl.textContent = "今天已完成，做得好。";
    } else if (dayVideosDone(day) === 0) {
      hintEl.textContent = "先看完视频，再开始今天的练习。";
    } else if (!state.practice[day.day]) {
      hintEl.textContent = "视频 " + dayVideosDone(day) + "/" + day.videos.length + " 集，练习还没打卡。";
    } else {
      hintEl.textContent = "练习已打卡，检查一下视频是否都看完了。";
    }
    button.dataset.target = String(day.day);
    button.innerHTML = '查看今日任务 <span aria-hidden="true">→</span>';
  }

  function updateIndexStatus() {
    $$("[data-watch]").forEach(function (dot) {
      const n = Number(dot.getAttribute("data-watch"));
      const watched = !!state.videos[n];
      const row = dot.closest(".course-row");
      if (row) row.classList.toggle("watched", watched);
      dot.title = watched ? "已观看" : "未观看";
      dot.setAttribute("aria-label", "第" + n + "集" + (watched ? "已观看" : "未观看"));
    });
  }

  function updateAll() {
    updateAllDayCards();
    updateStats();
    updateTodayCard();
    updateIndexStatus();
    renderBrief(activeWeek);
    updateDateLabels(false);
  }

  /* ---------------- navigation ---------------- */

  function openDay(day, scroll) {
    const el = document.getElementById("day-" + day);
    if (!el) return;
    el.open = true;
    if (scroll) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      el.classList.add("flash");
      window.setTimeout(function () { el.classList.remove("flash"); }, 1600);
    }
  }

  function setWeekFilter(weekKey, options) {
    const opts = options || {};
    activeWeek = weekKey;
    $$(".week-chip").forEach(function (btn) {
      const active = btn.getAttribute("data-week") === weekKey;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    $$(".week-block").forEach(function (block) {
      block.hidden = weekKey !== "all" && block.getAttribute("data-week-block") !== weekKey;
    });
    renderBrief(weekKey);
    if (opts.openFirst && weekKey !== "all") {
      const days = DAYS.filter(function (d) { return String(d.week) === String(weekKey); });
      const target = days.filter(function (d) { return !isDayComplete(d); })[0] || days[days.length - 1];
      if (target) openDay(target.day, false);
    }
  }

  function jumpToDay(dayNumber) {
    const day = DAY_BY_N.get(dayNumber);
    if (!day) return;
    const weekKey = String(day.week);
    if (activeWeek !== weekKey) setWeekFilter(weekKey, { openFirst: false });
    openDay(dayNumber, true);
  }

  function filterIndex(query) {
    const q = String(query || "").trim().toLowerCase();
    let visible = 0;
    $$(".course-row").forEach(function (row) {
      const hit = !q || (row.getAttribute("data-search") || "").indexOf(q) !== -1;
      row.hidden = !hit;
      if (hit) visible += 1;
    });
    $$(".course-module").forEach(function (module) {
      const rows = $$(".course-row", module);
      module.hidden = !rows.some(function (row) { return !row.hidden; });
    });
    $("#searchCount").textContent = visible + " 集";
    $("#indexEmpty").hidden = visible !== 0;
  }

  /* ---------------- downloads ---------------- */

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
  }

  function noteForWord(day, key) {
    const note = state.notes[day.day];
    const value = note && note[key] ? note[key].trim() : "";
    return value ? esc(value).replace(/\r?\n/g, "<br>") : '<span class="muted">（未填写）</span>';
  }

  function buildWordHtml() {
    const start = safeStart();
    const vDone = videosDoneCount();
    const dDone = completedDayCount();
    const nDone = notesDayCount();
    const pct = overallPercent();
    const pieces = [];

    pieces.push('<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>篮球系统训练计划 · 学习记录</title>');
    pieces.push("<style>");
    pieces.push('@page { size: A4; margin: 2cm; }');
    pieces.push('body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 10.5pt; line-height: 1.65; color: #1b2a3a; }');
    pieces.push("h1 { font-size: 24pt; line-height: 1.25; color: #101d2c; margin: 0 0 4pt; }");
    pieces.push("h1 + .subtitle { font-size: 12pt; color: #657181; margin: 0 0 4pt; }");
    pieces.push("h2 { font-size: 15pt; color: #101d2c; margin: 22pt 0 8pt; padding-bottom: 4pt; border-bottom: 2px solid #e85d2a; }");
    pieces.push("h3 { font-size: 12pt; color: #101d2c; margin: 15pt 0 5pt; }");
    pieces.push(".meta { color: #657181; font-size: 9.5pt; line-height: 1.6; }");
    pieces.push(".muted { color: #8a94a1; }");
    pieces.push(".summary-table, .video-table, .notes-table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; }");
    pieces.push(".summary-table td, .summary-table th, .notes-table td { border: 1px solid #cfd6df; padding: 6pt 8pt; vertical-align: top; }");
    pieces.push(".summary-table td.label-cell { background: #f3efe5; color: #101d2c; font-weight: bold; width: 20%; }");
    pieces.push(".video-table th { background: #f3efe5; color: #101d2c; font-size: 9pt; font-weight: bold; }");
    pieces.push(".video-table td, .video-table th { border: 1px solid #d9dee5; padding: 4pt 6pt; vertical-align: top; font-size: 9.5pt; }");
    pieces.push(".video-table td.check-cell { text-align: center; font-size: 13pt; color: #2f7d5c; }");
    pieces.push(".video-table td.num-cell { text-align: center; color: #657181; }");
    pieces.push(".practice { border-left: 4px solid #e85d2a; background: #f7f3ea; padding: 8pt 10pt; margin: 7pt 0 9pt; }");
    pieces.push(".practice p { margin: 0 0 4pt; }");
    pieces.push(".practice ol { margin: 0 0 0 16pt; padding: 0; }");
    pieces.push(".practice li { margin: 2pt 0; }");
    pieces.push(".label { font-weight: bold; color: #101d2c; }");
    pieces.push(".notes-table td { width: 50%; min-height: 48pt; }");
    pieces.push(".day-status { font-size: 9pt; font-weight: normal; color: #657181; margin-left: 8pt; }");
    pieces.push(".footer-note { margin-top: 22pt; padding-top: 8pt; border-top: 1px solid #cfd6df; color: #8a94a1; font-size: 8.5pt; }");
    pieces.push("</style></head><body>");

    pieces.push("<h1>篮球系统训练计划 · 学习记录</h1>");
    pieces.push('<p class="subtitle">70 集视频 · 28 天 · 从规则到实战</p>');
    pieces.push('<p class="meta">开始日期：' + esc(fmtDate(start, 0)) + '　|　导出时间：' + esc(fmtDate(todayISO(), 0)) + " " + esc(timeNow()) + "</p>");
    pieces.push('<table class="summary-table"><tr>' +
      '<td class="label-cell">已看视频</td><td>' + vDone + " / " + EPS.length + " 集</td>" +
      '<td class="label-cell">完成训练日</td><td>' + dDone + " / " + DAYS.length + " 天</td></tr>" +
      '<tr><td class="label-cell">已写感悟</td><td>' + nDone + " / " + DAYS.length + " 天</td>" +
      '<td class="label-cell">总进度</td><td>' + pct + "%（视频 + 练习项）</td></tr></table>");

    WEEKS.forEach(function (week) {
      pieces.push("<h2>第" + week.week + "周 · " + esc(week.title) + "</h2>");
      pieces.push('<p class="meta">' + esc(week.focus) + "</p>");
      DAYS.filter(function (d) { return d.week === week.week; }).forEach(function (day) {
        const status = statusInfo(day);
        pieces.push("<h3>DAY " + pad2(day.day) + " · " + esc(day.title) +
          '<span class="day-status">' + esc(fmtDate(start, day.day - 1)) + " · " + status.label + "</span></h3>");
        pieces.push('<p class="meta">' + esc(day.focus) + "</p>");

        if (day.videos.length) {
          pieces.push('<table class="video-table"><tr><th style="width:8%">完成</th><th style="width:8%">集数</th><th style="width:25%">标题</th><th style="width:8%">时长</th><th>内容简介</th></tr>');
          day.videos.forEach(function (n) {
            const ep = EP_BY_N.get(n);
            const checked = state.videos[n] ? "☑" : "☐";
            pieces.push("<tr>" +
              '<td class="check-cell">' + checked + "</td>" +
              '<td class="num-cell">' + pad2(n) + "</td>" +
              "<td>" + esc(ep.title) + "</td>" +
              '<td class="num-cell">' + esc(ep.duration) + "</td>" +
              "<td>" + esc(ep.summary) + "</td>" +
              "</tr>");
          });
          pieces.push("</table>");
        } else {
          pieces.push('<p class="meta">今天不安排新视频，以复盘练习为主。</p>');
        }

        pieces.push('<div class="practice"><p class="label">今日练习' +
          (state.practice[day.day] ? "　☑ 已完成" : "　☐ 未完成") + "</p><ol>");
        day.practice.forEach(function (item) {
          pieces.push("<li>" + esc(item) + "</li>");
        });
        pieces.push("</ol></div>");

        pieces.push('<table class="notes-table"><tr>' +
          '<td><p class="label">练习感悟</p><p>' + noteForWord(day, "reflection") + "</p></td>" +
          '<td><p class="label">困惑 / 待解决</p><p>' + noteForWord(day, "confusion") + "</p></td>" +
          "</tr></table>");
      });
    });

    pieces.push('<p class="footer-note">由“篮球系统训练计划”学习站点导出。视频来源：Bilibili《篮球系统教学（入门到精通）》。训练前请热身，量力而行；如有伤病请遵医嘱。</p>');
    pieces.push("</body></html>");
    return pieces.join("");
  }

  function downloadWordRecord() {
    const html = buildWordHtml();
    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    downloadBlob(blob, "篮球28天训练计划_学习记录_" + todayISO() + ".doc");
    showToast("Word 文档已开始下载");
  }

  function backupRecords() {
    const payload = {
      app: "basketball-plan",
      version: 1,
      exportedAt: new Date().toISOString(),
      startDate: safeStart(),
      videos: state.videos,
      practice: state.practice,
      notes: state.notes
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, "篮球计划备份_" + todayISO() + ".json");
    showToast("备份文件已开始下载");
  }

  function importRecords(file) {
    file.text().then(function (text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error("文件不是有效的 JSON。");
      }
      if (!parsed || typeof parsed !== "object") throw new Error("文件里没有可导入的记录。");
      if (parsed.app && parsed.app !== "basketball-plan") throw new Error("这不是本计划的备份文件。");
      if (!parsed.startDate && !parsed.videos && !parsed.practice && !parsed.notes) {
        throw new Error("文件里没有可导入的记录。");
      }
      const imported = normalizeState(parsed);
      if (!window.confirm("导入备份会覆盖当前所有打卡和笔记，确定继续吗？")) return;
      state = imported;
      activeWeek = "all";
      renderAll();
      saveState(true);
      showToast("备份已导入");
    }).catch(function (err) {
      window.alert("导入失败：" + err.message);
    });
  }

  function resetRecords() {
    if (!window.confirm("确定清空全部打卡、感悟和困惑吗？这个操作无法撤销。")) return;
    const keepStart = safeStart();
    state = defaultState();
    state.startDate = keepStart;
    try { window.localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
    activeWeek = "all";
    renderAll();
    saveState(true);
    showToast("已清空全部记录");
  }

  function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 2300);
  }

  /* ---------------- init + events ---------------- */

  function renderAll() {
    $("#startDate").value = safeStart();
    activeWeek = "all";
    renderWeekNav();
    renderDays();
    renderIndex();
    renderWeekBars();
    renderBrief("all");
    setWeekFilter("all", { openFirst: false });
    updateDateLabels(true);
    updateAll();
    $("#courseSearch").value = "";
    filterIndex("");
  }

  function init() {
    renderAll();
    if (!storageOk) {
      setSaveStatus("当前浏览器无法保存，请导出备份", true);
    } else if (hadSaved) {
      setSaveStatus("已载入本地记录");
    } else {
      setSaveStatus("本地自动保存");
    }

    $("#weekNav").addEventListener("click", function (event) {
      const btn = event.target.closest("[data-week]");
      if (!btn) return;
      setWeekFilter(btn.getAttribute("data-week"), { openFirst: true });
    });

    $("#goToday").addEventListener("click", function (event) {
      const target = Number(event.currentTarget.getAttribute("data-target") || "1");
      jumpToDay(target);
    });

    $("#startDate").addEventListener("change", function (event) {
      const value = event.target.value;
      state.startDate = isValidISO(value) ? value : todayISO();
      event.target.value = state.startDate;
      updateDateLabels(true);
      const current = currentDayNumber();
      if (current && activeWeek !== "all" && String(Math.ceil(current / 7)) !== activeWeek) {
        setWeekFilter(String(Math.ceil(current / 7)), { openFirst: false });
      }
      updateAll();
      saveState(true);
      showToast("开始日期已更新");
    });

    document.addEventListener("change", function (event) {
      const epInput = event.target.closest("[data-ep]");
      if (epInput) {
        const n = Number(epInput.getAttribute("data-ep"));
        if (epInput.checked) state.videos[n] = true;
        else delete state.videos[n];
        updateAll();
        saveState(true);
        return;
      }
      const practiceInput = event.target.closest("[data-practice]");
      if (practiceInput) {
        const day = Number(practiceInput.getAttribute("data-practice"));
        if (practiceInput.checked) state.practice[day] = true;
        else delete state.practice[day];
        updateAll();
        saveState(true);
      }
    });

    document.addEventListener("input", function (event) {
      const textarea = event.target.closest("[data-note]");
      if (!textarea) return;
      const day = Number(textarea.getAttribute("data-day"));
      const kind = textarea.getAttribute("data-note");
      if (!state.notes[day]) state.notes[day] = { reflection: "", confusion: "" };
      state.notes[day][kind] = textarea.value;
      updateStats();
      scheduleSave();
    });

    $("#courseSearch").addEventListener("input", function (event) {
      filterIndex(event.target.value);
    });

    $("#exportWord").addEventListener("click", downloadWordRecord);
    $("#exportTop").addEventListener("click", downloadWordRecord);
    $("#backupBtn").addEventListener("click", backupRecords);
    $("#resetBtn").addEventListener("click", resetRecords);

    $("#importFile").addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      if (file) importRecords(file);
      event.target.value = "";
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushSave();
    });
    window.addEventListener("beforeunload", flushSave);
  }

  init();
})();
