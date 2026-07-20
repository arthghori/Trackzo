/* ==========================================================
   TRACKZO app.js
   All app logic. Uses Firebase Realtime Database only.
   ========================================================== */

const CATEGORIES = ["Food", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Other"];
const CAT_COLORS = {
  Food: "#FB923C", Transport: "#3B82F6", Shopping: "#EC4899", Bills: "#EF4444",
  Health: "#22C55E", Entertainment: "#A855F7", Other: "#9CA3AF"
};

let state = {
  username: null,
  mode: "personal",           // "personal" | "group"
  activeGroupCode: null,
  user: {},                   // user record from DB
  expenses: {},                // id -> expense (personal)
  recurring: {},
  notes: {},
  groups: {},                 // code -> group record (only active group loaded)
  editingExpenseId: null,
  editingNoteId: null,
  monthKey: monthKeyNow()     // "2026-07"
};

let listeners = []; // { ref, event } to detach on logout

/* ---------------- Utilities ---------------- */
function monthKeyNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
function lastNMonths(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
function rupee(n) {
  n = Number(n) || 0;
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function getUserCategories() {
  const cats = state.user.categories;
  if (Array.isArray(cats) && cats.length) {
    return cats.map(c => String(c).trim()).filter(Boolean);
  }
  return CATEGORIES.slice();
}
function getVisibleCategories(extraCategories = []) {
  const cats = [...getUserCategories()];
  extraCategories.forEach(c => {
    if (c && !cats.includes(c)) cats.push(c);
  });
  return cats;
}
function getCategoryColor(category) {
  if (CAT_COLORS[category]) return CAT_COLORS[category];
  const idx = getUserCategories().indexOf(category);
  const palette = Object.values(CAT_COLORS);
  return palette[idx % palette.length] || palette[0];
}
function normalizeCategoryName(value) {
  return String(value || "").trim();
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function genId() {
  return db.ref().push().key;
}
function gen6Digit() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------- Session management ---------------- */
const SESSION_KEY = "trackzo_session";
const SESSION_DAYS = 30;

function saveSession(username, remember) {
  const data = {
    username,
    expiresAt: remember ? Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 : null,
    remember: !!remember
  };
  if (remember) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    localStorage.removeItem(SESSION_KEY);
  }
}

function loadSession() {
  let raw = localStorage.getItem(SESSION_KEY);
  if (!raw) raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || !data.username) return null;
  if (data.expiresAt && Date.now() > data.expiresAt) {
    clearSession();
    return null;
  }
  return data;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2000);
}
function showLoading(show) {
  document.getElementById("loading-overlay").classList.toggle("hidden", !show);
}
function confirmDialog(message) {
  return new Promise(resolve => {
    const backdrop = document.getElementById("confirm-dialog");
    document.getElementById("confirm-message").textContent = message;
    backdrop.classList.remove("hidden");
    const cleanup = (result) => {
      backdrop.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    };
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

/* ---------------- Screen / Nav routing ---------------- */
function showScreen(name) {
  document.querySelectorAll(".app-screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + name).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.screen === name));
  window.scrollTo(0, 0);
  if (name === "home") renderHome();
  if (name === "charts") renderCharts();
  if (name === "notes") renderNotes();
  if (name === "groups") renderGroups();
  if (name === "settings") renderSettings();
}

function showAuthScreen() {
  document.getElementById("screen-onboarding").classList.remove("active");
  document.getElementById("screen-auth").classList.add("active");
  document.getElementById("main-app").classList.add("hidden");
}

function showMainAppScreen() {
  document.getElementById("screen-onboarding").classList.remove("active");
  document.getElementById("screen-auth").classList.remove("active");
  document.getElementById("main-app").classList.remove("hidden");
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.screen === "add") { openAddExpense(); }
    showScreen(btn.dataset.screen);
  });
});

/* ================================================================
   ONBOARDING
   ================================================================ */
let onboardIndex = 0;
function initOnboarding() {
  if (localStorage.getItem("trackzo_onboarded") === "1") {
    document.getElementById("screen-onboarding").classList.remove("active");
    goToAuthOrApp();
    return;
  }
  document.getElementById("screen-onboarding").classList.add("active");
}
document.getElementById("onboard-skip").addEventListener("click", finishOnboarding);
document.getElementById("onboard-next").addEventListener("click", () => {
  onboardIndex++;
  if (onboardIndex > 2) { finishOnboarding(); return; }
  document.querySelectorAll(".onboard-slide").forEach(s => s.classList.remove("active"));
  document.querySelector(`.onboard-slide[data-slide="${onboardIndex}"]`).classList.add("active");
  document.querySelectorAll(".dot").forEach((d, i) => d.classList.toggle("active", i === onboardIndex));
  document.getElementById("onboard-next").textContent = onboardIndex === 2 ? "Get Started" : "Next";
});
function finishOnboarding() {
  localStorage.setItem("trackzo_onboarded", "1");
  showAuthScreen();
  goToAuthOrApp();
}

/* ================================================================
   AUTH
   ================================================================ */
document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("login-form").classList.toggle("hidden", tab.dataset.tab !== "login");
    document.getElementById("signup-form").classList.toggle("hidden", tab.dataset.tab !== "signup");
  });
});

