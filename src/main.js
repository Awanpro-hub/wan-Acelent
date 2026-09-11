import { Amplify } from "aws-amplify";
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signOut,
  getCurrentUser,
  resetPassword,
  confirmResetPassword,
} from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import outputs from "../amplify_outputs.json";

Amplify.configure(outputs);
const client = generateClient();

// 跟 amplify/functions/push-notify/resource.ts 裡的 VAPID_PUBLIC_KEY 是同一組公鑰
// （公鑰不是機密，本來就會出現在前端程式碼裡；私鑰只存在後端，不會出現在這裡）
var VAPID_PUBLIC_KEY = "BPBXKCP8yALA6fURWlQmoyT6zab2t75p8a6UJDg8FAFOhiNXl4XLJH2BAz2Lr2-oMG2SKEOE1suCfY_qpJzcu8g";
function urlBase64ToUint8Array(base64String) {
  var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  var rawData = atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/* ===================== constants ===================== */
var DEFAULT_GROUPS = [
  { id: "g1", name: "朋友", color: "var(--type-primary)" },
  { id: "g2", name: "同事", color: "var(--type-secondary)" },
  { id: "g3", name: "同學", color: "var(--type-status)" },
  { id: "g4", name: "親戚", color: "var(--accent)" },
  { id: "g5", name: "社團", color: "var(--type-other)" },
  { id: "g6", name: "商家", color: "var(--type-primary)" },
  { id: "g7", name: "鄰居", color: "var(--type-secondary)" },
  { id: "g8", name: "其他", color: "var(--type-status)" },
];
var LOG_TYPES = [
  { v: "4", label: "睡覺型／消費型顧客", target: 4, chip: "c4" },
  { v: "3", label: "有狀態領導人", target: 3, chip: "c3" },
  { v: "2", label: "經營型（一、二課）", target: 2, chip: "c2" },
  { v: "1", label: "陌生／跟進中", target: 1, chip: "c1" },
];
var PLAN_TYPES = [
  { v: "1", label: "主要對象", chip: "p1", minutes: "60-120 分鐘" },
  { v: "2", label: "次要對象", chip: "p2", minutes: "15-30 分鐘" },
  { v: "3", label: "有狀態對象", chip: "p3", minutes: "5-15 分鐘" },
  { v: "4", label: "其他", chip: "p4", minutes: "" },
];

function byV(list, v) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].v === v) return list[i];
  }
  return null;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}
