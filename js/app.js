/* ============================================================
   شحنك DZ — app.js
   المنطق الكامل: العرض + الشراء + التتبع + PWA + الأدوات
   ============================================================ */

"use strict";

/* ---------- أدوات عامة ---------- */
const $ = (id) => document.getElementById(id);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const fmtDZ = (n) => new Intl.NumberFormat("fr-DZ").format(Math.round(n)) + " دج";
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

/* Toast */
let toastTimer = null;
function toast(msg) {
  const t = $("toast"), m = $("toastMsg");
  if (!t || !m) return;
  m.textContent = msg;
  t.style.display = "flex";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.display = "none"), 3200);
}

/* ---------- التخزين (localStorage) ---------- */
const LS = {
  key: "shdz_orders",
  get() {
    try { return JSON.parse(localStorage.getItem(LS.key)) || []; }
    catch { return []; }
  },
  save(list) {
    try { localStorage.setItem(LS.key, JSON.stringify(list)); }
    catch { /* وضع خاص/ممتلئ — نتجاهل */ }
  },
};

/* توليد رقم طلب: SHDZ-YYMMDD-XXXXX */
function genOrderId() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, "0");
  const ymd = `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let rnd = "";
  const buf = new Uint32Array(5);
  crypto.getRandomValues(buf);
  for (const v of buf) rnd += abc[v % abc.length];
  return `SHDZ-${ymd}-${rnd}`;
}

/* التقسيم 25% / 75% */
function calcSplit(amount) {
  const store = Math.round(amount * SHDZ.split.storeSharePct);
  return { store, supplier: amount - store };
}

/* البحث عن لعبة/باقة */
function findGame(id) { return GAMES.find(g => g.id === id) || CARDS.find(c => c.id === id) || null; }
function isCard(item) { return CARDS.some(c => c.id === item.id); }
function findPack(game, packId) { return (game.packs || []).find(p => p.id === packId) || null; }

/* حجب كلمة السر لواجهة اللعبة (محاكاة) */
function maskId(v, type) {
  const s = String(v || "");
  if (type === "email") {
    const [u, d] = s.split("@");
    return d ? `${u.slice(0, 2)}${"•".repeat(Math.max(u.length - 2, 2))}@${d}` : s;
  }
  if (type === "username") return s.length > 3 ? `${s.slice(0, 2)}${"•".repeat(s.length - 2)}` : s;
  return s.length > 4 ? `${s.slice(0, 2)}•••${s.slice(-2)}` : "•".repeat(s.length);
}

/* ============================================================
   الصفحة الرئيسية (index.html)
   ============================================================ */
function initHome() {
  const cardTpl = (g, cta) => `
      <article class="game-card">
        <div class="game-top">
          <span class="game-emoji">${g.emoji}</span>
          <span class="tag">${(g.tags && g.tags[0]) || "فوري"}</span>
        </div>
        <h3>${g.name}</h3>
        <p class="g-sub">${g.sub}</p>
        <p class="g-price">من <b>${Math.min(...g.packs.map(p => p.price)).toLocaleString("fr-DZ")}</b> <span class="cur">دج</span></p>
        <a class="btn btn-small" href="buy.html?game=${g.id}">${cta}</a>
      </article>
    `;

  /* شبكة الألعاب */
  const grid = $("gamesGrid");
  if (grid) grid.innerHTML = GAMES.map(g => cardTpl(g, "اشحن الآن ⚡")).join("");

  /* شبكة البطاقات والاشتراكات */
  const cgrid = $("cardsGrid");
  if (cgrid) cgrid.innerHTML = CARDS.map(c => cardTpl(c, "اطلب الآن 🎁")).join("");

  /* FAQ */
  const faq = $("faqList");
  if (faq) {
    faq.innerHTML = FAQS.map(f => `
      <div class="faq-item">
        <button class="faq-q" type="button">${esc(f.q)} <span class="chev">▾</span></button>
        <div class="faq-a"><p>${esc(f.a)}</p></div>
      </div>
    `).join("");
    $$(".faq-item").forEach(item => {
      const q = item.querySelector(".faq-q");
      q.addEventListener("click", () => item.classList.toggle("open"));
    });
  }
}

/* ============================================================
   صفحة الشراء (buy.html)
   ============================================================ */
const Buy = {
  state: { game: null, pack: null, pid: "", nick: "", verified: false, pm: "card" },

  init() {
    /* قراءة ?game= من الرابط — يدعم الألعاب والبطاقات */
    const params = new URLSearchParams(location.search);
    const gid = params.get("game");
    this.state.game = findGame(gid) || GAMES[0];

    this.renderGameBox();
    this.renderPacks();
    this.wire();
    this.progress(1);
  },

  renderGameBox() {
    const g = this.state.game;
    if ($("selGameEmoji")) $("selGameEmoji").textContent = g.emoji;
    if ($("selGameName")) $("selGameName").textContent = g.name;
    if ($("selGameSub")) $("selGameSub").textContent = g.sub;
    /* تكييف الخطوة 2 حسب نوع المنتج: لعبة / بطاقة / اشتراك */
    if (g.verifyType === "email") {
      if ($("idLabel")) $("idLabel").textContent = "بريدك الإلكتروني";
      if ($("playerId")) {
        $("playerId").type = "email";
        $("playerId").inputMode = "email";
        $("playerId").placeholder = "name@email.com";
      }
      if ($("idHint")) $("idHint").textContent = "سيصلك الرمز أو تفاصيل الاشتراك على هذا البريد خلال 30 دقيقة كحد أقصى";
    } else if (g.verifyType === "username") {
      if ($("idLabel")) $("idLabel").textContent = "اسم المستخدم / المعرّف";
      if ($("playerId")) {
        $("playerId").type = "text";
        $("playerId").inputMode = "text";
        $("playerId").placeholder = "مثال: SniperDZ";
      }
      if ($("idHint")) $("idHint").textContent = g.verifyHint || "أدخل اسم المستخدم الظاهر في حسابك";
    } else {
      if ($("idLabel")) $("idLabel").textContent = "معرّف اللاعب (Player ID)";
      if ($("playerId")) {
        $("playerId").type = "text";
        $("playerId").inputMode = "numeric";
        $("playerId").placeholder = "مثال: 5214889012";
      }
      if ($("idHint")) $("idHint").textContent = g.verifyHint || "تجده أسفل صورك الشخصية في اللعبة";
    }
    if ($("playerId")) $("playerId").classList.toggle("ltr", g.verifyType === "playerid");
  },

  renderPacks() {
    const list = $("packsList");
    if (!list) return;
    list.innerHTML = this.state.game.packs.map(p => `
      <label class="pack" data-id="${p.id}">
        <input type="radio" name="pack" value="${p.id}" hidden>
        <span class="pack-ico">${this.state.game.emoji}</span>
        <span class="pack-info">
          <span class="p-name">${p.name}</span>
          <span class="p-sub">${p.sub}${p.bonus ? ` · ${p.bonus}` : ""}</span>
        </span>
        <span class="pack-price">${fmtDZ(p.price)}</span>
      </label>
    `).join("");

    $$(".pack", list).forEach(el => {
      el.addEventListener("click", () => this.selectPack(el.dataset.id));
    });
  },

  selectPack(id) {
    const pack = findPack(this.state.game, id);
    if (!pack) return;
    this.state.pack = pack;
    $$(".pack").forEach(el => el.classList.toggle("selected", el.dataset.id === id));
    this.refresh();
    this.toStep(2);
  },

  /* الانتقال بين الخطوات */
  toStep(n) {
    $$(".wiz-step").forEach(s => s.classList.toggle("active", s.dataset.step === String(n)));
    $$(".p-step").forEach(s => {
      const k = Number(s.dataset.step);
      s.classList.toggle("active", k === n);
      s.classList.toggle("done", k < n);
    });
    if (n > 1) window.scrollTo({ top: 0, behavior: "smooth" });
    this.progress(n);
  },

  progress(n) {
    const track = $("progressTrack");
    if (!track) return;
    const pct = [0, 25, 50, 75, 100][n] || 0;
    track.style.setProperty("--p", pct + "%");
  },

  /* تحديث الملخصات */
  refresh() {
    const { pack, game } = this.state;
    if (!pack) return;
    const split = calcSplit(pack.price);

    if ($("payAmount")) $("payAmount").textContent = fmtDZ(pack.price);
    if ($("sum2")) {
      $("sum2").innerHTML = `
        <div class="s-row"><span class="k">اللعبة</span><span class="v">${game.name}</span></div>
        <div class="s-row"><span class="k">الباقة</span><span class="v">${pack.name}</span></div>
        <div class="s-row"><span class="k">السعر</span><span class="v">${fmtDZ(pack.price)}</span></div>
        <div class="s-total"><span class="k">الإجمالي</span><span class="v">${fmtDZ(pack.price)}</span></div>`;
    }
    if ($("sum3")) {
      const pmName = this.state.pm === "card" ? "بطاقة CIB / الذهبية (SlickPay)" : "تطبيق SlickPay (QR)";
      $("sum3").innerHTML = `
        <div class="s-row"><span class="k">الطريقة</span><span class="v">${pmName}</span></div>
        <div class="s-row"><span class="k">✂️ هامش المتجر (25%)</span><span class="v">${fmtDZ(split.store)}</span></div>
        <div class="s-row"><span class="k">🚚 تكلفة الشحن → المورد (75%)</span><span class="v">${fmtDZ(split.supplier)}</span></div>
        <div class="s-total"><span class="k">تدفع أنت</span><span class="v">${fmtDZ(pack.price)}</span></div>`;
    }
  },

  /* التحقق من اللاعب (محاكاة سيرفر اللعبة) */
  async verifyPlayer() {
    const input = $("playerId");
    if (!input) return;
    const g = this.state.game;
    const val = input.value.trim();
    const box = $("verifyBox");
    const btn = $("toStep3");

    this.state.verified = false;
    if (btn) btn.disabled = true;

    if (box) { box.classList.remove("hidden", "err"); }

    const setType = g.verifyType;
    /* قواعد بسيطة للتحقق الشكلي */
    let ok = false;
    if (setType === "playerid") ok = /^\d{6,12}$/.test(val);
    else if (setType === "username") ok = /^[A-Za-z0-9_#]{3,20}$/.test(val);
    else ok = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(val);

    if (!ok) {
      input.classList.add("err");
      if (box) {
        box.classList.add("err");
        box.classList.remove("hidden");
        $("vIco").textContent = "✖";
        $("vName").textContent = "الصيغة غير صحيحة";
        $("vSub").textContent = setType === "email" ? "أدخل بريداً صحيحاً بصيغة name@email.com — سيصلك عليه الرمز" : "تأكد من كتابة المعرّف كما هو في اللعبة";
      }
      return;
    }

    input.classList.remove("err");

    /* محاكاة الاتصال بسيرفر اللعبة */
    if (box) {
      box.classList.remove("hidden", "err");
      $("vIco").textContent = "⏳";
      $("vName").textContent = (setType === "email" ? "جارٍ تسجيل بريدك للإرسال…" : "جارٍ التحقق من الحساب…");
      $("vSub").textContent = (setType === "email" ? "سجلنا بريدك — الرمز سيصل عليه بعد الدفع" : "نتصل بسيرفر اللعبة للتأكد من الحساب");
    }
    await new Promise(r => setTimeout(r, 1100));

    /* الاسم الوهمي — ثابت لنفس الإدخال (يبدو حقيقي) */
    let h = 0;
    for (const ch of val) h = (h * 31 + ch.charCodeAt(0)) % 997;
    const nick = setType === "email" ? val.split("@")[0] : FAKE_NAMES[h % FAKE_NAMES.length];
    this.state.pid = val;
    this.state.nick = nick;
    this.state.verified = true;

    if (box) {
      $("vIco").textContent = "✓";
      $("vName").textContent = (setType === "email" ? "بريد صحيح: " + nick : "تم التحقق: " + nick);
      $("vSub").textContent = (setType === "email" ? `سيصلك ${g.name} على ${maskId(val, "email")} بعد الدفع` : `الحساب موجود في ${g.name} — جاهز للشحن`);
    }
    if (btn) btn.disabled = false;
  },

  /* طريقة الدفع */
  setPM(pm) {
    this.state.pm = pm;
    $$(".pay-m").forEach(m => m.classList.toggle("selected", m.dataset.pm === pm));
    if ($("cardForm")) $("cardForm").classList.toggle("hidden", pm !== "card");
    if ($("qrForm")) $("qrForm").classList.toggle("hidden", pm !== "qr");
    this.refresh();
  },

  /* الدفع (محاكاة SlickPay) */
  async pay() {
    const { pack, game, pid, nick, pm } = this.state;
    if (!pack || !this.state.verified) { toast("أكمل الخطوات السابقة أولاً"); return; }

    const cardOK = pm === "card"
      ? ($("cardNum").value.replace(/\D/g, "").length >= 12 &&
         /^\d{2}\/\d{2}$/.test($("cardExp").value) &&
         $("cardCvv").value.length === 3)
      : true;

    if (!cardOK) {
      toast("⚠️ أكمل بيانات البطاقة (رقم 12+ خانة، تاريخ MM/YY، CVV)");
      $("cardNum").focus();
      return;
    }

    /* منع النقر المزدوج */
    const btn = $("payBtn");
    btn.disabled = true;

    this.toStep(4);

    /* المراحل الخمس — حسب نوع المنتج */
    const email = this.state.game.verifyType === "email";
    const steps = email ? [
      ["تأكيد الدفع…", "بوابة SlickPay تتحقق من المعاملة (SATIM)"],
      ["تقسيم المبلغ…", `${fmtDZ(calcSplit(pack.price).store)} للمتجر / ${fmtDZ(calcSplit(pack.price).supplier)} للمورد`],
      ["إرسال الشحنة للمورد…", "يُحوَّل ثمن الطلب لمورد البطاقات تلقائياً"],
      ["تجهيز البطاقة/الاشتراك…", `${game.name} — ${pack.name} → سيصل إلى ${maskId(pid, "email")}`],
    ] : [
      ["تأكيد الدفع…", "بوابة SlickPay تتحقق من المعاملة (SATIM)"],
      ["تقسيم المبلغ…", `${fmtDZ(calcSplit(pack.price).store)} للمتجر / ${fmtDZ(calcSplit(pack.price).supplier)} للمورد`],
      ["إرسال الشحنة للمورد…", "يُحوَّل ثمن الشحن لمورد اللعبة تلقائياً"],
      ["تنفيذ الشحن داخل اللعبة…", `${game.name} — ${pack.name} → ID ${maskId(pid, game.verifyType)}`],
    ];
    for (const [t, s] of steps) {
      if ($("procTitle")) $("procTitle").textContent = t;
      if ($("procSub")) $("procSub").textContent = s;
      await new Promise(r => setTimeout(r, 1400));
    }

    /* إنشاء الطلب */
    const order = this.buildOrder();
    LS.save([...LS.get(), order]);
    sessionStorage.setItem("shdz_last", JSON.stringify(order));

    /* النجاح */
    if ($("processingBox")) $("processingBox").classList.add("hidden");
    if ($("successBox")) $("successBox").classList.remove("hidden");
    this.fillReceipt(order);
    btn.disabled = false;
    toast("✅ تم الشحن بنجاح — " + order.id);
  },

  buildOrder() {
    const { pack, game, pid, nick, pm } = this.state;
    const split = calcSplit(pack.price);
    const now = new Date();
    const secs = 37 + Math.floor(Math.random() * 60);
    const email = game.verifyType === "email";
    return {
      id: genOrderId(),
      kind: email ? "card" : "game",
      game: game.id,
      gameName: game.name,
      gameEmoji: game.emoji,
      pack: pack.name,
      packPrice: pack.price,
      pid,
      nick,
      pm,
      pmName: pm === "card" ? "💳 بطاقة CIB/الذهبية · SlickPay" : "📱 QR · تطبيق SlickPay",
      amount: pack.price,
      splitStore: split.store,
      splitSupplier: split.supplier,
      status: "done",
      createdAt: now.toISOString(),
      deliveredSecs: secs,
      deliveryNote: email
        ? `وصل ${pack.name} من ${game.name} — أرسلنا التفاصيل/الرمز إلى ${maskId(pid, "email")} خلال ${secs} ثانية (محاكاة: الفعلي حتى 30 دقيقة).`
        : null,
    };
  },

  fillReceipt(o) {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set("rOrderId", o.id);
    set("rGame", `${o.gameEmoji} ${o.gameName}`);
    set("rPack", o.pack);
    set("rPid", o.pid);
    set("rNick", o.nick);
    if ($("rPidK")) $("rPidK").textContent = o.kind === "card" ? "البريد الإلكتروني" : "معرّف اللاعب";
    set("rMethod", o.pmName);
    set("rAmount", fmtDZ(o.amount));
    set("rSplit", `✂️ ${fmtDZ(o.splitStore)} للمتجر | ${fmtDZ(o.splitSupplier)} للمورد`);
    if ($("successSub")) {
      $("successSub").textContent =
        (o.deliveryNote || `وصل ${o.pack} من ${o.gameName} إلى حساب ${o.nick} (${maskId(o.pid, "playerid")}) خلال ${o.deliveredSecs} ثانية.`);
    }
    const tb = $("trackBtn");
    if (tb) tb.href = `track.html?id=${encodeURIComponent(o.id)}`;
  },

  wire() {
    on("click", "toStep2", () => { if (this.state.pack) this.toStep(2); });
    on("click", "back1", () => this.toStep(1));
    on("click", "back2", () => this.toStep(2));
    on("click", "toStep3", () => { if (this.state.verified) this.toStep(3); });
    on("click", "payBtn", () => this.pay());
    on("click", "printReceipt", () => {
      const o = JSON.parse(sessionStorage.getItem("shdz_last") || "null");
      if (o) downloadReceipt(o);
    });
    on("input", "playerId", () => {
      this.state.verified = false;
      const b = $("toStep3"); if (b) b.disabled = true;
    });
    on("change", "playerId", () => this.verifyPlayer());
    on("keyup", "playerId", (e) => { if (e.key === "Enter") this.verifyPlayer(); });
    $$(".pay-m").forEach(m => m.addEventListener("click", () => this.setPM(m.dataset.pm)));
    /* تهيئة الافتراضي */
    this.setPM("card");
  },
};

/* مساعد ربط الأحداث */
function on(evt, id, fn) {
  const el = $(id);
  if (el) el.addEventListener(evt, fn);
}

/* ---------- إيصال قابل للتحميل ---------- */
function downloadReceipt(o) {
  const rows = [
    ["رقم الطلب", o.id],
    ["اللعبة", o.gameName],
    ["الباقة", o.pack],
    [o.kind === "card" ? "البريد الإلكتروني" : "اللاعب (ID)", o.pid],
    [o.kind === "card" ? "اسم البريد" : "الاسم المُتحقَّق", o.nick],
    ["طريقة الدفع", o.pmName],
    ["المبلغ", fmtDZ(o.amount)],
    ["التقسيم التلقائي", `${fmtDZ(o.splitStore)} متجر | ${fmtDZ(o.splitSupplier)} مورد`],
    ["الحالة", "✓ مُسلَّم"],
    ["التاريخ", new Date(o.createdAt).toLocaleString("ar-DZ")],
  ];
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>إيصال ${o.id} — شحنك DZ</title>
<style>
  body { font-family: 'Cairo', system-ui, sans-serif; background:#f6f7fb; margin:0; padding:2rem; }
  .box { max-width:420px; margin:auto; background:#fff; border:1.5px solid #e5e7eb; border-radius:16px; overflow:hidden; }
  .head { background:linear-gradient(135deg,#4f46e5,#06b6d4); color:#fff; padding:1.2rem 1.4rem; display:flex; justify-content:space-between; align-items:center; }
  .head b { font-size:1rem; }
  .row { display:flex; justify-content:space-between; padding:.6rem 1.4rem; border-bottom:1px dashed #e5e7eb; font-size:.9rem; }
  .row:last-child { border:none; }
  .k { color:#6b7280; font-weight:600; }
  .v { font-weight:800; }
  .ok { color:#059669; }
  .foot { text-align:center; padding:1rem; font-size:.75rem; color:#9ca3af; }
</style></head><body>
<div class="box">
  <div class="head"><b>شحنك DZ — إيصال شحن</b><span>${o.id}</span></div>
  ${rows.map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")}
  <div class="foot">شحنك DZ · دفع آمن عبر SlickPay · تتبع طلبك من الموقع</div>
</div>
<script>window.onload=()=>{setTimeout(()=>print(),400)}<\/script></body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `receipt-${o.id}.html`;
  a.click();
  toast("🧾 تم تحميل الإيصال — افتحه واطبعه أو شاركه");
}

/* ============================================================
   صفحة التتبع (track.html)
   ============================================================ */
const Track = {
  init() {
    const form = $("trackForm");
    if (form) form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.track($("trackInput").value.trim().toUpperCase());
    });

    /* تتبع تلقائي من الرابط ?id= */
    const qid = new URLSearchParams(location.search).get("id");
    if (qid) {
      $("trackInput").value = qid;
      this.track(qid);
    }
  },

  track(id) {
    if (!id) { toast("أدخل رقم الطلب أولاً"); return; }
    const all = LS.get();
    const o = all.find(x => x.id.toUpperCase() === id.toUpperCase());
    const nf = $("notFoundBox"), ob = $("orderBox");
    if (!o) {
      if (ob) ob.hidden = true;
      if (nf) nf.hidden = false;
      return;
    }
    if (nf) nf.hidden = true;
    if (ob) ob.hidden = false;

    const set = (i, v) => { const el = $(i); if (el) el.textContent = v; };
    set("tOrderId", o.id);
    set("tGame", `${o.gameEmoji} ${o.gameName}`);
    set("tPack", o.pack);
    set("tPid", o.pid);
    if ($("tPidK")) $("tPidK").textContent = o.kind === "card" ? "البريد الإلكتروني" : "اللاعب";
    set("tNick", o.nick);
    if ($("tNickK")) $("tNickK").textContent = o.kind === "card" ? "اسم البريد" : "الاسم المُتحقَّق";
    set("tAmount", fmtDZ(o.amount));
    set("tMethod", o.pmName);
    set("tStatus", "✓ مُسلَّم");
    set("tTime", `00:00:${String(o.deliveredSecs).padStart(2, "0")}`);

    /* الخط الزمني — 5 مراحل */
    const t0 = new Date(o.createdAt);
    const tm = (offSec) => {
      const d = new Date(t0.getTime() + offSec * 1000);
      return d.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };
    const steps = [
      ["💳", "استلام الدفع", `بوابة SlickPay — ${fmtDZ(o.amount)} عبر ${o.pmName.includes("QR") ? "QR" : "بطاقة"}`, tm(0)],
      ["✂️", "التقسيم التلقائي للأموال", `${fmtDZ(o.splitStore)} للمتجر | ${fmtDZ(o.splitSupplier)} للمورد`, tm(3)],
      ["📤", "تحويل ثمن الشحن للمورد", "عبر SlickPay — تم تمويل طلب الشحن", tm(5)],
      ["🎮", o.kind === "card" ? "تجهيز البطاقة/الاشتراك" : "تنفيذ الشحن في اللعبة", o.kind === "card" ? `${o.gameName} — ${o.pack} بريد ${maskId(o.pid, "email")}` : `${o.gameName} — ${o.pack} إلى ${o.nick}`, tm(20)],
      ["✅", o.kind === "card" ? "الإرسال إلى البريد" : "التسليم للاعب", o.kind === "card" ? `أُرسل الرمز/التفاصيل إلى ${maskId(o.pid, "email")} — خلال ${o.deliveredSecs} ثانية` : `وصل الكريدي إلى ID ${maskId(o.pid, "playerid")} — خلال ${o.deliveredSecs} ثانية`, tm(o.deliveredSecs)],
    ];
    const list = $("tlList");
    if (list) {
      list.innerHTML = steps.map(([ico, title, sub, time]) => `
        <li class="tl-item done">
          <span class="tl-dot">${ico}</span>
          <div class="tl-info">
            <div class="tl-title">${esc(title)}</div>
            <div class="tl-sub">${esc(sub)}</div>
            <div class="tl-time">${esc(time)}</div>
          </div>
        </li>`).join("");
    }
  },
};

/* ============================================================
   عناصر عامة لكل الصفحات (فوتر + واتساب + PWA)
   ============================================================ */
function initCommon() {
  /* روابط التواصل من الإعدادات */
  const wa = $("waLink");
  if (wa) {
    wa.href = `https://wa.me/${SHDZ.contact.whatsapp}?text=${encodeURIComponent("سلام! أحتاج مساعدة بخصوص طلب من شحنك DZ")}`;
  }
  const ph = $("phoneLink");
  if (ph) {
    ph.href = `tel:+${SHDZ.contact.phone.replace(/\D/g, "").replace(/^0/, "213")}`;
    const pt = $("phoneTxt");
    if (pt) pt.textContent = SHDZ.contact.phone;
  }
  const ht = $("hoursTxt");
  if (ht) ht.textContent = SHDZ.contact.hours;

  /* PWA */
  registerSW();
}

/* ---------- PWA ---------- */
let deferredPrompt = null;
function registerSW() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const tip = $("installTip");
    if (tip) tip.classList.add("show");
  });
  const btn = $("installBtn");
  if (btn) btn.addEventListener("click", async () => {
    if (!deferredPrompt) {
      toast("📱 للتنصيب: قائمة المتصفح ← إضافة إلى الشاشة الرئيسية");
      return;
    }
    deferredPrompt.prompt();
    const c = await deferredPrompt.userChoice;
    if (c && c.outcome === "accepted") toast("✅ تم تثبيت التطبيق");
    deferredPrompt = null;
    const tip = $("installTip");
    if (tip) tip.classList.remove("show");
  });
}

/* ============================================================
   التشغيل
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initCommon();
  const page = (document.body.dataset.page || "").toLowerCase();
  const path = location.pathname.split("/").pop() || "index.html";

  if (path === "index.html" || path === "") initHome();
  if (path === "buy.html") Buy.init();
  if (path === "track.html") Track.init();
  setupInstallPrompt();
});