document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("signup-error");
  errEl.textContent = "";
  const username = document.getElementById("signup-username").value.trim().toLowerCase();
  const pw = document.getElementById("signup-password").value;
  const pw2 = document.getElementById("signup-password2").value;

  if (!username || username.length < 3) { errEl.textContent = "Username must be at least 3 characters."; return; }
  if (pw.length < 6) { errEl.textContent = "Password must be at least 6 characters."; return; }
  if (pw !== pw2) { errEl.textContent = "Passwords do not match."; return; }

  showLoading(true);
  try {
    const snap = await db.ref("users/" + username).get();
    if (snap.exists()) { errEl.textContent = "Username already taken."; showLoading(false); return; }
    const hash = await sha256(pw);
    await db.ref("users/" + username).set({
      passwordHash: hash,
      createdAt: Date.now(),
      totalBudget: 0,
      categoryBudgets: {},
      categories: CATEGORIES.slice(),
      activeGroupId: null
    });
    saveSession(username, true);
    state.username = username;
    showLoading(false);
    showToast("Account created!");
    await enterApp();
  } catch (err) {
    showLoading(false);
    errEl.textContent = "Something went wrong. Please try again.";
    console.error(err);
  }
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  const username = document.getElementById("login-username").value.trim().toLowerCase();
  const pw = document.getElementById("login-password").value;

  showLoading(true);
  try {
    const snap = await db.ref("users/" + username).get();
    if (!snap.exists()) { errEl.textContent = "No account found with that username."; showLoading(false); return; }
    const hash = await sha256(pw);
    if (snap.val().passwordHash !== hash) { errEl.textContent = "Incorrect password."; showLoading(false); return; }
    const remember = document.getElementById("login-remember").checked;
    saveSession(username, remember);
    state.username = username;
    showLoading(false);
    await enterApp();
  } catch (err) {
    showLoading(false);
    errEl.textContent = "Something went wrong. Please try again.";
    console.error(err);
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  const ok = await confirmDialog("Log out of Trackzo?");
  if (!ok) return;
  detachAllListeners();
  clearSession();
  state = { ...state, username: null, mode: "personal", activeGroupCode: null, user: {}, expenses: {}, recurring: {}, notes: {}, groups: {} };
  showAuthScreen();
  document.getElementById("login-form").reset();
  document.getElementById("signup-form").reset();
});

function goToAuthOrApp() {
  const savedSession = loadSession();
  const savedUser = savedSession ? savedSession.username : null;
  if (savedUser) {
    state.username = savedUser;
    enterApp();
  } else {
    showAuthScreen();
  }
}

/* ================================================================
   ENTER APP load data + attach listeners
   ================================================================ */
async function enterApp() {
  showMainAppScreen();
  showLoading(true);

  populateMonthSelectors();
  applyDarkModePref();

  // Load user record
  const userSnap = await db.ref("users/" + state.username).get();
  state.user = userSnap.val() || {};
  state.activeGroupCode = state.user.activeGroupId || null;

  // Listen to expenses
  attachListener(`expenses/${state.username}`, snap => {
    state.expenses = snap.val() || {};
    refreshCurrentScreen();
  });
  // Listen to recurring
  attachListener(`recurring/${state.username}`, snap => {
    state.recurring = snap.val() || {};
    processRecurring();
    refreshCurrentScreen();
  });
  // Listen to notes
  attachListener(`notes/${state.username}`, snap => {
    state.notes = snap.val() || {};
    refreshCurrentScreen();
  });

  if (state.activeGroupCode) attachGroupListener(state.activeGroupCode);

  updateTrackerToggleUI();
  showLoading(false);
  showScreen("home");
}

function attachListener(path, cb) {
  const ref = db.ref(path);
  ref.on("value", cb);
  listeners.push({ ref, event: "value", cb });
}
function detachAllListeners() {
  listeners.forEach(l => l.ref.off(l.event, l.cb));
  listeners = [];
}
function attachGroupListener(code) {
  const ref = db.ref("groups/" + code);
  ref.on("value", snap => {
    state.groups[code] = snap.val();
    refreshCurrentScreen();
  });
  listeners.push({ ref, event: "value" });
}

function refreshCurrentScreen() {
  const active = document.querySelector(".app-screen.active");
  if (!active) return;
  const name = active.id.replace("screen-", "");
  if (name === "home") renderHome();
  if (name === "charts") renderCharts();
  if (name === "notes") renderNotes();
  if (name === "groups") renderGroups();
}

/* ================================================================
   TRACKER TOGGLE (Personal / Group)
   ================================================================ */
document.querySelectorAll(".tt-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === "group" && !state.activeGroupCode) {
      showToast("Join or create a group first");
      showScreen("groups");
      return;
    }
    state.mode = btn.dataset.mode;
    updateTrackerToggleUI();
    refreshCurrentScreen();
  });
});
function updateTrackerToggleUI() {
  document.querySelectorAll(".tt-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === state.mode));
}

/* ================================================================
   MONTH SELECTORS
   ================================================================ */
function populateMonthSelectors() {
  const months = lastNMonths(12);
  ["home-month", "chart-month", "notes-month"].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    months.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m; opt.textContent = monthLabel(m);
      sel.appendChild(opt);
    });
    sel.value = state.monthKey;
    sel.onchange = () => {
      state.monthKey = sel.value;
      ["home-month", "chart-month", "notes-month"].forEach(otherId => {
        if (otherId !== id) document.getElementById(otherId).value = sel.value;
      });
      refreshCurrentScreen();
    };
  });
}