function todayKey() {
  var d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function fmtDateHuman(key) {
  var p = key.split("-");
  return p[0] + "年" + parseInt(p[1], 10) + "月" + parseInt(p[2], 10) + "日";
}
function showToast(msg) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(function () {
    t.classList.remove("show");
  }, 2400);
}
function wirePasswordToggles() {
  document.querySelectorAll("[data-toggle-pw]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = document.getElementById(btn.getAttribute("data-toggle-pw"));
      if (!input) return;
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "👁" : "🙈";
    });
  });
}
function icsDateStamp() {
  var d = new Date();
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}
function icsEscape(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
function downloadIcsForPlan(p) {
  var t = byV(PLAN_TYPES, p.planType) || PLAN_TYPES[0];
  var dayKey = (p.planAt || "").slice(0, 10);
  if (!dayKey) return;
  var startD = new Date(dayKey + "T00:00:00");
  var endD = new Date(startD);
  endD.setDate(endD.getDate() + 1);
  var startKey = dayKey.replace(/-/g, "");
  var endKey = endD.getFullYear() + pad(endD.getMonth() + 1) + pad(endD.getDate());
  var uid = "workplan-" + p.id + "@aurora-action";
  var summary = "工作規劃：" + (p.contactName || "") + "（" + t.label + "）";
  var lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aurora Action//Work Plan//ZH-TW",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:" + uid,
    "DTSTAMP:" + icsDateStamp(),
    "DTSTART;VALUE=DATE:" + startKey,
    "DTEND;VALUE=DATE:" + endKey,
    "SUMMARY:" + icsEscape(summary),
  ];
  if (p.note) lines.push("DESCRIPTION:" + icsEscape(p.note));
  lines.push("END:VEVENT", "END:VCALENDAR");
  var ics = lines.join("\r\n") + "\r\n";
  var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "工作規劃-" + (p.contactName || "plan") + ".ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 4000);
}
function csvEscape(s) {
  var v = String(s == null ? "" : s);
  if (/[",\n]/.test(v)) {
    v = '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}
function exportRangeCsv(startKey, endKey) {
  var header = ["日期", "類別", "分類", "姓名", "備註"];
  var data = [];
  state.logs
    .filter(function (l) {
      var k = (l.loggedAt || "").slice(0, 10);
      return k >= startKey && k <= endKey;
    })
    .forEach(function (l) {
      var t = byV(LOG_TYPES, l.type) || LOG_TYPES[0];
      data.push([(l.loggedAt || "").slice(0, 10), "聯絡記錄", t.label, l.contactName || "", l.note || ""]);
    });
  state.plans
    .filter(function (p) {
      var k = (p.planAt || "").slice(0, 10);
      return k >= startKey && k <= endKey;
    })
    .forEach(function (p) {
      var t = byV(PLAN_TYPES, p.planType) || PLAN_TYPES[0];
      data.push([(p.planAt || "").slice(0, 10), "工作規劃", t.label, p.contactName || "", p.note || ""]);
    });
  data.sort(function (a, b) {
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  var rows = [header].concat(data);
  var csv =
    "﻿" +
    rows
      .map(function (r) {
        return r.map(csvEscape).join(",");
      })
      .join("\r\n") +
    "\r\n";
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "鯊魚日常匯出_" + startKey + "_至_" + endKey + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 4000);
  return data.length;
}
function friendlyAuthError(err) {
  var name = (err && err.name) || "";
  var map = {
    UsernameExistsException: "這個 Email 已經註冊過了，請直接登入。",
    NotAuthorizedException: "Email 或密碼不正確。",
    UserNotFoundException: "找不到這個帳號，請確認 Email 或先註冊。",
    UserNotConfirmedException: "這個帳號還沒完成驗證，請輸入收到的驗證碼。",
    CodeMismatchException: "驗證碼不正確，請再確認一次。",
    ExpiredCodeException: "驗證碼已過期，請重新寄送。",
    InvalidPasswordException: "密碼不符合規則，請至少 8 碼並包含英文字母與數字。",
    LimitExceededException: "操作太頻繁了，請稍後再試。",
    InvalidParameterException: "請確認輸入的 Email 格式正確。",
  };
  return map[name] || (err && err.message) || "發生錯誤，請再試一次。";
}

/* ===================== state ===================== */
var state = {
  authScreen: "loading", // loading | signin | signup | confirm | forgot | reset | setname | app
  pendingEmail: "",
  pendingPassword: "",
  pendingResetEmail: "",
  profile: null,
  view: "contacts",
  contacts: [],
  customGroups: [],
  logs: [],
  plans: [],
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  selectedDate: todayKey(),
  trackerTab: "today",
  quickAddMode: "log",
  calendarOpen: false,
  exportOpen: false,
  confirmDelete: null, // { kind: 'contact'|'log'|'plan', id }
  myIdentity: "",
  friends: [],
  teamStats: [],
  battleNotice: false,
  addFriendErr: "",
  pushSubs: [],
  showPushTutorial: false,
  pushBusy: false,
};
function genInviteCode() {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉容易看錯的 0/O/1/I
  var out = "";
  for (var i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
var _armDeleteTimer = null;
function isArmed(kind, id) {
  return !!(state.confirmDelete && state.confirmDelete.kind === kind && state.confirmDelete.id === id);
}
function armDelete(kind, id) {
  state.confirmDelete = { kind: kind, id: id };
  render();
  clearTimeout(_armDeleteTimer);
  _armDeleteTimer = setTimeout(function () {
    if (isArmed(kind, id)) {
      state.confirmDelete = null;
      render();
    }
  }, 3000);
}
function disarmDelete() {
  clearTimeout(_armDeleteTimer);
  state.confirmDelete = null;
}
var unsubs = [];
function clearSubs() {
  unsubs.forEach(function (u) {
    try {
      u.unsubscribe();
    } catch (e) {}
  });
  unsubs = [];
}

/* ===================== data layer ===================== */
function subscribeAll() {
  clearSubs();
  unsubs.push(
    client.models.Contact.observeQuery().subscribe({
      next: function (r) {
        state.contacts = r.items;
        render();
      },
    })
  );
  unsubs.push(
    client.models.CustomGroup.observeQuery().subscribe({
      next: function (r) {
        state.customGroups = r.items;
        render();
      },
    })
  );
  unsubs.push(
    client.models.ContactLog.observeQuery().subscribe({
      next: function (r) {
        state.logs = r.items;
        syncMyTeamStat();
        render();
      },
    })
  );
  unsubs.push(
    client.models.WorkPlan.observeQuery().subscribe({
      next: function (r) {
        state.plans = r.items;
        syncMyTeamStat();
        render();
      },
    })
  );
  unsubs.push(
    client.models.Friend.observeQuery().subscribe({
      next: function (r) {
        state.friends = r.items;
        syncMyTeamStat();
        render();
      },
    })
  );
  unsubs.push(
    client.models.TeamStat.observeQuery().subscribe({
      next: function (r) {
        state.teamStats = r.items;
        checkBattleNotice();
        render();
      },
    })
  );
  unsubs.push(
    client.models.PushSubscription.observeQuery().subscribe({
      next: function (r) {
        state.pushSubs = r.items;
        render();
      },
    })
  );
}

/* ===================== 推播通知 ===================== */
async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    showToast("這個瀏覽器不支援推播通知");
    return;
  }
  state.pushBusy = true;
  render();
  try {
    var reg = await navigator.serviceWorker.register("/sw.js");
    var existing = await reg.pushManager.getSubscription();
    if (!existing) {
      var perm = await Notification.requestPermission();
      if (perm !== "granted") {
        showToast("沒有允許通知權限，之後可以在瀏覽器/系統設定裡重新開啟");
        state.pushBusy = false;
        render();
        return;
      }
      existing = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    var sub = existing.toJSON();
    var already = state.pushSubs.some(function (s) {
      return s.endpoint === sub.endpoint;
    });
    if (!already) {
      await client.models.PushSubscription.create({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        authKey: sub.keys.auth,
      });
    }
    showToast("推播通知已開啟！");
  } catch (err) {
    console.error(err);
    showToast("開啟推播失敗，請確認瀏覽器有允許通知權限");
  }
  state.pushBusy = false;
  render();
}
async function disablePush() {
  state.pushBusy = true;
  render();
  try {
    if ("serviceWorker" in navigator) {
      var reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (reg) {
        var existing = await reg.pushManager.getSubscription();
        if (existing) {
          var endpoint = existing.endpoint;
          await existing.unsubscribe();
          var mine = state.pushSubs.filter(function (s) {
            return s.endpoint === endpoint;
          });
          for (var i = 0; i < mine.length; i++) {
            await client.models.PushSubscription.delete({ id: mine[i].id });
          }
        }
      }
    }
    showToast("已關閉推播通知");
  } catch (err) {
    console.error(err);
  }
  state.pushBusy = false;
  render();
}

/* ===================== 好友對戰 ===================== */
var _syncStatTimer = null;
function weekStatsFor(weekKeys) {
  var effectiveContacts = state.logs.filter(function (l) {
    return weekKeys.indexOf((l.loggedAt || "").slice(0, 10)) > -1;
  }).length;

  var appointments = 0;
  weekKeys.forEach(function (dk) {
    var haveType = { 1: false, 2: false, 3: false };
    plansOn(dk).forEach(function (p) {
      if (haveType[p.planType] !== undefined) haveType[p.planType] = true;
    });
    appointments += (haveType[1] ? 1 : 0) + (haveType[2] ? 1 : 0) + (haveType[3] ? 1 : 0);
  });

  var newPeople = state.logs.filter(function (l) {
    return l.type === "1" && weekKeys.indexOf((l.loggedAt || "").slice(0, 10)) > -1;
  }).length;

  return { effectiveContacts: effectiveContacts, appointments: appointments, newPeople: newPeople };
}
function syncMyTeamStat() {
  if (!state.profile || !state.myIdentity) return;
  clearTimeout(_syncStatTimer);
  _syncStatTimer = setTimeout(function () {
    var wk = weekRangeKeys(todayKey());
    var weekKey = wk[0];
    var s = weekStatsFor(wk);
    var viewers = state.friends
      .map(function (f) {
        return f.friendOwnerId;
      })
      .filter(Boolean);
    var mine = state.teamStats.filter(function (t) {
      return t.owner === state.myIdentity && t.weekKey === weekKey;
    })[0];
    var sameViewers =
      mine &&
      (mine.viewers || []).length === viewers.length &&
      (mine.viewers || []).every(function (v) {
        return viewers.indexOf(v) > -1;
      });
    if (
      mine &&
      mine.effectiveContacts === s.effectiveContacts &&
      mine.appointments === s.appointments &&
      mine.newPeople === s.newPeople &&
      sameViewers
    ) {
      return; // 沒有變化，不用多寫一次
    }
    var payload = {
      weekKey: weekKey,
      displayName: state.profile.displayName,
      effectiveContacts: s.effectiveContacts,
      appointments: s.appointments,
      newPeople: s.newPeople,
      viewers: viewers,
    };
    if (mine) {
      client.models.TeamStat.update(Object.assign({ id: mine.id }, payload)).catch(function () {});
    } else {
      client.models.TeamStat.create(payload).catch(function () {});
    }
  }, 400);
}
function checkBattleNotice() {
  var latest = 0;
  state.teamStats.forEach(function (t) {
    if (t.owner === state.myIdentity) return;
    var ts = Date.parse(t.updatedAt || "") || 0;
    if (ts > latest) latest = ts;
  });
  var lastSeen = 0;
  try {
    lastSeen = parseInt(localStorage.getItem("battleLastSeen") || "0", 10) || 0;
  } catch (e) {}
  state.battleNotice = latest > lastSeen;
}
function markBattleSeen() {
  state.battleNotice = false;
  try {
    localStorage.setItem("battleLastSeen", String(Date.now()));
  } catch (e) {}
}
async function ensureInviteCode() {
  if (!state.profile || state.profile.inviteCode) return;
  var code = genInviteCode();
  try {
    var res = await client.models.Profile.update({ id: state.profile.id, inviteCode: code });
    state.profile = res.data;
    render();
  } catch (e) {}
}

async function enterApp() {
  state.authScreen = "app";
  subscribeAll();
  render();
}

async function afterSignedIn() {
  try {
    // Profile 現在所有登入者都能「讀」到（好友對戰要靠邀請碼互相找到彼此），
    // 所以這裡拿到的清單是「大家的」Profile，要用自己的帳號 sub 挑出「我自己的」那一筆。
    var cu = await getCurrentUser();
    var res = await client.models.Profile.list();
    var mine = (res.data || []).filter(function (p) {
      return p.owner && p.owner.indexOf(cu.userId) === 0;
    })[0];
    if (mine) {
      state.profile = mine;
      state.myIdentity = mine.owner;
      await ensureInviteCode();
      enterApp();
      showToast("歡迎回來，" + mine.displayName + "！");
    } else {
      state.authScreen = "setname";
      render();
    }
  } catch (e) {
    console.error(e);
    state.authScreen = "setname";
    render();
  }
}

async function checkSession() {
  try {
    await getCurrentUser();
    await afterSignedIn();
  } catch (e) {
    state.authScreen = "signin";
    render();
  }
}

/* ===================== auth screens ===================== */
function renderAuthShell(inner) {
  var app = document.getElementById("app");
  app.innerHTML =
    '<div id="login-screen"><div class="login-card">' +
    '<div class="login-mark">🦈</div>' +
    "<h1>鯊魚日常</h1>" +
    inner +
    "</div></div>";
}

function renderLoading() {
  document.getElementById("app").innerHTML =
    '<div class="loading-screen"><div class="spinner"></div><div>載入中…</div></div>';
}

function renderSignIn() {
  renderAuthShell(
    '<p class="lede">分類名單與 10-3-1 每日追蹤，用你的 Email 登入。</p>' +
      '<form id="signin-form" class="stack">' +
      '<div><label class="field-label" for="si-email">Email</label>' +
      '<input class="text-input" id="si-email" type="email" required autocomplete="email" /></div>' +
      '<div><label class="field-label" for="si-pw">密碼</label>' +
      '<div class="pw-wrap"><input class="text-input" id="si-pw" type="password" required autocomplete="current-password" />' +
      '<button type="button" class="pw-toggle" data-toggle-pw="si-pw" title="顯示/隱藏密碼">👁</button></div></div>' +
      '<div class="field-error" id="si-err"></div>' +
      '<button type="submit" class="btn btn-accent btn-block">登入</button>' +
      "</form>" +
      '<div class="auth-toggle">還沒有帳號？<button id="go-signup" type="button">建立一個</button></div>' +
      '<div class="auth-toggle"><button id="go-forgot" type="button">忘記密碼？</button></div>'
  );
  wirePasswordToggles();
  document.getElementById("signin-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = document.getElementById("si-email").value.trim();
    var pw = document.getElementById("si-pw").value;
    var errEl = document.getElementById("si-err");
    errEl.textContent = "";
    try {
      await signIn({ username: email, password: pw });
      renderLoading();
      await afterSignedIn();
    } catch (err) {
      errEl.textContent = friendlyAuthError(err);
    }
  });
  document.getElementById("go-signup").addEventListener("click", function () {
    state.authScreen = "signup";
    render();
  });
  document.getElementById("go-forgot").addEventListener("click", function () {
    state.authScreen = "forgot";
    render();
  });
}

function renderForgotPassword() {
  renderAuthShell(
    '<p class="lede">輸入註冊時用的 Email，我們會寄一組驗證碼給你，用來設定新密碼。</p>' +
      '<form id="forgot-form" class="stack">' +
      '<div><label class="field-label" for="fp-email">Email</label>' +
      '<input class="text-input" id="fp-email" type="email" required autocomplete="email" /></div>' +
      '<div class="field-error" id="fp-err"></div>' +
      '<button type="submit" class="btn btn-accent btn-block">寄送驗證碼</button>' +
      "</form>" +
      '<div class="auth-toggle"><button id="fp-back" type="button">返回登入</button></div>'
  );
  document.getElementById("forgot-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = document.getElementById("fp-email").value.trim();
    var errEl = document.getElementById("fp-err");
    errEl.textContent = "";
    try {
      await resetPassword({ username: email });
      state.pendingResetEmail = email;
      state.authScreen = "reset";
      render();
    } catch (err) {
      errEl.textContent = friendlyAuthError(err);
    }
  });
  document.getElementById("fp-back").addEventListener("click", function () {
    state.authScreen = "signin";
    render();
  });
}

function renderResetPassword() {
  renderAuthShell(
    '<p class="lede">我們寄了一組 6 位數驗證碼到 <b>' +
      esc(state.pendingResetEmail) +
      "</b>，請輸入並設定新密碼。</p>" +
      '<form id="reset-form" class="stack">' +
      '<div><label class="field-label" for="rp-code">驗證碼</label>' +
      '<input class="text-input code-input" id="rp-code" inputmode="numeric" maxlength="6" required /></div>' +
      '<div><label class="field-label" for="rp-pw">新密碼</label>' +
      '<div class="pw-wrap"><input class="text-input" id="rp-pw" type="password" required minlength="8" autocomplete="new-password" placeholder="至少 8 碼，需有英文字母與數字" />' +
      '<button type="button" class="pw-toggle" data-toggle-pw="rp-pw" title="顯示/隱藏密碼">👁</button></div></div>' +
      '<div class="field-error" id="rp-err"></div>' +
      '<button type="submit" class="btn btn-accent btn-block">設定新密碼</button>' +
      "</form>" +
      '<div class="auth-toggle"><button id="rp-resend" type="button">重新寄送驗證碼</button></div>' +
      '<div class="auth-toggle"><button id="rp-back" type="button">返回登入</button></div>'
  );
  wirePasswordToggles();
  document.getElementById("reset-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var code = document.getElementById("rp-code").value.trim();
    var newPw = document.getElementById("rp-pw").value;
    var errEl = document.getElementById("rp-err");
    errEl.textContent = "";
    try {
      await confirmResetPassword({
        username: state.pendingResetEmail,
        confirmationCode: code,
        newPassword: newPw,
      });
      state.pendingResetEmail = "";
      state.authScreen = "signin";
      render();
      showToast("密碼已重新設定，請用新密碼登入");
    } catch (err) {
      errEl.textContent = friendlyAuthError(err);
    }
  });
  document.getElementById("rp-resend").addEventListener("click", async function () {
    try {
      await resetPassword({ username: state.pendingResetEmail });
      showToast("已重新寄送驗證碼");
    } catch (err) {
      showToast(friendlyAuthError(err));
    }
  });
  document.getElementById("rp-back").addEventListener("click", function () {
    state.pendingResetEmail = "";
    state.authScreen = "signin";
    render();
  });
}

function renderSignUp() {
  renderAuthShell(
    '<p class="lede">建立你的鯊魚日常帳號 —— 資料只有你自己看得到，且跨裝置同步。</p>' +
      '<form id="signup-form" class="stack">' +
      '<div><label class="field-label" for="su-email">Email</label>' +
      '<input class="text-input" id="su-email" type="email" required autocomplete="email" /></div>' +
      '<div><label class="field-label" for="su-pw">密碼</label>' +
      '<div class="pw-wrap"><input class="text-input" id="su-pw" type="password" required minlength="8" autocomplete="new-password" placeholder="至少 8 碼，需有英文字母與數字" />' +
      '<button type="button" class="pw-toggle" data-toggle-pw="su-pw" title="顯示/隱藏密碼">👁</button></div></div>' +
      '<div class="agree-row">' +
      '<input type="checkbox" id="su-agree" required />' +
      '<label for="su-agree">我已閱讀並同意<button type="button" id="view-privacy" class="link-btn">隱私權政策</button></label>' +
      "</div>" +
      '<div class="field-error" id="su-err"></div>' +
      '<button type="submit" class="btn btn-accent btn-block">註冊</button>' +
      "</form>" +
      '<div class="auth-toggle">已經有帳號了？<button id="go-signin" type="button">直接登入</button></div>'
  );
  wirePasswordToggles();
  document.getElementById("signup-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = document.getElementById("su-email").value.trim();
    var pw = document.getElementById("su-pw").value;
    var agreed = document.getElementById("su-agree").checked;
    var errEl = document.getElementById("su-err");
    errEl.textContent = "";
    if (!agreed) {
      errEl.textContent = "請先閱讀並勾選同意隱私權政策，才能註冊。";
      return;
    }
    try {
      await signUp({
        username: email,
        password: pw,
        options: { userAttributes: { email: email } },
      });
      state.pendingEmail = email;
      state.pendingPassword = pw;
      state.authScreen = "confirm";
      render();
    } catch (err) {
      errEl.textContent = friendlyAuthError(err);
    }
  });
  document.getElementById("go-signin").addEventListener("click", function () {
    state.authScreen = "signin";
    render();
  });
  document.getElementById("view-privacy").addEventListener("click", function () {
    state.authScreen = "privacy";
    render();
  });
}

function renderPrivacyPolicy() {
  var app = document.getElementById("app");
  app.innerHTML =
    '<div id="login-screen"><div class="login-card" style="max-width:560px;">' +
    '<div class="login-mark">🦈</div>' +
    "<h1>隱私權政策</h1>" +
    '<div class="privacy-body">' +
    "<p><b>1. 誰在蒐集這些資料</b><br/>「鯊魚日常」由帶你使用這個工具的管理者建置與維運，不隸屬於任何特定公司系統。</p>" +
    "<p><b>2. 蒐集目的</b><br/>提供會員身分驗證、10-3-1 每日聯絡與工作規劃追蹤等功能，僅供內部團隊管理個人業務活動使用，不做其他行銷用途。</p>" +
    "<p><b>3. 會蒐集哪些資料</b><br/>帳號資訊(Email、密碼、你自訂的顯示名稱)；你在「分類名單」中輸入的聯絡人姓名與分類；你新增的聯絡記錄與工作規劃內容(含備註)。</p>" +
    "<p><b>4. 保存期間、地區、對象與方式</b><br/>資料會保存到你刪除該筆資料或帳號為止；儲存於 AWS 雲端伺服器(亞太地區)；僅供你本人查看，不會提供給第三人或用於行銷，以電子化方式處理與傳輸。</p>" +
    "<p><b>5. 你的權利</b><br/>你可以隨時在 App 內刪除聯絡人、聯絡記錄或工作規劃；如需查詢、更正、刪除帳號整體資料或有任何疑問，請聯絡邀請你使用本工具的管理者。</p>" +
    "<p><b>6. 若不同意或不提供資料</b><br/>將無法完成註冊、無法使用本工具的任何功能。</p>" +
    "<p><b>提醒</b><br/>你在「分類名單」中輸入的是他人(第三人)的姓名等個人資料，請確保你與該對象有適當、既有的關係或業務往來，並自行留意個人資料保護法上的告知義務。</p>" +
    "</div>" +
    '<button type="button" class="btn btn-ghost btn-block" id="privacy-back" style="margin-top:16px;">返回註冊</button>' +
    "</div></div>";
  document.getElementById("privacy-back").addEventListener("click", function () {
    state.authScreen = "signup";
    render();
  });
}

function renderConfirm() {
  renderAuthShell(
    '<p class="lede">我們寄了一組 6 位數驗證碼到 <b>' +
      esc(state.pendingEmail) +
      "</b>，請輸入。</p>" +
      '<form id="confirm-form" class="stack">' +
      '<div><label class="field-label" for="cf-code">驗證碼</label>' +
      '<input class="text-input code-input" id="cf-code" inputmode="numeric" maxlength="6" required /></div>' +
      '<div class="field-error" id="cf-err"></div>' +
      '<button type="submit" class="btn btn-accent btn-block">確認</button>' +
      "</form>" +
      '<div class="auth-toggle"><button id="cf-resend" type="button">重新寄送驗證碼</button></div>'
  );
  document.getElementById("confirm-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var code = document.getElementById("cf-code").value.trim();
    var errEl = document.getElementById("cf-err");
    errEl.textContent = "";
    try {
      await confirmSignUp({ username: state.pendingEmail, confirmationCode: code });
      renderLoading();
      try {
        await signIn({ username: state.pendingEmail, password: state.pendingPassword });
        state.pendingPassword = "";
        await afterSignedIn();
      } catch (e2) {
        state.authScreen = "signin";
        render();
        showToast("驗證成功，請重新登入");
      }
    } catch (err) {
      errEl.textContent = friendlyAuthError(err);
    }
  });
  document.getElementById("cf-resend").addEventListener("click", async function () {
    try {
      await resendSignUpCode({ username: state.pendingEmail });
      showToast("已重新寄送驗證碼");
    } catch (err) {
      showToast(friendlyAuthError(err));
    }
  });
}

