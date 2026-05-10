const STORAGE_KEY = "hearth-ledger-v1";
const categories = [
  "Essentials",
  "Groceries",
  "Rent",
  "Insurance",
  "Utilities",
  "Transport",
  "Health",
  "Education",
  "Entertainment",
  "Savings",
  "Other",
];

const NAV_ICONS = {
  dashboard: "🏠",
  transactions: "💸",
  recurring: "🔄",
  insights: "📊",
  settings: "⚙️",
};

const initial = {
  users: [
    { id: "u1", name: "You" },
    { id: "u2", name: "Family Member" },
  ],
  activeUserId: "u1",
  familyMode: false,
  darkMode: false,
  transactions: [],
  recurring: [],
  budgets: {},
};

const state = load();
const screens = {
  dashboard: document.querySelector("#dashboardScreen"),
  transactions: document.querySelector("#transactionsScreen"),
  recurring: document.querySelector("#recurringScreen"),
  insights: document.querySelector("#insightsScreen"),
  settings: document.querySelector("#settingsScreen"),
};

const navItems = ["dashboard", "transactions", "recurring", "insights", "settings"];
let activeScreen = "dashboard";

setupNav();
setupUserControls();
applyDarkMode();
renderAll();

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(initial);
  try {
    const parsed = JSON.parse(raw);
    return { ...structuredClone(initial), ...parsed };
  } catch {
    return structuredClone(initial);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyDarkMode() {
  document.documentElement.setAttribute("data-theme", state.darkMode ? "dark" : "light");
  const btn = document.querySelector("#darkModeBtn");
  if (btn) btn.textContent = state.darkMode ? "☀️ Light Mode" : "🌙 Dark Mode";
}

function setupNav() {
  const nav = document.querySelector("#navMenu");
  nav.innerHTML = navItems
    .map((item) => `<button data-screen="${item}"><span>${NAV_ICONS[item]}</span>${label(item)}</button>`)
    .join("");
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-screen]");
    if (!btn) return;
    activeScreen = btn.dataset.screen;
    renderAll();
  });
}

function setupUserControls() {
  const select = document.querySelector("#activeUser");
  select.addEventListener("change", (e) => {
    state.activeUserId = e.target.value;
    persist();
    renderAll();
  });

  const familyMode = document.querySelector("#familyMode");
  familyMode.addEventListener("change", (e) => {
    state.familyMode = e.target.checked;
    persist();
    renderAll();
  });

  const dialog = document.querySelector("#userDialog");
  document.querySelector("#newUserBtn").addEventListener("click", () => dialog.showModal());
  document.querySelector("#userForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.querySelector("#userName").value.trim();
    if (!name) return;
    const id = `u${Date.now()}`;
    state.users.push({ id, name });
    state.activeUserId = id;
    document.querySelector("#userName").value = "";
    dialog.close();
    persist();
    renderAll();
  });

  document.querySelector("#darkModeBtn").addEventListener("click", () => {
    state.darkMode = !state.darkMode;
    persist();
    applyDarkMode();
  });
}

function renderAll() {
  const monthLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
  document.querySelector("#monthBadge").textContent = monthLabel;
  document.querySelector("#activeUser").innerHTML = state.users
    .map((u) => `<option value="${u.id}" ${u.id === state.activeUserId ? "selected" : ""}>${u.name}</option>`)
    .join("");
  document.querySelector("#familyMode").checked = state.familyMode;

  document.querySelectorAll(".nav button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.screen === activeScreen);
  });

  Object.entries(screens).forEach(([key, node]) => node.classList.toggle("hidden", key !== activeScreen));
  document.querySelector("#screenTitle").textContent = label(activeScreen);

  renderDashboard();
  renderTransactions();
  renderRecurring();
  renderInsights();
  renderSettings();
}

function inScope(tx) {
  return state.familyMode || tx.userId === state.activeUserId;
}