/* ================================================================
   EXPENSES DATA HELPERS
   ================================================================ */
function currentExpensesSource() {
  if (state.mode === "group" && state.activeGroupCode) {
    const g = state.groups[state.activeGroupCode];
    return (g && g.expenses) || {};
  }
  return state.expenses || {};
}
function expensesForMonth(monthKey, paymentFilter) {
  const src = currentExpensesSource();
  return Object.entries(src)
    .map(([id, e]) => ({ id, ...e }))
    .filter(e => e.date && e.date.startsWith(monthKey))
    .filter(e => !paymentFilter || paymentFilter === "all" || e.paymentMethod === paymentFilter);
}

/* ================================================================
   HOME SCREEN
   ================================================================ */
function renderHome() {
  const monthKey = document.getElementById("home-month").value || state.monthKey;
  const search = document.getElementById("home-search").value.trim().toLowerCase();
  const sort = document.getElementById("home-sort").value;

  let list = expensesForMonth(monthKey);
  if (search) {
    list = list.filter(e =>
      (e.category || "").toLowerCase().includes(search) ||
      (e.note || "").toLowerCase().includes(search) ||
      String(e.amount).includes(search)
    );
  }
  list.sort((a, b) => {
    if (sort === "date-desc") return (b.timestamp || 0) - (a.timestamp || 0);
    if (sort === "date-asc") return (a.timestamp || 0) - (b.timestamp || 0);
    if (sort === "amt-desc") return b.amount - a.amount;
    if (sort === "amt-asc") return a.amount - b.amount;
    return 0;
  });

  const listEl = document.getElementById("expense-list");
  const emptyEl = document.getElementById("home-empty");
  listEl.innerHTML = "";
  if (list.length === 0) {
    emptyEl.classList.remove("hidden");
  } else {
    emptyEl.classList.add("hidden");
    list.forEach(e => listEl.appendChild(renderExpenseItem(e)));
  }

  renderBudgetCard(monthKey, list);
}

function renderExpenseItem(e) {
  const div = document.createElement("div");
  div.className = "expense-item";
  const addedByTxt = e.addedBy ? ` · ${e.addedBy}` : "";
  div.innerHTML = `
    <div class="expense-main">
      <span class="cat-dot" style="background:${getCategoryColor(e.category)}"></span>
      <div class="expense-info">
        <div class="cat">${e.category}${e.recurring ? " · 🔁" : ""}</div>
        <div class="meta">${formatDate(e.date)} · ${e.paymentMethod}${addedByTxt}${e.note ? " · " + escapeHtml(e.note) : ""}</div>
      </div>
    </div>
    <div class="expense-amount">${rupee(e.amount)}</div>
    <div class="expense-actions">
      <button title="Edit" data-action="edit">✏️</button>
      <button title="Delete" data-action="delete">🗑️</button>
      <button title="Share" data-action="share">⇪</button>
    </div>
  `;
  div.querySelector('[data-action="edit"]').addEventListener("click", () => openAddExpense(e));
  div.querySelector('[data-action="delete"]').addEventListener("click", () => deleteExpense(e));
  div.querySelector('[data-action="share"]').addEventListener("click", () => shareText(
    "Trackzo Expense",
    `${e.category} ${rupee(e.amount)}\n${formatDate(e.date)} · ${e.paymentMethod}${e.note ? "\nNote: " + e.note : ""}`
  ));
  return div;
}
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderBudgetCard(monthKey, list) {
  const spent = list.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalBudget = state.mode === "group"
    ? (list.length ? null : null) // groups don't have a single owner budget; show spend-only
    : Number(state.user.totalBudget || 0);

  const totalEl = document.getElementById("budget-total");
  const spentEl = document.getElementById("budget-spent");
  const leftEl = document.getElementById("budget-left");
  const fill = document.getElementById("budget-progress-fill");

  spentEl.textContent = rupee(spent);

  if (state.mode === "group") {
    totalEl.textContent = "—";
    leftEl.textContent = "Group mode";
    fill.style.width = "0%";
    return;
  }

  totalEl.textContent = rupee(totalBudget);
  const left = totalBudget - spent;
  leftEl.textContent = rupee(left);
  const pct = totalBudget > 0 ? Math.min(100, (spent / totalBudget) * 100) : 0;
  fill.style.width = pct + "%";
  fill.className = "progress-fill" + (pct >= 100 ? " over" : pct >= 70 ? " warn" : "");
}

document.getElementById("home-search").addEventListener("input", renderHome);
document.getElementById("home-sort").addEventListener("change", renderHome);