function renderSetName() {
  renderAuthShell(
    '<p class="lede">最後一步：你希望團隊夥伴看到的名字是？</p>' +
      '<form id="setname-form" class="stack">' +
      '<div><label class="field-label" for="sn-name">姓名</label>' +
      '<input class="text-input" id="sn-name" maxlength="20" required placeholder="例如：李承諭" /></div>' +
      '<div class="field-error" id="sn-err"></div>' +
      '<button type="submit" class="btn btn-accent btn-block">開始使用</button>' +
      "</form>"
  );
  document.getElementById("setname-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var name = document.getElementById("sn-name").value.trim();
    if (!name) return;
    var errEl = document.getElementById("sn-err");
    try {
      var res = await client.models.Profile.create({ displayName: name, inviteCode: genInviteCode() });
      state.profile = res.data;
      state.myIdentity = res.data.owner;
      enterApp();
    } catch (err) {
      errEl.textContent = friendlyAuthError(err);
    }
  });
}

/* ===================== quota computations ===================== */
function logsOn(dateKey) {
  return state.logs.filter(function (l) {
    return (l.loggedAt || "").slice(0, 10) === dateKey;
  });
}
function plansOn(dateKey) {
  return state.plans.filter(function (p) {
    return (p.planAt || "").slice(0, 10) === dateKey;
  });
}
function weekRangeKeys(dateKey) {
  var d = new Date(dateKey + "T00:00:00");
  var dow = (d.getDay() + 6) % 7;
  var start = new Date(d);
  start.setDate(d.getDate() - dow);
  var keys = [];
  for (var i = 0; i < 7; i++) {
    var x = new Date(start);
    x.setDate(start.getDate() + i);
    keys.push(x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()));
  }
  return keys;
}

