/* ============================================================
   شحنك DZ — admin.js
   لوحة المالك: PIN + إحصائيات + محفظة المورد + سجل الطلبات
   ============================================================ */

"use strict";

/* ⚠️ رمز PIN للتجربة — غيّره قبل الإطلاق (أو اربطه بخادمك) */
const ADMIN_PIN = "2609";
const LS_PIN = "shdz_admin_ok";

const A$ = (id) => document.getElementById(id);

/* ---------- الدخول ---------- */
function initAdmin() {
  const pinForm = A$("pinForm");
  if (!pinForm) return; /* ليست صفحة الأدمن */

  /* جلسة مفتوحة مسبقاً؟ */
  if (sessionStorage.getItem(LS_PIN) === "1") openDash();

  pinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = A$("pinInput").value.trim();
    if (val === ADMIN_PIN) {
      sessionStorage.setItem(LS_PIN, "1");
      openDash();
    } else {
      A$("pinErr").hidden = false;
      A$("pinInput").value = "";
      A$("pinInput").focus();
      setTimeout(() => (A$("pinErr").hidden = true), 2600);
    }
  });
}

function openDash() {
  A$("loginBox").hidden = true;
  A$("dashBox").hidden = false;
  renderDash();
}

/* ---------- الإحصائيات ---------- */
function getOrders() {
  try { return JSON.parse(localStorage.getItem("shdz_orders")) || []; }
  catch { return []; }
}

function renderDash() {
  const orders = getOrders();
  const w = SHDZ.wallet;

  /* أرقام الإحصائيات */
  const total = orders.length;
  const pending = orders.filter(o => o.status !== "done").length;
  const volume = orders.reduce((s, o) => s + (o.amount || 0), 0);
  const profit = orders.reduce((s, o) => s + (o.splitStore || 0), 0);

  A$("stOrders").textContent = total;
  A$("stPending").textContent = pending;
  A$("stVolume").textContent = fmtDZ(volume);
  A$("stProfit").textContent = fmtDZ(profit);

  /* المحفظة: رصيد أولي − تكاليف الشحن المنفَّذة + ... */
  const spent = orders
    .filter(o => o.status === "done")
    .reduce((s, o) => s + (o.splitSupplier || 0), 0);
  const balance = w.supplierStartBalance - spent;

  A$("wBalance").textContent = fmtDZ(balance);
  A$("wFlow").textContent = `−${fmtDZ(spent)}`;
  A$("wThreshold").textContent = `عتبة التنبيه: ${fmtDZ(w.lowBalanceThreshold)}`;

  /* تنبيه انخفاض الرصيد */
  A$("lowBalBox").classList.toggle("hidden", balance >= w.lowBalanceThreshold);

  /* شارة الوضع */
  const mode = SHDZ.slickpay.mode;
  A$("wMode").textContent = mode === "LIVE"
    ? "🔴 الوضع الحقيقي LIVE"
    : "🧪 وضع التجربة SIMULATION";

  /* جدول الطلبات */
  const body = A$("ordersBody");
  const note = A$("emptyNote");
  if (!orders.length) {
    body.innerHTML = "";
    note.classList.remove("hidden");
  } else {
    note.classList.add("hidden");
    body.innerHTML = [...orders].reverse().map(o => {
      const st = o.status === "done"
        ? '<span class="st-pill done">✓ مُسلَّم</span>'
        : '<span class="st-pill new">قيد المعالجة</span>';
      return `<tr>
        <td><b class="ltr">${esc(o.id)}</b></td>
        <td>${esc(o.gameEmoji || "")} ${esc(o.gameName)}<br><span style="font-size:.75rem;color:var(--ink-3)">${esc(o.pack)}</span></td>
        <td class="ltr">${esc(o.pid)}</td>
        <td><b>${fmtDZ(o.amount)}</b></td>
        <td style="font-size:.8rem">✂️ ${fmtDZ(o.splitStore)} / ${fmtDZ(o.splitSupplier)}</td>
        <td>${st}</td>
      </tr>`;
    }).join("");
  }
}

/* ---------- مسح السجل ---------- */
function wireAdminButtons() {
  const clear = A$("clearOrders");
  if (clear) clear.addEventListener("click", () => {
    if (confirm("مسح كل طلبات التجربة من هذا الجهاز؟ (لا يمكن التراجع)")) {
      localStorage.removeItem("shdz_orders");
      renderDash();
      toast("🗑 تم مسح سجل التجربة");
    }
  });

  const logout = A$("logoutBtn");
  if (logout) logout.addEventListener("click", () => {
    sessionStorage.removeItem(LS_PIN);
    A$("dashBox").hidden = true;
    A$("loginBox").hidden = false;
    A$("pinInput").value = "";
    A$("pinInput").focus();
  });
}

/* ---------- تشغيل صفحة الأدمن ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const path = location.pathname.split("/").pop();
  if (path !== "admin.html") return;
  initAdmin();
  wireAdminButtons();
});