document.getElementById("share-summary-btn").addEventListener("click", () => {
  const monthKey = document.getElementById("home-month").value || state.monthKey;
  const list = expensesForMonth(monthKey);
  const spent = list.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalBudget = Number(state.user.totalBudget || 0);
  const left = totalBudget - spent;
  let text = `Trackzo ${monthLabel(monthKey)}\nBudget: ${rupee(totalBudget)}\nSpent: ${rupee(spent)}\nLeft: ${rupee(left)}\n\n`;
  list.slice(0, 15).forEach(e => { text += `• ${e.category}: ${rupee(e.amount)} (${formatDate(e.date)})\n`; });
  shareText("Trackzo Summary", text);
});

async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); }
    catch (e) { /* user cancelled */ }
  } else {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard (share not supported on this browser)");
    } catch {
      showToast("Sharing not supported on this browser");
    }
  }
}

/* ================================================================
   ADD / EDIT EXPENSE
   ================================================================ */
function openAddExpense(existing) {
  state.editingExpenseId = existing ? existing.id : null;
  document.getElementById("add-title").textContent = existing ? "Edit Expense" : "Add Expense";
  document.getElementById("exp-submit-btn").textContent = existing ? "Update Expense" : "Save Expense";
  document.getElementById("exp-error").textContent = "";

  const categorySelect = document.getElementById("exp-category");
  const categories = getVisibleCategories(existing ? [existing.category] : []);
  categorySelect.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  categorySelect.value = existing && categories.includes(existing.category) ? existing.category : (categories[0] || "Food");
  document.getElementById("exp-amount").value = existing ? existing.amount : "";
  document.getElementById("exp-date").value = existing ? existing.date : todayISO();
  document.getElementById("exp-note").value = existing ? (existing.note || "") : "";
  document.getElementById("exp-payment").value = existing ? existing.paymentMethod : "Cash";
  document.getElementById("exp-recurring").checked = existing ? !!existing.recurring : false;

  const splitRow = document.getElementById("split-row");
  const splitMembers = document.getElementById("split-members");
  if (state.mode === "group" && state.activeGroupCode) {
    splitRow.classList.add("hidden");
    const g = state.groups[state.activeGroupCode];
    const members = g && g.members ? Object.keys(g.members) : [];
    splitMembers.classList.remove("hidden");
    splitMembers.innerHTML = "<label style='font-weight:600;color:var(--text-muted);margin-bottom:6px;display:block;'>Split between</label>" +
      members.map(m => `
        <label><input type="checkbox" class="split-check" value="${m}" ${(!existing || (existing.splitBetween || []).includes(m)) ? "checked" : ""}/> ${m}</label>
      `).join("");
  } else {
    splitRow.classList.remove("hidden");
    splitMembers.classList.add("hidden");
    splitMembers.innerHTML = "";
  }
  showScreen("add");
}

document.getElementById("expense-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("exp-error");
  errEl.textContent = "";

  const amount = parseFloat(document.getElementById("exp-amount").value);
  const category = document.getElementById("exp-category").value;
  const date = document.getElementById("exp-date").value;
  const note = document.getElementById("exp-note").value.trim();
  const paymentMethod = document.getElementById("exp-payment").value;
  const recurring = document.getElementById("exp-recurring").checked;

  if (!amount || amount <= 0) { errEl.textContent = "Enter an amount greater than 0."; return; }
  if (!date) { errEl.textContent = "Please pick a date."; return; }

  showLoading(true);
  try {
    if (state.mode === "group" && state.activeGroupCode) {
      const splitBetween = Array.from(document.querySelectorAll(".split-check:checked")).map(c => c.value);
      if (splitBetween.length === 0) { errEl.textContent = "Select at least one member to split with."; showLoading(false); return; }
      const payload = { amount, category, date, note, paymentMethod, timestamp: Date.now(), addedBy: state.username, splitBetween };
      const gRef = db.ref(`groups/${state.activeGroupCode}/expenses`);
      let expId = state.editingExpenseId;
      if (expId) await gRef.child(expId).update(payload);
      else { expId = genId(); await gRef.child(expId).set(payload); }
      await logGroupActivity(state.activeGroupCode, `${state.username} ${state.editingExpenseId ? "edited" : "added"} ₹${amount} ${category} expense`);
    } else {
      const payload = { amount, category, date, note, paymentMethod, timestamp: Date.now() };
      const uRef = db.ref(`expenses/${state.username}`);
      if (state.editingExpenseId) {
        await uRef.child(state.editingExpenseId).update(payload);
      } else {
        const id = genId();
        await uRef.child(id).set(payload);
        if (recurring) {
          const rid = genId();
          await db.ref(`recurring/${state.username}/${rid}`).set({
            amount, category, note, paymentMethod, dayOfMonth: new Date(date).getDate()
          });
        }
      }
    }
    showLoading(false);
    showToast(state.editingExpenseId ? "Expense updated" : "Expense added");
    document.getElementById("expense-form").reset();
    state.editingExpenseId = null;
    showScreen("home");
  } catch (err) {
    showLoading(false);
    errEl.textContent = "Could not save. Please try again.";
    console.error(err);
  }
});