function renderQuota() {
  var tk = todayKey();
  var todaysLogs = logsOn(tk);
  var totalLogs = todaysLogs.length;
  var byType = { 4: 0, 3: 0, 2: 0, 1: 0 };
  todaysLogs.forEach(function (l) {
    if (byType[l.type] !== undefined) byType[l.type]++;
  });

  var todaysPlans = plansOn(tk);
  var haveType = { 1: false, 2: false, 3: false };
  todaysPlans.forEach(function (p) {
    if (haveType[p.planType] !== undefined) haveType[p.planType] = true;
  });
  var apptCount = (haveType[1] ? 1 : 0) + (haveType[2] ? 1 : 0) + (haveType[3] ? 1 : 0);

  var wk = weekRangeKeys(tk);
  var weekStrangers = state.logs.filter(function (l) {
    return l.type === "1" && wk.indexOf((l.loggedAt || "").slice(0, 10)) > -1;
  }).length;

  var barColor = { c4: "type-other", c3: "type-status", c2: "type-secondary", c1: "type-primary" };
  var barsHtml = LOG_TYPES.map(function (t) {
    var v = byType[t.v] || 0;
    var pct = Math.min(100, Math.round((v / t.target) * 100));
    return (
      '<div class="seg" title="' +
      t.label +
      " " +
      v +
      "/" +
      t.target +
      '"><i style="width:' +
      pct +
      "%;background:var(--" +
      barColor[t.chip] +
      ')"></i></div>'
    );
  }).join("");

  var dotColor = { p1: "type-primary", p2: "type-secondary", p3: "type-status" };
  var dotsHtml = ["1", "2", "3"]
    .map(function (k) {
      var t = byV(PLAN_TYPES, k);
      var filled = haveType[k];
      var bg = filled ? "var(--" + dotColor[t.chip] + ")" : "transparent";
      return (
        '<div class="slot' +
        (filled ? " filled" : "") +
        '" style="background:' +
        bg +
        '" title="' +
        t.label +
        '">' +
        (filled ? "✓" : "") +
        "</div>"
      );
    })
    .join("");

  return (
    '<div class="panel today-summary">' +
    '<div class="ts-row">' +
    '<div class="ts-stat">' +
    '<div class="q-label">今日有效聯絡</div>' +
    '<div class="q-num">' +
    totalLogs +
    " <small>/ 10</small></div>" +
    '<div class="q-bar">' +
    barsHtml +
    "</div></div>" +
    '<div class="ts-div"></div>' +
    '<div class="ts-stat">' +
    '<div class="q-label">今日約會</div>' +
    '<div class="q-num">' +
    apptCount +
    " <small>/ 3</small></div>" +
    '<div class="q-dots">' +
    dotsHtml +
    "</div></div>" +
    '<div class="ts-div"></div>' +
    '<div class="ts-stat">' +
    '<div class="q-label">本週新朋友</div>' +
    '<div class="q-num">' +
    weekStrangers +
    " <small>/ 1</small></div>" +
    '<div class="q-bar"><div class="seg"><i style="width:' +
    Math.min(100, weekStrangers * 100) +
    '%;background:var(--accent)"></i></div></div>' +
    "</div>" +
    "</div></div>"
  );
}