function getMonths(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthTotal(key) {
  return state.transactions
    .filter((t) => inScope(t) && t.date.startsWith(key))
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

// ─── Feature 1: Budget Goals ───────────────────────────────────────────────

function renderBudgetBars() {
  const activeBudgets = Object.entries(state.budgets).filter(([, v]) => v > 0);
  if (!activeBudgets.length) return "";

  const monthKey = getMonths(0);
  const catSpend = {};
  state.transactions.forEach((t) => {
    if (!inScope(t) || !t.date.startsWith(monthKey)) return;
    catSpend[t.category] = (catSpend[t.category] || 0) + Number(t.amount);
  });

  const bars = activeBudgets
    .map(([cat, limit]) => {
      const spent = catSpend[cat] || 0;
      const pct = Math.min((spent / limit) * 100, 100);
      const isOver = spent > limit;
      const cls = pct < 70 ? "ok" : pct < 90 ? "warn" : "over";
      const overLabel = isOver ? `<span class="over-label">🔴 Over!</span>` : "";
      return `
        <div class="budget-bar-wrap">
          <div class="budget-bar-meta">
            <span>${cat}${overLabel}</span>
            <strong>${money(spent)} / ${money(limit)}</strong>
          </div>
          <div class="budget-bar-track">
            <div class="budget-bar-fill ${cls}" style="width:${pct}%"></div>
          </div>
        </div>`;
    })
    .join("");

  return `<article class="card">
    <h3>Budget Goals — ${new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
    <div class="budget-section">${bars}</div>
  </article>`;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

function renderDashboard() {
  const thisMonth = monthTotal(getMonths(0));
  const prevMonth = monthTotal(getMonths(-1));
  const prev2Month = monthTotal(getMonths(-2));
  const recurringMonthly = state.recurring
    .filter((r) => (state.familyMode || r.userId === state.activeUserId) && r.frequency === "monthly" && r.active)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const topCats = aggregateCategories(getMonths(0));
  const budgetSection = renderBudgetBars();

  screens.dashboard.innerHTML = `
    <div class="metrics">
      ${metricCard("Current Month", money(thisMonth), delta(thisMonth - prevMonth, "vs previous month"))}
      ${metricCard("Previous Month", money(prevMonth), delta(prevMonth - prev2Month, "vs two months ago"))}
      ${metricCard("Two Months Ago", money(prev2Month), "Baseline")}
      ${metricCard("Recurring (monthly)", money(recurringMonthly), "Autopay commitments")}
    </div>
    <div class="grid-two">
      <article class="card">
        <h3>Category Spend (Current Month)</h3>
        ${barList(topCats)}
      </article>
      <article class="card">
        <h3>Recent Transactions</h3>
        ${recentTable()}
      </article>
    </div>
    ${budgetSection}
  `;
}

// ─── Transactions ──────────────────────────────────────────────────────────

function renderTransactions() {
  const userId = state.activeUserId;
  screens.transactions.innerHTML = `
    <article class="card">
      <h3>Add Expense</h3>
      <form id="txForm" class="form-grid">
        <label>Amount<input required type="number" min="0" step="0.01" name="amount" /></label>
        <label>Date<input required type="date" name="date" value="${new Date().toISOString().slice(0, 10)}"/></label>
        <label>Category
          <select name="category">${categories.map((c) => `<option>${c}</option>`).join("")}</select>
        </label>
        <label>User
          <select name="userId">${state.users.map((u) => `<option value="${u.id}" ${u.id === userId ? "selected" : ""}>${u.name}</option>`).join("")}</select>
        </label>
        <label class="full">Note<input name="note" placeholder="Optional description"/></label>
        <button class="full">Save Transaction</button>
      </form>
    </article>
    <article class="card">
      <div class="card-header-row">
        <h3>Expense Log</h3>
        <button id="exportCsvBtn" class="secondary btn-sm">⬇ Export CSV</button>
      </div>
      ${txTable()}
    </article>
  `;

  document.querySelector("#txForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    state.transactions.unshift({
      id: `t${Date.now()}`,
      userId: data.get("userId"),
      amount: Number(data.get("amount")),
      date: data.get("date"),
      category: data.get("category"),
      note: data.get("note") || "",
    });
    persist();
    renderAll();
  });

  // Feature 3a: CSV Export
  document.querySelector("#exportCsvBtn").addEventListener("click", exportCSV);

  // Feature 3b: Delete transaction (event delegation)
  document.querySelector("#txTableBody")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-delete");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (confirm("Delete this transaction?")) {
      state.transactions = state.transactions.filter((t) => t.id !== id);
      persist();
      renderAll();
    }
  });
}