async function deleteExpense(e) {
  const ok = await confirmDialog(`Delete this ${rupee(e.amount)} ${e.category} expense?`);
  if (!ok) return;
  showLoading(true);
  try {
    if (state.mode === "group" && state.activeGroupCode) {
      await db.ref(`groups/${state.activeGroupCode}/expenses/${e.id}`).remove();
      await logGroupActivity(state.activeGroupCode, `${state.username} deleted a ${e.category} expense`);
    } else {
      await db.ref(`expenses/${state.username}/${e.id}`).remove();
    }
    showToast("Expense deleted");
  } catch (err) {
    console.error(err);
    showToast("Could not delete. Try again.");
  }
  showLoading(false);
}

/* ---------------- Recurring processing ---------------- */
let recurringProcessed = false;
async function processRecurring() {
  if (recurringProcessed) return;
  recurringProcessed = true;
  const mk = monthKeyNow();
  const entries = Object.entries(state.recurring || {});
  for (const [rid, r] of entries) {
    const alreadyExists = Object.values(state.expenses || {}).some(e => e.recurringId === rid && e.date && e.date.startsWith(mk));
    if (!alreadyExists) {
      const day = Math.min(r.dayOfMonth || 1, 28);
      const date = `${mk}-${String(day).padStart(2, "0")}`;
      const id = genId();
      await db.ref(`expenses/${state.username}/${id}`).set({
        amount: r.amount, category: r.category, date, note: r.note || "",
        paymentMethod: r.paymentMethod, timestamp: Date.now(), recurring: true, recurringId: rid
      });
    }
  }
}

/* ================================================================
   CHARTS
   ================================================================ */
function renderCharts() {
  const monthKey = document.getElementById("chart-month").value || state.monthKey;
  const paymentFilter = document.getElementById("chart-payment").value;
  const list = expensesForMonth(monthKey, paymentFilter);

  const contentEl = document.getElementById("charts-content");
  const emptyEl = document.getElementById("charts-empty");
  if (list.length === 0) {
    contentEl.classList.add("hidden"); emptyEl.classList.remove("hidden");
    return;
  }
  contentEl.classList.remove("hidden"); emptyEl.classList.add("hidden");

  drawCategoryChart(list);
  drawTrendChart(paymentFilter);
}
document.getElementById("chart-payment").addEventListener("change", renderCharts);