/* ===================== calendar ===================== */
function renderCalendar() {
  var dateChip =
    fmtDateHuman(state.selectedDate) + (state.selectedDate === todayKey() ? "（今天）" : "");

  if (!state.calendarOpen) {
    return (
      '<div class="panel"><div class="cal-compact-row">' +
      '<div><div class="cal-compact-label">選取日期</div>' +
      '<div class="cal-compact-date">' +
      dateChip +
      "</div></div>" +
      '<button type="button" class="btn btn-ghost btn-sm" id="cal-toggle">📅 選擇其他日期</button>' +
      "</div></div>"
    );
  }

  var y = state.calYear,
    m = state.calMonth;
  var first = new Date(y, m, 1);
  var startOffset = (first.getDay() + 6) % 7;
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var tk = todayKey();
  var colorVarMap = { p1: "type-primary", p2: "type-secondary", p3: "type-status", p4: "type-other" };

  var cells = "";
  for (var i = 0; i < startOffset; i++) {
    cells += '<div class="cal-cell blank"></div>';
  }
  for (var d = 1; d <= daysInMonth; d++) {
    var key = y + "-" + pad(m + 1) + "-" + pad(d);
    var dayLogs = logsOn(key);
    var dayPlans = plansOn(key);
    var typesPresent = {};
    dayPlans.forEach(function (p) {
      typesPresent[p.planType] = true;
    });
    var dotHtml = Object.keys(typesPresent)
      .sort()
      .map(function (k) {
        var t = byV(PLAN_TYPES, k);
        return '<span style="background:var(--' + colorVarMap[t.chip] + ')"></span>';
      })
      .join("");
    var cls = "cal-cell";
    if (key === tk) cls += " today";
    if (key === state.selectedDate) cls += " selected";
    cells +=
      '<button type="button" class="' +
      cls +
      '" data-date="' +
      key +
      '"><span class="dnum">' +
      d +
      "</span>" +
      (dayLogs.length ? '<span style="font-size:10px;color:var(--ink-faint)">' + dayLogs.length + " 聯絡</span>" : "") +
      '<span class="cal-dots">' +
      dotHtml +
      "</span></button>";
  }
  var dows = ["一", "二", "三", "四", "五", "六", "日"];
  var dowHtml = dows.map(function (x) {
    return '<div class="dow">' + x + "</div>";
  }).join("");

  return (
    '<div class="panel">' +
    '<div class="cal-open-head"><div class="cal-compact-label">選取日期：' +
    dateChip +
    '</div><button type="button" class="btn btn-ghost btn-sm" id="cal-toggle">收合 ▲</button></div>' +
    '<div class="cal-nav">' +
    '<button class="btn btn-ghost btn-sm" id="cal-prev">← 上個月</button>' +
    '<div class="ym">' +
    y +
    " 年 " +
    (m + 1) +
    " 月</div>" +
    '<button class="btn btn-ghost btn-sm" id="cal-next">下個月 →</button>' +
    "</div>" +
    '<div class="cal-grid">' +
    dowHtml +
    cells +
    "</div>" +
    '<div class="legend">' +
    PLAN_TYPES.map(function (t) {
      return '<div class="li"><span class="sw" style="background:var(--' + colorVarMap[t.chip] + ')"></span>' + t.label + "</div>";
    }).join("") +
    "</div></div>"
  );
}

/* ===================== forms ===================== */
function contactOptionsHtml() {
  return state.contacts
    .map(function (c) {
      return '<option value="' + esc(c.name) + '">';
    })
    .join("");
}

function renderQuickAddPanel() {
  var mode = state.quickAddMode === "plan" ? "plan" : "log";

  var logTypeOpts = LOG_TYPES.map(function (t) {
    return '<option value="' + t.v + '">' + t.v + "：" + esc(t.label) + "</option>";
  }).join("");
  var planTypeOpts = PLAN_TYPES.map(function (t) {
    return '<option value="' + t.v + '">' + esc(t.label) + (t.minutes ? "（" + t.minutes + "）" : "") + "</option>";
  }).join("");

  var logForm =
    '<form class="stack" id="log-form">' +
    '<div><label class="sub">對象姓名</label>' +
    '<input class="text-input" list="contact-names" name="name" placeholder="輸入或從名單選擇" required style="margin-top:4px;"/></div>' +
    '<div class="row2">' +
    '<div><label class="sub">分類（4321）</label><select name="type" style="margin-top:4px;">' +
    logTypeOpts +
    "</select></div>" +
    '<div><label class="sub">聯絡時間</label><input class="text-input" type="time" name="time" value="16:00" style="margin-top:4px;"/></div>' +
    "</div>" +
    '<div><label class="sub">內容備註</label><textarea name="note" placeholder="聊了什麼、下一步…" style="margin-top:4px;"></textarea></div>' +
    '<button class="btn btn-accent btn-block" type="submit">送出聯絡記錄</button>' +
    "</form>";

  var planForm =
    '<form class="stack" id="plan-form">' +
    '<div><label class="sub">對象姓名</label>' +
    '<input class="text-input" list="contact-names" name="name" placeholder="輸入或從名單選擇" required style="margin-top:4px;"/></div>' +
    '<div class="row2">' +
    '<div><label class="sub">類型</label><select name="planType" style="margin-top:4px;">' +
    planTypeOpts +
    "</select></div>" +
    '<div><label class="sub">安排日期</label><input class="text-input" type="date" name="date" value="' +
    state.selectedDate +
    '" style="margin-top:4px;"/></div>' +
    "</div>" +
    '<div><label class="sub">工作內容</label><textarea name="note" placeholder="約會地點、要談的內容…" style="margin-top:4px;"></textarea></div>' +
    '<button class="btn btn-accent btn-block" type="submit">送出工作規劃</button>' +
    "</form>";

  return (
    '<div class="panel" id="quick-add-panel"><div class="qa-head"><h3 style="margin:0;">快速新增 <span class="hint">選取日期：' +
    fmtDateHuman(state.selectedDate) +
    '</span></h3><div class="seg-toggle" role="tablist">' +
    '<button type="button" data-qa-mode="log" class="' +
    (mode === "log" ? "active" : "") +
    '">聯絡記錄</button>' +
    '<button type="button" data-qa-mode="plan" class="' +
    (mode === "plan" ? "active" : "") +
    '">工作規劃</button>' +
    "</div></div>" +
    (mode === "log" ? logForm : planForm) +
    "</div>"
  );
}

/* ===================== lists / tabs ===================== */
function entryHtmlLog(l) {
  var t = byV(LOG_TYPES, l.type) || LOG_TYPES[0];
  return (
    '<div class="entry"><span class="chip ' +
    t.chip +
    '">' +
    t.v +
    '</span><div class="e-main"><div class="e-name">' +
    esc(l.contactName) +
    "</div>" +
    (l.note ? '<div class="e-note">' + esc(l.note) + "</div>" : "") +
    '<div class="e-time">' +
    esc((l.loggedAt || "").replace("T", " ").slice(0, 16)) +
    "</div></div>" +
    '<button class="x-del' +
    (isArmed("log", l.id) ? " confirm" : "") +
    '" data-del-log="' +
    l.id +
    '" title="' +
    (isArmed("log", l.id) ? "再按一次確認刪除" : "刪除") +
    '">' +
    (isArmed("log", l.id) ? "確定?" : "✕") +
    "</button></div>"
  );
}
function entryHtmlPlan(p) {
  var t = byV(PLAN_TYPES, p.planType) || PLAN_TYPES[0];
  return (
    '<div class="entry"><span class="chip ' +
    t.chip +
    '">' +
    esc(t.label) +
    '</span><div class="e-main"><div class="e-name">' +
    esc(p.contactName) +
    "</div>" +
    (p.note ? '<div class="e-note">' + esc(p.note) + "</div>" : "") +
    '<div class="e-time">' +
    esc((p.planAt || "").slice(0, 10)) +
    "</div></div>" +
    '<button class="ics-btn" data-ics-plan="' +
    p.id +
    '" title="加入手機日曆">📅</button>' +
    '<button class="x-del' +
    (isArmed("plan", p.id) ? " confirm" : "") +
    '" data-del-plan="' +
    p.id +
    '" title="' +
    (isArmed("plan", p.id) ? "再按一次確認刪除" : "刪除") +
    '">' +
    (isArmed("plan", p.id) ? "確定?" : "✕") +
    "</button></div>"
  );
}