function exportCSV() {
  const txs = state.transactions.filter(inScope);
  const header = "Date,User,Category,Note,Amount\n";
  const rows = txs
    .map((t) => `${t.date},${nameOf(t.userId)},${t.category},"${(t.note || "").replace(/"/g, '""')}",${t.amount}`)
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hearthledger-${getMonths(0)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Recurring ─────────────────────────────────────────────────────────────

function renderRecurring() {
  screens.recurring.innerHTML = `
    <article class="card">
      <h3>Add Autopay / Recurring Charge</h3>
      <form id="recurringForm" class="form-grid">
        <label>Label<input required name="name" placeholder="Rent / Netflix / Insurance"/></label>
        <label>Amount<input required type="number" step="0.01" min="0" name="amount"/></label>
        <label>Category
          <select name="category">${categories.map((c) => `<option>${c}</option>`).join("")}</select>
        </label>
        <label>Frequency
          <select name="frequency"><option>daily</option><option selected>weekly</option><option>monthly</option><option>yearly</option></select>
        </label>
        <label>Starts on<input type="date" name="startDate" value="${new Date().toISOString().slice(0, 10)}"/></label>
        <label>User
          <select name="userId">${state.users.map((u) => `<option value="${u.id}">${u.name}</option>`).join("")}</select>
        </label>
        <button class="full">Add Recurring</button>
      </form>
    </article>
    <article class="card">
      <h3>Recurring Charges</h3>
      <table class="table">
        <thead><tr><th>Name</th><th>Amount</th><th>Frequency</th><th>User</th><th>Category</th></tr></thead>
        <tbody>
          ${state.recurring
            .filter((r) => state.familyMode || r.userId === state.activeUserId)
            .map(
              (r) => `<tr><td>${r.name}</td><td>${money(r.amount)}</td><td><span class="chip">${r.frequency}</span></td><td>${nameOf(r.userId)}</td><td>${r.category}</td></tr>`,
            )
            .join("") || `<tr><td colspan="5">No recurring charges yet.</td></tr>`}
        </tbody>
      </table>
    </article>
  `;

  document.querySelector("#recurringForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    state.recurring.unshift({
      id: `r${Date.now()}`,
      name: data.get("name"),
      amount: Number(data.get("amount")),
      category: data.get("category"),
      frequency: data.get("frequency"),
      startDate: data.get("startDate"),
      userId: data.get("userId"),
      active: true,
    });
    persist();
    renderAll();
  });
}

// ─── Insights ──────────────────────────────────────────────────────────────

function renderInsights() {
  const months = [getMonths(-5), getMonths(-4), getMonths(-3), getMonths(-2), getMonths(-1), getMonths(0)];
  const points = months.map((m) => monthTotal(m));
  screens.insights.innerHTML = `
    <article class="card">
      <h3>6-Month Spend Trend</h3>
      <canvas id="trendCanvas"></canvas>
    </article>
    <article class="card">
      <h3>Ideas to Extend This App</h3>
      <ul>
        <li>Set monthly category budgets with alert thresholds.</li>
        <li>Assign savings goals (vacation, emergency fund) and track progress.</li>
        <li>Add receipt image uploads and OCR extraction.</li>
        <li>Future-ready bank integration via a provider abstraction layer.</li>
        <li>Create family notifications for unusual spending spikes.</li>
      </ul>
    </article>
  `;
  // Wait one frame so the canvas has a computed width before drawing
  requestAnimationFrame(() => {
    const canvas = document.querySelector("#trendCanvas");
    if (canvas) drawLineChart(canvas, points, months);
  });
}

// ─── Settings ──────────────────────────────────────────────────────────────