function drawCategoryChart(list) {
  const canvas = document.getElementById("category-chart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const totals = {};
  const cats = getVisibleCategories(list.map(e => e.category));
  cats.forEach(c => totals[c] = 0);
  list.forEach(e => totals[e.category] = (totals[e.category] || 0) + Number(e.amount));
  const max = Math.max(1, ...Object.values(totals));
  const barW = Math.min(46, (w - 40) / cats.length - 12);
  const gap = (w - 40 - barW * cats.length) / Math.max(1, cats.length - 1);
  let x = 20;
  const baseY = h - 34;
  const chartH = h - 60;

  cats.forEach(c => {
    const barH = (totals[c] / max) * chartH;
    ctx.fillStyle = CAT_COLORS[c];
    roundRect(ctx, x, baseY - barH, barW, barH, 6);
    ctx.fill();
    ctx.fillStyle = getComputedStyle(document.body).color || "#333";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(c.slice(0, 4), x + barW / 2, h - 16);
    ctx.fillText(rupee(totals[c]).replace("₹", "₹"), x + barW / 2, baseY - barH - 6);
    x += barW + gap;
  });
}

function drawTrendChart(paymentFilter) {
  const canvas = document.getElementById("trend-chart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const months = lastNMonths(6).reverse();
  const totals = months.map(m => expensesForMonth(m, paymentFilter).reduce((s, e) => s + Number(e.amount), 0));
  const max = Math.max(1, ...totals);
  const barW = (w - 40) / months.length - 14;
  const baseY = h - 34;
  const chartH = h - 60;
  let x = 20;

  months.forEach((m, i) => {
    const barH = (totals[i] / max) * chartH;
    ctx.fillStyle = "#0F766E";
    roundRect(ctx, x, baseY - barH, barW, barH, 6);
    ctx.fill();
    ctx.fillStyle = getComputedStyle(document.body).color || "#333";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(m.slice(5), x + barW / 2, h - 16);
    x += barW + 14;
  });
}
function roundRect(ctx, x, y, w, h, r) {
  if (h < 0) { y += h; h = Math.abs(h); }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ================================================================
   NOTES
   ================================================================ */
function renderNotes() {
  const monthKey = document.getElementById("notes-month").value || state.monthKey;
  const search = document.getElementById("notes-search").value.trim().toLowerCase();

  let list = Object.entries(state.notes || {}).map(([id, n]) => ({ id, ...n }))
    .filter(n => n.timestamp && new Date(n.timestamp).toISOString().slice(0, 7) === monthKey);
  if (search) list = list.filter(n => (n.title + " " + n.text).toLowerCase().includes(search));
  list.sort((a, b) => b.timestamp - a.timestamp);

  const listEl = document.getElementById("notes-list");
  const emptyEl = document.getElementById("notes-empty");
  listEl.innerHTML = "";
  if (list.length === 0) { emptyEl.classList.remove("hidden"); }
  else {
    emptyEl.classList.add("hidden");
    list.forEach(n => listEl.appendChild(renderNoteItem(n)));
  }
}
document.getElementById("notes-search").addEventListener("input", renderNotes);

function renderNoteItem(n) {
  const div = document.createElement("div");
  div.className = "note-item";
  div.innerHTML = `
    <div class="note-title-row"><span>${escapeHtml(n.title)}</span><span style="font-weight:400;font-size:11px;color:var(--text-muted)">${formatDate(new Date(n.timestamp).toISOString())}</span></div>
    <div class="note-body">${escapeHtml(n.text)}</div>
    <div class="note-actions">
      <button data-action="edit">Edit</button>
      <button data-action="delete">Delete</button>
      <button data-action="share">Share</button>
    </div>
  `;
  div.querySelector('[data-action="edit"]').addEventListener("click", () => openNoteEdit(n));
  div.querySelector('[data-action="delete"]').addEventListener("click", () => deleteNote(n));
  div.querySelector('[data-action="share"]').addEventListener("click", () => shareText(n.title, `${n.title}\n\n${n.text}`));
  return div;
}

document.getElementById("notes-add-btn").addEventListener("click", () => openNoteEdit());
function openNoteEdit(existing) {
  state.editingNoteId = existing ? existing.id : null;
  document.getElementById("note-edit-title").textContent = existing ? "Edit Note" : "New Note";
  document.getElementById("note-title").value = existing ? existing.title : "";
  document.getElementById("note-text").value = existing ? existing.text : "";
  showScreen("note-edit");
}
document.getElementById("note-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("note-title").value.trim();
  const text = document.getElementById("note-text").value.trim();
  if (!title || !text) return;
  showLoading(true);
  try {
    const ref = db.ref(`notes/${state.username}`);
    if (state.editingNoteId) await ref.child(state.editingNoteId).update({ title, text });
    else await ref.child(genId()).set({ title, text, timestamp: Date.now() });
    showToast(state.editingNoteId ? "Note updated" : "Note saved");
    state.editingNoteId = null;
    showScreen("notes");
  } catch (err) { console.error(err); showToast("Could not save note."); }
  showLoading(false);
});
async function deleteNote(n) {
  const ok = await confirmDialog(`Delete note "${n.title}"?`);
  if (!ok) return;
  showLoading(true);
  await db.ref(`notes/${state.username}/${n.id}`).remove();
  showLoading(false);
  showToast("Note deleted");
}

/* ================================================================
   GROUPS
   ================================================================ */
function renderGroups() {
  const hasGroup = !!state.activeGroupCode && state.groups[state.activeGroupCode];
  document.getElementById("no-group-view").classList.toggle("hidden", hasGroup);
  document.getElementById("active-group-view").classList.toggle("hidden", !hasGroup);
  if (!hasGroup) return;

  const g = state.groups[state.activeGroupCode];
  document.getElementById("group-name-label").textContent = g.name || "Group";
  document.getElementById("group-code-label").textContent = state.activeGroupCode;

  const members = g.members ? Object.keys(g.members) : [];
  document.getElementById("group-members-list").innerHTML = members.map(m =>
    `<span class="member-chip">${m}${m === g.ownerUsername ? " 👑" : ""}</span>`
  ).join("");

  renderSettleUp(g, members);

  const activityEl = document.getElementById("group-activity-list");
  const activities = Object.values(g.activity || {}).sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  activityEl.innerHTML = activities.length
    ? activities.map(a => `<div class="activity-item">${escapeHtml(a.details)}</div>`).join("")
    : `<div class="activity-item">No activity yet.</div>`;
}

function renderSettleUp(g, members) {
  const expenses = Object.values(g.expenses || {});
  const balance = {};
  members.forEach(m => balance[m] = 0);
  expenses.forEach(e => {
    const split = e.splitBetween && e.splitBetween.length ? e.splitBetween : members;
    const share = e.amount / split.length;
    balance[e.addedBy] = (balance[e.addedBy] || 0) + e.amount;
    split.forEach(m => balance[m] = (balance[m] || 0) - share);
  });

  const creditors = Object.entries(balance).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
  const debtors = Object.entries(balance).filter(([, v]) => v < -0.5).sort((a, b) => a[1] - b[1]);
  const transactions = [];
  let ci = 0, di = 0;
  const cr = creditors.map(c => [...c]);
  const db_ = debtors.map(d => [...d]);
  while (ci < cr.length && di < db_.length) {
    const amt = Math.min(cr[ci][1], -db_[di][1]);
    if (amt > 0.5) transactions.push(`${db_[di][0]} owes ${cr[ci][0]} ${rupee(amt)}`);
    cr[ci][1] -= amt; db_[di][1] += amt;
    if (cr[ci][1] < 0.5) ci++;
    if (db_[di][1] > -0.5) di++;
  }

  const el = document.getElementById("settle-up-list");
  el.innerHTML = transactions.length
    ? transactions.map(t => `<div class="settle-row">${t}</div>`).join("")
    : `<div class="settle-row">Everyone's settled up 🎉</div>`;
}

document.getElementById("create-group-btn").addEventListener("click", async () => {
  const nameInput = document.getElementById("new-group-name");
  const name = nameInput.value.trim() || "My Group";
  showLoading(true);
  try {
    const code = gen6Digit();
    await db.ref(`groups/${code}`).set({
      ownerUsername: state.username, name, createdAt: Date.now(),
      members: { [state.username]: true }
    });
    await db.ref(`users/${state.username}/activeGroupId`).set(code);
    state.user.activeGroupId = code;
    state.activeGroupCode = code;
    attachGroupListener(code);
    nameInput.value = "";
    showToast(`Group created! Code: ${code}`);
    state.mode = "group";
    updateTrackerToggleUI();
  } catch (err) { console.error(err); showToast("Could not create group."); }
  showLoading(false);
});

document.getElementById("join-group-btn").addEventListener("click", async () => {
  const errEl = document.getElementById("join-group-error");
  errEl.textContent = "";
  const code = document.getElementById("join-group-code").value.trim();
  if (!/^\d{6}$/.test(code)) { errEl.textContent = "Enter a valid 6-digit code."; return; }
  showLoading(true);
  try {
    const snap = await db.ref(`groups/${code}`).get();
    if (!snap.exists()) { errEl.textContent = "No group found with that code."; showLoading(false); return; }
    await db.ref(`groups/${code}/members/${state.username}`).set(true);
    await db.ref(`users/${state.username}/activeGroupId`).set(code);
    state.activeGroupCode = code;
    attachGroupListener(code);
    await logGroupActivity(code, `${state.username} joined the group`);
    document.getElementById("join-group-code").value = "";
    showToast("Joined group!");
    state.mode = "group";
    updateTrackerToggleUI();
  } catch (err) { console.error(err); errEl.textContent = "Could not join group."; }
  showLoading(false);
});

document.getElementById("leave-group-btn").addEventListener("click", async () => {
  const ok = await confirmDialog("Leave this group? You'll need the code to rejoin.");
  if (!ok) return;
  showLoading(true);
  try {
    const code = state.activeGroupCode;
    const g = state.groups[code];
    await db.ref(`groups/${code}/members/${state.username}`).remove();
    if (g && g.ownerUsername === state.username) {
      const remaining = Object.keys(g.members || {}).filter(m => m !== state.username);
      if (remaining.length > 0) await db.ref(`groups/${code}/ownerUsername`).set(remaining[0]);
      else await db.ref(`groups/${code}`).remove();
    }
    await db.ref(`users/${state.username}/activeGroupId`).set(null);
    state.activeGroupCode = null;
    state.mode = "personal";
    updateTrackerToggleUI();
    showToast("You left the group");
  } catch (err) { console.error(err); showToast("Could not leave group."); }
  showLoading(false);
});

document.getElementById("share-group-code-btn").addEventListener("click", () => {
  const g = state.groups[state.activeGroupCode];
  shareText("Join my Trackzo group", `Join "${g.name}" on Trackzo!\nUse code: ${state.activeGroupCode}`);
});

async function logGroupActivity(code, details) {
  const id = genId();
  await db.ref(`groups/${code}/activity/${id}`).set({ username: state.username, action: "log", details, timestamp: Date.now() });
}

/* ================================================================
   SETTINGS
   ================================================================ */
function renderSettings() {
  document.getElementById("set-total-budget").value = state.user.totalBudget || 0;
  const catBudgets = state.user.categoryBudgets || {};
  const container = document.getElementById("category-budget-inputs");
  const categories = getUserCategories();
  container.innerHTML = categories.map(c => `
    <div class="cat-budget-row">
      <span class="cat-label">${escapeHtml(c)}</span>
      <input type="number" min="0" class="cat-budget-input" data-cat="${escapeHtml(c)}" value="${catBudgets[c] || 0}" />
    </div>
  `).join("");

  const categoryListEl = document.getElementById("category-list");
  categoryListEl.innerHTML = categories.map(c => `
    <div class="category-item">
      <span class="category-name">${escapeHtml(c)}</span>
      <div class="category-actions">
        <button type="button" data-action="edit-category" data-cat="${escapeHtml(c)}">Edit</button>
        <button type="button" data-action="delete-category" data-cat="${escapeHtml(c)}">Delete</button>
      </div>
    </div>
  `).join("");
  categoryListEl.querySelectorAll('[data-action="edit-category"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const currentName = btn.dataset.cat;
      const updated = window.prompt("Edit category name", currentName);
      if (!updated) return;
      const normalized = normalizeCategoryName(updated);
      if (!normalized) return;
      const next = categories.map(c => c === currentName ? normalized : c);
      saveCategories(next);
      renderSettings();
      showToast("Category updated");
    });
  });
  categoryListEl.querySelectorAll('[data-action="delete-category"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const currentName = btn.dataset.cat;
      if (categories.length <= 1) { showToast("Keep at least one category"); return; }
      const ok = await confirmDialog(`Delete category "${currentName}"? Existing expenses keep their labels.`);
      if (!ok) return;
      const next = categories.filter(c => c !== currentName);
      saveCategories(next);
      renderSettings();
      showToast("Category deleted");
    });
  });

  const recEl = document.getElementById("recurring-list");
  const recs = Object.entries(state.recurring || {});
  recEl.innerHTML = recs.length ? recs.map(([id, r]) => `
    <div class="expense-item">
      <div class="expense-main">
        <span class="cat-dot cat-${r.category}"></span>
        <div class="expense-info">
          <div class="cat">${r.category}</div>
          <div class="meta">${rupee(r.amount)} · day ${r.dayOfMonth} of month</div>
        </div>
      </div>
      <div class="expense-actions">
        <button data-id="${id}" data-action="del-rec">🗑️</button>
      </div>
    </div>
  `).join("") : `<p style="color:var(--text-muted);font-size:13px;">No recurring expenses set up.</p>`;
  recEl.querySelectorAll('[data-action="del-rec"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const ok = await confirmDialog("Delete this recurring expense template?");
      if (!ok) return;
      await db.ref(`recurring/${state.username}/${btn.dataset.id}`).remove();
      showToast("Recurring template removed");
    });
  });

  document.getElementById("dark-mode-toggle").checked = localStorage.getItem("trackzo_dark") === "1";
}