function renderTabs() {
  var tabs = [
    { k: "today", label: "當日聯絡" },
    { k: "plans", label: "工作規劃" },
    { k: "p1", label: "主要對象" },
    { k: "p2", label: "次要對象" },
    { k: "p3", label: "有狀態對象" },
    { k: "p4", label: "其他" },
  ];
  var tabsHtml = tabs
    .map(function (t) {
      return '<button data-tab="' + t.k + '" class="' + (state.trackerTab === t.k ? "active" : "") + '">' + t.label + "</button>";
    })
    .join("");

  var listHtml = "";
  if (state.trackerTab === "today") {
    var todays = logsOn(state.selectedDate)
      .slice()
      .sort(function (a, b) {
        return (a.loggedAt || "") < (b.loggedAt || "") ? 1 : -1;
      });
    listHtml = todays.length ? todays.map(entryHtmlLog).join("") : '<div class="empty-hint">' + fmtDateHuman(state.selectedDate) + " 還沒有聯絡記錄。</div>";
  } else if (state.trackerTab === "plans") {
    var allPlans = state.plans.slice().sort(function (a, b) {
      return (a.planAt || "") < (b.planAt || "") ? -1 : 1;
    });
    listHtml = allPlans.length ? allPlans.map(entryHtmlPlan).join("") : '<div class="empty-hint">還沒有工作規劃。</div>';
  } else {
    var pv = state.trackerTab.slice(1);
    var filtered = state.plans
      .filter(function (p) {
        return p.planType === pv;
      })
      .sort(function (a, b) {
        return (a.planAt || "") < (b.planAt || "") ? -1 : 1;
      });
    listHtml = filtered.length ? filtered.map(entryHtmlPlan).join("") : '<div class="empty-hint">目前沒有這個分類的對象。</div>';
  }

  var wk = weekRangeKeys(todayKey());
  var exportHtml = state.exportOpen
    ? '<div class="export-row">' +
      '<input class="text-input" type="date" id="export-start" value="' +
      wk[0] +
      '"/>' +
      '<span class="export-sep">至</span>' +
      '<input class="text-input" type="date" id="export-end" value="' +
      todayKey() +
      '"/>' +
      '<button type="button" class="btn btn-accent btn-sm" id="export-run">⬇ 匯出 CSV</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="export-toggle">收合</button>' +
      "</div>"
    : '<div class="export-row-compact"><button type="button" class="btn btn-ghost btn-sm" id="export-toggle">⬇ 匯出區間資料(CSV)</button></div>';

  return (
    '<div class="panel">' +
    exportHtml +
    '<div class="tabs">' +
    tabsHtml +
    '</div><div class="entry-list">' +
    listHtml +
    "</div></div>"
  );
}

/* ===================== contacts view ===================== */
function allGroups() {
  return DEFAULT_GROUPS.concat(
    state.customGroups.map(function (g) {
      return { id: g.id, name: g.name, color: "var(--accent)" };
    })
  );
}
function contactsInGroup(gid) {
  return state.contacts.filter(function (c) {
    return c.groupId === gid;
  });
}

function renderContactsView() {
  var groups = allGroups();
  var cards = groups
    .map(function (g) {
      var list = contactsInGroup(g.id);
      var rows = list.length
        ? list
            .map(function (c) {
              var armed = isArmed("contact", c.id);
              return (
                '<div class="contact-row"><span>' +
                esc(c.name) +
                '</span><button class="x-del' +
                (armed ? " confirm" : "") +
                '" data-del-contact="' +
                c.id +
                '" title="' +
                (armed ? "再按一次確認刪除" : "刪除") +
                '">' +
                (armed ? "確定?" : "✕") +
                "</button></div>"
              );
            })
            .join("")
        : '<div class="empty-hint">尚無名單</div>';
      return (
        '<div class="group-card"><div class="g-head"><div class="g-title"><span class="g-dot" style="background:' +
        g.color +
        '"></span>' +
        esc(g.name) +
        '</div><span class="g-count">' +
        list.length +
        ' 人</span></div><div class="g-body">' +
        rows +
        "</div></div>"
      );
    })
    .join("");

  var addGroupCard =
    '<div class="add-group-card"><form id="add-group-form">' +
    '<input type="text" placeholder="自訂群組名稱，如：教會、球隊" maxlength="12" required />' +
    '<button class="btn btn-ghost btn-sm" type="submit">＋ 新增群組</button></form></div>';

  var groupOpts = groups
    .map(function (g) {
      return '<option value="' + g.id + '" data-name="' + esc(g.name) + '">' + esc(g.name) + "</option>";
    })
    .join("");
  var quickAdd =
    '<div class="panel quick-add-contact"><form id="quick-add-contact-form" class="qac-form">' +
    '<input class="text-input" type="text" id="qac-name" placeholder="輸入姓名，快速加入名單" maxlength="20" required />' +
    '<select id="qac-group">' +
    groupOpts +
    "</select>" +
    '<button class="btn btn-accent" type="submit">＋ 加入</button>' +
    "</form></div>";

  return (
    '<div class="page-head"><div><h2>分類名單</h2><p>把你認識的人放進對的分類，是「鯊魚日常」第一步。</p></div></div>' +
    quickAdd +
    '<div class="group-grid">' +
    cards +
    addGroupCard +
    "</div>"
  );
}

/* ===================== tracker view ===================== */
function renderTrackerView() {
  return (
    '<div class="page-head"><div><h2>10-3-1 每日追蹤</h2><p>每天 10 個有效聯絡、3 個約會、每週 1 位新朋友 — 卓越八把金鑰匙第一、二把。</p></div></div>' +
    renderQuota() +
    '<div class="tracker-grid"><div>' +
    renderCalendar() +
    "</div><div>" +
    renderQuickAddPanel() +
    "</div></div>" +
    '<div style="height:20px"></div>' +
    renderTabs() +
    '<datalist id="contact-names">' +
    contactOptionsHtml() +
    "</datalist>"
  );
}