function renderSettings() {
  screens.settings.innerHTML = `
    <article class="card">
      <h3>Monthly Budget Goals</h3>
      <p class="hint">Set a monthly spending limit per category. Leave blank for no limit.</p>
      <div class="form-grid">
        ${categories
          .map(
            (cat) => `
          <label>${cat}
            <input type="number" min="0" step="1" class="budget-input" data-cat="${cat}"
                   value="${state.budgets[cat] || ""}" placeholder="No limit" />
          </label>`,
          )
          .join("")}
        <button class="full" id="saveBudgets">💾 Save Budget Goals</button>
      </div>
    </article>
    <article class="card">
      <h3>Design & Product Notes</h3>
      <ul>
        <li>Muted palette and low contrast surfaces for a calm, elegant interface.</li>
        <li>Single-click family aggregation toggle for merged visibility.</li>
        <li>Extensible data model (users, transactions, recurring schedules).</li>
      </ul>
      <button id="seedData" class="secondary">🌱 Seed Demo Data</button>
    </article>
  `;

  document.querySelector("#saveBudgets").addEventListener("click", () => {
    document.querySelectorAll(".budget-input").forEach((input) => {
      const cat = input.dataset.cat;
      const val = parseFloat(input.value);
      if (val > 0) {
        state.budgets[cat] = val;
      } else {
        delete state.budgets[cat];
      }
    });
    persist();
    renderAll();
  });

  document.querySelector("#seedData").addEventListener("click", () => {
    if (state.transactions.length) return;
    const baseDate = new Date();
    for (let i = 0; i < 35; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i * 2);
      state.transactions.push({
        id: `seed${i}`,
        userId: i % 2 === 0 ? "u1" : "u2",
        amount: (20 + (i % 7) * 13).toFixed(2),
        date: d.toISOString().slice(0, 10),
        category: categories[i % categories.length],
        note: "Seeded",
      });
    }
    persist();
    renderAll();
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function aggregateCategories(monthKey) {
  const totals = Object.fromEntries(categories.map((c) => [c, 0]));
  state.transactions.forEach((t) => {
    if (!inScope(t) || !t.date.startsWith(monthKey)) return;
    totals[t.category] = (totals[t.category] || 0) + Number(t.amount);
  });
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
}

function txTable() {
  const rows = state.transactions
    .filter(inScope)
    .slice(0, 40)
    .map(
      (t) =>
        `<tr>
          <td>${t.date}</td><td>${nameOf(t.userId)}</td><td>${t.category}</td>
          <td>${t.note || "–"}</td><td>${money(t.amount)}</td>
          <td><button class="btn-delete" data-id="${t.id}" title="Delete transaction">✕</button></td>
        </tr>`,
    )
    .join("");
  return `<table class="table">
    <thead><tr><th>Date</th><th>User</th><th>Category</th><th>Note</th><th>Amount</th><th></th></tr></thead>
    <tbody id="txTableBody">${rows || `<tr><td colspan="6">No expenses yet.</td></tr>`}</tbody>
  </table>`;
}

function recentTable() {
  const rows = state.transactions
    .filter(inScope)
    .slice(0, 6)
    .map((t) => `<tr><td>${t.date}</td><td>${t.category}</td><td>${money(t.amount)}</td></tr>`)
    .join("");
  return `<table class="table"><thead><tr><th>Date</th><th>Category</th><th>Amount</th></tr></thead><tbody>${rows || `<tr><td colspan="3">No expenses for this profile.</td></tr>`}</tbody></table>`;
}

function barList(items) {
  const max = Math.max(...items.map(([, v]) => v), 1);
  return items
    .map(
      ([name, value]) => `
      <div style="margin-bottom:.6rem;">
        <div style="display:flex;justify-content:space-between;"><span>${name}</span><strong>${money(value)}</strong></div>
        <div style="background:var(--line);height:8px;border-radius:99px;overflow:hidden;margin-top:.25rem;">
          <div style="width:${(value / max) * 100}%;background:var(--primary);height:100%;border-radius:99px;transition:width .4s ease;"></div>
        </div>
      </div>`,
    )
    .join("");
}

// ─── Improved line chart ────────────────────────────────────────────────────

function drawLineChart(canvas, points, months) {
  const isDark = state.darkMode;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.offsetWidth || 700;
  const h = 240;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const max = Math.max(...points, 1);
  const padL = 58, padR = 16, padT = 24, padB = 38;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const gridColor  = isDark ? "#2c3230" : "#e8ece6";
  const textColor  = isDark ? "#8a9488" : "#5f655e";
  const lineColor  = isDark ? "#87a584" : "#6d7f6a";
  const dotBg      = isDark ? "#1c1f23" : "#ffffff";

  // Grid lines + Y-axis labels
  ctx.font = `11px Inter, system-ui, sans-serif`;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH * i) / 4;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    const val = max * (1 - i / 4);
    ctx.fillStyle = textColor;
    ctx.textAlign = "right";
    const label = val >= 1000 ? `$${(val / 1000).toFixed(1)}k` : `$${val.toFixed(0)}`;
    ctx.fillText(label, padL - 5, y + 4);
  }

  const coords = points.map((p, i) => ({
    x: padL + (i / (points.length - 1 || 1)) * chartW,
    y: padT + chartH - (p / max) * chartH,
  }));

  // Gradient fill under the line
  const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0, isDark ? "rgba(135,165,132,0.22)" : "rgba(109,127,106,0.15)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  coords.forEach(({ x, y }, i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.lineTo(coords[coords.length - 1].x, padT + chartH);
  ctx.lineTo(coords[0].x, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  coords.forEach(({ x, y }, i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();

  // Dots, value labels, month labels
  coords.forEach(({ x, y }, i) => {
    // Value label above dot
    if (points[i] > 0) {
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.font = `10px Inter, system-ui, sans-serif`;
      const v = points[i];
      ctx.fillText(v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`, x, y - 10);
    }

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.strokeStyle = dotBg;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Month label on X-axis
    const [yr, mo] = months[i].split("-").map(Number);
    const shortMonth = new Date(yr, mo - 1, 1).toLocaleDateString(undefined, {
      month: "short",
      year: "2-digit",
    });
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.font = `10px Inter, system-ui, sans-serif`;
    ctx.fillText(shortMonth, x, h - padB + 16);
  });
}

// ─── Formatters ────────────────────────────────────────────────────────────

function money(v) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(v || 0));
}

function nameOf(userId) {
  return state.users.find((u) => u.id === userId)?.name || "Unknown";
}

function label(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function metricCard(labelTxt, value, sub) {
  return `<article class="card metric"><div class="label">${labelTxt}</div><div class="value">${value}</div><div class="delta">${sub}</div></article>`;
}

function delta(value, suffix) {
  const sign = value >= 0 ? "+" : "-";
  const cls = value > 0 ? "delta-negative" : value < 0 ? "delta-positive" : "";
  const span = cls
    ? `<span class="${cls}">${sign}${money(Math.abs(value))} ${suffix}</span>`
    : `${sign}${money(Math.abs(value))} ${suffix}`;
  return span;
}