document.getElementById("save-budget-btn").addEventListener("click", async () => {
  const total = parseFloat(document.getElementById("set-total-budget").value) || 0;
  if (total < 0) { showToast("Budget cannot be negative"); return; }
  const catBudgets = {};
  let invalid = false;
  const categories = getUserCategories();
  document.querySelectorAll(".cat-budget-input").forEach(inp => {
    const v = parseFloat(inp.value) || 0;
    if (v < 0) invalid = true;
    catBudgets[inp.dataset.cat] = v;
  });
  categories.forEach(cat => {
    if (!(cat in catBudgets)) catBudgets[cat] = 0;
  });
  if (invalid) { showToast("Category budgets cannot be negative"); return; }

  showLoading(true);
  try {
    await db.ref(`users/${state.username}`).update({ totalBudget: total, categoryBudgets: catBudgets });
    state.user.totalBudget = total;
    state.user.categoryBudgets = catBudgets;
    showToast("Budget updated");
  } catch (err) { console.error(err); showToast("Could not save budget."); }
  showLoading(false);
});

async function saveCategories(categories) {
  const nextCategories = [...new Set(categories.map(normalizeCategoryName).filter(Boolean))];
  if (nextCategories.length === 0) return;
  state.user.categories = nextCategories;
  await db.ref(`users/${state.username}/categories`).set(nextCategories);
}