/* ===================== 好友對戰 view ===================== */
function battleMetricRowTheirs(label, mine, theirs) {
  var max = Math.max(mine, theirs, 1);
  return (
    '<div class="battle-metric single">' +
    '<span class="bm-label-inline">' +
    label +
    "</span>" +
    '<div class="bm-track"><i style="width:' +
    Math.round((theirs / max) * 100) +
    '%"></i></div>' +
    '<span class="bm-num">' +
    theirs +
    "</span>" +
    "</div>"
  );
}
function renderMyProgressSticky(myStat) {
  return (
    '<div class="my-progress-sticky" id="my-progress-sticky">' +
    '<div class="mp-title">我的本週進度</div>' +
    '<div class="mp-stats">' +
    '<div class="mp-stat"><span class="mp-num">' +
    myStat.effectiveContacts +
    '</span><span class="mp-name">有效聯絡</span></div>' +
    '<div class="mp-stat"><span class="mp-num">' +
    myStat.appointments +
    '</span><span class="mp-name">約會</span></div>' +
    '<div class="mp-stat"><span class="mp-num">' +
    myStat.newPeople +
    '</span><span class="mp-name">新朋友</span></div>' +
    "</div></div>"
  );
}
function renderBattleView() {
  var wk = weekRangeKeys(todayKey());
  var weekKey = wk[0];
  var myStat = weekStatsFor(wk);
  var code = (state.profile && state.profile.inviteCode) || "產生中…";

  var cardsHtml =
    state.friends.length === 0
      ? '<div class="empty-hint">還沒有加好友。跟隊友互相輸入邀請碼，就能互看本週 10-3-1 進度囉！</div>'
      : state.friends
          .map(function (f) {
            var theirStat = state.teamStats.filter(function (t) {
              return t.owner === f.friendOwnerId && t.weekKey === weekKey;
            })[0];
            if (!theirStat) {
              return (
                '<div class="battle-card pending"><div class="battle-card-head"><b>' +
                esc(f.friendDisplayName || "隊友") +
                '</b><span class="battle-pending-tag">等待對方也加入你</span></div>' +
                '<p class="battle-pending-note">你已經加了他，但要等他也把你加為好友，才能互看進度。</p></div>'
              );
            }
            return (
              '<div class="battle-card"><div class="battle-card-head"><b>' +
              esc(f.friendDisplayName || theirStat.displayName || "隊友") +
              "</b></div>" +
              battleMetricRowTheirs("有效聯絡", myStat.effectiveContacts, theirStat.effectiveContacts || 0) +
              battleMetricRowTheirs("約會", myStat.appointments, theirStat.appointments || 0) +
              battleMetricRowTheirs("新朋友", myStat.newPeople, theirStat.newPeople || 0) +
              "</div>"
            );
          })
          .join("");

  return (
    '<div class="page-head"><div><h2>好友對戰</h2><p>跟隊友互相輸入邀請碼，本週的 10-3-1 進度就能互相看到、互相激勵。</p></div></div>' +
    renderMyProgressSticky(myStat) +
    '<div class="panel invite-panel">' +
    '<div class="invite-code-row"><div><div class="q-label">我的邀請碼</div><div class="invite-code">' +
    esc(code) +
    '</div></div><button class="btn btn-ghost btn-sm" id="copy-invite-btn" type="button">複製</button></div>' +
    '<form id="add-friend-form" class="add-friend-form">' +
    '<input class="text-input" id="af-code" maxlength="6" placeholder="輸入好友的邀請碼" style="text-transform:uppercase" />' +
    '<button type="submit" class="btn btn-accent btn-sm">加好友</button></form>' +
    (state.addFriendErr ? '<div class="field-error">' + esc(state.addFriendErr) + "</div>" : "") +
    '<div class="push-row">' +
    (state.pushSubs.length > 0
      ? '<span class="push-status on">🔔 這台裝置的推播通知已開啟</span>' +
        '<button class="btn btn-ghost btn-sm" id="push-disable-btn" type="button"' +
        (state.pushBusy ? " disabled" : "") +
        ">關閉</button>"
      : '<span class="push-status">🔕 這台裝置還沒開啟推播通知</span>' +
        '<button class="btn btn-accent btn-sm" id="push-info-btn" type="button">開啟推播通知</button>') +
    "</div>" +
    '<p class="battle-tip">💡 沒開啟推播的話，隊友更新進度時，上面選單的「好友對戰」還是會出現紅點提醒（打開 App 就看得到）。</p>' +
    "</div>" +
    '<div class="battle-list">' +
    cardsHtml +
    "</div>" +
    renderPushTutorial()
  );
}
function renderPushTutorial() {
  if (!state.showPushTutorial) return "";
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isStandalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return (
    '<div class="modal-backdrop" id="push-tutorial-backdrop">' +
    '<div class="modal-card">' +
    '<h3>開啟推播通知</h3>' +
    '<p>開啟之後，隊友更新本週 10-3-1 進度時，就算沒有打開 App，這台裝置也會跳出通知提醒你。</p>' +
    (isIOS && !isStandalone
      ? '<div class="modal-warn">📱 偵測到你可能是用 iPhone 的 Safari 瀏覽器打開這個網站——這種情況下收不到推播通知喔！<br/>請先點下方工具列的「分享」按鈕 → 選擇「加入主畫面」，之後改從主畫面的圖示打開 App，才能收到通知。</div>'
      : "") +
    '<ol class="modal-steps">' +
    "<li>點下方「允許並開啟通知」</li>" +
    "<li>瀏覽器會跳出權限詢問，選擇「允許」</li>" +
    "<li>之後隊友更新進度，這台裝置就會跳通知</li>" +
    "</ol>" +
    '<div class="modal-actions">' +
    '<button class="btn btn-ghost btn-sm" id="push-tutorial-close" type="button">先不要</button>' +
    '<button class="btn btn-accent btn-sm" id="push-tutorial-enable" type="button">允許並開啟通知</button>' +
    "</div></div></div>"
  );
}

/* ===================== shell + wiring ===================== */
function render() {
  if (state.authScreen === "loading") return renderLoading();
  if (state.authScreen === "signin") return renderSignIn();
  if (state.authScreen === "signup") return renderSignUp();
  if (state.authScreen === "privacy") return renderPrivacyPolicy();
  if (state.authScreen === "confirm") return renderConfirm();
  if (state.authScreen === "forgot") return renderForgotPassword();
  if (state.authScreen === "reset") return renderResetPassword();
  if (state.authScreen === "setname") return renderSetName();

  var app = document.getElementById("app");
  var name = state.profile ? state.profile.displayName : "";
  app.innerHTML =
    '<div id="topbar"><div class="brand"><span class="mark">🦈</span>鯊魚日常</div>' +
    '<nav><button data-view="contacts" class="' +
    (state.view === "contacts" ? "active" : "") +
    '">分類名單</button>' +
    '<button data-view="tracker" class="' +
    (state.view === "tracker" ? "active" : "") +
    '">10-3-1 追蹤</button>' +
    '<button data-view="battle" class="' +
    (state.view === "battle" ? "active" : "") +
    '">好友對戰' +
    (state.battleNotice ? '<span class="notice-dot"></span>' : "") +
    "</button></nav>" +
    '<div class="spacer"></div>' +
    '<div class="whoami"><span class="badge-mode live">● 團隊同步中</span><span>你好，<b>' +
    esc(name) +
    '</b></span><button class="btn btn-ghost btn-sm" id="sign-out-btn">登出</button></div></div>' +
    "<main>" +
    (state.view === "contacts"
      ? renderContactsView()
      : state.view === "battle"
      ? renderBattleView()
      : renderTrackerView()) +
    "</main>" +
    '<div class="footer-note">資料儲存在你自己的 AWS 帳號中，只有你看得到，登入後可跨裝置同步。</div>' +
    '<nav class="bottom-nav">' +
    '<button data-view="contacts" class="' +
    (state.view === "contacts" ? "active" : "") +
    '"><span class="ic">📋</span>分類名單</button>' +
    '<button data-view="tracker" class="' +
    (state.view === "tracker" ? "active" : "") +
    '"><span class="ic">🎯</span>10-3-1 追蹤</button>' +
    '<button data-view="battle" class="' +
    (state.view === "battle" ? "active" : "") +
    '"><span class="ic">⚔️</span>好友對戰' +
    (state.battleNotice ? '<span class="notice-dot"></span>' : "") +
    "</button>" +
    "</nav>";

  syncTopbarHeightVar();
  wireEvents();
}
var _topbarResizeWired = false;
function syncTopbarHeightVar() {
  var topbar = document.getElementById("topbar");
  if (!topbar) return;
  document.documentElement.style.setProperty("--topbar-h", topbar.offsetHeight + "px");
  if (!_topbarResizeWired) {
    _topbarResizeWired = true;
    window.addEventListener("resize", function () {
      syncTopbarHeightVar();
    });
  }
}

function wireEvents() {
  var app = document.getElementById("app");

  app.querySelectorAll("#topbar nav button, .bottom-nav button").forEach(function (b) {
    b.addEventListener("click", function () {
      state.view = b.getAttribute("data-view");
      if (state.view === "battle") markBattleSeen();
      render();
    });
  });

  var so = document.getElementById("sign-out-btn");
  if (so)
    so.addEventListener("click", async function () {
      clearSubs();
      await signOut();
      state.contacts = [];
      state.customGroups = [];
      state.logs = [];
      state.plans = [];
      state.profile = null;
      state.friends = [];
      state.teamStats = [];
      state.myIdentity = "";
      state.battleNotice = false;
      state.addFriendErr = "";
      state.pushSubs = [];
      state.showPushTutorial = false;
      state.authScreen = "signin";
      render();
    });

  if (state.view === "contacts") {
    var qacForm = document.getElementById("quick-add-contact-form");
    if (qacForm)
      qacForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var nameInput = document.getElementById("qac-name");
        var groupSelect = document.getElementById("qac-group");
        var name = nameInput.value.trim();
        if (!name) return;
        var opt = groupSelect.options[groupSelect.selectedIndex];
        try {
          await client.models.Contact.create({
            name: name,
            groupId: groupSelect.value,
            groupName: opt ? opt.getAttribute("data-name") : "",
          });
          nameInput.value = "";
          nameInput.focus();
          showToast("已加入「" + (opt ? opt.getAttribute("data-name") : "") + "」");
        } catch (err) {
          showToast(friendlyAuthError(err));
        }
      });
    var agf = document.getElementById("add-group-form");
    if (agf)
      agf.addEventListener("submit", async function (e) {
        e.preventDefault();
        var input = agf.querySelector("input");
        var name = input.value.trim();
        if (!name) return;
        await client.models.CustomGroup.create({ name: name });
        input.value = "";
      });
    app.querySelectorAll("[data-del-contact]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-del-contact");
        if (isArmed("contact", id)) {
          disarmDelete();
          await client.models.Contact.delete({ id: id });
        } else {
          armDelete("contact", id);
        }
      });
    });
  }

  if (state.view === "battle") {
    var copyBtn = document.getElementById("copy-invite-btn");
    if (copyBtn)
      copyBtn.addEventListener("click", function () {
        var code = state.profile && state.profile.inviteCode;
        if (!code) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(function () {
            showToast("已複製邀請碼");
          });
        } else {
          showToast("邀請碼：" + code);
        }
      });
    var afForm = document.getElementById("add-friend-form");
    if (afForm)
      afForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var input = document.getElementById("af-code");
        var code = (input.value || "").trim().toUpperCase();
        state.addFriendErr = "";
        if (!code) return;
        if (state.profile && state.profile.inviteCode === code) {
          state.addFriendErr = "這是你自己的邀請碼喔";
          render();
          return;
        }
        try {
          var res = await client.models.Profile.list({ filter: { inviteCode: { eq: code } } });
          var found = res.data && res.data[0];
          if (!found) {
            state.addFriendErr = "找不到這組邀請碼，請跟對方確認拼字";
            render();
            return;
          }
          var already = state.friends.some(function (f) {
            return f.friendOwnerId === found.owner;
          });
          if (already) {
            state.addFriendErr = "已經加過這位好友了";
            render();
            return;
          }
          await client.models.Friend.create({
            friendOwnerId: found.owner,
            friendDisplayName: found.displayName,
          });
          showToast("已加入「" + found.displayName + "」，等對方也加入你就能互看進度");
          input.value = "";
        } catch (err) {
          state.addFriendErr = friendlyAuthError(err);
          render();
        }
      });

    var pushInfoBtn = document.getElementById("push-info-btn");
    if (pushInfoBtn)
      pushInfoBtn.addEventListener("click", function () {
        state.showPushTutorial = true;
        render();
      });
    var pushDisableBtn = document.getElementById("push-disable-btn");
    if (pushDisableBtn) pushDisableBtn.addEventListener("click", disablePush);
    var ptClose = document.getElementById("push-tutorial-close");
    if (ptClose)
      ptClose.addEventListener("click", function () {
        state.showPushTutorial = false;
        render();
      });
    var ptBackdrop = document.getElementById("push-tutorial-backdrop");
    if (ptBackdrop)
      ptBackdrop.addEventListener("click", function (e) {
        if (e.target === ptBackdrop) {
          state.showPushTutorial = false;
          render();
        }
      });
    var ptEnable = document.getElementById("push-tutorial-enable");
    if (ptEnable)
      ptEnable.addEventListener("click", function () {
        state.showPushTutorial = false;
        render();
        enablePush();
      });
  }

  if (state.view === "tracker") {
    app.querySelectorAll("[data-qa-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.quickAddMode = btn.getAttribute("data-qa-mode");
        render();
      });
    });

    var calToggle = document.getElementById("cal-toggle");
    if (calToggle)
      calToggle.addEventListener("click", function () {
        state.calendarOpen = !state.calendarOpen;
        render();
      });

    var prev = document.getElementById("cal-prev");
    var next = document.getElementById("cal-next");
    if (prev)
      prev.addEventListener("click", function () {
        state.calMonth--;
        if (state.calMonth < 0) {
          state.calMonth = 11;
          state.calYear--;
        }
        render();
      });
    if (next)
      next.addEventListener("click", function () {
        state.calMonth++;
        if (state.calMonth > 11) {
          state.calMonth = 0;
          state.calYear++;
        }
        render();
      });
    app.querySelectorAll(".cal-cell:not(.blank)").forEach(function (cell) {
      cell.addEventListener("click", function () {
        state.selectedDate = cell.getAttribute("data-date");
        state.calendarOpen = false;
        render();
      });
    });

    var lf = document.getElementById("log-form");
    if (lf)
      lf.addEventListener("submit", async function (e) {
        e.preventDefault();
        var fd = new FormData(lf);
        var name = (fd.get("name") || "").toString().trim();
        if (!name) return;
        var time = (fd.get("time") || "16:00").toString();
        try {
          await client.models.ContactLog.create({
            contactName: name,
            type: fd.get("type").toString(),
            note: (fd.get("note") || "").toString().trim(),
            loggedAt: state.selectedDate + "T" + time,
          });
          showToast("已記錄聯絡");
          lf.reset();
        } catch (err) {
          showToast(friendlyAuthError(err));
        }
      });

    var pf = document.getElementById("plan-form");
    if (pf)
      pf.addEventListener("submit", async function (e) {
        e.preventDefault();
        var fd = new FormData(pf);
        var name = (fd.get("name") || "").toString().trim();
        if (!name) return;
        var date = (fd.get("date") || state.selectedDate).toString();
        try {
          await client.models.WorkPlan.create({
            contactName: name,
            planType: fd.get("planType").toString(),
            note: (fd.get("note") || "").toString().trim(),
            planAt: date + "T00:00",
          });
          showToast("已加入工作規劃");
          pf.reset();
        } catch (err) {
          showToast(friendlyAuthError(err));
        }
      });

    app.querySelectorAll("[data-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.trackerTab = btn.getAttribute("data-tab");
        render();
      });
    });
    var exportToggle = document.getElementById("export-toggle");
    if (exportToggle)
      exportToggle.addEventListener("click", function () {
        state.exportOpen = !state.exportOpen;
        render();
      });
    var exportRun = document.getElementById("export-run");
    if (exportRun)
      exportRun.addEventListener("click", function () {
        var s = document.getElementById("export-start").value;
        var e = document.getElementById("export-end").value;
        if (!s || !e) {
          showToast("請選擇日期區間");
          return;
        }
        if (s > e) {
          showToast("開始日期不能晚於結束日期");
          return;
        }
        var count = exportRangeCsv(s, e);
        showToast(count ? "已匯出 " + count + " 筆資料" : "這段期間沒有資料可匯出");
      });
    app.querySelectorAll("[data-del-log]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-del-log");
        if (isArmed("log", id)) {
          disarmDelete();
          await client.models.ContactLog.delete({ id: id });
        } else {
          armDelete("log", id);
        }
      });
    });
    app.querySelectorAll("[data-del-plan]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-del-plan");
        if (isArmed("plan", id)) {
          disarmDelete();
          await client.models.WorkPlan.delete({ id: id });
        } else {
          armDelete("plan", id);
        }
      });
    });
    app.querySelectorAll("[data-ics-plan]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-ics-plan");
        var plan = state.plans.filter(function (p) {
          return p.id === id;
        })[0];
        if (plan) {
          downloadIcsForPlan(plan);
          showToast("已下載日曆檔，點開即可加入手機行事曆");
        }
      });
    });
  }
}

/* ===================== boot ===================== */
renderLoading();
checkSession();