document.getElementById("add-category-btn").addEventListener("click", async () => {
  const value = normalizeCategoryName(document.getElementById("new-category-name").value);
  if (!value) { showToast("Enter a category name"); return; }
  const nextCategories = [...getUserCategories(), value];
  const uniqueCategories = [...new Set(nextCategories.map(normalizeCategoryName).filter(Boolean))];
  try {
    await saveCategories(uniqueCategories);
    document.getElementById("new-category-name").value = "";
    renderSettings();
    showToast("Category added");
  } catch (err) { console.error(err); showToast("Could not add category"); }
});

document.getElementById("dark-mode-toggle").addEventListener("change", (e) => {
  const on = e.target.checked;
  localStorage.setItem("trackzo_dark", on ? "1" : "0");
  applyDarkModePref();
});
function applyDarkModePref() {
  const on = localStorage.getItem("trackzo_dark") === "1";
  document.documentElement.setAttribute("data-theme", on ? "dark" : "light");
}

/* ---------------- Export CSV / PDF ---------------- */
document.getElementById("export-csv-btn").addEventListener("click", () => {
  const monthKey = document.getElementById("home-month").value || state.monthKey;
  const list = expensesForMonth(monthKey);
  if (list.length === 0) { showToast("No expenses to export for this month"); return; }
  let csv = "Date,Category,Amount,PaymentMethod,Note\n";
  list.forEach(e => {
    csv += `${e.date},${e.category},${e.amount},${e.paymentMethod},"${(e.note || "").replace(/"/g, '""')}"\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `Trackzo_${monthKey}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("CSV downloaded");
});

document.getElementById("export-pdf-btn").addEventListener("click", () => {
  const monthKey = document.getElementById("home-month").value || state.monthKey;
  const list = expensesForMonth(monthKey);
  if (list.length === 0) { showToast("No expenses to export for this month"); return; }
  const printArea = document.createElement("div");
  printArea.id = "print-area";
  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  printArea.innerHTML = `
    <h2>Trackzo ${monthLabel(monthKey)}</h2>
    <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><th>Date</th><th>Category</th><th>Amount</th><th>Payment</th><th>Note</th></tr>
      ${list.map(e => `<tr><td>${e.date}</td><td>${e.category}</td><td>${rupee(e.amount)}</td><td>${e.paymentMethod}</td><td>${escapeHtml(e.note || "")}</td></tr>`).join("")}
    </table>
    <p style="margin-top:14px;font-weight:bold;">Total: ${rupee(total)}</p>
  `;
  document.body.appendChild(printArea);
  document.body.classList.add("printing");
  window.print();
  document.body.classList.remove("printing");
  document.body.removeChild(printArea);
});

/* ================================================================
   INIT
   ================================================================ */
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("exp-date").value = todayISO();
  initOnboarding();
});