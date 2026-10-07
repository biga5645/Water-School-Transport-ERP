/* ═══════════════════════════════════════════════════════
   Association ERP – app.js  (v2 – refonte complète)
   ═══════════════════════════════════════════════════════ */

const state = { data: null, activeView: "dashboard", session: null };

/* ══ Auth helpers ══ */
function getSession()  { try { return JSON.parse(localStorage.getItem("session")||"null"); } catch { return null; } }
function saveSession(s){ localStorage.setItem("session", JSON.stringify(s)); }
function clearSession(){ localStorage.removeItem("session"); }

function showApp() {
  byId("login-screen").classList.add("hidden");
  byId("main-sidebar").style.display = "";
  byId("main-shell").style.display = "";
}
function showLogin() {
  byId("main-sidebar").style.display = "none";
  byId("main-shell").style.display = "none";
  byId("login-screen").classList.remove("hidden");
}
function renderSidebarUser() {
  const s = state.session;
  if (!s) return;
  byId("sidebar-user").innerHTML =
    "<div class=\"su-name\">\uD83D\uDC64 " + esc(s.name) + "</div>" +
    "<div class=\"su-role\">" + esc(s.role) + "</div>";
}

/* ══ RBAC helper ══ */
function can(perm) {
  const s = state.session;
  if (!s) return false;
  // Super Admin a tout
  if (s.role === "Super Admin") return true;
  // permissions résolues envoyées depuis le login
  const perms = s.permissions || [];
  return perms.includes(perm);
}
// Génère un bouton action visible seulement si la permission est accordée
function actionBtn(label, perm, attrs = "") {
  if (!can(perm)) return "";
  return `<button class="action-button" ${attrs}>${label}</button>`;
}
// Génère un bouton de suppression visible seulement si la permission est accordée
function delBtn(perm, res, id) {
  if (!can(perm)) return "";
  return `<button class="del-btn" data-res="${res}" data-id="${id}">🗑️</button>`;
}


const navSections = [
  { label: "💧 الماء والتحصيل", items: [
    ["dashboard",   "🏠 لوحة التحكم"],
    ["association", "🏛️ إدارة الجمعية"],
    ["customers",   "👥 المشتركون والقطاعات"],
    ["meters",      "📟 العدادات"],
    ["readings",    "📊 قراءات العدادات"],
    ["tariffs",     "💲 التعريفة والشرائح"],
    ["invoices",    "🧾 الفوترة والتحصيل"],
    ["debts",       "⚠️ الديون والقطع"],
    ["maintenance", "🔧 الصيانة والأعطاب"]
  ]},
  { label: "🚌 النقل المدرسي", items: [
    ["transport", "🚌 الحافلات والتلاميذ"]
  ]},
  { label: "💰 المالية والموارد", items: [
    ["hr",         "👤 الموارد البشرية"],
    ["accounting", "📒 المحاسبة"],
    ["reports",    "📈 التقارير"]
  ]},
  { label: "⚙️ النظام", items: [
    ["notifications", "🔔 الإشعارات"],
    ["architecture",  "🛠️ التحليل التقني"],
    ["settings",      "🔐 الأدوار والصلاحيات"]
  ]}
];
const navItems = navSections.flatMap(s => s.items);

const byId        = id => document.getElementById(id);
const today       = () => new Date().toISOString().slice(0,10);
const formatMoney = v  => `${Number(v||0).toFixed(2)} د.م`;
const ESC_MAP     = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };
/* esc(): échappe toute valeur avant injection dans du HTML (protection XSS) */
const esc         = v  => (v==null ? "" : String(v)).replace(/[&<>"']/g, c => ESC_MAP[c]);
/* unesc(): inverse d'esc() — à utiliser pour pré-remplir un champ de formulaire */
const unesc       = v  => (v==null ? "" : String(v))
  .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
  .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");
/* deepEscape(): échappe récursivement toutes les chaînes reçues du serveur.
   Barrière unique: tout ce qui est injecté via innerHTML est déjà neutralisé. */
function deepEscape(x) {
  if (typeof x === "string") return esc(x);
  if (Array.isArray(x))      return x.map(deepEscape);
  if (x && typeof x === "object") {
    const o = {};
    for (const k of Object.keys(x)) o[k] = deepEscape(x[k]);
    return o;
  }
  return x;
}
const safe        = v  => (v==null||v==="") ? "-" : v;

async function api(path, opts={}) {
  const token = state.session?.token || "";
  const headers = { "Content-Type":"application/json", ...(opts.headers||{}) };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res  = await fetch(path, { headers, ...opts });
  const data = await res.json().catch(()=>({}));
  if (res.status === 401) { clearSession(); state.session = null; showLogin(); throw new Error(data.message||"انتهت الجلسة، الرجاء إعادة الدخول"); }
  if (!res.ok) throw new Error(data.message||"تعذر تنفيذ العملية");
  return data;
}

function toast(msg, type="") {
  const el = byId("toast");
  el.textContent = msg;
  el.className   = "toast show"+(type?" "+type:"");
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.className="toast"; }, 3400);
}

let _spinner=null;
function showLoading() {
  if (_spinner) return;
  _spinner = document.createElement("div");
  _spinner.className = "loading-overlay";
  _spinner.innerHTML = '<div class="spinner"></div>';
  document.body.appendChild(_spinner);
}
function hideLoading() { if (_spinner){_spinner.remove();_spinner=null;} }

function filterTable(viewId) {
  return e => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(`#${viewId} tbody tr`).forEach(tr=>{
      tr.style.display = tr.textContent.toLowerCase().includes(q)?"":"none";
    });
  };
}

/* Délégation d'événement UNIQUE: évite d'empiler un listener par rendu
   (l'ancienne version rebranchait tous les .del-btn à chaque render → DELETE multiples). */
let _delWired = false;
function attachDeleteHandlers() {
  if (_delWired) return;
  _delWired = true;
  document.addEventListener("click", async e => {
    const btn = e.target.closest(".del-btn");
    if (!btn || !btn.dataset.res || !btn.dataset.id) return;   // .btn-del-tariff a son propre handler
    if (btn._busy) return;
    const row   = btn.closest("tr");
    const label = row ? (row.cells[0]?.textContent || btn.dataset.id) : btn.dataset.id;
    if (!confirm(`هل تريد حذف: ${label}؟`)) return;
    btn._busy = true; btn.disabled = true;
    try {
      await api(`/api/v1/${btn.dataset.res}/${btn.dataset.id}`, { method:"DELETE" });
      toast("تم الحذف بنجاح","success");
      await load();
    } catch(err) {
      toast(err.message,"error");
      btn._busy = false; btn.disabled = false;
    }
  });
}

function csvDownload(filename, headers, rows, title = "") {
  const sep = ";";
  // Anti CSV-injection: une cellule commençant par = + - @ TAB CR est préfixée d'une apostrophe.
  const q = v => {
    let t = unesc(v == null ? "" : String(v));
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const esc = q;
  const bom = "\uFEFF";
  const lines = [];
  if (title) {
    const assocName = state.data?.association?.name || "";
    lines.push(esc(title));
    if (assocName) lines.push(esc(assocName));
    lines.push(esc("التاريخ: " + new Date().toLocaleDateString("ar-MA")));
    lines.push("");
  }
  lines.push(headers.map(esc).join(sep));
  rows.forEach(r => lines.push(r.map(esc).join(sep)));
  const txt = lines.join("\r\n");
  const blob = new Blob([bom + txt], { type: "text/csv;charset=utf-8;" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

/* ── Context-aware Print ── */
function printCurrentView() {
  const view = state.activeView;
  const assoc = state.data?.association || {};
  const viewTitle = navItems.find(i => i[0] === view)?.[1] || "";
  const dateNow = new Date().toLocaleDateString("ar-MA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  if (view === "reports") { window.print(); return; }

  const viewEl = byId("view-" + view);
  if (!viewEl) return;

  const tableWraps = viewEl.querySelectorAll(".table-wrap");
  if (!tableWraps.length) { toast("لا توجد بيانات للطباعة", "warn"); return; }

  let contentHtml = "";
  tableWraps.forEach(tw => {
    let heading = "";
    let el = tw.parentElement;
    for (let i = 0; i < 4 && el && !heading; i++) {
      const h = el.querySelector(":scope > h2, :scope > h3, :scope > .panel-header h2, :scope > .panel-header h3");
      if (h) heading = h.textContent.trim();
      el = el.parentElement;
    }
    if (heading) {
      contentHtml += `<h3 style="margin:14px 0 6px;font-size:14px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;color:#374151">${heading}</h3>`;
    }
    const clone = tw.cloneNode(true);
    clone.querySelectorAll("button").forEach(b => b.remove());
    contentHtml += clone.outerHTML;
  });

  printModal(`<div class="print-invoice">
    <div class="print-header">
      <div>
        <div class="print-logo">💧 ${assoc.name || "الجمعية"}</div>
        <div style="font-size:12px;color:#666">${assoc.address || ""}</div>
        <div style="font-size:12px;color:#666">${assoc.phone || ""}</div>
      </div>
      <div style="text-align:left">
        <div style="font-size:14px;font-weight:700;color:#0077b6">${viewTitle}</div>
        <div style="font-size:11px;color:#888">${dateNow}</div>
        ${assoc.registrationNumber ? `<div style="font-size:11px;color:#888">رقم التسجيل: ${assoc.registrationNumber}</div>` : ""}
      </div>
    </div>
    <div class="print-title">${viewTitle}</div>
    ${contentHtml}
    <div class="footer">جمعية ${assoc.name || ""} — ${assoc.phone || ""} — ${assoc.email || ""}</div>
  </div>`);
}

/* ── Global CSV Export per active view ── */
function exportCurrentViewCsv() {
  if (!state.data) { toast("لا توجد بيانات", "warn"); return; }
  const view = state.activeView;
  const viewTitle = navItems.find(i => i[0] === view)?.[1] || view;
  const d = state.data;

  switch (view) {
    case "dashboard": {
      csvDownload(`dashboard_${today()}.csv`,
        ["البيان", "القيمة"],
        [
          ["المشتركون النشطون", d.dashboard?.activeCustomers || 0],
          ["الفواتير غير المؤداة", (d.invoices || []).filter(i => i.status !== "paid").length],
          ["الفواتير المؤداة", (d.invoices || []).filter(i => i.status === "paid").length],
          ["الديون النشطة", (d.debts || []).length],
          ["إجمالي المداخيل (د.م)", (d.revenues || []).reduce((s, r) => s + (r.amount || 0), 0).toFixed(2)],
          ["إجمالي المصاريف (د.م)", (d.expenses || []).reduce((s, e) => s + (e.amount || 0), 0).toFixed(2)],
          ["العدادات النشطة", (d.meters || []).filter(m => m.status === "active").length],
          ["إجمالي التلاميذ", (d.students || []).length],
        ], viewTitle);
      break;
    }
    case "association": {
      const members = d.officeMembers || [];
      const branches = d.branches || [];
      const docs = d.legalDocuments || [];
      csvDownload(`association_${today()}.csv`,
        ["النوع", "الاسم", "المنصب / المسؤول", "الهاتف", "البريد الإلكتروني", "العنوان / الملاحظة"],
        [
          ...members.map(m => ["عضو مكتب", m.name, m.position, m.phone || "-", m.email || "-", "-"]),
          ...branches.map(b => ["فرع", b.name, b.manager || "-", b.phone || "-", "-", b.address || "-"]),
          ...docs.map(doc => ["وثيقة", doc.title, doc.number || "-", "-", "-", doc.expiresAt ? "انتهاء: " + doc.expiresAt : "-"])
        ], viewTitle);
      break;
    }
    case "customers": {
      const sectors = d.sectors || [];
      csvDownload(`customers_${today()}.csv`,
        ["رقم الاشتراك", "الاسم الكامل", "الهاتف", "رقم البطاقة الوطنية", "القطاع", "نوع المشترك", "الحالة", "تاريخ الاشتراك"],
        (d.customers || []).map(c => {
          const sec = sectors.find(s => s.id === c.sectorId);
          return [c.subscriptionNumber || c.customerNumber || c.id, c.fullName, c.phone || "-", c.nationalId || "-", sec?.name || "-", c.customerType || "-", c.status, c.subscriptionDate || "-"];
        }), viewTitle);
      break;
    }
    case "meters": {
      const custs = d.customers || [];
      csvDownload(`meters_${today()}.csv`,
        ["رقم العداد", "QR", "المشترك", "النوع", "القطر", "الماركة", "تاريخ التركيب", "آخر قراءة", "الحالة"],
        (d.meters || []).map(m => {
          const c = custs.find(x => x.id === m.customerId);
          return [m.meterNumber, m.qrCode || "-", m.customerName || c?.fullName || "-", m.type, m.diameter, m.brand || "-", m.installationDate || "-", m.lastReading ?? 0, m.status];
        }), viewTitle);
      break;
    }
    case "readings": {
      const metersR = d.meters || [];
      const custsR = d.customers || [];
      csvDownload(`readings_${today()}.csv`,
        ["رقم العداد", "الزبون", "الفترة", "القراءة السابقة", "القراءة الحالية", "الاستهلاك (م³)", "تاريخ القراءة", "القارئ"],
        (d.meterReadings || []).map(r => {
          const m = metersR.find(x => x.id === r.meterId);
          const c = custsR.find(x => x.id === r.customerId);
          return [m?.meterNumber || "-", c?.fullName || "-", r.periodLabel || "-", r.previousReading, r.currentReading, r.consumption, r.readingDate, r.readerName || "-"];
        }), viewTitle);
      break;
    }
    case "tariffs": {
      const rows = [];
      (d.tariffs || []).forEach(t => {
        (t.tiers || []).forEach((tier, i) => {
          rows.push([t.name, t.active ? "نشطة" : "غير نشطة", i + 1, tier.min, tier.max ?? "غير محدود", tier.price, t.monthlyFee, t.maintenanceFee, (Number(t.taxRate || 0) * 100).toFixed(1) + "%"]);
        });
      });
      csvDownload(`tariffs_${today()}.csv`,
        ["التعريفة", "الحالة", "رقم الشريحة", "من (م³)", "إلى (م³)", "السعر (د.م/م³)", "الاشتراك الشهري (د.م)", "رسم الصيانة (د.م)", "نسبة الضريبة"],
        rows, viewTitle);
      break;
    }
    case "invoices": {
      const custsI = d.customers || [];
      const metersI = d.meters || [];
      const paymentsI = d.payments || [];
      const periodsI = d.readingPeriods || [];
      csvDownload(`invoices_${today()}.csv`,
        ["رقم الفاتورة", "النوع", "الزبون", "رقم العداد", "الفترة", "الاستهلاك (م³)", "المبلغ الإجمالي (د.م)", "المبلغ المؤدى (د.م)", "المتبقي (د.م)", "الحالة", "تاريخ الفاتورة", "تاريخ الاستحقاق"],
        (d.invoices || []).map(inv => {
          const c = custsI.find(x => x.id === inv.customerId);
          const m = metersI.find(x => x.id === inv.meterId);
          const p = periodsI.find(x => x.id === inv.periodId);
          const paid = paymentsI.filter(x => x.invoiceId === inv.id).reduce((s, x) => s + (x.amount || 0), 0);
          return [inv.invoiceNumber, inv.type || "water", c?.fullName || "-", m?.meterNumber || "-", p?.label || "-", inv.consumption || 0, (inv.totalAmount || 0).toFixed(2), paid.toFixed(2), Math.max(0, (inv.totalAmount || 0) - paid).toFixed(2), inv.status, inv.invoiceDate || "-", inv.dueDate || "-"];
        }), viewTitle);
      break;
    }
    case "debts": {
      csvDownload(`debts_${today()}.csv`,
        ["الزبون", "الهاتف", "المبلغ (د.م)", "تاريخ الاستحقاق", "الحالة"],
        (d.debts || []).map(x => [x.customerName || "-", x.phone || "-", (x.amount || 0).toFixed(2), x.dueDate || "-", x.status]),
        viewTitle);
      break;
    }
    case "maintenance": {
      csvDownload(`repairs_${today()}.csv`,
        ["النوع", "الموقع", "الوصف", "الأولوية", "الحالة", "تاريخ التسجيل", "المكلف بالإصلاح"],
        (d.repairs || []).map(r => [r.type, r.location || "-", r.description || "-", r.priority, r.status, (r.reportedAt || "").slice(0, 10) || "-", r.assignedTo || "-"]),
        viewTitle);
      break;
    }
    case "transport": {
      csvDownload(`students_${today()}.csv`,
        ["رقم التسجيل", "الاسم الكامل", "المؤسسة التعليمية", "المستوى الدراسي", "ولي الأمر", "هاتف ولي الأمر", "الحالة"],
        (d.students || []).map(s => [s.registrationNumber, s.fullName, s.schoolName, s.gradeLevel || "-", s.guardianName || "-", s.guardianPhone || "-", s.status]),
        viewTitle);
      break;
    }
    case "hr": {
      csvDownload(`employees_${today()}.csv`,
        ["الاسم الكامل", "المنصب الوظيفي", "الهاتف", "الراتب (د.م)", "الحالة"],
        (d.employees || []).map(e => [e.fullName, e.jobTitle, e.phone || "-", (e.salary || 0).toFixed(2), e.status]),
        viewTitle);
      break;
    }
    case "accounting": {
      const revs = d.revenues || [];
      const exps = d.expenses || [];
      csvDownload(`accounting_${today()}.csv`,
        ["النوع", "الفئة / المصدر", "المبلغ (د.م)", "التاريخ", "الوصف"],
        [
          ...revs.map(r => ["مداخل", r.source, (r.amount || 0).toFixed(2), r.revenueDate || "-", r.description || "-"]),
          ...exps.map(e => ["مصروف", e.category, (e.amount || 0).toFixed(2), e.expenseDate || "-", e.description || "-"])
        ], viewTitle);
      break;
    }
    case "reports":
      toast("استخدم أزرار CSV الموجودة في صفحة التقارير", "warn");
      break;
    default:
      toast("لا يتوفر تصدير CSV لهذه الصفحة", "warn");
  }
}

const STATUS_CLS = {
  active:"success",paid:"success",reconnected:"success",present:"success",closed:"success",resolved:"success",
  unpaid:"warn",partial:"warn",open:"warn",in_progress:"warn",pending:"warn",late:"warn",maintenance:"warn",
  overdue:"danger",disconnected:"danger",escalated:"danger",absent:"danger",failed:"danger",suspended:"danger",
  inactive:"",sent:"success"
};
const STATUS_LBL = {
  active:"فعال",inactive:"غير فعال",paid:"مؤدى",unpaid:"غير مؤدى",partial:"جزئي",
  overdue:"متأخر",disconnected:"مفصول",reconnected:"معاد الربط",
  open:"مفتوح",escalated:"تصعيد",in_progress:"قيد الإصلاح",closed:"مغلق",resolved:"تم الإصلاح",
  pending:"قيد الإرسال",sent:"مرسل",failed:"فشل",
  present:"حاضر",absent:"غائب",late:"متأخر",suspended:"موقوف"
};
const badge = s => `<span class="badge ${STATUS_CLS[s]||""}">${STATUS_LBL[s]||s||"-"}</span>`;

function tbl(headers, rows, empty="لا توجد بيانات") {
  const th   = headers.map(h=>`<th>${h}</th>`).join("");
  const tbody= rows.length ? rows.join("")
    : `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--muted)">${empty}</td></tr>`;
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

/* ── Navigation ── */
// Mapping nav item → permission requise
const NAV_PERMS = {
  dashboard:    "dashboard.view",
  association:  "association.view",
  customers:    "customers.view",
  meters:       "meters.read",
  readings:     "readings.view",
  tariffs:      "settings.view",
  invoices:     "invoices.view",
  debts:        "debts.view",
  maintenance:  "repairs.view",
  transport:    "transport.view",
  hr:           "hr.view",
  accounting:   "accounting.view",
  reports:      "reports.view",
  notifications:"notifications.send",
  architecture: "dashboard.view",
  settings:     "settings.view"
};
function renderNav() {
  byId("nav").innerHTML = navSections.map(sec => {
    const visibleItems = sec.items.filter(([key]) => {
      const perm = NAV_PERMS[key];
      return !perm || can(perm);
    });
    if (!visibleItems.length) return "";
    return `<div class="nav-group-label">${sec.label}</div>` +
      visibleItems.map(([key,lbl]) =>
        `<button class="nav-button${state.activeView===key?" active":""}" data-view="${key}">${lbl}</button>`
      ).join("");
  }).join("");
  document.querySelectorAll(".nav-button").forEach(b =>
    b.addEventListener("click",()=>switchView(b.dataset.view))
  );
}
function switchView(view) {
  state.activeView = view;
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  byId(`view-${view}`).classList.add("active");
  byId("page-title").textContent = navItems.find(i=>i[0]===view)?.[1]||"";
  renderNav(); render();
}

/* ═════════════════════════ VUES ════════════════════════ */

function renderDashboard() {
  const role = state.session?.role || '';
  const d        = state.data.dashboard;
  const invoices = state.data.invoices  ||[];
  const debts    = state.data.debts     ||[];
  const repairs  = state.data.repairs   ||[];
  const revenues = state.data.revenues  ||[];
  const meters   = state.data.meters    ||[];
  const readings = state.data.meterReadings||[];
  const expenses = state.data.expenses  ||[];
  const students = state.data.students  ||[];
  const periods  = state.data.readingPeriods||[];
  const activePeriod = periods.find(p=>p.status==='open');
  const totalRev = revenues.reduce((s,r)=>s+(r.amount||0),0);
  const totalExp = expenses.reduce((s,e)=>s+(e.amount||0),0);
  const unpaid   = invoices.filter(i=>i.status!=='paid').length;
  const paid     = invoices.filter(i=>i.status==='paid').length;
  const netBalance = totalRev - totalExp;

  // — رأس مشترك: اسم + دور + رسالة ترحيب —
  const ROLE_WELCOME = {
    'Super Admin':       { icon:'🛡️', msg:'مرحباً بك في لوحة التحكم الكاملة', color:'#2563eb' },
    'President':         { icon:'🏛️', msg:'مرحباً أيها الرئيس — عرض شامل للجمعية', color:'#7c3aed' },
    'Treasurer':         { icon:'💼', msg:'مرحباً أمين المال — إدارة التحصيل والمحاسبة', color:'#059669' },
    'Secretary':         { icon:'📋', msg:'مرحباً أمين السر — إدارة المشتركين والوثائق', color:'#0891b2' },
    'Billing Agent':     { icon:'🧾', msg:'مرحباً وكيل الفوترة — الفواتير والتحصيل', color:'#d97706' },
    'Meter Reader':      { icon:'📟', msg:'مرحباً قارئ العدادات — إدخال القراءات اليومية', color:'#16a34a' },
    'Transport Manager': { icon:'🚌', msg:'مرحباً مسؤول النقل — إدارة الحافلات والتلاميذ', color:'#dc2626' },
    'Accountant':        { icon:'📒', msg:'مرحباً المحاسب — المصاريف والمداخيل والتقارير', color:'#7c3aed' },
    'Maintenance Agent': { icon:'🔧', msg:'مرحباً عون الصيانة — تتبع الأعطاب والإصلاح', color:'#b45309' },
    'Auditor':           { icon:'🔍', msg:'مرحباً المراجع — مراجعة الحسابات والتدقيق', color:'#64748b' },
    'Driver':            { icon:'🚗', msg:'مرحباً — عرض مسارات النقل', color:'#0369a1' }
  };
  const wl = ROLE_WELCOME[role] || { icon:'👤', msg:`مرحباً ${esc(state.session?.name||'')}`, color:'#2563eb' };

  // — بانر ترحيب مخصص —
  const welcomeBanner = `
    <div class="role-welcome-banner" style="border-right:5px solid ${wl.color}">
      <div class="rwb-icon">${wl.icon}</div>
      <div class="rwb-text">
        <div class="rwb-name">${esc(state.session?.name||'')}</div>
        <div class="rwb-role" style="color:${wl.color}">${esc(role)}</div>
        <div class="rwb-msg">${wl.msg}</div>
      </div>
      <div class="rwb-date">📅 ${new Date().toLocaleDateString('ar-MA',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
    </div>`;

  // — KPIs حسب الدور —
  function kpi(val, label, cls='', icon='') {
    return `<div class="kpi-card ${cls}"><div class="kpi-value">${icon}${val}</div><div class="kpi-label">${label}</div></div>`;
  }

  let kpiHtml = '';
  if (role === 'Super Admin' || role === 'President') {
    kpiHtml = `<div class="kpi-band" style="grid-template-columns:repeat(6,1fr)">
      ${kpi(d.activeCustomers,'👥 مشتركون نشطون','success')}
      ${kpi(meters.length,'📟 عدادات','info')}
      ${kpi(unpaid,'🧾 فواتير غير مؤداة','warn')}
      ${kpi(debts.length,'⚠️ ديون نشطة','danger')}
      ${kpi(totalRev.toFixed(0),'💰 مداخيل (د.م)','success')}
      ${kpi(d.students||students.length,'🚌 تلاميذ النقل','info')}
    </div>`;
  } else if (role === 'Treasurer') {
    const collectedToday = invoices.filter(i=>i.status==='paid'&&i.paidDate===today()).length;
    const overdueDebts = debts.filter(d=>d.status==='overdue').length;
    kpiHtml = `<div class="kpi-band" style="grid-template-columns:repeat(5,1fr)">
      ${kpi(paid,'✅ فواتير مؤداة','success')}
      ${kpi(unpaid,'🧾 غير مؤداة','warn')}
      ${kpi(overdueDebts,'⚠️ ديون متأخرة','danger')}
      ${kpi(formatMoney(totalRev),'💰 إجمالي المداخيل','success')}
      ${kpi(formatMoney(netBalance),'📊 الرصيد الصافي',netBalance>=0?'success':'danger')}
    </div>`;
  } else if (role === 'Meter Reader') {
    const metersRead = activePeriod
      ? readings.filter(r=>r.periodId===activePeriod.id).length : 0;
    const totalMeters = meters.filter(m=>m.status==='active').length;
    const remaining = totalMeters - metersRead;
    const pct = totalMeters>0 ? Math.round(metersRead/totalMeters*100) : 0;
    kpiHtml = `<div class="kpi-band" style="grid-template-columns:repeat(4,1fr)">
      ${kpi(metersRead,'✅ عدادات مُدخَلة','success')}
      ${kpi(remaining,'⏳ متبقية','warn')}
      ${kpi(totalMeters,'📟 إجمالي العدادات','info')}
      ${kpi(pct+'%','📊 نسبة الإنجاز',pct>=80?'success':pct>=50?'warn':'danger')}
    </div>
    ${activePeriod ? `<div class="period-banner">
      <span class="period-label">📅 الفترة الحالية: <strong>${activePeriod.label}</strong></span>
      <span class="period-dates">${activePeriod.startDate} ← ${activePeriod.endDate}</span>
      <div class="period-progress-bar"><div style="width:${pct}%;background:#16a34a;height:100%;border-radius:4px;transition:.4s"></div></div>
      <span class="period-progress">${metersRead} / ${totalMeters} عداد</span>
    </div>` : `<div class="period-banner period-closed">⛔ لا توجد فترة مفتوحة حالياً</div>`}`;
  } else if (role === 'Accountant') {
    const thisMonth = new Date().toISOString().slice(0,7);
    const monthExp = expenses.filter(e=>e.expenseDate&&e.expenseDate.startsWith(thisMonth)).reduce((s,e)=>s+(e.amount||0),0);
    const monthRev = revenues.filter(r=>r.revenueDate&&r.revenueDate.startsWith(thisMonth)).reduce((s,r)=>s+(r.amount||0),0);
    kpiHtml = `<div class="kpi-band" style="grid-template-columns:repeat(4,1fr)">
      ${kpi(formatMoney(monthRev),'📥 مداخيل الشهر','success')}
      ${kpi(formatMoney(monthExp),'📤 مصاريف الشهر','warn')}
      ${kpi(formatMoney(monthRev-monthExp),'⚖️ الرصيد الشهري',(monthRev-monthExp)>=0?'success':'danger')}
      ${kpi(formatMoney(netBalance),'💼 الرصيد الكلي',netBalance>=0?'success':'danger')}
    </div>`;
  } else if (role === 'Transport Manager') {
    const buses = state.data.buses||[];
    const routes = state.data.routes||[];
    const activeSubs = (state.data.transportSubscriptions||[]).filter(s=>s.status==='active').length;
    kpiHtml = `<div class="kpi-band" style="grid-template-columns:repeat(4,1fr)">
      ${kpi(students.length,'👨‍🎓 إجمالي التلاميذ','info')}
      ${kpi(activeSubs,'✅ اشتراكات نشطة','success')}
      ${kpi(buses.filter(b=>b.status==='active').length,'🚌 حافلات نشطة','info')}
      ${kpi(routes.length,'🗺️ مسارات','info')}
    </div>`;
  } else if (role === 'Billing Agent') {
    kpiHtml = `<div class="kpi-band" style="grid-template-columns:repeat(4,1fr)">
      ${kpi(invoices.filter(i=>i.status==='unpaid').length,'🧾 فواتير غير مؤداة','warn')}
      ${kpi(invoices.filter(i=>i.status==='partial').length,'📝 مؤداة جزئياً','warn')}
      ${kpi(paid,'✅ مؤداة بالكامل','success')}
      ${kpi(debts.length,'⚠️ ديون','danger')}
    </div>`;
  } else if (role === 'Maintenance Agent') {
    const open = repairs.filter(r=>r.status==='open').length;
    const inProg = repairs.filter(r=>r.status==='in_progress').length;
    kpiHtml = `<div class="kpi-band" style="grid-template-columns:repeat(4,1fr)">
      ${kpi(open,'🔴 أعطاب مفتوحة','danger')}
      ${kpi(inProg,'🟡 قيد الإصلاح','warn')}
      ${kpi(repairs.filter(r=>r.status==='closed'||r.status==='resolved').length,'✅ تم الإصلاح','success')}
      ${kpi(meters.filter(m=>m.status==='maintenance').length,'📟 عدادات صيانة','warn')}
    </div>`;
  } else if (role === 'Secretary') {
    const customers = state.data.customers||[];
    const docs = state.data.legalDocuments||[];
    kpiHtml = `<div class="kpi-band" style="grid-template-columns:repeat(4,1fr)">
      ${kpi(customers.filter(c=>c.status==='active').length,'👥 مشتركون نشطون','success')}
      ${kpi(customers.filter(c=>c.status==='disconnected').length,'🚫 مفصولون','danger')}
      ${kpi(docs.length,'📄 وثائق','info')}
      ${kpi(docs.filter(d=>{try{return new Date(d.expiresAt)<new Date();}catch{return false;}}).length,'⚠️ وثائق منتهية','warn')}
    </div>`;
  } else {
    kpiHtml = `<div class="kpi-band" style="grid-template-columns:repeat(3,1fr)">
      ${kpi(d.activeCustomers,'👥 مشتركون','success')}
      ${kpi(repairs.filter(r=>r.status!=='closed').length,'🔧 أعطاب مفتوحة','warn')}
      ${kpi(d.pendingNotifications,'🔔 إشعارات','info')}
    </div>`;
  }

  // — قسم القراءات السريعة لقارئ العداد —
  const quickReadingSection = (role === 'Meter Reader') ? `
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><h3>📟 إدخال قراءة سريع</h3>
        <button class="action-button" onclick="switchView('readings')">→ الانتقال لصفحة القراءات</button>
      </div>
      <p style="color:var(--muted);padding:8px 12px">انتقل إلى صفحة القراءات لإدخال قراءة العدادات ضمن الفترة الحالية.</p>
    </div>` : '';

  // — القسم السفلي حسب الدور —
  let bottomSection = '';
  if (role === 'Meter Reader') {
    const lastReadings = readings.slice(-5).reverse();
    bottomSection = `
      <div class="panel">
        <div class="panel-header"><h3>📋 آخر القراءات المُدخلة</h3></div>
        ${tbl(['العداد','القراءة السابقة','الحالية','الاستهلاك','التاريخ'],
          lastReadings.map(r=>`<tr>
            <td>${meters.find(m=>m.id===r.meterId)?.meterNumber||r.meterId}</td>
            <td>${r.previousReading}</td><td>${r.currentReading}</td>
            <td>${r.consumption}</td><td>${r.readingDate}</td>
          </tr>`),'لا توجد قراءات بعد')}
      </div>`;
  } else if (role === 'Accountant') {
    bottomSection = `
      <div class="split">
        <div class="panel">
          <div class="panel-header"><h3>📤 آخر المصاريف</h3></div>
          ${tbl(['الفئة','المبلغ','التاريخ'],
            expenses.slice(-5).reverse().map(e=>`<tr><td>${safe(e.category)}</td><td>${formatMoney(e.amount)}</td><td>${e.expenseDate}</td></tr>`))}
        </div>
        <div class="panel">
          <div class="panel-header"><h3>📥 آخر المداخيل</h3></div>
          ${tbl(['المصدر','المبلغ','التاريخ'],
            revenues.slice(-5).reverse().map(r=>`<tr><td>${safe(r.source)}</td><td>${formatMoney(r.amount)}</td><td>${r.revenueDate}</td></tr>`))}
        </div>
      </div>`;
  } else if (role === 'Treasurer' || role === 'Billing Agent') {
    bottomSection = `
      <div class="split">
        <div class="panel">
          <div class="panel-header"><h3>🧾 آخر الفواتير غير المؤداة</h3></div>
          ${tbl(['الرقم','المبلغ','الحالة'],
            invoices.filter(i=>i.status!=='paid').slice(-6).reverse().map(inv=>`
              <tr><td>${inv.invoiceNumber}</td><td>${formatMoney(inv.totalAmount)}</td><td>${badge(inv.status)}</td></tr>`))}
        </div>
        <div class="panel">
          <div class="panel-header"><h3>⚠️ الديون النشطة</h3></div>
          ${tbl(['العميل','المبلغ','الحالة'],
            debts.slice(-6).reverse().map(d=>`
              <tr><td>${(state.data.customers||[]).find(c=>c.id===d.customerId)?.fullName||d.customerId}</td>
              <td>${formatMoney(d.amount)}</td><td>${badge(d.status)}</td></tr>`))}
        </div>
      </div>`;
  } else if (role === 'Maintenance Agent') {
    bottomSection = `
      <div class="panel">
        <div class="panel-header"><h3>🔴 الأعطاب المفتوحة</h3></div>
        ${tbl(['النوع','الوصف','الأولوية','الحالة'],
          repairs.filter(r=>r.status!=='closed'&&r.status!=='resolved').map(r=>`
            <tr><td>${safe(r.type)}</td><td>${safe(r.description)}</td>
            <td><span class="badge ${r.priority==='critical'?'danger':r.priority==='high'?'warn':''}">${safe(r.priority)}</span></td>
            <td>${badge(r.status)}</td></tr>`),'لا أعطاب مفتوحة ✅')}
      </div>`;
  } else if (role === 'Transport Manager') {
    bottomSection = `
      <div class="split">
        <div class="panel">
          <div class="panel-header"><h3>👨‍🎓 آخر التلاميذ المسجلين</h3></div>
          ${tbl(['الاسم','المدرسة','الحافلة'],
            students.slice(-6).reverse().map(s=>`
              <tr><td>${s.fullName}</td><td>${safe(s.schoolName)}</td>
              <td>${safe((state.data.routes||[]).find(r=>r.id===s.routeId)?.village)}</td></tr>`))}
        </div>
        <div class="panel">
          <div class="panel-header"><h3>🚌 حالة الحافلات</h3></div>
          ${tbl(['الرقم','السائق','الطاقة','الحالة'],
            (state.data.buses||[]).map(b=>`
              <tr><td>${b.busNumber}</td><td>${safe(b.driver)}</td>
              <td>${safe(b.capacity)}</td><td>${badge(b.status)}</td></tr>`))}
        </div>
      </div>`;
  } else {
    bottomSection = `
      <div class="split">
        <div class="panel">
          <div class="panel-header"><h3>🔴 أعطاب مفتوحة</h3></div>
          ${tbl(['النوع','الموقع','الأولوية','الحالة'],
            repairs.filter(r=>r.status!=='closed'&&r.status!=='resolved').slice(0,6).map(r=>`
              <tr><td>${safe(r.type)}</td><td>${safe(r.location||r.description)}</td>
              <td><span class="badge ${r.priority==='critical'?'danger':r.priority==='high'?'warn':''}">${safe(r.priority)}</span></td>
              <td>${badge(r.status)}</td></tr>`),'لا أعطاب مفتوحة ✅')}
        </div>
        <div class="panel">
          <div class="panel-header"><h3>🧾 آخر الفواتير</h3></div>
          ${tbl(['رقم','المبلغ','الحالة'],
            invoices.slice(-6).reverse().map(inv=>`
              <tr><td>${inv.invoiceNumber}</td><td>${formatMoney(inv.totalAmount)}</td><td>${badge(inv.status)}</td></tr>`))}
        </div>
      </div>`;
  }

  byId('view-dashboard').innerHTML = `
    ${welcomeBanner}
    ${kpiHtml}
    ${quickReadingSection}
    ${bottomSection}`;
}

function renderAssociation() {
  const a=state.data.association||{};
  const members=state.data.officeMembers||[];
  const branches=state.data.branches||[];
  const docs=state.data.legalDocuments||[];

  byId("view-association").innerHTML=`
    <!-- معلومات الجمعية + تعديل -->
    <div class="split" style="margin-bottom:16px">
      <section class="panel">
        <div class="panel-header">
          <h2>🏛️ معلومات الجمعية</h2>
          <button class="action-button" id="btn-edit-assoc">✏️ تعديل</button>
        </div>
        <div class="profile-grid" id="assoc-info">
          <div><span>الاسم</span><strong>${a.name}</strong></div>
          <div><span>رقم التسجيل</span><strong>${a.registrationNumber}</strong></div>
          <div><span>الهاتف</span><strong>${a.phone}</strong></div>
          <div><span>البريد</span><strong>${a.email}</strong></div>
          <div><span>العنوان</span><strong>${a.address}</strong></div>
          <div><span>تاريخ التأسيس</span><strong>${safe(a.foundingDate)}</strong></div>
          <div><span>الحالة</span>${badge(a.status||"active")}</div>
        </div>
        <form id="assoc-edit-form" class="form-grid" style="display:none;margin-top:12px">
          <div class="field"><label>الاسم</label><input name="name" value="${esc(unesc(a.name||""))}"></div>
          <div class="field"><label>رقم التسجيل</label><input name="registrationNumber" value="${esc(unesc(a.registrationNumber||""))}"></div>
          <div class="field"><label>الهاتف</label><input name="phone" value="${esc(unesc(a.phone||""))}"></div>
          <div class="field"><label>البريد</label><input name="email" type="email" value="${esc(unesc(a.email||""))}"></div>
          <div class="field"><label>العنوان</label><input name="address" value="${esc(unesc(a.address||""))}"></div>
          <div class="field"><label>تاريخ التأسيس</label><input name="foundingDate" type="date" value="${a.foundingDate||""}"></div>
          <div style="grid-column:1/-1;display:flex;gap:8px">
            <button type="submit" class="action-button">💾 حفظ التعديلات</button>
            <button type="button" class="danger-button" id="btn-cancel-assoc">إلغاء</button>
          </div>
        </form>
      </section>

      <!-- أعضاء المكتب -->
      <section class="panel">
        <div class="panel-header">
          <h2>👥 أعضاء المكتب</h2>
        </div>
        ${tbl(["الاسم","المهمة","الهاتف","البريد","إجراء"],
          members.map(m=>`<tr>
            <td>${m.name}</td><td>${m.position}</td>
            <td>${safe(m.phone)}</td><td>${safe(m.email)}</td>
            <td><button class="del-btn danger-button" data-res="office-members" data-id="${m.id}" title="حذف">🗑️</button></td>
          </tr>`)
        )}
        <form id="member-form" class="form-grid" style="margin-top:12px">
          <div class="field"><label>الاسم الكامل</label><input name="name" required></div>
          <div class="field"><label>المهمة / المنصب</label>
            <select name="position">
              <option>الرئيس</option><option>أمين المال</option><option>الكاتب</option>
              <option>عضو</option><option>مراقب الحسابات</option><option>مستشار</option>
            </select>
          </div>
          <div class="field"><label>الهاتف</label><input name="phone"></div>
          <div class="field"><label>البريد الإلكتروني</label><input name="email" type="email"></div>
          <button type="submit" class="action-button" style="grid-column:1/-1">➕ إضافة عضو</button>
        </form>
      </section>
    </div>

    <!-- الفروع + الوثائق -->
    <div class="split">
      <section class="panel">
        <div class="panel-header"><h2>🏢 الفروع</h2></div>
        ${tbl(["الفرع","المسؤول","الهاتف","العنوان","إجراء"],
          branches.map(b=>`<tr>
            <td>${b.name}</td><td>${safe(b.manager)}</td>
            <td>${safe(b.phone)}</td><td>${safe(b.address)}</td>
            <td><button class="del-btn danger-button" data-res="branches" data-id="${b.id}">🗑️</button></td>
          </tr>`)
        )}
        <form id="branch-form" class="form-grid" style="margin-top:12px">
          <div class="field"><label>اسم الفرع</label><input name="name" required></div>
          <div class="field"><label>المسؤول</label><input name="manager"></div>
          <div class="field"><label>الهاتف</label><input name="phone"></div>
          <div class="field"><label>العنوان</label><input name="address"></div>
          <button type="submit" class="action-button" style="grid-column:1/-1">➕ إضافة فرع</button>
        </form>
      </section>

      <section class="panel">
        <div class="panel-header"><h2>📄 الوثائق القانونية</h2></div>
        ${tbl(["الوثيقة","الرقم","الانتهاء","الحالة","إجراء"],
          docs.map(d=>`<tr>
            <td>${d.title}</td><td>${safe(d.number)}</td>
            <td>${safe(d.expiresAt)}</td><td>${badge(d.status)}</td>
            <td>
              <button class="action-button btn-renew-doc" data-id="${d.id}" title="تجديد">🔄</button>
              <button class="del-btn danger-button" data-res="legal-documents" data-id="${d.id}">🗑️</button>
            </td>
          </tr>`)
        )}
        <form id="doc-form" class="form-grid" style="margin-top:12px">
          <div class="field"><label>عنوان الوثيقة</label><input name="title" required></div>
          <div class="field"><label>الرقم المرجعي</label><input name="number"></div>
          <div class="field"><label>تاريخ الانتهاء</label><input name="expiresAt" type="date"></div>
          <div class="field"><label>الحالة</label>
            <select name="status">
              <option value="active">فعال</option>
              <option value="expired">منتهي</option>
              <option value="pending">قيد التجديد</option>
            </select>
          </div>
          <button type="submit" class="action-button" style="grid-column:1/-1">➕ إضافة وثيقة</button>
        </form>
      </section>
    </div>`;

  // Toggle تعديل معلومات الجمعية
  byId("btn-edit-assoc").addEventListener("click",()=>{
    byId("assoc-info").style.display="none";
    byId("assoc-edit-form").style.display="grid";
    byId("btn-edit-assoc").style.display="none";
  });
  byId("btn-cancel-assoc").addEventListener("click",()=>{
    byId("assoc-info").style.display="grid";
    byId("assoc-edit-form").style.display="none";
    byId("btn-edit-assoc").style.display="";
  });
  byId("assoc-edit-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    try{
      await api("/api/v1/associations",{method:"PUT",body:JSON.stringify(body)});
      toast("✅ تم حفظ معلومات الجمعية","success"); await load();
    }catch(err){toast(err.message,"error");}
  });

  // إضافة عضو مكتب
  byId("member-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    try{
      await api("/api/v1/office-members",{method:"POST",body:JSON.stringify(body)});
      toast("✅ تمت إضافة العضو","success"); e.target.reset(); await load();
    }catch(err){toast(err.message,"error");}
  });

  // إضافة فرع
  byId("branch-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    try{
      await api("/api/v1/branches",{method:"POST",body:JSON.stringify(body)});
      toast("✅ تمت إضافة الفرع","success"); e.target.reset(); await load();
    }catch(err){toast(err.message,"error");}
  });

  // إضافة وثيقة
  byId("doc-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    try{
      await api("/api/v1/legal-documents",{method:"POST",body:JSON.stringify(body)});
      toast("✅ تمت إضافة الوثيقة","success"); e.target.reset(); await load();
    }catch(err){toast(err.message,"error");}
  });

  // تجديد وثيقة
  document.querySelectorAll(".btn-renew-doc").forEach(btn=>btn.addEventListener("click",async()=>{
    const newDate=prompt("تاريخ التجديد الجديد (YYYY-MM-DD):",new Date(new Date().setFullYear(new Date().getFullYear()+1)).toISOString().slice(0,10));
    if(!newDate) return;
    try{
      await api(`/api/v1/legal-documents/${btn.dataset.id}`,{method:"PUT",body:JSON.stringify({expiresAt:newDate,status:"active"})});
      toast("✅ تم تجديد الوثيقة","success"); await load();
    }catch(err){toast(err.message,"error");}
  }));

  attachDeleteHandlers();
}
function renderCustomers() {
  const customers=state.data.customers||[];
  const sectors  =state.data.sectors||[];
  byId("view-customers").innerHTML=`
    <div class="form-panel" style="margin-bottom:16px">
      <h2>➕ إضافة مشترك جديد</h2>
      <form id="customer-form" class="form-grid">
        <div class="field"><label>الاسم الكامل</label><input name="fullName" required></div>
        <div class="field"><label>الهاتف</label><input name="phone" required></div>
        <div class="field"><label>رقم البطاقة الوطنية</label><input name="nationalId"></div>
        <div class="field"><label>العنوان</label><input name="address"></div>
        <div class="field"><label>القطاع</label>
          <select name="sectorId">${sectors.map(s=>`<option value="${s.id}">${s.name}</option>`).join("")}</select>
        </div>
        <div class="field"><label>نوع المشترك</label>
          <select name="customerType">
            <option value="residential">سكني</option><option value="commercial">تجاري</option><option value="public">عمومي</option>
          </select>
        </div>
        <div class="field"><label>تاريخ الاشتراك</label><input name="subscriptionDate" type="date" value="${today()}"></div>
        <button type="submit" class="action-button" style="grid-column:1/-1;margin-top:6px">➕ إضافة مشترك</button>
      </form>
    </div>
    <div class="section-toolbar">
      <input class="search-input" id="cust-search" placeholder="🔍 بحث في المشتركين..."/>
      <button class="action-button" id="cust-csv">📥 تصدير CSV</button>
      <span class="badge">${customers.length} مشترك</span>
    </div>
    ${(function(){
      const invData = state.data.invoices||[];
      const payData = state.data.payments||[];
      function custInitStatus(cid){
        const initInvs = invData.filter(function(i){return i.customerId===cid&&(i.type==="connection"||i.type==="subscription"||i.type==="onboarding");});
        if(!initInvs.length) return "";
        const allPaid = initInvs.every(function(i){
          const p=payData.filter(function(x){return x.invoiceId===i.id;}).reduce(function(s,x){return s+(x.amount||0);},0);
          return p>=(i.totalAmount||0);
        });
        return allPaid
          ? "<span class=\"badge success\" title=\"فواتير الربط والاشتراك مؤداة\">\u2705 مؤدى</span>"
          : "<span class=\"badge danger\" title=\"يجب أداء فواتير الربط والاشتراك\">\u26A0\uFE0F معلق</span>";
      }
      return tbl(["رقم الاشتراك","الاسم","الهاتف","القطاع","النوع","الحالة","الربط","إجراء"],
        customers.map(function(c){
          const sec=sectors.find(function(s){return s.id===c.sectorId;});
          return "<tr>"
            +"<td>"+(c.subscriptionNumber||c.customerNumber||c.id)+"</td>"
            +"<td>"+c.fullName+"</td><td>"+safe(c.phone)+"</td>"
            +"<td>"+(sec?sec.name:"-")+"</td><td>"+safe(c.customerType)+"</td>"
            +"<td>"+badge(c.status)+"</td>"
            +"<td>"+custInitStatus(c.id)+"</td>"
            +"<td style='white-space:nowrap'>"
            +'<button class="action-button btn-cust-account" data-id="'+c.id+'" title="حساب الزبون">📒</button> '
            +(can('customers.manage')?'<button class="action-button btn-edit-customer" data-id="'+c.id+'" title="تعديل">✏️</button> ':'')
            +'<button class="del-btn danger-button" data-res="customers" data-id="'+c.id+'">🗑️</button>'
            +"</td>"
            +"</tr>";
        })
      );
    })()}`;
  byId("customer-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    body.sectorId=Number(body.sectorId); body.status="pending";
    try{
      const result = await api("/api/v1/customers",{method:"POST",body:JSON.stringify(body)});
      const inv = result.invoices||[];
      toast("✅ تمت إضافة المشترك — تم إنشاء "+inv.length+" فاتورة (ربط+اشتراك)","success");
      e.target.reset(); await load();
    }catch(err){toast(err.message,"error");}
  });
  byId("cust-search").addEventListener("input",filterTable("view-customers"));
  byId("cust-csv").addEventListener("click",()=>csvDownload("customers.csv",
    ["رقم الاشتراك","الاسم","الهاتف","القطاع","النوع","الحالة"],
    customers.map(c=>{const s=sectors.find(x=>x.id===c.sectorId);
      return[c.subscriptionNumber,c.fullName,c.phone,s?.name,c.customerType,c.status];}),
    "👥 المشتركون والقطاعات"
  ));

  // ─── sector management section ───
  const sectorSection = document.createElement('section');
  sectorSection.className = 'panel'; sectorSection.style.marginTop = '16px';
  sectorSection.innerHTML = '<div class="panel-header"><h2>🗂️ القطاعات</h2></div>'
    + tbl(['الرمز','الاسم','المسؤول','إجراء'],
        sectors.map(s=>'<tr><td>'+s.code+'</td><td>'+s.name+'</td><td>'+safe(s.manager)+'</td>'
          +'<td style="white-space:nowrap">'
          +(can('customers.manage')?'<button class="action-button btn-edit-sector" data-id="'+s.id+'" title="تعديل">✏️</button> ':'')
          +(can('customers.manage')?'<button class="del-btn danger-button" data-res="sectors" data-id="'+s.id+'">🗑️</button>':'')
          +'</td></tr>')
      )
    +(can('customers.manage')?'<form id="sector-form" class="form-grid" style="margin-top:10px">'
      +'<div class="field"><label>رمز القطاع</label><input name="code" required placeholder="S-03"></div>'
      +'<div class="field"><label>اسم القطاع</label><input name="name" required></div>'
      +'<div class="field"><label>المسؤول</label><input name="manager"></div>'
      +'<button type="submit" class="action-button" style="grid-column:1/-1">➕ إضافة قطاع</button>'
      +'</form>':'');
  byId('view-customers').appendChild(sectorSection);

  if (can('customers.manage')) {
    byId('sector-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      try { await api('/api/v1/sectors', { method: 'POST', body: JSON.stringify(body) }); toast('✅ تم إضافة القطاع','success'); e.target.reset(); await load(); }
      catch(err) { toast(err.message,'error'); }
    });

    function openSectorEdit(s) {
      const ex = byId('sector-edit-modal'); if(ex) ex.remove();
      const ist = 'width:100%;padding:6px 8px;border:1px solid var(--border,#ccc);border-radius:6px;box-sizing:border-box';
      const ov = document.createElement('div'); ov.id='sector-edit-modal';
      ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
      ov.innerHTML='<div style="background:var(--bg,#fff);border-radius:14px;max-width:380px;width:100%;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3)">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0;font-size:16px">✏️ تعديل القطاع</h3><button id="se-close" class="action-button" style="padding:4px 10px">✖</button></div>'
        +'<label style="display:block;margin-bottom:10px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">الرمز</span><input id="se-code" value="'+esc(unesc(s.code||''))+'" style="'+ist+'"></label>'
        +'<label style="display:block;margin-bottom:10px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">الاسم</span><input id="se-name" value="'+esc(unesc(s.name||''))+'" style="'+ist+'"></label>'
        +'<label style="display:block;margin-bottom:10px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">المسؤول</span><input id="se-manager" value="'+esc(unesc(s.manager||''))+'" style="'+ist+'"></label>'
        +'<div style="display:flex;gap:8px;margin-top:6px"><button id="se-save" class="action-button" style="flex:1;justify-content:center">💾 حفظ</button><button id="se-cancel" class="secondary-button" style="flex:1;justify-content:center">إلغاء</button></div>'
        +'</div>';
      ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); }); document.body.appendChild(ov);
      byId('se-close').onclick=()=>ov.remove(); byId('se-cancel').onclick=()=>ov.remove();
      byId('se-save').onclick=async()=>{
        const payload={code:byId('se-code').value,name:byId('se-name').value,manager:byId('se-manager').value};
        try{ await api('/api/v1/sectors/'+s.id,{method:'PUT',body:JSON.stringify(payload)}); toast('✅ تم تحديث القطاع','success'); ov.remove(); await load(); }
        catch(err){toast(err.message,'error');}
      };
    }
    document.querySelectorAll('.btn-edit-sector').forEach(b=>{ b.onclick=()=>openSectorEdit(sectors.find(s=>s.id===Number(b.dataset.id))); });

    function openCustomerEdit(c) {
      const ex = byId('customer-edit-modal'); if(ex) ex.remove();
      const ist = 'width:100%;padding:6px 8px;border:1px solid var(--border,#ccc);border-radius:6px;box-sizing:border-box';
      const secOpts = sectors.map(s=>'<option value="'+s.id+'"'+(c.sectorId===s.id?' selected':'')+'>'+s.name+'</option>').join('');
      const statusOpts=[['active','فعال'],['pending','في الانتظار'],['disconnected','مقطوع'],['inactive','غير فعال']]
        .map(x=>'<option value="'+x[0]+'"'+(c.status===x[0]?' selected':'')+'>'+x[1]+'</option>').join('');
      const ov = document.createElement('div'); ov.id='customer-edit-modal';
      ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
      ov.innerHTML='<div style="background:var(--bg,#fff);border-radius:14px;max-width:460px;width:100%;max-height:90vh;overflow:auto;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3)">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0;font-size:16px">✏️ تعديل مشترك</h3><button id="ce-close" class="action-button" style="padding:4px 10px">✖</button></div>'
        +'<div class="form-grid">'
        +'<label style="display:block;margin-bottom:8px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">الاسم الكامل</span><input id="ce-name" value="'+esc(unesc(c.fullName||''))+'" style="'+ist+'"></label>'
        +'<label style="display:block;margin-bottom:8px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">الهاتف</span><input id="ce-phone" value="'+esc(unesc(c.phone||''))+'" style="'+ist+'"></label>'
        +'<label style="display:block;margin-bottom:8px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">رقم ب.و.</span><input id="ce-nid" value="'+esc(unesc(c.nationalId||''))+'" style="'+ist+'"></label>'
        +'<label style="display:block;margin-bottom:8px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">العنوان</span><input id="ce-addr" value="'+esc(unesc(c.address||''))+'" style="'+ist+'"></label>'
        +'<label style="display:block;margin-bottom:8px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">القطاع</span><select id="ce-sector" style="'+ist+'">'+secOpts+'</select></label>'
        +'<label style="display:block;margin-bottom:8px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">الحالة</span><select id="ce-status" style="'+ist+'">'+statusOpts+'</select></label>'
        +'</div>'
        +'<div style="display:flex;gap:8px;margin-top:10px"><button id="ce-save" class="action-button" style="flex:1;justify-content:center">💾 حفظ</button><button id="ce-cancel" class="secondary-button" style="flex:1;justify-content:center">إلغاء</button></div>'
        +'</div>';
      ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); }); document.body.appendChild(ov);
      byId('ce-close').onclick=()=>ov.remove(); byId('ce-cancel').onclick=()=>ov.remove();
      byId('ce-save').onclick=async()=>{
        const payload={fullName:byId('ce-name').value,phone:byId('ce-phone').value,nationalId:byId('ce-nid').value,address:byId('ce-addr').value,sectorId:Number(byId('ce-sector').value),status:byId('ce-status').value};
        try{ await api('/api/v1/customers/'+c.id,{method:'PUT',body:JSON.stringify(payload)}); toast('✅ تم تحديث بيانات المشترك','success'); ov.remove(); await load(); }
        catch(err){toast(err.message,'error');}
      };
    }
    document.querySelectorAll('.btn-edit-customer').forEach(b=>{ b.onclick=()=>openCustomerEdit(customers.find(c=>c.id===Number(b.dataset.id))); });
  }

  // حساب الزبون — يعمل لجميع المستخدمين الذين يملكون صلاحية العرض
  document.querySelectorAll('.btn-cust-account').forEach(b=>{
    b.onclick=()=>openCustomerAccount(customers.find(c=>c.id===Number(b.dataset.id)));
  });

  attachDeleteHandlers();
}

/* ══════════════════════════════════════════════════
   حساب الزبون — نافذة شاملة
   ══════════════════════════════════════════════════ */
function openCustomerAccount(cust) {
  if (!cust) return;
  const ex = byId('cust-account-modal'); if (ex) ex.remove();

  const d = state.data;
  const allInvoices  = (d.invoices  || []).filter(i => i.customerId === cust.id);
  const allPayments  = (d.payments  || []).filter(p => p.customerId === cust.id);
  const allCredits   = (d.customerCredits || []).filter(c => c.customerId === cust.id);
  const meter        = (d.meters || []).find(m => m.customerId === cust.id);
  const sector       = (d.sectors || []).find(s => s.id === cust.sectorId);

  // ── مجاميع ──
  const totalBilled  = allInvoices.reduce((s,i) => s + (i.totalAmount||0), 0);
  const totalPaid    = allPayments.reduce((s,p) => s + (p.amount||0), 0);
  const totalCredit  = allCredits.reduce((s,c) => s + (c.remainingAmount||0), 0);
  const totalDebt    = Math.max(0, totalBilled - totalPaid);

  // ── الفواتير غير المؤداة (ماء + ربط) ──
  const unpaidInvoices = allInvoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'avoir');

  // ── بناء جدول الفواتير ──
  function invRows(list, showPayBtn) {
    if (!list.length) return '<tr><td colspan="7" style="text-align:center;color:var(--muted)">لا توجد فواتير</td></tr>';
    const typeL = { water:'💧 ماء', onboarding:'🔗 ربط+اشتراك', connection:'🔌 ربط', subscription:'📝 اشتراك', avoir:'💚 رصيد دائن' };
    return list.map(inv => {
      const paidAmt = allPayments.filter(p=>p.invoiceId===inv.id).reduce((s,p)=>s+(p.amount||0),0);
      const rem = Math.max(0,(inv.totalAmount||0)-paidAmt);
      const isAvoir = inv.type==='avoir';
      const rowStyle = isAvoir ? 'style="background:#f0fdf4;color:#166534"'
        : (rem>0 && !isAvoir ? 'style="background:#fff7ed"' : '');
      const payCell = (showPayBtn && !isAvoir && rem>0 && can('payments.collect'))
        ? '<button class="action-button btn-pay-from-account" data-id="'+inv.id+'" data-rem="'+rem.toFixed(2)+'" style="font-size:11px;padding:3px 8px">💰 استخلاص</button>'
        : (isAvoir ? '<span class="badge success" style="font-size:11px">رصيد دائن</span>' : (rem===0?'<span class="badge success" style="font-size:11px">✅ مؤدى</span>':'-'));
      return '<tr '+rowStyle+'>'
        +'<td style="font-size:11px">'+inv.invoiceNumber+'</td>'
        +'<td><span class="badge" style="font-size:10px">'+(typeL[inv.type]||inv.type||'water')+'</span></td>'
        +'<td>'+(inv.periodLabel||inv.invoiceDate?.slice(0,7)||'-')+'</td>'
        +'<td>'+(inv.consumption!=null?inv.consumption+' م³':'-')+'</td>'
        +'<td><strong>'+formatMoney(inv.totalAmount)+'</strong></td>'
        +'<td style="color:'+(rem>0&&!isAvoir?'var(--danger)':'var(--success)')+'"><strong>'+formatMoney(isAvoir?0:rem)+'</strong></td>'
        +'<td>'+payCell+'</td>'
        +'</tr>';
    }).join('');
  }

  // ── بناء جدول المدفوعات ──
  function payRows() {
    if (!allPayments.length) return '<tr><td colspan="4" style="text-align:center;color:var(--muted)">لا توجد مدفوعات</td></tr>';
    return allPayments.slice().reverse().map(p => {
      const inv = allInvoices.find(i=>i.id===p.invoiceId);
      return '<tr>'
        +'<td style="font-size:11px">'+(p.paymentDate||'').slice(0,10)+'</td>'
        +'<td><strong style="color:var(--success)">'+formatMoney(p.amount)+'</strong></td>'
        +'<td>'+(p.method||'-')+'</td>'
        +'<td style="font-size:11px">'+(inv?inv.invoiceNumber:'-')+'</td>'
        +'</tr>';
    }).join('');
  }

  // ── بناء جدول الأرصدة الدائنة ──
  function creditRows() {
    if (!allCredits.length) return '<tr><td colspan="4" style="text-align:center;color:var(--muted)">لا يوجد رصيد دائن</td></tr>';
    return allCredits.map(c => {
      return '<tr style="background:#f0fdf4">'
        +'<td style="font-size:11px">'+c.createdAt+'</td>'
        +'<td><strong style="color:#166534">'+formatMoney(c.amount)+'</strong></td>'
        +'<td style="color:#16a34a">'+formatMoney(c.usedAmount||0)+'</td>'
        +'<td><strong style="color:#15803d;font-size:13px">'+formatMoney(c.remainingAmount||0)+'</strong></td>'
        +'</tr>';
    }).join('');
  }

  // ── KPI شرائط ──
  const kpiHtml =
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">'
    +'<div style="background:#eff6ff;border-radius:10px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:800;color:#1d4ed8">'+formatMoney(totalBilled)+'</div><div style="font-size:11px;color:#64748b">إجمالي الفواتير</div></div>'
    +'<div style="background:#f0fdf4;border-radius:10px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:800;color:#16a34a">'+formatMoney(totalPaid)+'</div><div style="font-size:11px;color:#64748b">إجمالي المؤدى</div></div>'
    +'<div style="background:'+(totalDebt>0?'#fff7ed':'#f0fdf4')+';border-radius:10px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:800;color:'+(totalDebt>0?'#ea580c':'#16a34a')+'">'+formatMoney(totalDebt)+'</div><div style="font-size:11px;color:#64748b">المبلغ المتبقي</div></div>'
    +'<div style="background:'+(totalCredit>0?'#f0fdf4':'#f8fafc')+';border-radius:10px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:800;color:'+(totalCredit>0?'#15803d':'#94a3b8')+'">'+formatMoney(totalCredit)+'</div><div style="font-size:11px;color:#64748b">💚 رصيد دائن</div></div>'
    +'</div>';

  // ── معلومات الزبون ──
  const custInfoHtml =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:13px;background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:14px">'
    +'<div><span style="color:var(--muted)">رقم الاشتراك: </span><strong>'+(cust.subscriptionNumber||cust.customerNumber||cust.id)+'</strong></div>'
    +'<div><span style="color:var(--muted)">الهاتف: </span><strong>'+(cust.phone||'-')+'</strong></div>'
    +'<div><span style="color:var(--muted)">القطاع: </span><strong>'+(sector?.name||'-')+'</strong></div>'
    +'<div><span style="color:var(--muted)">العداد: </span><strong>'+(meter?.meterNumber||'<span style="color:var(--danger)">لم يُركَّب بعد</span>')+'</strong></div>'
    +'<div><span style="color:var(--muted)">تاريخ الاشتراك: </span><strong>'+(cust.subscriptionDate||'-')+'</strong></div>'
    +'<div><span style="color:var(--muted)">الحالة: </span>'+badge(cust.status)+'</div>'
    +'</div>';

  // ── تنبيه رصيد دائن للاستخدام ──
  const creditAlert = totalCredit > 0
    ? '<div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;display:flex;justify-content:space-between;align-items:center">'
      +'<span>💚 <strong>رصيد دائن متاح: '+formatMoney(totalCredit)+'</strong> — يمكن استخدامه لتسوية الفواتير غير المؤداة.</span>'
      +(unpaidInvoices.length && can('payments.collect')
        ? '<button class="action-button" id="btn-apply-credit-all" style="background:#16a34a;color:#fff;font-size:12px;padding:4px 12px">⚡ تطبيق على الكل</button>'
        : '')
      +'</div>'
    : '';

  const ov = document.createElement('div');
  ov.id = 'cust-account-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:16px;overflow-y:auto';

  ov.innerHTML = '<div style="background:var(--bg,#fff);border-radius:16px;max-width:760px;width:100%;margin:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
    // header
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
      +'<div>'
        +'<h2 style="margin:0;font-size:18px">📒 حساب: '+esc(cust.fullName)+'</h2>'
        +'<div style="font-size:12px;color:var(--muted);margin-top:2px">'+(cust.subscriptionNumber||cust.customerNumber||'')+'</div>'
      +'</div>'
      +'<button id="ca-close" class="action-button" style="padding:4px 12px">✖ إغلاق</button>'
    +'</div>'
    + custInfoHtml
    + kpiHtml
    + creditAlert
    // tabs
    +'<div style="display:flex;gap:4px;margin-bottom:14px;border-bottom:2px solid var(--border,#e5e7eb)">'
      +'<button class="ca-tab active" data-tab="unpaid" style="padding:7px 16px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;border-bottom:2px solid #2563eb;margin-bottom:-2px;color:#2563eb">⚠️ غير المؤداة ('+unpaidInvoices.length+')</button>'
      +'<button class="ca-tab" data-tab="all" style="padding:7px 16px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13px;color:var(--muted)">📋 كل الفواتير ('+allInvoices.length+')</button>'
      +'<button class="ca-tab" data-tab="payments" style="padding:7px 16px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13px;color:var(--muted)">💳 المدفوعات ('+allPayments.length+')</button>'
      +(allCredits.length ? '<button class="ca-tab" data-tab="credits" style="padding:7px 16px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13px;color:#15803d">💚 الرصيد الدائن ('+allCredits.length+')</button>' : '')
    +'</div>'
    // tab panels
    +'<div id="ca-tab-unpaid">'
      +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
        +'<thead><tr style="background:var(--card,#f8fafc)"><th style="padding:8px;text-align:right">رقم الفاتورة</th><th>النوع</th><th>الفترة</th><th>الاستهلاك</th><th>الإجمالي</th><th>المتبقي</th><th>استخلاص</th></tr></thead>'
        +'<tbody>'+invRows(unpaidInvoices, true)+'</tbody>'
      +'</table></div>'
    +'</div>'
    +'<div id="ca-tab-all" style="display:none">'
      +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
        +'<thead><tr style="background:var(--card,#f8fafc)"><th style="padding:8px;text-align:right">رقم الفاتورة</th><th>النوع</th><th>الفترة</th><th>الاستهلاك</th><th>الإجمالي</th><th>المتبقي</th><th></th></tr></thead>'
        +'<tbody>'+invRows(allInvoices.slice().reverse(), true)+'</tbody>'
      +'</table></div>'
    +'</div>'
    +'<div id="ca-tab-payments" style="display:none">'
      +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
        +'<thead><tr style="background:var(--card,#f8fafc)"><th style="padding:8px;text-align:right">التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>الفاتورة</th></tr></thead>'
        +'<tbody>'+payRows()+'</tbody>'
      +'</table></div>'
    +'</div>'
    +(allCredits.length
      ? '<div id="ca-tab-credits" style="display:none">'
          +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
            +'<thead><tr style="background:#f0fdf4"><th style="padding:8px;text-align:right">التاريخ</th><th>المبلغ الأصلي</th><th>المستخدم</th><th>المتبقي</th></tr></thead>'
            +'<tbody>'+creditRows()+'</tbody>'
          +'</table></div>'
        +'</div>'
      : '')
    +'</div>';

  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);

  // ── تبديل التبويبات ──
  ov.querySelectorAll('.ca-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      ov.querySelectorAll('.ca-tab').forEach(t => {
        t.style.fontWeight = ''; t.style.color = 'var(--muted)'; t.style.borderBottom = 'none';
      });
      tab.style.fontWeight = '600';
      tab.style.color = tab.dataset.tab === 'credits' ? '#15803d' : '#2563eb';
      tab.style.borderBottom = '2px solid ' + (tab.dataset.tab === 'credits' ? '#16a34a' : '#2563eb');
      ['unpaid','all','payments','credits'].forEach(id => {
        const el = byId('ca-tab-'+id); if (el) el.style.display = 'none';
      });
      const panel = byId('ca-tab-'+tab.dataset.tab);
      if (panel) panel.style.display = '';
    });
  });

  byId('ca-close').onclick = () => ov.remove();

  // ── استخلاص فاتورة واحدة ──
  ov.querySelectorAll('.btn-pay-from-account').forEach(btn => {
    btn.addEventListener('click', async () => {
      const invId = Number(btn.dataset.id);
      const rem   = parseFloat(btn.dataset.rem);
      const inv   = allInvoices.find(i => i.id === invId);
      if (!inv) return;

      // اقتراح استخدام الرصيد الدائن إن وُجد
      let defaultAmt = rem.toFixed(2);
      let creditMsg  = '';
      if (totalCredit > 0) {
        const applyAmt = Math.min(totalCredit, rem);
        creditMsg = `\n💚 رصيد دائن متاح: ${formatMoney(totalCredit)}\nسيُطبَّق منه: ${formatMoney(applyAmt)}`;
        defaultAmt = Math.max(0, rem - applyAmt).toFixed(2);
      }
      const promptMsg = `استخلاص فاتورة: ${inv.invoiceNumber}\nالمبلغ المتبقي: ${formatMoney(rem)}${creditMsg}\n\nأدخل المبلغ النقدي الإضافي (0 لتسوية بالرصيد فقط):`;
      const input = prompt(promptMsg, defaultAmt);
      if (input === null) return;
      const cashAmt = parseFloat(String(input).replace(',', '.')) || 0;
      if (cashAmt < 0) { toast('⛔ مبلغ غير صالح', 'error'); return; }

      try {
        showLoading();
        let remaining = rem;
        // 1. تطبيق الرصيد الدائن أولاً
        if (totalCredit > 0 && remaining > 0) {
          const creditApply = Math.min(totalCredit, remaining);
          // نرسل طلب أداء بالرصيد (طريقة credit)
          await api('/api/v1/payments/collect', { method: 'POST', body: JSON.stringify({
            invoiceId: invId, amount: creditApply, method: 'credit',
            reference: 'رصيد دائن'
          })});
          remaining = Math.max(0, remaining - creditApply);
        }
        // 2. تطبيق المبلغ النقدي إن وُجد
        if (cashAmt > 0 && remaining > 0) {
          const apply = Math.min(cashAmt, remaining);
          await api('/api/v1/payments/collect', { method: 'POST', body: JSON.stringify({
            invoiceId: invId, amount: apply, method: 'cash'
          })});
        }
        toast('✅ تم الاستخلاص', 'success');
        ov.remove();
        await load();
      } catch(err) { toast(err.message, 'error'); }
      finally { hideLoading(); }
    });
  });

  // ── تطبيق الرصيد الدائن على كل الفواتير ──
  byId('btn-apply-credit-all')?.addEventListener('click', async () => {
    if (!totalCredit || !unpaidInvoices.length) return;
    if (!confirm(`تطبيق الرصيد الدائن (${formatMoney(totalCredit)}) على ${unpaidInvoices.length} فاتورة غير مؤداة؟`)) return;
    try {
      showLoading();
      let creditLeft = totalCredit;
      for (const inv of unpaidInvoices) {
        if (creditLeft <= 0) break;
        const paidAmt = allPayments.filter(p=>p.invoiceId===inv.id).reduce((s,p)=>s+(p.amount||0),0);
        const rem = Math.max(0, (inv.totalAmount||0) - paidAmt);
        if (rem <= 0) continue;
        const apply = Math.min(creditLeft, rem);
        await api('/api/v1/payments/collect', { method: 'POST', body: JSON.stringify({
          invoiceId: inv.id, amount: apply, method: 'credit', reference: 'رصيد دائن'
        })});
        creditLeft -= apply;
      }
      toast('✅ تم تطبيق الرصيد الدائن', 'success');
      ov.remove();
      await load();
    } catch(err) { toast(err.message, 'error'); }
    finally { hideLoading(); }
  });
}

function renderMeters() {
  const meters=state.data.meters||[];
  const customers=state.data.customers||[];
  const periods=state.data.readingPeriods||[];
  const activePeriod=periods.find(p=>p.status==='open')||null;

  const meterByCust=new Map(meters.map(m=>[m.customerId,m]));
  const custById=new Map(customers.map(c=>[c.id,c]));
  const available=customers.filter(c=>!meterByCust.has(c.id)); // مشتركون بلا عداد

  const statusLabels={active:'نشط',stopped:'متوقف',broken:'معطل',disconnected:'مقطوع',maintenance:'صيانة'};
  const typeLabels={mechanical:'ميكانيكي',smart:'ذكي'};

  const total=meters.length;
  const activeC=meters.filter(m=>m.status==='active').length;
  const issuesC=meters.filter(m=>['stopped','broken','maintenance','disconnected'].includes(m.status)).length;
  const noMeter=available.length;

  const formPanel = can('meters.manage') ? `
    <div class="form-panel" style="margin-bottom:16px">
      <h2>🔧 تركيب عداد جديد</h2>
      ${available.length ? `
      <form id="meter-form" class="form-grid">
        <div class="field"><label>المشترك (بدون عداد)</label>
          <select name="customerId" required>
            <option value="">— اختر مشتركاً —</option>
            ${available.map(c=>`<option value="${c.id}">${c.fullName} (${c.subscriptionNumber||c.customerNumber||''})</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>رقم العداد</label><input name="meterNumber" required placeholder="MTR-..."></div>
        <div class="field"><label>النوع</label><select name="type"><option value="mechanical">ميكانيكي</option><option value="smart">ذكي</option></select></div>
        <div class="field"><label>القطر</label><input name="diameter" value="15mm"></div>
        <div class="field"><label>الماركة</label><input name="brand" placeholder="Itron, Zenner..."></div>
        <div class="field"><label>القراءة الأولى (م³)</label><input name="lastReading" type="number" min="0" value="0"></div>
        <div class="field" style="grid-column:1/-1">
          <div style="background:var(--card,#f1f5f9);border-radius:8px;padding:8px 12px;font-size:13px;color:var(--muted)">
            ${activePeriod ? '📅 سيُربط العداد بفترة القراءة الحالية: <strong>'+activePeriod.label+'</strong>' : '⚠️ لا توجد فترة قراءة مفتوحة — افتح فترة من الإعدادات ليدخل العداد دورة القراءة.'}
          </div>
        </div>
        <button type="submit" class="action-button" style="grid-column:1/-1;margin-top:6px">🔧 تركيب العداد</button>
      </form>` : '<div style="padding:14px;text-align:center;color:var(--success)">✅ كل المشتركين لديهم عدادات مركّبة — لا يوجد مشترك بدون عداد.</div>'}
    </div>` : '';

  byId("view-meters").innerHTML=`
    <div class="kpi-band" style="margin-bottom:16px">
      <div class="kpi-card info"><div class="kpi-value">${total}</div><div class="kpi-label">إجمالي العدادات</div></div>
      <div class="kpi-card success"><div class="kpi-value">${activeC}</div><div class="kpi-label">نشطة</div></div>
      <div class="kpi-card warn"><div class="kpi-value">${issuesC}</div><div class="kpi-label">متوقفة/معطلة/صيانة</div></div>
      <div class="kpi-card ${noMeter?'danger':'info'}"><div class="kpi-value">${noMeter}</div><div class="kpi-label">مشتركون بلا عداد</div></div>
    </div>
    ${formPanel}
    <div class="section-toolbar">
      <input class="search-input" id="meter-search" placeholder="🔍 بحث (رقم العداد، المشترك، الماركة)..."/>
      <select class="filter-select" id="meter-status"><option value="">📋 كل الحالات</option>${Object.entries(statusLabels).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select>
      <select class="filter-select" id="meter-type"><option value="">⚙️ كل الأنواع</option><option value="mechanical">ميكانيكي</option><option value="smart">ذكي</option></select>
      <span class="badge" id="meter-count">${meters.length} عداد</span>
    </div>
    <div id="meters-table-wrap">${buildMetersTable(meters)}</div>`;

  function buildMetersTable(list){
    if(!list.length) return '<p style="padding:16px;text-align:center;color:var(--muted)">لا توجد عدادات مطابقة</p>';
    return tbl(["رقم العداد","QR","المشترك","النوع","القطر","الماركة","فترة التركيب","تاريخ التركيب","آخر قراءة","الحالة","إجراءات"],
      list.map(m=>{
        const cust=custById.get(m.customerId);
        const perLabel=m.installPeriodLabel||(periods.find(p=>p.id===m.installPeriodId)||{}).label||'-';
        const actions=(can('meters.manage')?'<button class="action-button btn-edit-meter" data-id="'+m.id+'" title="تعديل">✏️</button> ':'')
          +(can('meters.manage')?'<button class="del-btn danger-button" data-res="meters" data-id="'+m.id+'" title="حذف">🗑️</button>':'');
        return '<tr>'
          +'<td><strong>'+m.meterNumber+'</strong></td>'
          +'<td style="font-size:11px">'+(m.qrCode||m.barcode||'-')+'</td>'
          +'<td>'+(m.customerName||(cust?cust.fullName:'-'))+'</td>'
          +'<td>'+(typeLabels[m.type]||m.type||'-')+'</td>'
          +'<td>'+(m.diameter||'-')+'</td>'
          +'<td>'+(m.brand||'-')+'</td>'
          +'<td>'+perLabel+'</td>'
          +'<td>'+safe(m.installationDate)+'</td>'
          +'<td>'+(m.lastReading??0)+' م³</td>'
          +'<td>'+badge(m.status)+'</td>'
          +'<td style="white-space:nowrap">'+actions+'</td>'
          +'</tr>';
      })
    );
  }

  function getMetersFiltered(){
    const q=(byId('meter-search')?.value||'').toLowerCase();
    const st=byId('meter-status')?.value||'';
    const ty=byId('meter-type')?.value||'';
    return meters.filter(m=>{
      if(st && m.status!==st) return false;
      if(ty && m.type!==ty) return false;
      if(q){
        const cust=custById.get(m.customerId);
        const hay=[(m.meterNumber||''),(m.brand||''),(cust?cust.fullName:''),(m.customerName||'')].join(' ').toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function applyMeterFilters(){
    const list=getMetersFiltered();
    byId('meters-table-wrap').innerHTML=buildMetersTable(list);
    byId('meter-count').textContent=list.length+' عداد';
    attachDeleteHandlers();
    wireEditMeters();
  }
  function wireEditMeters(){
    document.querySelectorAll('.btn-edit-meter').forEach(b=>{ b.onclick=()=>openMeterEdit(meters.find(m=>m.id===Number(b.dataset.id))); });
  }
  function openMeterEdit(m){
    if(!m) return;
    const ex=byId('meter-edit-modal'); if(ex) ex.remove();
    const ist='width:100%;padding:6px 8px;border:1px solid var(--border,#ccc);border-radius:6px;box-sizing:border-box';
    const statusOpts=Object.entries(statusLabels).map(([k,v])=>'<option value="'+k+'"'+(m.status===k?' selected':'')+'>'+v+'</option>').join('');
    const typeOpts=[['mechanical','ميكانيكي'],['smart','ذكي']].map(t=>'<option value="'+t[0]+'"'+(m.type===t[0]?' selected':'')+'>'+t[1]+'</option>').join('');
    const ov=document.createElement('div'); ov.id='meter-edit-modal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    ov.innerHTML='<div style="background:var(--bg,#fff);border-radius:14px;max-width:420px;width:100%;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3)">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0;font-size:16px">✏️ تعديل العداد '+m.meterNumber+'</h3><button id="me-close" class="action-button" style="padding:4px 10px">✖</button></div>'
      +'<label style="display:block;margin-bottom:10px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">الحالة</span><select id="me-status" style="'+ist+'">'+statusOpts+'</select></label>'
      +'<label style="display:block;margin-bottom:10px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">النوع</span><select id="me-type" style="'+ist+'">'+typeOpts+'</select></label>'
      +'<label style="display:block;margin-bottom:10px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">القطر</span><input id="me-diam" value="'+esc(unesc(m.diameter||''))+'" style="'+ist+'"></label>'
      +'<label style="display:block;margin-bottom:10px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">الماركة</span><input id="me-brand" value="'+esc(unesc(m.brand||''))+'" style="'+ist+'"></label>'
      +'<div style="display:flex;gap:8px;margin-top:6px"><button id="me-save" class="action-button" style="flex:1;justify-content:center">💾 حفظ</button><button id="me-cancel" class="secondary-button" style="flex:1;justify-content:center">إلغاء</button></div>'
      +'</div>';
    ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); });
    document.body.appendChild(ov);
    byId('me-close').onclick=()=>ov.remove();
    byId('me-cancel').onclick=()=>ov.remove();
    byId('me-save').onclick=async()=>{
      const payload={ status:byId('me-status').value, type:byId('me-type').value, diameter:byId('me-diam').value, brand:byId('me-brand').value };
      try{ await api('/api/v1/meters/'+m.id,{method:'PUT',body:JSON.stringify(payload)}); toast('✅ تم تحديث العداد','success'); ov.remove(); await load(); }
      catch(err){ toast(err.message,'error'); }
    };
  }

  const mform=byId('meter-form');
  if(mform) mform.addEventListener('submit',async e=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    if(!body.customerId){ toast('اختر مشتركاً','error'); return; }
    body.customerId=Number(body.customerId); body.lastReading=Number(body.lastReading||0);
    body.qrCode='QR-'+body.meterNumber; body.barcode='BAR-'+body.meterNumber;
    body.installationDate=today(); body.status='active';
    try{
      const r=await api('/api/v1/meters',{method:'POST',body:JSON.stringify(body)});
      toast('✅ تم تركيب العداد'+(r&&r.activePeriod?(' وربطه بفترة '+r.activePeriod.label):''),'success');
      e.target.reset(); await load();
    }catch(err){ toast((err.message&&err.message.includes('ربط')?'⛔ ':'')+err.message,'error'); }
  });

  byId('meter-search').addEventListener('input',applyMeterFilters);
  byId('meter-status').addEventListener('change',applyMeterFilters);
  byId('meter-type').addEventListener('change',applyMeterFilters);
  attachDeleteHandlers();
  wireEditMeters();
}

function renderTariffs() {
  const tariffs = state.data.tariffs || [];
  const activeTariff = tariffs.find(t => t.active) || tariffs[0] || null;

  // ─── بناء جدول الشرائح التجريبي ───
  function calcPreview(tariff) {
    if (!tariff || !tariff.tiers || !tariff.tiers.length) return "";
    const examples = [5, 15, 30, 50];
    const rows = examples.map(c => {
      let amt = 0, rem = c;
      for (const tier of tariff.tiers) {
        if (rem <= 0) break;
        const cap = tier.max != null ? tier.max - tier.min : Infinity;
        const used = Math.min(rem, cap);
        amt += used * tier.price;
        rem -= used;
      }
      const fees = (tariff.monthlyFee || 0) + (tariff.maintenanceFee || 0);
      const tax  = (amt + fees) * (tariff.taxRate || 0);
      const total = (amt + fees + tax).toFixed(2);
      return `<tr><td>${c} م³</td><td>${formatMoney(amt)}</td><td>${formatMoney(fees)}</td><td>${formatMoney(tax)}</td><td><strong>${formatMoney(total)}</strong></td></tr>`;
    });
    return `<div class="tariff-preview">
      <h3>📊 جدول حساب تجريبي</h3>
      ${tbl(["الاستهلاك","الاستهلاك (د.م)","الرسوم","الضريبة","المجموع"], rows)}
    </div>`;
  }

  // ─── نموذج الشرائح الديناميكي ───
  function tiersFormHtml(tiers) {
    return (tiers || []).map((t, i) => `
      <div class="tier-row" data-tier="${i}">
        <input type="number" class="tier-min" placeholder="من" value="${t.min}" min="0" required>
        <input type="number" class="tier-max" placeholder="إلى (فارغ=∞)" value="${t.max ?? ""}">
        <input type="number" class="tier-price" placeholder="السعر د.م./م³" value="${t.price}" step="0.01" min="0" required>
        <button type="button" class="del-tier-btn">🗑️</button>
      </div>`).join("");
  }

  // ─── بناء الـ HTML ───
  const tariffCards = tariffs.map(t => `
    <div class="tariff-card${t.active ? " tariff-active" : ""}" data-id="${t.id}">
      <div class="tc-head">
        <span class="tc-name">${t.name}</span>
        ${t.active ? '<span class="badge success">نشطة ✓</span>' : '<span class="badge">غير نشطة</span>'}
      </div>
      <div class="tc-info">
        <span>اشتراك شهري: <strong>${formatMoney(t.monthlyFee)}</strong></span>
        <span>صيانة: <strong>${formatMoney(t.maintenanceFee)}</strong></span>
        <span>ضريبة: <strong>${(Number(t.taxRate || 0) * 100).toFixed(1)}%</strong></span>
        <span>شرائح: <strong>${(t.tiers || []).length}</strong></span>
      </div>
      <div class="tc-actions">
        ${can("settings.manage") ? `<button class="action-button btn-edit-tariff" data-id="${t.id}">✏️ تعديل</button>` : ""}
        ${can("settings.manage") && !t.active ? `<button class="action-button btn-activate-tariff" data-id="${t.id}">✅ تفعيل</button>` : ""}
        ${can("settings.manage") && tariffs.length > 1 && !t.active ? `<button class="del-btn btn-del-tariff" data-id="${t.id}">🗑️</button>` : ""}
      </div>
    </div>`).join("");

  byId("view-tariffs").innerHTML = `
    <div class="section-header">
      <h2>💲 التعريفة والشرائح</h2>
      ${can("settings.manage") ? `<button class="action-button" id="btn-new-tariff">➕ تعريفة جديدة</button>` : ""}
      ${can("settings.manage") ? `<button class="action-button" id="btn-recalc-invoices" title="إعادة احتساب كل فواتير الماء من التعريفة النشطة">🧮 إعادة احتساب الفواتير</button>` : ""}
    </div>

    <!-- بطاقات التعريفات -->
    <div class="tariff-cards-grid" id="tariff-cards">${tariffCards}</div>

    <!-- نموذج الإضافة/التعديل -->
    <div id="tariff-form-wrap" style="display:none">
      <section class="panel">
        <h2 id="tariff-form-title">➕ تعريفة جديدة</h2>
        <form id="tariff-form" class="form-grid">
          <input type="hidden" id="tf-id" value="">
          <div class="field">
            <label>اسم التعريفة</label>
            <input id="tf-name" name="name" required placeholder="مثال: تعريفة 2026">
          </div>
          <div class="field">
            <label>النوع</label>
            <select id="tf-type" name="type">
              <option value="tiered">شرائح</option>
              <option value="flat">ثابت</option>
            </select>
          </div>
          <div class="field">
            <label>اشتراك شهري (د.م.)</label>
            <input id="tf-monthly" name="monthlyFee" type="number" step="0.01" min="0" value="10">
          </div>
          <div class="field">
            <label>رسم الصيانة (د.م.)</label>
            <input id="tf-maint" name="maintenanceFee" type="number" step="0.01" min="0" value="5">
          </div>
          <div class="field">
            <label>نسبة الضريبة (0.05 = 5%)</label>
            <input id="tf-tax" name="taxRate" type="number" step="0.001" min="0" max="1" value="0.05">
          </div>
          <div class="field">
            <label>
              <input id="tf-active" type="checkbox" name="active">
              تعريفة نشطة (للفواتير)
            </label>
          </div>

          <!-- شرائح الاستهلاك -->
          <div style="grid-column:1/-1">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
              <strong>شرائح الاستهلاك (م³)</strong>
              <button type="button" class="action-button" id="btn-add-tier">➕ شريحة</button>
            </div>
            <div class="tiers-header">
              <span>من (م³)</span><span>إلى (م³)</span><span>السعر (د.م./م³)</span><span></span>
            </div>
            <div id="tiers-container"></div>
          </div>

          <div style="grid-column:1/-1;display:flex;gap:8px;margin-top:8px">
            <button type="submit" class="action-button">💾 حفظ</button>
            <button type="button" class="secondary-button" id="btn-cancel-tariff">إلغاء</button>
          </div>
        </form>
      </section>
    </div>

    <!-- معاينة التعريفة النشطة -->
    ${activeTariff ? `
    <section class="panel" style="margin-top:16px">
      <h2>📋 تفاصيل التعريفة النشطة: ${activeTariff.name}</h2>
      <div class="split">
        <div>
          ${tbl(["من (م³)","إلى (م³)","السعر (د.م./م³)"],
            (activeTariff.tiers || []).map((t, i) =>
              `<tr>
                <td>${t.min}</td>
                <td>${t.max ?? "<span class='badge'>∞ غير محدود</span>"}</td>
                <td><strong>${formatMoney(t.price)}</strong></td>
              </tr>`
            )
          )}
        </div>
        <div>
          <div class="profile-grid">
            <div><span>اشتراك شهري</span><strong>${formatMoney(activeTariff.monthlyFee)}</strong></div>
            <div><span>رسم الصيانة</span><strong>${formatMoney(activeTariff.maintenanceFee)}</strong></div>
            <div><span>نسبة الضريبة</span><strong>${(Number(activeTariff.taxRate || 0) * 100).toFixed(1)}%</strong></div>
          </div>
          ${calcPreview(activeTariff)}
        </div>
      </div>
    </section>` : ""}
  `;

  if (!can("settings.manage")) return;

  // ─── مساعد: ملء نموذج التعديل ───
  function openForm(tariff = null) {
    byId("tariff-form-wrap").style.display = "";
    byId("tariff-form-title").textContent = tariff ? "✏️ تعديل التعريفة" : "➕ تعريفة جديدة";
    byId("tf-id").value       = tariff ? tariff.id : "";
    byId("tf-name").value     = tariff ? unesc(tariff.name) : "";
    byId("tf-type").value     = tariff ? (tariff.type || "tiered") : "tiered";
    byId("tf-monthly").value  = tariff ? tariff.monthlyFee : 10;
    byId("tf-maint").value    = tariff ? tariff.maintenanceFee : 5;
    byId("tf-tax").value      = tariff ? tariff.taxRate : 0.05;
    byId("tf-active").checked = tariff ? !!tariff.active : false;
    byId("tiers-container").innerHTML = tiersFormHtml(tariff ? tariff.tiers : [
      { min: 0, max: 10, price: 2 },
      { min: 10, max: 20, price: 3 },
      { min: 20, max: 40, price: 5 },
      { min: 40, max: null, price: 7 }
    ]);
    byId("tariff-form-wrap").scrollIntoView({ behavior: "smooth" });
  }

  // ─── مساعد: قراءة الشرائح من الـ DOM ───
  function readTiers() {
    return [...byId("tiers-container").querySelectorAll(".tier-row")].map(row => ({
      min:   Number(row.querySelector(".tier-min").value  || 0),
      max:   row.querySelector(".tier-max").value !== "" ? Number(row.querySelector(".tier-max").value) : null,
      price: Number(row.querySelector(".tier-price").value || 0)
    }));
  }

  // ─── إضافة شريحة جديدة ───
  byId("btn-add-tier").addEventListener("click", () => {
    const rows = byId("tiers-container").querySelectorAll(".tier-row");
    const lastMax = rows.length ? (rows[rows.length - 1].querySelector(".tier-max").value || "") : "0";
    const newMin = lastMax !== "" ? Number(lastMax) : 0;
    const div = document.createElement("div");
    div.className = "tier-row";
    div.innerHTML = `
      <input type="number" class="tier-min" placeholder="من" value="${newMin}" min="0" required>
      <input type="number" class="tier-max" placeholder="إلى (فارغ=∞)" value="">
      <input type="number" class="tier-price" placeholder="السعر" step="0.01" min="0" required>
      <button type="button" class="del-tier-btn">🗑️</button>`;
    byId("tiers-container").appendChild(div);
  });

  // ─── حذف شريحة (event delegation) ───
  byId("tiers-container").addEventListener("click", e => {
    if (e.target.classList.contains("del-tier-btn")) {
      e.target.closest(".tier-row").remove();
    }
  });

  // ─── زر تعريفة جديدة ───
  byId("btn-new-tariff").addEventListener("click", () => openForm(null));

  // ─── إعادة احتساب الفواتير من التعريفة النشطة ───
  byId("btn-recalc-invoices")?.addEventListener("click", async () => {
    if (!confirm("إعادة احتساب جميع فواتير الماء من التعريفة النشطة؟ سيشمل ذلك الفواتير المؤداة.")) return;
    try {
      const r = await api("/api/v1/invoices/recalculate", { method: "POST", body: "{}" });
      toast(`🧮 تمت إعادة احتساب ${r?.recalculatedInvoices || 0} فاتورة`, "success");
      await load();
    } catch(err) { toast(err.message, "error"); }
  });

  // ─── إلغاء ───
  byId("btn-cancel-tariff").addEventListener("click", () => {
    byId("tariff-form-wrap").style.display = "none";
  });

  // ─── تعديل ───
  document.querySelectorAll(".btn-edit-tariff").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = tariffs.find(x => x.id === Number(btn.dataset.id));
      if (t) openForm(t);
    });
  });

  // ─── تفعيل ───
  document.querySelectorAll(".btn-activate-tariff").forEach(btn => {
    btn.addEventListener("click", async () => {
      const t = tariffs.find(x => x.id === Number(btn.dataset.id));
      if (!t) return;
      try {
        await api(`/api/v1/tariffs/${t.id}`, { method: "PUT", body: JSON.stringify({ ...t, active: true }) });
        toast("✅ تم تفعيل التعريفة", "success");
        await load();
      } catch(err) { toast(err.message, "error"); }
    });
  });

  // ─── حذف ───
  document.querySelectorAll(".btn-del-tariff").forEach(btn => {
    btn.addEventListener("click", async () => {
      const t = tariffs.find(x => x.id === Number(btn.dataset.id));
      if (!confirm(`حذف التعريفة "${t?.name}"؟`)) return;
      try {
        await api(`/api/v1/tariffs/${btn.dataset.id}`, { method: "DELETE" });
        toast("🗑️ تم حذف التعريفة", "success");
        await load();
      } catch(err) { toast(err.message, "error"); }
    });
  });

  // ─── حفظ (إضافة أو تعديل) ───
  byId("tariff-form").addEventListener("submit", async e => {
    e.preventDefault();
    const id = byId("tf-id").value;
    const body = {
      name:           byId("tf-name").value.trim(),
      type:           byId("tf-type").value,
      monthlyFee:     Number(byId("tf-monthly").value),
      maintenanceFee: Number(byId("tf-maint").value),
      taxRate:        Number(byId("tf-tax").value),
      active:         byId("tf-active").checked,
      tiers:          readTiers()
    };
    if (!body.name) { toast("اسم التعريفة مطلوب", "error"); return; }
    if (!body.tiers.length) { toast("أضف شريحة واحدة على الأقل", "error"); return; }
    try {
      if (id) {
        await api(`/api/v1/tariffs/${id}`, { method: "PUT", body: JSON.stringify({ ...body, id: Number(id) }) });
        toast("✅ تم تحديث التعريفة (تُطبَّق على الفواتير الجديدة)", "success");
      } else {
        await api("/api/v1/tariffs", { method: "POST", body: JSON.stringify(body) });
        toast("✅ تم إضافة التعريفة", "success");
      }
      byId("tariff-form-wrap").style.display = "none";
      await load();
    } catch(err) { toast(err.message, "error"); }
  });
}

function renderReadings() {
  const readings  = state.data.meterReadings || [];
  const meters    = state.data.meters        || [];
  const customers = state.data.customers     || [];
  const users     = state.data.users         || [];
  const periods   = state.data.readingPeriods|| [];
  const sectors   = state.data.sectors       || [];
  const activePeriod = periods.find(p => p.status === "open") || null;

  const doneMeterIds = activePeriod
    ? readings.filter(r => r.periodId === activePeriod.id).map(r => r.meterId)
    : [];

  const totalMeters = meters.filter(m => m.status === 'active').length;
  const doneCount   = doneMeterIds.length;

  const currentUser = state.session;

  if (can('invoices.generate') ? "" : null !== null) {} // guard
  // ── Period banner ──
  let periodBanner = "";
  if (activePeriod) {
    const pct = totalMeters ? Math.round((doneCount / totalMeters) * 100) : 0;
    const allDone = doneCount >= totalMeters && totalMeters > 0;
    const suspCount = readings.filter(r => r.periodId === activePeriod.id && r.anomalyType && !r.anomalyResolved).length;
    const existingInvCount = (state.data.invoices||[]).filter(i => i.periodId === activePeriod.id && i.type === 'water').length;
    const billingPct = totalMeters > 0 ? Math.round((existingInvCount / totalMeters) * 100) : 0;

    // شريط تقدم الفوترة
    const billingBar = `<div style="margin-top:8px">`
      + `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">`
      + `<span>📄 الفوترة: <strong>${existingInvCount}</strong> / ${totalMeters} فاتورة</span>`
      + `<span style="font-weight:700;color:${billingPct===100?'#bbf7d0':'#fef3c7'}">${billingPct}%</span>`
      + `</div>`
      + `<div style="height:8px;background:rgba(255,255,255,.25);border-radius:4px;overflow:hidden">`
      + `<div style="width:${billingPct}%;background:${billingPct===100?'#4ade80':'#fbbf24'};height:100%;border-radius:4px;transition:.5s"></div>`
      + `</div>`
      + `</div>`;

    periodBanner =
      "<div class=\"period-banner\">" +
      "<div><span class=\"period-label\">📅 فترة: " + activePeriod.label + "</span>" +
      "<span style=\"margin-right:12px;font-size:12px\">" + activePeriod.startDate + " – " + activePeriod.endDate + "</span></div>" +
      "<div class=\"period-progress\">📊 " + doneCount + " / " + totalMeters + " عداد (" + pct + "%) — " +
        "<span style=\"background:rgba(255,255,255,.25);padding:2px 8px;border-radius:4px\">فترة مفتوحة</span>" +
        (suspCount ? " <span style=\"background:#fbbf24;color:#78350f;padding:2px 8px;border-radius:4px;margin-right:6px\">⚠️ " + suspCount + " قراءة مشكوكة</span>" : "") +
      "</div>" +
      "<div class=\"period-progress-bar\"><div style=\"width:" + pct + "%\"></div></div>" +
      billingBar +
      (can('invoices.generate') ? "<div style=\"margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center\">" +
        "<button class=\"action-button\" id=\"btn-generate-period-invoices\" " +
          (!allDone ? "style=\"opacity:.6;cursor:not-allowed\" disabled" : "") +
          " title=\"" + (!allDone ? 'لم تكتمل القراءات' : 'فوترة الفترة بالكامل') + "\">" +
          "💰 فوترة الفترة بالكامل</button>" +
        (suspCount > 0 ? "<button class=\"action-button\" id=\"btn-generate-force\" style=\"background:#d97706;color:#fff\" title=\"فوترة مع تخطي القراءات المشكوكة\">" +
          "⚡ فوترة مع تخطي المشكوكة (" + suspCount + ")</button>" : "") +
        (!allDone ? "<span style=\"font-size:12px;color:#fef3c7\">⛔ " + (totalMeters - doneCount) + " عداد لم يُقرأ بعد</span>" : "") +
        "</div>" : "") +
      "</div>";
  } else {
    periodBanner =
      "<div class=\"period-banner\" style=\"background:linear-gradient(90deg,#dc2626,#ef4444)\">" +
      "<div class=\"period-label\">⛔ لا توجد فترة مفتوحة</div>" +
      "<div style=\"font-size:12px\">اذهب إلى الإعدادات لفتح فترة جديدة</div>" +
      "</div>";
  }

  // ── Meter options for form: only meters that have an associated customer ──
  const customerById = new Map(customers.map(c => [c.id, c]));
  const metersWithCustomer = meters.filter(m => customerById.has(m.customerId));
  const meterOptions = metersWithCustomer.map(m => {
    const isDone = doneMeterIds.includes(m.id);
    const cust = customerById.get(m.customerId);
    const doneReading = isDone ? readings.find(r => r.meterId === m.id && r.periodId === activePeriod?.id) : null;
    const doneInfo = doneReading
      ? " ✔ سُجِّل بواسطة " + (doneReading.readerName || "?") + " في " + (doneReading.readingDate || "") : "";
    return "<option value=\"" + m.id + "\" data-last=\"" + m.lastReading + "\"" +
      (isDone ? " disabled style=\"color:#9ca3af\"" : "") + ">" +
      m.meterNumber + " – " + (m.customerName || cust?.fullName || "") +
      (isDone ? doneInfo : "") + "</option>";
  }).join("");

  const readerFieldHtml =
    "<input type=\"hidden\" name=\"readerId\" value=\"" + (currentUser?.id || "") + "\">" +
    "<div class=\"field\"><label>📟 القارئ</label>" +
    "<input value=\"" + esc(currentUser?.name || currentUser?.email || "") + "\" readonly " +
    "style=\"background:#f0fdf4;font-weight:700;color:#15803d;border-color:#86efac\"></div>";

  // ── Unique readers and sectors for filters ──
  const readerNames = [...new Set(readings.map(r => r.readerName || '').filter(Boolean))];
  const periodOpts = periods.slice().sort((a,b)=>b.id-a.id)
    .map(p=>'<option value="'+p.id+'">'+(p.label)+(p.status==='open'?' (مفتوحة)':'')+'</option>').join('');
  const sectorOpts = sectors.map(s=>'<option value="'+s.id+'">'+s.name+'</option>').join('');
  const readerOpts = readerNames.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('');

  byId("view-readings").innerHTML =
    periodBanner +
    "<div class=\"split\" style=\"margin-bottom:16px\">" +
    "<div class=\"form-panel\">" +
    "<h2>📊 إدخال قراءة ميدانية</h2>" +
    (activePeriod
      ? "<form id=\"reading-form\" class=\"form-grid\">" +
        "<div class=\"field\"><label>العداد</label>" +
        "<select name=\"meterId\" id=\"meter-sel\">" + meterOptions + "</select></div>" +
        readerFieldHtml +
        "<div class=\"field\"><label>القراءة السابقة</label><input name=\"previousReading\" id=\"prev-read\" readonly></div>" +
        "<div class=\"field\"><label>القراءة الحالية</label><input name=\"currentReading\" type=\"number\" min=\"0\" required></div>" +
        "<div class=\"field\"><label>تاريخ القراءة الميدانية</label>" +
        "<input name=\"readingDate\" type=\"date\" value=\"" + today() + "\" min=\"" + (activePeriod.startDate||'') + "\" max=\"" + (activePeriod.endDate||'') + "\"\">" +
        "</div>" +
        "<div class=\"field\"><label>ملاحظة</label><input name=\"notes\" placeholder=\"اختياري\"></div>" +
        "<div id=\"reading-dup-warn\" style=\"display:none;grid-column:1/-1;background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:10px 14px;font-size:13px;color:#92400e\">" +
        "⚠️ <strong>تحذير:</strong> هذا العداد سُجِّلت قراءته مسبقاً في الفترة الحالية. لا يمكن الإدخال مرتين.</div>" +
        "<div id=\"reading-preview\" style=\"display:none;grid-column:1/-1;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;font-size:13px\"></div>" +
        "<button type=\"submit\" id=\"reading-submit-btn\" class=\"action-button\" style=\"grid-column:1/-1;margin-top:6px\">📋 تسجيل القراءة</button>" +
        "</form>"
      : "<div style=\"padding:24px;text-align:center;color:var(--muted)\">⛔ لا يمكن إدخال قراءة خارج الفترة المفتوحة</div>"
    ) +
    "</div>" +
    "<section class=\"panel\"><h2>سير العمل</h2>" +
    "<div class=\"workflow\"><span>اختيار القطاع</span><span>مسح QR</span><span>إدخال القراءة</span>" +
    "<span>مراجعة التنبيهات</span><span>اعتماد</span><span>فوترة الفترة</span></div>" +
    "<div style=\"margin-top:12px;padding:10px;background:var(--card,#f8fafc);border-radius:8px;font-size:12px\">" +
    "<strong>تنبيه:</strong> الفواتير لا تُنشأ تلقائياً. بعد إدخال جميع القراءات وتأكيد القراءات المشكوكة، استخدم زر \"فوترة الفترة بالكامل\" أعلاه." +
    "</div></section></div>" +
    "<div class=\"section-toolbar\" style=\"flex-wrap:wrap;gap:8px\">" +
    "<input class=\"search-input\" id=\"readings-search\" placeholder=\"🔍 بحث في القراءات...\"/>" +
    "<select class=\"filter-select\" id=\"readings-period\"><option value=\"\">📅 كل الفترات</option>" + periodOpts + "</select>" +
    "<select class=\"filter-select\" id=\"readings-sector\"><option value=\"\">🗂️ كل القطاعات</option>" + sectorOpts + "</select>" +
    "<select class=\"filter-select\" id=\"readings-reader\"><option value=\"\">👤 كل القراء</option>" + readerOpts + "</select>" +
    "<select class=\"filter-select\" id=\"readings-anomaly\">" +
      "<option value=\"\">📋 كل الحالات</option>" +
      "<option value=\"none\">✅ سليمة</option>" +
      "<option value=\"suspicious\">⚠️ مشكوكة (غير مؤكدة)</option>" +
      "<option value=\"resolved\">✔️ مشكوكة مؤكدة</option>" +
      "<option value=\"high_consumption\">📈 استهلاك مرتفع</option>" +
      "<option value=\"invalid_reading\">❌ قراءة غير صحيحة</option>" +
    "</select>" +
    "<span class=\"badge\" id=\"readings-count\">" + readings.length + " قراءة</span></div>" +
    "<div id=\"readings-table-wrap\"></div>";

  // ── set default period filter to active period ──
  if (activePeriod && byId('readings-period')) byId('readings-period').value = String(activePeriod.id);

  if (activePeriod) {
    const mSel = byId("meter-sel");
    const dupWarn = byId("reading-dup-warn");
    const prevReadInp = byId("prev-read");
    const previewDiv = byId("reading-preview");
    const submitBtn = byId("reading-submit-btn");
    const currReadInp = byId('reading-form').querySelector('[name="currentReading"]');

    const checkDuplicate = () => {
      const mid = Number(mSel.value);
      const isDone = doneMeterIds.includes(mid);
      if (isDone) {
        dupWarn.style.display = "block";
        submitBtn.disabled = true; submitBtn.style.opacity = "0.5";
        const prev = readings.find(r => r.meterId === mid && r.periodId === activePeriod.id);
        if (prev) dupWarn.innerHTML = "⚠️ <strong>لا يمكن الإدخال مرتين:</strong> سجّل " +
          (prev.readerName||"?") + " قراءة " + prev.currentReading +
          " م³ بتاريخ " + prev.readingDate;
      } else {
        dupWarn.style.display = "none";
        submitBtn.disabled = false; submitBtn.style.opacity = "";
      }
      prevReadInp.value = mSel.selectedOptions[0]?.dataset.last || 0;
      updatePreview();
    };

    const updatePreview = () => {
      const prev = Number(prevReadInp.value || 0);
      const curr = Number(currReadInp?.value || 0);
      if (!curr) { previewDiv.style.display = 'none'; return; }
      const cons = curr - prev;
      let warning = '';
      if (curr < prev) warning = ' <span style="color:#dc2626">⚠️ قراءة أقل من السابقة — ستُوضع علامة مشكوكة</span>';
      else if (cons > 40) warning = ' <span style="color:#d97706">⚠️ استهلاك مرتفع — ستُوضع علامة مشكوكة</span>';
      previewDiv.style.display = 'block';
      previewDiv.innerHTML = 'الاستهلاك: <strong>' + cons.toFixed(2) + ' م³</strong>' + warning;
    };

    mSel.addEventListener("change", checkDuplicate);
    currReadInp?.addEventListener('input', updatePreview);
    checkDuplicate();

    byId("reading-form").addEventListener("submit", async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      body.meterId  = Number(body.meterId);
      body.readerId = Number(currentUser?.id || body.readerId || 0);
      body.previousReading = Number(body.previousReading);
      body.currentReading  = Number(body.currentReading);
      if (doneMeterIds.includes(body.meterId)) { toast("⛔ هذا العداد سُجِّل مسبقاً في الفترة الحالية", "error"); return; }
      body.readerName = currentUser?.name || currentUser?.email || "";
      try {
        const res = await api("/api/v1/meter-readings", { method: "POST", body: JSON.stringify(body) });
        const isSusp = res.alerts && res.alerts.length > 0;
        toast(isSusp
          ? "⚠️ تم تسجيل القراءة مع تنبيه: " + (res.alerts[0]?.message || "")
          : "✅ تم تسجيل القراءة",
          isSusp ? "warn" : "success");
        e.target.reset(); await load();
      } catch(err) { toast(err.message, "error"); }
    });

    // Bulk invoice generation button (normal + force)
    async function doGenerateInvoices(force) {
      const label = activePeriod.label;
      const confirmMsg = force
        ? `فوترة مع تخطي القراءات المشكوكة في فترة "${label}"؟\nالقراءات السالبة والمشكوكة غير المؤكدة ستُتخطى ولن تُفوتر.`
        : `إنشاء فواتير لجميع قراءات فترة "${label}"؟ سيتم إنشاء ${doneCount} فاتورة.`;
      if (!confirm(confirmMsg)) return;
      try {
        showLoading();
        const r = await api('/api/v1/reading-periods/' + activePeriod.id + '/generate-invoices', {
          method: 'POST', body: JSON.stringify({ force: force })
        });
        hideLoading();
        showBillingResult(r, label);
        await load();
      } catch(err) {
        hideLoading();
        // إذا طلب السيرفر القوة ولم يُرسل
        if (err.message && err.message.includes('force=true')) {
          if (confirm('⚠️ ' + err.message + '\n\nهل تريد المتابعة مع تخطي القراءات المشكوكة؟')) {
            await doGenerateInvoices(true);
          }
        } else {
          toast(err.message, 'error');
        }
      }
    }

    function showBillingResult(r, periodLabel) {
      const ex = byId('billing-result-modal'); if (ex) ex.remove();
      const created = r.created || 0;
      const skipped = r.skipped || 0;
      const total = created + skipped;
      const billingPctFinal = total > 0 ? Math.round((created / total) * 100) : 0;
      const skippedList = r.skippedList || [];

      // تفاصيل المتخطاة
      const skippedRows = skippedList.length
        ? skippedList.map(s => {
            const m = meters.find(x => x.id === s.meterId);
            const c = customers.find(x => x.id === (m?.customerId));
            return '<tr style="background:#fff7ed">'  
              + '<td style="font-size:11px">' + (m?.meterNumber || s.readingId) + '</td>'
              + '<td>' + (c?.fullName || '-') + '</td>'
              + '<td style="color:#ea580c;font-size:11px">' + (s.reason || '-') + '</td>'
              + '</tr>';
          }).join('')
        : '<tr><td colspan="3" style="text-align:center;color:var(--muted)">لا توجد تخطيات</td></tr>';

      const ov = document.createElement('div');
      ov.id = 'billing-result-modal';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;overflow-y:auto';
      ov.innerHTML = '<div style="background:var(--bg,#fff);border-radius:16px;max-width:580px;width:100%;margin:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.3);">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
          + '<h2 style="margin:0;font-size:17px">📊 نتيجة فوترة الفترة: ' + periodLabel + '</h2>'
          + '<button id="br-close" class="action-button" style="padding:4px 12px">✖ إغلاق</button>'
        + '</div>'
        // KPI شرائط
        + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">'
          + '<div style="background:#f0fdf4;border-radius:10px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:800;color:#16a34a">' + created + '</div><div style="font-size:12px;color:#64748b">✅ فاتورة أُنشئت</div></div>'
          + '<div style="background:' + (skipped > 0 ? '#fff7ed' : '#f8fafc') + ';border-radius:10px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:800;color:' + (skipped > 0 ? '#ea580c' : '#94a3b8') + '">' + skipped + '</div><div style="font-size:12px;color:#64748b">⏭️ تم تخطيها</div></div>'
          + '<div style="background:#eff6ff;border-radius:10px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:800;color:#2563eb">' + billingPctFinal + '%</div><div style="font-size:12px;color:#64748b">📊 نسبة الفوترة</div></div>'
        + '</div>'
        // شريط التقدم
        + '<div style="margin-bottom:16px">'
          + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>تقدم الفوترة</span><strong>' + billingPctFinal + '%</strong></div>'
          + '<div style="height:12px;background:#e5e7eb;border-radius:6px;overflow:hidden">'
            + '<div style="width:' + billingPctFinal + '%;background:' + (billingPctFinal === 100 ? '#16a34a' : '#f59e0b') + ';height:100%;border-radius:6px;transition:1s"></div>'
          + '</div>'
          + (billingPctFinal === 100 ? '<div style="text-align:center;color:#16a34a;font-weight:700;margin-top:6px;font-size:13px">🎉 تمت فوترة جميع القراءات بنجاح!</div>' : '')
        + '</div>'
        // جدول المتخطاة
        + (skipped > 0 ? '<div><div style="font-size:13px;font-weight:600;margin-bottom:6px;color:#ea580c">⏭️ القراءات المتخطاة:</div>'
          + '<div style="overflow-x:auto;max-height:200px;overflow-y:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
          + '<thead><tr style="background:#f8fafc"><th style="padding:6px;text-align:right">العداد</th><th>الزبون</th><th>السبب</th></tr></thead>'
          + '<tbody>' + skippedRows + '</tbody></table></div></div>' : '')
        + '</div>';

      ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
      document.body.appendChild(ov);
      byId('br-close').onclick = () => ov.remove();
    }

    const bulkBtn = byId('btn-generate-period-invoices');
    if (bulkBtn && !bulkBtn.disabled) {
      bulkBtn.addEventListener('click', () => doGenerateInvoices(false));
    }
    const forceBtn = byId('btn-generate-force');
    if (forceBtn) {
      forceBtn.addEventListener('click', () => doGenerateInvoices(true));
    }
  }

  const anomalyLabels={high_consumption:"استهلاك مرتفع",invalid_reading:"قراءة غير صحيحة",meter_not_active:"عداد غير فعّال"};

  function buildReadingsTable(list){
    if(!list.length) return '<p style="padding:16px;text-align:center;color:var(--muted)">لا توجد قراءات مطابقة</p>';
    return tbl(["العداد","الزبون","الفترة","القطاع","السابق","الحالي","الاستهلاك","تاريخ القراءة","القارئ","الحالة","مراجعة"],
      list.map(r=>{
        const m=meters.find(x=>x.id===r.meterId);
        const c=customers.find(x=>x.id===r.customerId);
        const sec=sectors.find(x=>x.id===c?.sectorId);
        const flagged=r.anomalyType && !r.anomalyResolved;
        let stateCell, rowStyle = '';
        if (!r.anomalyType) {
          stateCell = '<span class="badge success">✅ سليمة</span>';
        } else if (flagged) {
          stateCell = '<span class="badge warn" style="background:#fef3c7;color:#92400e;border:1px solid #fbbf24">⚠️ مشكوكة: '+(anomalyLabels[r.anomalyType]||r.anomalyType)+'</span>';
          rowStyle = ' style="background:rgba(251,191,36,.12);border-right:3px solid #f59e0b"';
        } else {
          stateCell = '<span class="badge info">✔️ مؤكدة</span>';
        }
        const reviewCell=(can('readings.review')||can('readings.edit'))
          ? '<button class="action-button btn-review-reading" data-id="'+r.id+'">'+(flagged?'🔎 مراجعة':'✏️ تعديل')+'</button>'
          : '-';
        return '<tr'+rowStyle+'><td>'+(m?m.meterNumber:'-')+'</td><td>'+(c?c.fullName:'-')+'</td>'+
          '<td><span class="badge info">'+(r.periodLabel||'-')+'</span></td>'+
          '<td>'+(sec?sec.name:'-')+'</td>'+
          '<td>'+r.previousReading+'</td><td>'+r.currentReading+'</td>'+
          '<td><strong>'+r.consumption+'</strong> م³</td>'+
          '<td>'+r.readingDate+'</td>'+
          '<td><span class="badge">'+(r.readerName||(users.find(u=>u.id===r.readerId)||{}).name||('#'+r.readerId))+'</span></td>'+
          '<td>'+stateCell+'</td>'+
          '<td>'+reviewCell+'</td></tr>';
      })
    );
  }

  function getReadingsFiltered(){
    const q=(byId("readings-search")?.value||"").toLowerCase();
    const a=byId("readings-anomaly")?.value||"";
    const pid=byId('readings-period')?.value||"";
    const sid=byId('readings-sector')?.value||"";
    const rdr=byId('readings-reader')?.value||"";
    let list=readings.slice().reverse();
    if(pid) list=list.filter(r=>String(r.periodId)===pid);
    if(sid) list=list.filter(r=>{ const c=customers.find(x=>x.id===r.customerId); return c&&String(c.sectorId)===sid; });
    if(rdr) list=list.filter(r=>r.readerName===rdr);
    if(a==="none") list=list.filter(r=>!r.anomalyType);
    else if(a==="suspicious") list=list.filter(r=>r.anomalyType&&!r.anomalyResolved);
    else if(a==="resolved") list=list.filter(r=>r.anomalyResolved);
    else if(a==="high_consumption") list=list.filter(r=>r.anomalyType==="high_consumption");
    else if(a==="invalid_reading") list=list.filter(r=>r.anomalyType==="invalid_reading");
    if(q) list=list.filter(r=>{
      const m=meters.find(x=>x.id===r.meterId); const c=customers.find(x=>x.id===r.customerId);
      return [(m?m.meterNumber:''),(c?c.fullName:''),(r.periodLabel||''),(r.readerName||'')].join(' ').toLowerCase().includes(q);
    });
    return list;
  }

  function applyReadingsFilters(){
    const list=getReadingsFiltered();
    byId("readings-table-wrap").innerHTML=buildReadingsTable(list);
    byId("readings-count").textContent=list.length+" قراءة";
    document.querySelectorAll(".btn-review-reading").forEach(b=>{ b.onclick=()=>openReadingReview(readings.find(r=>r.id===Number(b.dataset.id))); });
  }

  function openReadingReview(r){
    if(!r) return;
    const ex=byId("reading-rev-modal"); if(ex) ex.remove();
    const m=meters.find(x=>x.id===r.meterId)||{}; const c=customers.find(x=>x.id===r.customerId)||{};
    const ist='width:100%;padding:6px 8px;border:1px solid var(--border,#ccc);border-radius:6px;box-sizing:border-box';
    const ov=document.createElement('div'); ov.id='reading-rev-modal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    ov.innerHTML='<div style="background:var(--bg,#fff);border-radius:14px;max-width:460px;width:100%;max-height:90vh;overflow:auto;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3)">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0;font-size:16px">🔎 مراجعة قراءة العداد '+(m.meterNumber||'')+'</h3><button id="rv-close" class="action-button" style="padding:4px 10px">✖</button></div>'
      +'<div class="info-grid" style="margin-bottom:12px">'
        +'<div><span>الزبون</span><strong>'+(c.fullName||'-')+'</strong></div>'
        +'<div><span>الفترة</span><strong>'+(r.periodLabel||'-')+'</strong></div>'
        +'<div><span>القراءة السابقة</span><strong>'+r.previousReading+' م³</strong></div>'
        +'<div><span>الاستهلاك</span><strong>'+r.consumption+' م³</strong></div>'
        +(r.anomalyType?'<div style="grid-column:1/-1"><span>التنبيه</span><strong style="color:var(--school,#d97706)">'+(anomalyLabels[r.anomalyType]||r.anomalyType)+(r.anomalyResolved?' (مؤكَّد)':'')+'</strong></div>':'')
      +'</div>'
      +'<label style="display:block;margin-bottom:10px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">القراءة الحالية (للتعديل)</span><input id="rv-current" type="number" step="0.001" value="'+r.currentReading+'" style="'+ist+'"></label>'
      +'<label style="display:block;margin-bottom:8px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">ملاحظة</span><input id="rv-notes" value="'+esc(unesc(r.notes||''))+'" style="'+ist+'"></label>'
      +'<div id="rv-newcons" style="font-size:12px;color:var(--muted);margin-bottom:12px"></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
        +((r.anomalyType&&!r.anomalyResolved&&can('readings.review'))?'<button id="rv-confirm" class="action-button" style="flex:1;justify-content:center;background:#16a34a;color:#fff">✅ تأكيد القراءة كما هي</button>':'')
        +(can('readings.edit')?'<button id="rv-save" class="action-button" style="flex:1;justify-content:center">💾 حفظ التعديل</button>':'')
        +'<button id="rv-cancel" class="secondary-button" style="flex:1;justify-content:center">إلغاء</button>'
      +'</div></div>';
    ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); });
    document.body.appendChild(ov);
    const closeRv=()=>ov.remove();
    byId('rv-close').onclick=closeRv; byId('rv-cancel').onclick=closeRv;
    const upd=()=>{ const cur=parseFloat(byId('rv-current').value)||0; const cons=cur-r.previousReading; byId('rv-newcons').textContent='الاستهلاك بعد التعديل: '+cons.toFixed(2)+' م³'+(cons<0?' ⚠️ أقل من السابقة':(cons>40?' ⚠️ مرتفع':'')); };
    byId('rv-current').addEventListener('input',upd); upd();
    if(byId('rv-confirm')) byId('rv-confirm').onclick=async()=>{
      try{ await api('/api/v1/meter-readings/'+r.id+'/confirm',{method:'POST',body:'{}'}); toast('✅ تم تأكيد القراءة','success'); closeRv(); await load(); }
      catch(err){ toast(err.message,'error'); }
    };
    if(byId('rv-save')) byId('rv-save').onclick=async()=>{
      const payload={ currentReading:parseFloat(byId('rv-current').value)||0, notes:byId('rv-notes').value, resolve:true };
      try{ await api('/api/v1/meter-readings/'+r.id,{method:'PUT',body:JSON.stringify(payload)}); toast('✅ تم تعديل القراءة','success'); closeRv(); await load(); }
      catch(err){ toast(err.message,'error'); }
    };
  }
  byId("readings-search").addEventListener("input", applyReadingsFilters);
  byId("readings-anomaly").addEventListener("change", applyReadingsFilters);
  byId('readings-period')?.addEventListener('change', applyReadingsFilters);
  byId('readings-sector')?.addEventListener('change', applyReadingsFilters);
  byId('readings-reader')?.addEventListener('change', applyReadingsFilters);
  applyReadingsFilters();
}

/* Calcul unique du détail d'une facture (utilisé par l'impression unitaire ET groupée). */
function invoiceBreakdown(inv, tariffs) {
  const at = (tariffs||[]).find(t=>t.active) || (tariffs||[])[0] || {};
  const consumptionAmount = inv.consumptionAmount || 0;
  const monthlyFee     = inv.monthlyFee     ?? at.monthlyFee     ?? 0;
  const maintenanceFee = inv.maintenanceFee ?? at.maintenanceFee ?? 0;
  const subTotal = consumptionAmount + monthlyFee + maintenanceFee;
  const taxRate  = inv.taxRate != null ? inv.taxRate
    : (inv.taxAmount != null && subTotal > 0 ? inv.taxAmount / subTotal : (at.taxRate ?? 0));
  const taxAmount = inv.taxAmount != null ? inv.taxAmount : Math.round(subTotal * taxRate * 100) / 100;
  const total = inv.totalAmount != null ? inv.totalAmount : subTotal + taxAmount;
  return { consumptionAmount, monthlyFee, maintenanceFee, subTotal, taxRate, taxAmount, total };
}

function printModal(html) {
  const win = window.open("","_blank","width=860,height=640");
  if (!win || !win.document) {
    toast("تعذر فتح نافذة الطباعة — الرجاء السماح بالنوافذ المنبثقة","error");
    return;
  }
  win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head>
    <meta charset="utf-8"><title>طباعة</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:Arial,sans-serif;direction:rtl;padding:24px;color:#111;font-size:13px;}
      .print-invoice{max-width:720px;margin:auto;border:1px solid #ccc;padding:24px;border-radius:8px;}
      .print-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0077b6;padding-bottom:12px;margin-bottom:16px;}
      .print-logo{font-size:26px;font-weight:900;color:#0077b6;}
      .print-title{text-align:center;font-size:18px;font-weight:700;margin-bottom:12px;}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:14px;}
      .info-grid div{display:flex;justify-content:space-between;border-bottom:1px dashed #e5e7eb;padding:4px 0;}
      .info-grid span{color:#666;}
      .tier-table,table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px;}
      .tier-table th,thead th{background:#f0f9ff;padding:6px 8px;text-align:right;border:1px solid #e5e7eb;}
      .tier-table td,tbody td{padding:5px 8px;border-bottom:1px solid #e5e7eb;}
      .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#e5e7eb;color:#374151;}
      .badge.success{background:#dcfce7;color:#166534;}
      .badge.warn{background:#fef3c7;color:#92400e;}
      .badge.danger{background:#fee2e2;color:#991b1b;}
      .badge.info{background:#dbeafe;color:#1e40af;}
      .total-box{background:#f0f9ff;border-radius:6px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;}
      .total-box .amount{font-size:22px;font-weight:800;color:#0077b6;}
      .warning-box{background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px 16px;margin-bottom:14px;}
      .cut-box{background:#ffe4e4;border:2px solid #dc2626;border-radius:6px;padding:14px 18px;text-align:center;margin-bottom:14px;}
      .cut-box h2{color:#dc2626;margin-bottom:6px;}
      .footer{text-align:center;color:#888;font-size:11px;margin-top:16px;border-top:1px solid #e5e7eb;padding-top:10px;}
      @media print{body{padding:0;}.no-print{display:none;}}
    </style></head><body>
    ${html}
    <div class="no-print" style="text-align:center;margin-top:18px;">
      <button onclick="window.print()" style="padding:8px 24px;background:#0077b6;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;">🖨️ طباعة / حفظ PDF</button>
      <button onclick="window.close()" style="padding:8px 16px;margin-right:8px;background:#666;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;">✖ إغلاق</button>
    </div>
  </body></html>`);
  win.document.close();
}

function renderInvoices() {
  const invoices=state.data.invoices||[]; const payments=state.data.payments||[];
  const customers=state.data.customers||[]; const meters=state.data.meters||[];
  const periods=state.data.readingPeriods||[];
  const assoc=state.data.association||{};

  // قائمة الأشهر الفريدة من تواريخ الفواتير
  const monthSet=[...new Set(invoices.map(i=>(i.invoiceDate||"").slice(0,7)).filter(Boolean))].sort().reverse();
  const monthLabels={1:"يناير",2:"فبراير",3:"مارس",4:"أبريل",5:"ماي",6:"يونيو",
    7:"يوليوز",8:"غشت",9:"شتنبر",10:"أكتوبر",11:"نونبر",12:"دجنبر"};

  byId("view-invoices").innerHTML=`
    <div class="section-toolbar inv-filters-bar">
      <input class="search-input" id="inv-search" placeholder="🔍 بحث في الفواتير..."/>
      <select id="inv-filter-status" class="filter-select" title="فلترة بالحالة">
        <option value="">📋 كل الحالات</option>
        <option value="unpaid">⛔ غير مؤدى</option>
        <option value="partial">🔶 جزئي</option>
        <option value="paid">✅ مؤدى</option>
      </select>
      <button class="action-button" id="inv-csv">📥 تصدير CSV</button>
      <button class="action-button" id="inv-print-all">🖨️ طباعة الكل</button>
      <span class="badge" id="inv-count">${invoices.length} فاتورة</span>
    </div>
    <p style="color:var(--muted);font-size:13px;margin:4px 2px 10px">📅 اضغط على فترة لفتحها وعرض فواتيرها وملخّصها، ثم اضغط على فاتورة لإظهار الخيارات.</p>
    <div id="inv-acc-wrap">${buildPeriodsView(invoices)}</div>`;

  function buildInvTable(list){
    if(!list.length) return '<p style="padding:16px;color:var(--muted);text-align:center">لا توجد فواتير تطابق الفلتر</p>';
    const typeLabel = { connection:'\uD83D\uDD0C ربط', subscription:'\uD83D\uDCDD اشتراك', water:'\uD83D\uDCA7 ماء', onboarding:'\uD83D\uDD17 ربط+اشتراك' };
    return tbl(["رقم","النوع","الزبون","العداد","الاستهلاك","المبلغ","المؤدى","الباقي","الحالة","إجراءات"],
      list.map(function(inv){
        const cust=customers.find(function(c){return c.id===inv.customerId;});
        const mtr =meters.find(function(m){return m.id===inv.meterId;});
        const paid=payments.filter(function(p){return p.invoiceId===inv.id;}).reduce(function(s,p){return s+(p.amount||0);},0);
        const rem =Math.max(0,(inv.totalAmount||0)-paid);
        const invType = inv.type||'water';
        const typeSpan = '<span class="badge" style="font-size:11px">'+(typeLabel[invType]||invType)+'</span>';
        const remColor = rem>0 ? 'var(--danger)' : 'var(--success)';
        const actions = inv.status!=='paid'
          ? '<button class="action-button pay-btn" data-id="'+inv.id+'" data-rem="'+rem.toFixed(2)+'" title="تحصيل الأداء">\uD83D\uDCB0 \u0623\u062F\u0650\u0651</button> <button class="action-button btn-print-reminder" data-id="'+inv.id+'" title="طباعة تذكير">\uD83D\uDCE9</button>'
          : '<span style="color:var(--success)">\u2705</span>';
        return '<tr>'
          +'<td>'+inv.invoiceNumber+'</td>'
          +'<td>'+typeSpan+'</td>'
          +'<td>'+(cust ? cust.fullName : '-')+'</td>'
          +'<td>'+(mtr ? mtr.meterNumber : '-')+'</td>'
          +'<td>'+(inv.consumption||0)+' م³</td>'
          +'<td><strong>'+formatMoney(inv.totalAmount)+'</strong></td>'
          +'<td>'+formatMoney(paid)+'</td>'
          +'<td><strong style="color:'+remColor+'">'+formatMoney(rem)+'</strong></td>'
          +'<td>'+badge(inv.status)+'</td>'
          +'<td style="white-space:nowrap"><button class="action-button btn-print-inv" data-id="'+inv.id+'" title="طباعة الفاتورة">\uD83D\uDDA8\uFE0F</button> '+actions+'</td>'
          +'</tr>';
      })
    );
  }
  // فهارس مُسرّعة (مبنية كسولاً) لتفادي البحث المتكرر مع العدد الكبير للفواتير
  var _paid, _custMap, _meterMap, groupsCache, PAGE_SIZE = 80;
  function paidOf(id){ if(!_paid){ _paid=new Map(); payments.forEach(p=>_paid.set(p.invoiceId,(_paid.get(p.invoiceId)||0)+(p.amount||0))); } return _paid.get(id)||0; }
  function custOf(id){ if(!_custMap){ _custMap=new Map(); customers.forEach(c=>_custMap.set(c.id,c)); } return _custMap.get(id); }
  function meterOf(id){ if(!_meterMap){ _meterMap=new Map(); meters.forEach(m=>_meterMap.set(m.id,m)); } return _meterMap.get(id); }
  function invPaid(inv){ return paidOf(inv.id); }
  function invRem(inv){ return Math.max(0,(inv.totalAmount||0)-paidOf(inv.id)); }

  function buildInvRows(arr){
    if(!arr.length) return '<tr><td colspan="9" style="padding:14px;text-align:center;color:var(--muted)">لا توجد فواتير في هذه الفترة</td></tr>';
    const typeLabels={connection:'🔌 ربط',subscription:'📝 اشتراك',water:'💧 ماء',onboarding:'🔗 ربط+اشتراك'};
    return arr.map(inv=>{
      const cust=custOf(inv.customerId);
      const mtr=meterOf(inv.meterId);
      const rem=invRem(inv);
      const invType=inv.type||'water';
      return '<tr class="inv-row" data-id="'+inv.id+'" style="cursor:pointer" title="اضغط لعرض الخيارات">'
        +'<td>'+inv.invoiceNumber+'</td>'
        +'<td><span class="badge" style="font-size:11px">'+(typeLabels[invType]||invType)+'</span></td>'
        +'<td>'+(cust?cust.fullName:'-')+'</td>'
        +'<td>'+(mtr?mtr.meterNumber:'-')+'</td>'
        +'<td>'+(inv.consumption||0)+' م³</td>'
        +'<td><strong>'+formatMoney(inv.totalAmount)+'</strong></td>'
        +'<td><strong style="color:'+(rem>0?'var(--danger)':'var(--success)')+'">'+formatMoney(rem)+'</strong></td>'
        +'<td>'+badge(inv.status)+'</td>'
        +'<td><button class="action-button inv-opt" data-id="'+inv.id+'">⚙️ خيارات</button></td>'
        +'</tr>';
    }).join('');
  }

  // Construit uniquement les en-têtes de période + corps vide (rendu paresseux à l'ouverture)
  function buildPeriodsView(list){
    groupsCache=new Map();
    list.forEach(inv=>{ const k=inv.periodId?('p'+inv.periodId):'none'; if(!groupsCache.has(k)) groupsCache.set(k,[]); groupsCache.get(k).push(inv); });
    const ordered=periods.slice().sort((a,b)=>b.id-a.id);
    const card=(key,label,status)=>{
      const arr=groupsCache.get(key)||[];
      const total=arr.reduce((s,i)=>s+(i.totalAmount||0),0);
      const collected=arr.reduce((s,i)=>s+paidOf(i.id),0);
      const remaining=Math.max(0,total-collected);
      const unpaid=arr.filter(i=>i.status!=='paid').length;
      const stBadge=status?('<span class="badge '+(status==='open'?'success':'')+'" style="font-size:11px">'+(status==='open'?'مفتوحة':'مغلقة')+'</span>'):'';
      return '<div class="period-acc" style="border:1px solid var(--border,#e5e7eb);border-radius:10px;margin-bottom:10px;overflow:hidden">'
        +'<button type="button" class="period-head" data-key="'+key+'" style="width:100%;display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:space-between;padding:12px 14px;background:var(--card,#f8fafc);border:none;cursor:pointer;text-align:right;font-family:inherit">'
          +'<span style="font-weight:700;font-size:14px">📅 '+label+' '+stBadge+'</span>'
          +'<span style="font-size:12px;color:var(--muted)">'+arr.length+' فاتورة · إجمالي '+formatMoney(total)+' · محصّل '+formatMoney(collected)+' · متبقي <b style="color:var(--danger)">'+formatMoney(remaining)+'</b>'+(unpaid?' · '+unpaid+' غير مؤدى':'')+'</span>'
          +'<span class="ph-chevron" style="display:inline-block;transition:transform .2s">▾</span>'
        +'</button>'
        +'<div class="period-body" data-key="'+key+'" data-rendered="0" style="display:none;padding:6px 10px 12px;overflow-x:auto"></div>'
      +'</div>';
    };
    let html='';
    ordered.forEach(p=>{ html+=card('p'+p.id,p.label,p.status); });
    if((groupsCache.get('none')||[]).length) html+=card('none','فواتير الربط/الاشتراك (بدون فترة)',null);
    return html || '<p style="padding:16px;text-align:center;color:var(--muted)">لا توجد فواتير</p>';
  }

  // Rendu paresseux + pagination du corps d'une période
  function renderPeriodBody(body){
    const arr=groupsCache.get(body.dataset.key)||[];
    body._all=arr; body._shown=0;
    body.innerHTML='<table class="data-table" style="width:100%"><thead><tr><th>رقم</th><th>النوع</th><th>الزبون</th><th>العداد</th><th>الاستهلاك</th><th>المبلغ</th><th>الباقي</th><th>الحالة</th><th>خيارات</th></tr></thead><tbody class="inv-tbody"></tbody></table><div class="lm-wrap" style="text-align:center;margin-top:8px"></div>';
    appendRows(body);
  }
  function appendRows(body){
    const arr=body._all||[];
    const next=arr.slice(body._shown, body._shown+PAGE_SIZE);
    const tb=body.querySelector('.inv-tbody');
    tb.insertAdjacentHTML('beforeend', buildInvRows(next));
    body._shown+=next.length;
    const remn=arr.length-body._shown;
    const lm=body.querySelector('.lm-wrap');
    lm.innerHTML = remn>0
      ? '<button type="button" class="action-button lm-btn">⬇️ تحميل المزيد ('+remn+' متبقية)</button>'
      : (arr.length>PAGE_SIZE?'<span style="color:var(--muted);font-size:12px">عُرضت كل الفواتير ('+arr.length+')</span>':'');
    const lb=lm.querySelector('.lm-btn');
    if(lb) lb.onclick=()=>appendRows(body);
    wireRows(tb);
  }
  function wireRows(tb){
    tb.querySelectorAll('.inv-row').forEach(r=>{ if(r._w) return; r._w=true; r.onclick=()=>openInvOptions(invoices.find(i=>i.id===Number(r.dataset.id))); });
  }

  function getFilteredList(){
    const q=(byId("inv-search")?.value||"").toLowerCase();
    const st=byId("inv-filter-status")?.value||"";
    return invoices.filter(inv=>{
      if(st && inv.status!==st) return false;
      if(q){
        const cust=customers.find(c=>c.id===inv.customerId);
        const mtr=meters.find(m=>m.id===inv.meterId);
        const hay=[(inv.invoiceNumber||""),(cust?.fullName||""),(mtr?.meterNumber||"")].join(" ").toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function applyFilters(){
    const list=getFilteredList();
    byId("inv-acc-wrap").innerHTML=buildPeriodsView(list);
    byId("inv-count").textContent=list.length+" فاتورة";
    wirePage();
  }

  let _searchTimer=null;
  byId("inv-search").addEventListener("input",()=>{ clearTimeout(_searchTimer); _searchTimer=setTimeout(applyFilters,250); });
  byId("inv-filter-status").addEventListener("change",applyFilters);
  byId("inv-csv").addEventListener("click",()=>{const list=getFilteredList();
    csvDownload("invoices.csv",["رقم","الزبون","الفترة","شهر الاستهلاك","الاستهلاك","المبلغ","الحالة"],
    list.map(inv=>{const c=customers.find(x=>x.id===inv.customerId);
      const p=periods.find(x=>x.id===inv.periodId);
      return[inv.invoiceNumber,c?.fullName,p?.label||"-",(inv.invoiceDate||"").slice(0,7),inv.consumption,inv.totalAmount,inv.status];}),
    "🧾 الفواتير والتحصيل");
  });

  // ====== دوال الإجراءات ======
  function doPrintInvoice(inv){
    if(!inv) return;
    const cust=customers.find(c=>c.id===inv.customerId)||{};
    const mtr=meters.find(m=>m.id===inv.meterId)||{};
    const period=periods.find(p=>p.id===inv.periodId)||{};
    const paid=payments.filter(p=>p.invoiceId===inv.id).reduce((s,p)=>s+(p.amount||0),0);
    const rem=Math.max(0,(inv.totalAmount||0)-paid);
    // ─── فاتورة الربط والاشتراك المدمجة ───
    if (inv.type === 'onboarding') {
      const connFee = inv.connectionFee || 0;
      const subsFee = inv.subscriptionFee || 0;
      const total   = inv.totalAmount || (connFee + subsFee);
      printModal(`<div class="print-invoice">
        <div class="print-header">
          <div><div class="print-logo">💧 ${assoc.name||"الجمعية"}</div>
            <div style="font-size:12px;color:#666">${assoc.address||""}</div>
            <div style="font-size:12px;color:#666">${assoc.phone||""}</div>
          </div>
          <div style="text-align:left">
            <div style="font-size:11px;color:#888">رقم التسجيل: ${assoc.registrationNumber||"-"}</div>
            <div style="font-size:11px;color:#888">تاريخ الطباعة: ${(new Date()).toLocaleDateString("ar-MA")}</div>
          </div>
        </div>
        <div class="print-title" style="color:#0077b6">🔗 فاتورة الانخراط والربط</div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#1e40af">
          📋 هذه الفاتورة تتضمن مصاريف الربط بالشبكة ورسم الاشتراك الأولي. يجب تسديدها قبل تركيب العداد والدخول في الفوترة الشهرية.
        </div>
        <div class="info-grid">
          <div><span>رقم الفاتورة</span><strong>${inv.invoiceNumber}</strong></div>
          <div><span>الحالة</span><strong>${inv.status==="paid"?"✅ مؤدى":inv.status==="partial"?"🔶 جزئي":"⚠️ غير مؤدى"}</strong></div>
          <div><span>الزبون</span><strong>${cust.fullName||"-"}</strong></div>
          <div><span>رقم الاشتراك</span><strong>${cust.subscriptionNumber||cust.customerNumber||"-"}</strong></div>
          <div><span>تاريخ الفاتورة</span><strong>${(inv.invoiceDate||"").slice(0,10)||"-"}</strong></div>
          <div><span>تاريخ الاستحقاق</span><strong>${(inv.dueDate||"").slice(0,10)||"-"}</strong></div>
        </div>
        <table class="tier-table">
          <thead><tr><th>البيان</th><th>المبلغ</th></tr></thead>
          <tbody>
            <tr><td>🔌 مصاريف الربط بالشبكة</td><td><strong>${formatMoney(connFee)}</strong></td></tr>
            <tr><td>📝 رسم الاشتراك الأولي</td><td><strong>${formatMoney(subsFee)}</strong></td></tr>
            <tr style="font-weight:700;background:#f0f9ff"><td>المجموع</td><td>${formatMoney(total)}</td></tr>
            <tr style="color:#16a34a"><td>المبلغ المؤدى</td><td>${formatMoney(paid)}</td></tr>
            <tr style="color:${rem>0?"#dc2626":"#16a34a"};font-weight:700"><td>المبلغ المتبقي</td><td>${formatMoney(rem)}</td></tr>
          </tbody>
        </table>
        <div class="total-box"><div>المبلغ المستحق الأداء</div><div class="amount">${formatMoney(rem)}</div></div>
        <div class="footer">جمعية ${assoc.name||""} — ${assoc.phone||""} — ${assoc.email||""}</div>
      </div>`);
      return;
    }
    // ─── منطق الحساب المراجع (فاتورة الماء) — موحَّد عبر invoiceBreakdown ───
    const _bd = invoiceBreakdown(inv, state.data.tariffs);
    const consumAmt = _bd.consumptionAmount, monthlyFee = _bd.monthlyFee, maintFee = _bd.maintenanceFee;
    const subTotal  = _bd.subTotal, taxRate = _bd.taxRate, taxCalc = _bd.taxAmount, total = _bd.total;
    const periodLabel = period.label || (inv.invoiceDate||'').slice(0,7) || '-';
    const prevRead  = inv.previousReading ?? '-';
    const currRead  = inv.currentReading  ?? '-';
    printModal(`<div class="print-invoice">
      <div class="print-header">
        <div><div class="print-logo">💧 ${assoc.name||"الجمعية"}</div>
          <div style="font-size:12px;color:#666">${assoc.address||""}</div>
          <div style="font-size:12px;color:#666">${assoc.phone||""}</div>
        </div>
        <div style="text-align:left">
          <div style="font-size:11px;color:#888">رقم التسجيل: ${assoc.registrationNumber||"-"}</div>
          <div style="font-size:11px;color:#888">تاريخ الطباعة: ${(new Date()).toLocaleDateString("ar-MA")}</div>
        </div>
      </div>
      <div class="print-title">🧾 فاتورة استهلاك الماء</div>
      <div class="info-grid">
        <div><span>رقم الفاتورة</span><strong>${inv.invoiceNumber}</strong></div>
        <div><span>الحالة</span><strong>${inv.status==="paid"?"✅ مؤدى":inv.status==="partial"?"🔶 جزئي":"⚠️ غير مؤدى"}</strong></div>
        <div><span>الزبون</span><strong>${cust.fullName||"-"}</strong></div>
        <div><span>رقم العداد</span><strong>${mtr.meterNumber||"-"}</strong></div>
        <div><span>فترة الاستهلاك</span><strong>${periodLabel}</strong></div>
        <div><span>تاريخ الفاتورة</span><strong>${(inv.invoiceDate||inv.dueDate||"").slice(0,10)||"-"}</strong></div>
        <div><span>القراءة السابقة</span><strong>${prevRead} م³</strong></div>
        <div><span>القراءة الحالية</span><strong>${currRead} م³</strong></div>
        <div><span>الاستهلاك</span><strong>${inv.consumption||0} م³</strong></div>
        <div><span>تاريخ الاستحقاق</span><strong>${(inv.dueDate||"").slice(0,10)||"-"}</strong></div>
      </div>
      <table class="tier-table">
        <thead><tr><th>البيان</th><th>المبلغ</th></tr></thead>
        <tbody>
          <tr><td>مبلغ الاستهلاك (${inv.consumption||0} م³)</td><td>${formatMoney(consumAmt)}</td></tr>
          <tr><td>رسم الاشتراك الشهري</td><td>${formatMoney(monthlyFee)}</td></tr>
          <tr><td>رسم الصيانة</td><td>${formatMoney(maintFee)}</td></tr>
          <tr style="border-top:1px solid #ddd"><td>المجموع قبل الضريبة</td><td>${formatMoney(subTotal)}</td></tr>
          <tr><td>الضريبة (${Math.round(taxRate*100)}%)</td><td>${formatMoney(taxCalc)}</td></tr>
          <tr style="font-weight:700;background:#f8f9fa"><td>المبلغ الإجمالي</td><td>${formatMoney(total)}</td></tr>
          <tr style="color:#16a34a"><td>المبلغ المؤدى</td><td>${formatMoney(paid)}</td></tr>
          <tr style="color:${rem>0?"#dc2626":"#16a34a"};font-weight:700"><td>المبلغ المتبقي</td><td>${formatMoney(rem)}</td></tr>
        </tbody>
      </table>
      <div class="total-box"><div>المبلغ المستحق الأداء</div><div class="amount">${formatMoney(rem)}</div></div>
      <div class="footer">جمعية ${assoc.name||""} — ${assoc.phone||""} — ${assoc.email||""}</div>
    </div>`);
  }

  function doPrintReminder(inv){
    if(!inv) return;
    const cust=customers.find(c=>c.id===inv.customerId)||{};
    const period=periods.find(p=>p.id===inv.periodId)||{};
    const allCustInv=invoices.filter(i=>i.customerId===inv.customerId && i.status!=='paid');
    const unpaidMonths=allCustInv.length;
    const totalUnpaid=allCustInv.reduce((s,i)=>{
      const p=payments.filter(x=>x.invoiceId===i.id).reduce((a,x)=>a+(x.amount||0),0);
      return s+Math.max(0,(i.totalAmount||0)-p);
    },0);
    const paid=payments.filter(p=>p.invoiceId===inv.id).reduce((s,p)=>s+(p.amount||0),0);
    const rem=Math.max(0,(inv.totalAmount||0)-paid);
    const periodLabel=period.label||(inv.invoiceDate||'').slice(0,7)||'-';
    const overdueClass=unpaidMonths>1?'color:#dc2626;font-weight:700':'color:#92400e';
    printModal(`<div class="print-invoice">
      <div class="print-header">
        <div><div class="print-logo">💧 ${assoc.name||"الجمعية"}</div>
          <div style="font-size:12px;color:#666">${assoc.address||""}</div>
        </div>
        <div style="text-align:left">
          <div style="font-size:11px;color:#888">${(new Date()).toLocaleDateString("ar-MA")}</div>
        </div>
      </div>
      <div class="warning-box">
        <strong>📩 إشعار تذكير بالأداء</strong><br>
        <p style="margin-top:6px">السيد/ة <strong>${cust.fullName||"-"}</strong>،</p>
        <p style="margin-top:6px">نذكركم بضرورة تسوية مستحقاتكم المتعلقة بفاتورة رقم
        <strong>${inv.invoiceNumber}</strong> عن فترة <strong>${periodLabel}</strong>،
        البالغ المتبقي منها <strong style="color:#dc2626">${formatMoney(rem)}</strong>،
        وذلك في أقرب وقت ممكن لتفادي القطع عن الخدمة.</p>
        ${unpaidMonths>1?`<p style="margin-top:8px;${overdueClass}">
          ⚠️ تنبيه: لديكم <strong>${unpaidMonths} شهر</strong> غير مؤدى بمجموع
          <strong>${formatMoney(totalUnpaid)}</strong> د.م.
        </p>`:""}
      </div>
      <div class="info-grid">
        <div><span>رقم الفاتورة</span><strong>${inv.invoiceNumber}</strong></div>
        <div><span>فترة الاستهلاك</span><strong>${periodLabel}</strong></div>
        <div><span>المبلغ الإجمالي</span><strong>${formatMoney(inv.totalAmount)}</strong></div>
        <div><span>المؤدى</span><strong style="color:#16a34a">${formatMoney(paid)}</strong></div>
        <div><span>المتبقي للفاتورة</span><strong style="color:#dc2626">${formatMoney(rem)}</strong></div>
        <div><span>تاريخ الاستحقاق</span><strong>${(inv.dueDate||"").slice(0,10)||"-"}</strong></div>
        ${unpaidMonths>1?`
        <div style="grid-column:1/-1;background:#fef3c7;border-radius:6px;padding:8px">
          <span>إجمالي الأشهر غير المؤداة</span>
          <strong style="${overdueClass}">${unpaidMonths} شهر — ${formatMoney(totalUnpaid)}</strong>
        </div>`:""}
      </div>
      <p style="margin-top:12px;font-size:12px;color:#555">يرجى أداء المبلغ في مكتب الجمعية أو عبر الحساب البنكي المعتمد.</p>
      <div class="footer">جمعية ${assoc.name||""} — ${assoc.phone||""} — ${assoc.email||""}</div>
    </div>`);
  }

  function buildPrintHtml(list){
    return list.map(inv=>{
      const cust=customers.find(c=>c.id===inv.customerId)||{};
      const mtr=meters.find(m=>m.id===inv.meterId)||{};
      const period=periods.find(p=>p.id===inv.periodId)||{};
      const paid=payments.filter(p=>p.invoiceId===inv.id).reduce((s,p)=>s+(p.amount||0),0);
      const rem=Math.max(0,(inv.totalAmount||0)-paid);
      const periodLabel=period.label||(inv.invoiceDate||'').slice(0,7)||'-';
      const _bd2=invoiceBreakdown(inv, state.data.tariffs);
      const consumAmt=_bd2.consumptionAmount, monthlyFee=_bd2.monthlyFee,
            maintFee=_bd2.maintenanceFee, taxCalc=_bd2.taxAmount;
      return `<div class="print-invoice" style="page-break-after:always;margin-bottom:20px;">
        <div class="print-header">
          <div><div class="print-logo">💧 ${assoc.name||""}</div>
            <div style="font-size:11px;color:#666">${assoc.address||""}</div>
          </div>
          <div style="text-align:left">
            <div style="font-size:11px;color:#888">${(new Date()).toLocaleDateString("ar-MA")}</div>
          </div>
        </div>
        <div class="print-title">فاتورة رقم ${inv.invoiceNumber} — ${cust.fullName||"-"}</div>
        <div class="info-grid">
          <div><span>فترة الاستهلاك</span><strong>${periodLabel}</strong></div>
          <div><span>رقم العداد</span><strong>${mtr.meterNumber||"-"}</strong></div>
          <div><span>القراءة السابقة</span><strong>${inv.previousReading??'-'} م³</strong></div>
          <div><span>القراءة الحالية</span><strong>${inv.currentReading??'-'} م³</strong></div>
          <div><span>الاستهلاك</span><strong>${inv.consumption||0} م³</strong></div>
          <div><span>الحالة</span><strong>${badge(inv.status)}</strong></div>
        </div>
        <table class="tier-table" style="margin:8px 0">
          <thead><tr><th>البيان</th><th>المبلغ</th></tr></thead>
          <tbody>
            <tr><td>مبلغ الاستهلاك</td><td>${formatMoney(consumAmt)}</td></tr>
            <tr><td>رسم الاشتراك</td><td>${formatMoney(monthlyFee)}</td></tr>
            <tr><td>رسم الصيانة</td><td>${formatMoney(maintFee)}</td></tr>
            <tr><td>الضريبة</td><td>${formatMoney(taxCalc)}</td></tr>
            <tr style="font-weight:700"><td>الإجمالي</td><td>${formatMoney(inv.totalAmount)}</td></tr>
            <tr style="color:#16a34a"><td>المؤدى</td><td>${formatMoney(paid)}</td></tr>
            <tr style="color:${rem>0?"#dc2626":"#16a34a"};font-weight:700"><td>المتبقي</td><td>${formatMoney(rem)}</td></tr>
          </tbody>
        </table>
        <div class="total-box"><div>المستحق</div><div class="amount">${formatMoney(rem)}</div></div>
      </div>`;
    }).join("");
  }

  function doPrintAll(){
    // ── نافذة اختيار الفترة والحالة قبل الطباعة ──
    const ex=document.getElementById('print-all-modal'); if(ex) ex.remove();
    const ist='width:100%;padding:7px 10px;border:1px solid var(--border,#ccc);border-radius:7px;box-sizing:border-box;font-family:inherit;font-size:13px';
    const periodsOrdered=periods.slice().sort((a,b)=>b.id-a.id);
    const periodOpts=periodsOrdered.map(p=>`<option value="${p.id}">${p.label}${p.status==='open'?' (مفتوحة)':''}</option>`).join('');
    const ov=document.createElement('div');
    ov.id='print-all-modal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    ov.innerHTML=`
      <div style="background:var(--bg,#fff);border-radius:14px;max-width:420px;width:100%;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;font-size:16px">🖨️ طباعة الفواتير</h3>
          <button id="pam-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted)">✕</button>
        </div>
        <label style="display:block;margin-bottom:12px">
          <span style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px">📅 الفترة</span>
          <select id="pam-period" style="${ist}">
            <option value="">كل الفترات</option>
            ${periodOpts}
          </select>
        </label>
        <label style="display:block;margin-bottom:12px">
          <span style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px">📋 حالة الفاتورة</span>
          <select id="pam-status" style="${ist}">
            <option value="">كل الحالات</option>
            <option value="unpaid">⛔ غير مؤدى</option>
            <option value="partial">🔶 مؤدى جزئياً</option>
            <option value="paid">✅ مؤدى بالكامل</option>
          </select>
        </label>
        <div id="pam-count" style="background:var(--card,#f8fafc);border-radius:7px;padding:8px 12px;font-size:13px;color:var(--muted);margin-bottom:14px;text-align:center">
          — اختر الفترة لمعرفة عدد الفواتير —
        </div>
        <div style="display:flex;gap:8px">
          <button id="pam-confirm" class="action-button" style="flex:1;justify-content:center">🖨️ طباعة</button>
          <button id="pam-cancel" class="secondary-button" style="flex:1;justify-content:center">إلغاء</button>
        </div>
      </div>`;
    ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); });
    document.body.appendChild(ov);

    function getPamFiltered(){
      const pid=byId('pam-period').value;
      const st=byId('pam-status').value;
      return invoices.filter(inv=>{
        if(pid && String(inv.periodId)!==pid) return false;
        if(st && inv.status!==st) return false;
        return true;
      });
    }
    function updateCount(){
      const list=getPamFiltered();
      const total=list.reduce((s,i)=>s+(i.totalAmount||0),0);
      const collected=list.reduce((s,i)=>s+paidOf(i.id),0);
      const rem=Math.max(0,total-collected);
      const pid=byId('pam-period').value;
      const pLabel=pid ? (periods.find(p=>String(p.id)===pid)?.label||'') : 'كل الفترات';
      byId('pam-count').innerHTML=
        `<strong>${list.length}</strong> فاتورة · فترة: <strong>${pLabel}</strong><br>`+
        `إجمالي: <strong>${formatMoney(total)}</strong> · محصّل: <strong style="color:var(--success,#16a34a)">${formatMoney(collected)}</strong> · متبقي: <strong style="color:var(--danger,#dc2626)">${formatMoney(rem)}</strong>`;
    }

    byId('pam-period').addEventListener('change', updateCount);
    byId('pam-status').addEventListener('change', updateCount);
    updateCount();

    byId('pam-close').onclick=()=>ov.remove();
    byId('pam-cancel').onclick=()=>ov.remove();
    byId('pam-confirm').onclick=()=>{
      const list=getPamFiltered();
      if(!list.length){ toast('لا توجد فواتير للطباعة','warn'); return; }
      ov.remove();
      const html=buildPrintHtml(list);
      if(!html) return;
      // ترويسة ملخص الفترة في أول الصفحة
      const pid=byId('pam-period')?.value || '';
      const pLabel=pid ? (periods.find(p=>String(p.id)===pid)?.label||'') : 'كل الفترات';
      const st=byId('pam-status')?.value || '';
      const stLabel={'':'كل الحالات',unpaid:'غير مؤدى',partial:'جزئي',paid:'مؤدى'}[st]||st;
      const total=list.reduce((s,i)=>s+(i.totalAmount||0),0);
      const collected=list.reduce((s,i)=>s+paidOf(i.id),0);
      const cover=`<div class="print-invoice" style="page-break-after:always;margin-bottom:20px;text-align:center">
        <div class="print-logo" style="font-size:28px;margin-bottom:8px">💧 ${assoc.name||''}</div>
        <div style="font-size:13px;color:#666;margin-bottom:16px">${assoc.address||''} — ${assoc.phone||''}</div>
        <div class="print-title" style="font-size:20px">🖨️ كشف طباعة الفواتير</div>
        <div style="margin:16px auto;max-width:320px;text-align:right">
          <div class="info-grid">
            <div><span>الفترة</span><strong>${pLabel}</strong></div>
            <div><span>الحالة</span><strong>${stLabel}</strong></div>
            <div><span>عدد الفواتير</span><strong>${list.length}</strong></div>
            <div><span>تاريخ الطباعة</span><strong>${new Date().toLocaleDateString('ar-MA')}</strong></div>
            <div><span>الإجمالي</span><strong>${formatMoney(total)}</strong></div>
            <div><span>المحصّل</span><strong style="color:#16a34a">${formatMoney(collected)}</strong></div>
            <div style="grid-column:1/-1"><span>المتبقي</span><strong style="color:#dc2626">${formatMoney(Math.max(0,total-collected))}</strong></div>
          </div>
        </div>
        <div class="footer">جمعية ${assoc.name||''} — ${assoc.phone||''} — ${assoc.email||''}</div>
      </div>`;
      printModal(cover+html);
    };
  }

  async function doCollect(inv){
    if(!inv) return;
    const rem=invRem(inv);
    if(rem<=0){ toast("الفاتورة مؤداة بالكامل","success"); return; }
    const amount=prompt(`المبلغ المؤدى (المتبقي: ${rem.toFixed(2)} د.م):`,rem.toFixed(2));
    if(amount===null||amount==="") return;
    const val=parseFloat(String(amount).replace(",","."));
    if(!Number.isFinite(val)||val<=0){ toast("⛔ مبلغ غير صالح","error"); return; }
    if(val>rem+0.005){ toast("⛔ المبلغ أكبر من المتبقي ("+rem.toFixed(2)+" د.م)","error"); return; }
    try{
      await api("/api/v1/payments/collect",{method:"POST",body:JSON.stringify({invoiceId:inv.id,amount:val,method:"cash"})});
      toast("✅ تم تسجيل الأداء","success"); closeInvModal(); await load();
    }catch(err){toast(err.message,"error");}
  }

  async function doDisconnect(inv){
    if(!inv) return;
    const reason=prompt("سبب القطع:","فواتير غير مؤداة");
    if(reason===null) return;
    try{
      await api("/api/v1/disconnections",{method:"POST",body:JSON.stringify({customerId:inv.customerId,reason})});
      toast("🔌 تم تسجيل أمر القطع","success"); closeInvModal(); await load();
    }catch(err){toast(err.message,"error");}
  }

  async function doReconnect(inv){
    if(!inv) return;
    const disc=(state.data.disconnections||[]).find(d=>d.customerId===inv.customerId && d.status==='disconnected');
    if(!disc){ toast("لا يوجد أمر قطع نشط لهذا الزبون","error"); return; }
    try{
      await api(`/api/v1/disconnections/${disc.id}/reconnect`,{method:"POST",body:"{}"});
      toast("♻️ تم إرجاع الخدمة","success"); closeInvModal(); await load();
    }catch(err){toast(err.message,"error");}
  }

  async function doDeleteInvoice(inv){
    if(!inv) return;
    if(!confirm('حذف الفاتورة '+inv.invoiceNumber+'؟ سيُحذف معها الأداءات والديون المرتبطة بها. لا يمكن التراجع.')) return;
    try{
      const r=await api('/api/v1/invoices/'+inv.id,{method:'DELETE'});
      toast('🗑️ تم حذف الفاتورة'+(r&&r.removedPayments?(' و'+r.removedPayments+' أداء مرتبط'):''),'success');
      closeInvModal(); await load();
    }catch(err){toast(err.message,'error');}
  }

  function openInvEdit(inv){
    if(!inv) return;
    closeInvModal();
    const isOnb=inv.type==='onboarding';
    const ist='width:100%;padding:6px 8px;border:1px solid var(--border,#ccc);border-radius:6px;box-sizing:border-box';
    const numInput=(id,val)=>'<input id="'+id+'" type="number" step="0.01" value="'+(val??0)+'" style="'+ist+'">';
    const rowf=(label,inputHtml)=>'<label style="display:block;margin-bottom:10px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">'+label+'</span>'+inputHtml+'</label>';
    const dueVal=(inv.dueDate||'').slice(0,10);
    let bodyHtml=rowf('تاريخ الاستحقاق','<input id="ie-due" type="date" value="'+dueVal+'" style="'+ist+'">');
    if(isOnb){
      bodyHtml+=rowf('مصاريف الربط (د.م)',numInput('ie-conn',inv.connectionFee));
      bodyHtml+=rowf('رسم الاشتراك (د.م)',numInput('ie-subs',inv.subscriptionFee));
    } else {
      bodyHtml+=rowf('مبلغ الاستهلاك (د.م)',numInput('ie-cons',inv.consumptionAmount));
      bodyHtml+=rowf('الاشتراك الشهري (د.م)',numInput('ie-month',inv.monthlyFee));
      bodyHtml+=rowf('رسم الصيانة (د.م)',numInput('ie-maint',inv.maintenanceFee));
      bodyHtml+=rowf('الضريبة (د.م)',numInput('ie-tax',inv.taxAmount));
    }
    const statuses=[['unpaid','غير مؤدى'],['partial','جزئي'],['paid','مؤدى'],['overdue','متأخر'],['cancelled','ملغاة']];
    bodyHtml+=rowf('الحالة','<select id="ie-status" style="'+ist+'">'+statuses.map(s=>'<option value="'+s[0]+'"'+(inv.status===s[0]?' selected':'')+'>'+s[1]+'</option>').join('')+'</select>');
    const overlay=document.createElement('div');
    overlay.id='inv-opt-modal';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    overlay.innerHTML='<div style="background:var(--bg,#fff);border-radius:14px;max-width:460px;width:100%;max-height:90vh;overflow:auto;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3)">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0;font-size:16px">✏️ تعديل فاتورة '+inv.invoiceNumber+'</h3><button id="ie-close" class="action-button" style="padding:4px 10px">✖</button></div>'
      +bodyHtml
      +'<div style="background:var(--card,#f8fafc);border-radius:8px;padding:10px;margin:8px 0;display:flex;justify-content:space-between"><span>المجموع المحسوب</span><strong id="ie-total">-</strong></div>'
      +'<div style="font-size:11px;color:var(--muted);margin-bottom:8px">ملاحظة: تتحدّث الحالة تلقائياً حسب المبلغ المؤدى عند الحفظ.</div>'
      +'<div style="display:flex;gap:8px"><button id="ie-save" class="action-button" style="flex:1;justify-content:center">💾 حفظ</button><button id="ie-cancel" class="secondary-button" style="flex:1;justify-content:center">إلغاء</button></div>'
      +'</div>';
    overlay.addEventListener('click',e=>{ if(e.target===overlay) closeInvModal(); });
    document.body.appendChild(overlay);
    const g=id=>byId(id)?byId(id).value:'';
    function recompute(){
      const total=isOnb
        ? (parseFloat(g('ie-conn'))||0)+(parseFloat(g('ie-subs'))||0)
        : (parseFloat(g('ie-cons'))||0)+(parseFloat(g('ie-month'))||0)+(parseFloat(g('ie-maint'))||0)+(parseFloat(g('ie-tax'))||0);
      byId('ie-total').textContent=formatMoney(Number(total.toFixed(2)));
    }
    ['ie-conn','ie-subs','ie-cons','ie-month','ie-maint','ie-tax'].forEach(id=>{ const el=byId(id); if(el) el.addEventListener('input',recompute); });
    recompute();
    byId('ie-close').onclick=closeInvModal;
    byId('ie-cancel').onclick=closeInvModal;
    byId('ie-save').onclick=async()=>{
      const payload=isOnb
        ? { dueDate:g('ie-due'), connectionFee:parseFloat(g('ie-conn'))||0, subscriptionFee:parseFloat(g('ie-subs'))||0, status:g('ie-status') }
        : { dueDate:g('ie-due'), consumptionAmount:parseFloat(g('ie-cons'))||0, monthlyFee:parseFloat(g('ie-month'))||0, maintenanceFee:parseFloat(g('ie-maint'))||0, taxAmount:parseFloat(g('ie-tax'))||0, status:g('ie-status') };
      try{
        const result = await api('/api/v1/invoices/'+inv.id,{method:'PUT',body:JSON.stringify(payload)});
        if (result.avoir) {
          toast('✅ تم تحديث الفاتورة — تم إنشاء رصيد دائن (Avoir) '+result.avoir.invoiceNumber+' بمبلغ '+formatMoney(result.avoir.creditAmount),'success');
        } else {
          toast('✅ تم تحديث الفاتورة','success');
        }
        closeInvModal(); await load();
      }catch(err){toast(err.message,'error');}
    };
  }

  function closeInvModal(){ const m=byId("inv-opt-modal"); if(m) m.remove(); }

  function openInvOptions(inv){
    if(!inv) return;
    closeInvModal();
    const cust=customers.find(c=>c.id===inv.customerId)||{};
    const mtr=meters.find(m=>m.id===inv.meterId)||{};
    const period=periods.find(p=>p.id===inv.periodId)||{};
    const paid=invPaid(inv); const rem=invRem(inv);
    const payHist=payments.filter(p=>p.invoiceId===inv.id);
    const isDisc=cust.status==='disconnected';
    // Customer credits
    const custCredits=(state.data.customerCredits||[]).filter(c=>c.customerId===inv.customerId&&c.remainingAmount>0);
    const totalCredit=custCredits.reduce((s,c)=>s+(c.remainingAmount||0),0);
    const creditHtml=totalCredit>0
      ? '<div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#166534">'
        +'💚 <strong>رصيد دائن متاح: '+formatMoney(totalCredit)+'</strong> — سيُستخدم تلقائياً عند الفوترة القادمة.</div>'
      : '';
    const btns=[];
    btns.push('<button class="action-button" id="io-print" style="justify-content:center">🖨️ طباعة الفاتورة</button>');
    if(can('payments.collect') && inv.status!=='paid') btns.push('<button class="action-button" id="io-pay" style="justify-content:center">💰 تحصيل أداء</button>');
    if(inv.status!=='paid' && (can('notifications.send')||can('debts.manage')||can('debts.view'))) btns.push('<button class="action-button" id="io-remind" style="justify-content:center">📩 تذكير بالأداء</button>');
    if(can('disconnections.manage')){
      if(isDisc) btns.push('<button class="action-button" id="io-recon" style="justify-content:center;background:#16a34a;color:#fff">♻️ إرجاع الخدمة</button>');
      else btns.push('<button class="danger-button" id="io-disc" style="justify-content:center">🔌 قطع الخدمة</button>');
    }
    if(can('invoices.edit')) btns.push('<button class="action-button" id="io-edit" style="justify-content:center">✏️ تعديل الفاتورة</button>');
    if(can('invoices.delete')) btns.push('<button class="danger-button" id="io-del" style="justify-content:center">🗑️ حذف الفاتورة</button>');
    const histRows = payHist.length
      ? payHist.map(p=>'<tr><td>'+((p.paymentDate||'').slice(0,10)||'-')+'</td><td>'+formatMoney(p.amount)+'</td><td>'+(p.method||p.paymentMethod||'-')+'</td></tr>').join('')
      : '<tr><td colspan="3" style="text-align:center;color:var(--muted)">لا توجد أداءات بعد</td></tr>';
    const overlay=document.createElement('div');
    overlay.id='inv-opt-modal';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    overlay.innerHTML='<div id="inv-opt-card" style="background:var(--bg,#fff);color:inherit;border-radius:14px;max-width:540px;width:100%;max-height:90vh;overflow:auto;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3)">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0;font-size:16px">🧾 فاتورة '+inv.invoiceNumber+'</h3><button id="io-close" class="action-button" style="padding:4px 10px">✖</button></div>'
      +creditHtml
      +'<div class="info-grid" style="margin-bottom:14px">'
        +'<div><span>الزبون</span><strong>'+(cust.fullName||'-')+'</strong></div>'
        +'<div><span>العداد</span><strong>'+(mtr.meterNumber||'-')+'</strong></div>'
        +'<div><span>الفترة</span><strong>'+(period.label||'-')+'</strong></div>'
        +'<div><span>الحالة</span><strong>'+badge(inv.status)+'</strong></div>'
        +'<div><span>الإجمالي</span><strong>'+formatMoney(inv.totalAmount)+'</strong></div>'
        +'<div><span>المؤدى</span><strong style="color:#16a34a">'+formatMoney(paid)+'</strong></div>'
        +'<div><span>المتبقي</span><strong style="color:var(--danger)">'+formatMoney(rem)+'</strong></div>'
        +(isDisc?'<div><span>الخدمة</span><strong style="color:var(--danger)">مقطوعة</strong></div>':'')
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'+btns.join('')+'</div>'
      +'<div style="font-size:13px;color:var(--muted);margin-bottom:4px">سجل الأداءات</div>'
      +'<table class="data-table" style="width:100%"><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th></tr></thead><tbody>'+histRows+'</tbody></table>'
      +'</div>';
    overlay.addEventListener('click',e=>{ if(e.target===overlay) closeInvModal(); });
    document.body.appendChild(overlay);
    byId('io-close').onclick=closeInvModal;
    const b=id=>byId(id);
    if(b('io-print')) b('io-print').onclick=()=>{ closeInvModal(); doPrintInvoice(inv); };
    if(b('io-pay')) b('io-pay').onclick=()=>doCollect(inv);
    if(b('io-remind')) b('io-remind').onclick=()=>{ closeInvModal(); doPrintReminder(inv); };
    if(b('io-disc')) b('io-disc').onclick=()=>doDisconnect(inv);
    if(b('io-recon')) b('io-recon').onclick=()=>doReconnect(inv);
    if(b('io-edit')) b('io-edit').onclick=()=>openInvEdit(inv);
    if(b('io-del')) b('io-del').onclick=()=>doDeleteInvoice(inv);
  }

  function wirePage(){
    document.querySelectorAll('.period-head').forEach(h=>{
      h.onclick=()=>{
        const body=h.nextElementSibling;
        const chev=h.querySelector('.ph-chevron');
        const open=body.style.display!=='none';
        if(open){ body.style.display='none'; if(chev) chev.style.transform=''; return; }
        body.style.display='';
        if(chev) chev.style.transform='rotate(180deg)';
        // Rendu paresseux: ne construire les lignes qu'à la première ouverture
        if(body.dataset.rendered==='0'){ renderPeriodBody(body); body.dataset.rendered='1'; }
      };
    });
  }

  byId("inv-print-all").addEventListener("click",doPrintAll);
  wirePage();
}
function renderDebts() {
  const debts=state.data.debts||[];
  const disconnections=state.data.disconnections||[];
  const assoc=state.data.association||{};

  byId("view-debts").innerHTML=`
    <div class="kpi-band" style="margin-bottom:16px">
      <div class="kpi-card warn"><div class="kpi-value">${debts.length}</div><div class="kpi-label">مدين نشط</div></div>
      <div class="kpi-card danger"><div class="kpi-value">${debts.reduce((s,d)=>s+(d.amount||0),0).toFixed(0)}</div><div class="kpi-label">مجموع الديون (د.م)</div></div>
      <div class="kpi-card info"><div class="kpi-value">${disconnections.length}</div><div class="kpi-label">أوامر القطع</div></div>
      <div class="kpi-card danger"><div class="kpi-value">${disconnections.filter(d=>d.status==="disconnected").length}</div><div class="kpi-label">مفصولون حالياً</div></div>
    </div>
    <div class="section-toolbar">
      <input class="search-input" id="debt-search" placeholder="🔍 بحث في المتأخرات..."/>
      <button class="action-button" id="btn-reminders">📲 تذكير WhatsApp</button>
      <button class="action-button" id="btn-print-debts">🖨️ طباعة كشف الديون</button>
      <button class="action-button" id="debt-csv">📥 CSV</button>
    </div>
    <h3 style="margin:0 0 8px">⚠️ المتأخرات</h3>
    ${tbl(["الزبون","الهاتف","المبلغ","الاستحقاق","الحالة","إجراء"],
      debts.map(d=>{
        const over=new Date(d.dueDate)<new Date();
        return "<tr><td>"+safe(d.customerName)+"</td><td>"+safe(d.phone)+"</td>"
          +"<td><strong>"+formatMoney(d.amount)+"</strong></td>"
          +"<td>"+(d.dueDate?d.dueDate.slice(0,10):"-")+"</td>"
          +"<td><span class=\"badge "+(over?"danger":"warn")+"\">"+(over?"متأخر":"جارٍ")+"</span></td>"
          +"<td style=\"white-space:nowrap\">"
          +"<button class=\"action-button btn-disc\" data-id=\""+d.id+"\" data-cid=\""+d.customerId+"\">✂️ قطع</button> "
          +"<button class=\"action-button btn-print-cutnotice\" data-id=\""+d.id+"\">🖨️ إشعار</button>"
          +"</td></tr>";
      })
    )}
    <h3 style="margin:18px 0 8px">🔌 أوامر القطع</h3>
    ${tbl(["الزبون","تاريخ القطع","السبب","الحالة","إجراء"],
      disconnections.map(d=>{
        const reBtn=d.status!=="reconnected"
          ?"<button class=\"action-button btn-reconnect\" data-id=\""+d.id+"\">🔌 إعادة الوصل</button>"
          :"<span class=\"badge success\">✅ معاد</span>";
        return "<tr>"
          +"<td>"+safe(d.customerName||d.customerId)+"</td>"
          +"<td>"+(d.disconnectedAt||d.disconnectionDate||"").slice(0,10)+"</td>"
          +"<td>"+safe(d.reason)+"</td>"
          +"<td>"+badge(d.status)+"</td>"
          +"<td style=\"white-space:nowrap\">"+reBtn
          +" <button class=\"action-button btn-print-disc\" data-id=\""+d.id+"\">🖨️</button>"
          +"</td></tr>";
      })
    )}`;

  byId("debt-search").addEventListener("input",filterTable("view-debts"));

  byId("debt-csv").addEventListener("click",()=>csvDownload("debts.csv",
    ["الزبون","الهاتف","المبلغ","الاستحقاق","الحالة"],
    debts.map(d=>[d.customerName,d.phone,d.amount,d.dueDate,d.status]),
    "⚠️ الديون والقطع"));

  byId("btn-reminders").addEventListener("click",async()=>{
    try{
      const r=await api("/api/v1/debts/send-reminders",{method:"POST",body:"{}"});
      toast("📲 تم إرسال "+(r.created||0)+" تذكير","success");
    }catch(err){toast(err.message,"error");}
  });

  byId("btn-print-debts").addEventListener("click",()=>{
    const rows=debts.map(d=>"<tr><td>"+safe(d.customerName)+"</td><td>"+safe(d.phone)+"</td>"
      +"<td><strong>"+formatMoney(d.amount)+"</strong></td>"
      +"<td>"+(d.dueDate||"").slice(0,10)+"</td>"
      +"<td>"+(new Date(d.dueDate)<new Date()?"متأخر":"جارٍ")+"</td></tr>").join("");
    const assocName=assoc.name||"";
    const dateNow=(new Date()).toLocaleDateString("ar-MA");
    const total=formatMoney(debts.reduce((s,d)=>s+(d.amount||0),0));
    printModal("<div class=\"print-invoice\">"
      +"<div class=\"print-header\"><div class=\"print-logo\">💧 "+assocName+"</div>"
      +"<div style=\"font-size:11px;color:#888\">"+dateNow+"</div></div>"
      +"<div class=\"print-title\">📋 كشف المتأخرات والديون</div>"
      +"<table class=\"tier-table\"><thead><tr><th>الزبون</th><th>الهاتف</th><th>المبلغ</th><th>الاستحقاق</th><th>الحالة</th></tr></thead>"
      +"<tbody>"+rows+"</tbody></table>"
      +"<div class=\"total-box\"><div>مجموع الديون</div><div class=\"amount\">"+total+"</div></div>"
      +"<div class=\"footer\">جمعية "+assocName+" — "+dateNow+"</div></div>");
  });

  document.querySelectorAll(".btn-print-cutnotice").forEach(btn=>btn.addEventListener("click",()=>{
    const d=debts.find(x=>x.id===Number(btn.dataset.id)); if(!d) return;
    const assocName=assoc.name||"الجمعية";
    const dateNow=(new Date()).toLocaleDateString("ar-MA");
    printModal("<div class=\"print-invoice\">"
      +"<div class=\"print-header\"><div class=\"print-logo\">💧 "+assocName+"</div>"
      +"<div style=\"font-size:11px;color:#888\">"+dateNow+"</div></div>"
      +"<div class=\"cut-box\"><h2>⚠️ إشعار بقطع الخدمة</h2>"
      +"<p>في حالة عدم التسديد خلال 15 يوماً سيتم قطع خدمة الماء</p></div>"
      +"<p>السيد/ة <strong>"+safe(d.customerName||"-")+"</strong> — الهاتف: <strong>"+safe(d.phone||"-")+"</strong></p>"
      +"<div class=\"info-grid\" style=\"margin-top:10px\">"
      +"<div><span>المبلغ المستحق</span><strong style=\"color:#dc2626\">"+formatMoney(d.amount)+"</strong></div>"
      +"<div><span>تاريخ الاستحقاق</span><strong>"+(d.dueDate||"").slice(0,10)+"</strong></div></div>"
      +"<p style=\"margin-top:12px;font-size:12px\">لتفادي القطع يرجى أداء المبلغ المتأخر في أقرب وقت ممكن بمكتب الجمعية.</p>"
      +"<div class=\"footer\">جمعية "+assocName+" — "+(assoc.phone||"")+" — "+(assoc.email||"")+"</div></div>");
  }));

  document.querySelectorAll(".btn-print-disc").forEach(btn=>btn.addEventListener("click",()=>{
    const d=disconnections.find(x=>x.id===Number(btn.dataset.id)); if(!d) return;
    const assocName=assoc.name||"الجمعية";
    const dateNow=(new Date()).toLocaleDateString("ar-MA");
    printModal("<div class=\"print-invoice\">"
      +"<div class=\"print-header\"><div class=\"print-logo\">💧 "+assocName+"</div>"
      +"<div style=\"font-size:11px;color:#888\">"+dateNow+"</div></div>"
      +"<div class=\"cut-box\"><h2>🔌 وثيقة قطع الخدمة</h2><p>تم قطع خدمة الماء عن المشترك التالي</p></div>"
      +"<div class=\"info-grid\" style=\"margin-top:10px\">"
      +"<div><span>المشترك</span><strong>"+(d.customerName||d.customerId)+"</strong></div>"
      +"<div><span>تاريخ القطع</span><strong>"+(d.disconnectedAt||"").slice(0,10)+"</strong></div>"
      +"<div><span>السبب</span><strong>"+(d.reason||"-")+"</strong></div>"
      +"<div><span>رسم إعادة الوصل</span><strong>"+formatMoney(d.reconnectionFee||50)+"</strong></div>"
      +"<div><span>الحالة</span><strong>"+(d.status==="reconnected"?"✅ معاد الوصل":"❌ مقطوع")+"</strong></div>"
      +(d.reconnectedAt?"<div><span>تاريخ الإعادة</span><strong>"+d.reconnectedAt.slice(0,10)+"</strong></div>":"")
      +"</div>"
      +"<p style=\"margin-top:12px;font-size:12px\">لإعادة الوصل يرجى أداء رسم إعادة التوصيل بمكتب الجمعية.</p>"
      +"<div class=\"footer\">جمعية "+assocName+" — "+(assoc.phone||"")+" — "+(assoc.email||"")+"</div></div>");
  }));

  document.querySelectorAll(".btn-disc").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      const reason=prompt("سبب القطع:","فواتير غير مؤداة"); if(reason===null) return;
      try{await api("/api/v1/disconnections",{method:"POST",body:JSON.stringify({customerId:Number(btn.dataset.cid),reason})});
        toast("تم تسجيل أمر القطع","warn"); await load();
      }catch(err){toast(err.message,"error");}
    });
  });

  document.querySelectorAll(".btn-reconnect").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      if(!confirm("تأكيد إعادة الوصل؟")) return;
      try{await api("/api/v1/disconnections/"+btn.dataset.id+"/reconnect",{method:"POST",body:"{}"});
        toast("✅ تم إعادة الوصل","success"); await load();
      }catch(err){toast(err.message,"error");}
    });
  });
}
function renderMaintenance() {
  const repairs=state.data.repairs||[];
  const SLBL={"open":"🔴 مفتوح","in_progress":"🟡 جارٍ","closed":"✅ مغلق","resolved":"✅ تم الإصلاح"};
  byId("view-maintenance").innerHTML=`
    <div class="form-panel" style="margin-bottom:16px">
      <h2>🔧 تسجيل عطب جديد</h2>
      <form id="repair-form" class="form-grid">
        <div class="field"><label>النوع</label>
          <select name="type">
            <option value="leak">تسرب مياه</option><option value="meter">عطل عداد</option>
            <option value="network">عطل شبكة</option><option value="pump">عطل مضخة</option><option value="other">أخرى</option>
          </select>
        </div>
        <div class="field"><label>الموقع</label><input name="location" required></div>
        <div class="field"><label>الوصف</label><input name="description"></div>
        <div class="field"><label>الأولوية</label>
          <select name="priority">
            <option value="low">منخفضة</option><option value="medium" selected>متوسطة</option>
            <option value="high">عالية</option><option value="critical">حرجة</option>
          </select>
        </div>
        <div class="field"><label>المكلف بالإصلاح</label><input name="assignedTo" placeholder="اسم التقني"></div>
        <button type="submit" class="action-button" style="grid-column:1/-1;margin-top:6px">➕ تسجيل</button>
      </form>
    </div>
    <div class="section-toolbar">
      <input class="search-input" id="repair-search" placeholder="🔍 بحث في الأعطاب..."/>
      <span class="badge ${repairs.filter(r=>r.status!=="closed"&&r.status!=="resolved").length>0?"warn":"success"}">
        ${repairs.filter(r=>r.status!=="closed"&&r.status!=="resolved").length} عطب نشط
      </span>
    </div>
    ${tbl(["النوع","الموقع","الأولوية","الحالة","التاريخ","المكلف","إجراء"],
      repairs.map(r=>`<tr>
        <td>${safe(r.type)}</td><td>${safe(r.location||r.description)}</td>
        <td><span class="badge ${r.priority==="critical"?"danger":r.priority==="high"?"warn":""}">${safe(r.priority)}</span></td>
        <td><span class="badge ${r.status==="closed"||r.status==="resolved"?"success":r.status==="in_progress"?"warn":"danger"}">${SLBL[r.status]||r.status}</span></td>
        <td>${(r.reportedAt||"").slice(0,10)||"-"}</td><td>${safe(r.assignedTo)}</td>
        <td>
          ${r.status!=="closed"&&r.status!=="resolved"
            ?`<button class="action-button btn-close-repair" data-id="${r.id}">✅ إغلاق</button>`:""}
          <button class="del-btn danger-button" data-res="repairs" data-id="${r.id}">🗑️</button>
        </td>
      </tr>`)
    )}`;
  byId("repair-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    body.reportedAt=new Date().toISOString(); body.status="open";
    try{await api("/api/v1/repairs",{method:"POST",body:JSON.stringify(body)});
      toast("تم تسجيل العطب","success"); e.target.reset(); await load();
    }catch(err){toast(err.message,"error");}
  });
  byId("repair-search").addEventListener("input",filterTable("view-maintenance"));
  document.querySelectorAll(".btn-close-repair").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      try{await api(`/api/v1/repairs/${btn.dataset.id}`,{method:"PUT",body:JSON.stringify({status:"closed"})});
        toast("تم إغلاق العطب","success"); await load();
      }catch(err){toast(err.message,"error");}
    });
  });
  attachDeleteHandlers();
}

function renderTransport() {
  const students=state.data.students||[]; const buses=state.data.buses||[];
  const routes=state.data.routes||[]; const subs=state.data.transportSubscriptions||[];
  byId("view-transport").innerHTML=`
    <div class="kpi-band" style="margin-bottom:16px">
      <div class="kpi-card info"><div class="kpi-value">${students.length}</div><div class="kpi-label">👦 تلاميذ</div></div>
      <div class="kpi-card success"><div class="kpi-value">${buses.length}</div><div class="kpi-label">🚌 حافلات</div></div>
      <div class="kpi-card success"><div class="kpi-value">${routes.length}</div><div class="kpi-label">🗺️ مسارات</div></div>
      <div class="kpi-card warn"><div class="kpi-value">${subs.filter(s=>s.status==="unpaid").length}</div><div class="kpi-label">اشتراكات غير مؤداة</div></div>
    </div>
    <div class="form-panel" style="margin-bottom:16px">
      <h2>➕ إضافة تلميذ</h2>
      <form id="student-form" class="form-grid">
        <div class="field"><label>الاسم الكامل</label><input name="fullName" required></div>
        <div class="field"><label>المؤسسة التعليمية</label><input name="schoolName" required></div>
        <div class="field"><label>المستوى الدراسي</label><input name="gradeLevel"></div>
        <div class="field"><label>ولي الأمر</label><input name="guardianName"></div>
        <div class="field"><label>هاتف ولي الأمر</label><input name="guardianPhone"></div>
        <div class="field"><label>الدوار / القرية</label><input name="village"></div>
        <button type="submit" class="action-button" style="grid-column:1/-1;margin-top:6px">➕ إضافة</button>
      </form>
    </div>
    <div class="section-toolbar">
      <input class="search-input" id="transport-search" placeholder="🔍 بحث في التلاميذ..."/>
    </div>
    <div class="split">
      <section class="panel">
        <h2>التلاميذ</h2>
        ${tbl(["رقم التسجيل","الاسم","المؤسسة","المستوى","ولي الأمر","الهاتف","الحالة"],
          students.map(s=>`<tr>
            <td>${s.registrationNumber}</td><td>${s.fullName}</td><td>${s.schoolName}</td>
            <td>${s.gradeLevel}</td><td>${safe(s.guardianName)}</td><td>${safe(s.guardianPhone)}</td>
            <td>${badge(s.status)}</td>
          </tr>`)
        )}
      </section>
      <section class="panel">
        <h2>الحافلات والمسارات</h2>
        ${tbl(["الحافلة","السائق","المساعد","السعة","المسار","التوقيت"],
          routes.map(route=>{const bus=buses.find(b=>b.id===route.busId);return`<tr>
            <td>${bus?.busNumber||"-"}</td><td>${bus?.driver||"-"}</td><td>${bus?.assistant||"-"}</td>
            <td>${bus?.capacity||"-"}</td><td>${route.startPoint} ← ${route.endPoint}</td><td>${route.scheduleTime}</td>
          </tr>`;})
        )}
      </section>
    </div>`;
  byId("student-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    body.status="active"; body.registrationNumber="STU-"+Date.now();
    try{await api("/api/v1/students",{method:"POST",body:JSON.stringify(body)});
      toast("تمت إضافة التلميذ","success"); e.target.reset(); await load();
    }catch(err){toast(err.message,"error");}
  });
  byId("transport-search").addEventListener("input",filterTable("view-transport"));
}

function renderHr() {
  const employees=state.data.employees||[]; const att=state.data.attendances||[];
  byId("view-hr").innerHTML=`
    <div class="form-panel" style="margin-bottom:16px">
      <h2>➕ إضافة موظف</h2>
      <form id="employee-form" class="form-grid">
        <div class="field"><label>الاسم الكامل</label><input name="fullName" required></div>
        <div class="field"><label>المنصب</label><input name="jobTitle" required></div>
        <div class="field"><label>الهاتف</label><input name="phone"></div>
        <div class="field"><label>الراتب</label><input name="salary" type="number" value="2500"></div>
        <button type="submit" class="action-button" style="grid-column:1/-1;margin-top:6px">➕ إضافة</button>
      </form>
    </div>
    <div class="split">
      <section class="panel">
        <h2>الموظفون</h2>
        ${tbl(["الاسم","المهمة","الهاتف","الراتب","الحالة","إجراء"],
          employees.map(e=>`<tr>
            <td>${e.fullName}</td><td>${e.jobTitle}</td><td>${safe(e.phone)}</td>
            <td>${formatMoney(e.salary)}</td><td>${badge(e.status)}</td>
            <td><button class="del-btn danger-button" data-res="employees" data-id="${e.id}">🗑️</button></td>
          </tr>`)
        )}
      </section>
      <section class="panel">
        <h2>الحضور</h2>
        ${tbl(["الموظف","التاريخ","الحالة","ملاحظة"],
          att.map(a=>{const emp=employees.find(e=>e.id===a.employeeId);return`<tr>
            <td>${emp?.fullName||a.employeeId}</td><td>${a.date}</td><td>${badge(a.status)}</td><td>${safe(a.notes)}</td>
          </tr>`;})
        )}
      </section>
    </div>`;
  byId("employee-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    body.salary=Number(body.salary); body.status="active";
    try{await api("/api/v1/employees",{method:"POST",body:JSON.stringify(body)});
      toast("تمت إضافة الموظف","success"); e.target.reset(); await load();
    }catch(err){toast(err.message,"error");}
  });
  attachDeleteHandlers();
}

function renderAccounting() {
  const revenues=state.data.revenues||[]; const expenses=state.data.expenses||[];
  const d=state.data.dashboard;
  const totalSal=(state.data.employees||[]).reduce((s,e)=>s+(e.salary||0),0);
  byId("view-accounting").innerHTML=`
    <div class="kpi-band" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
      <div class="kpi-card success"><div class="kpi-value">${formatMoney(d.revenue)}</div><div class="kpi-label">💰 المداخيل</div></div>
      <div class="kpi-card danger"><div class="kpi-value">${formatMoney(d.expenses)}</div><div class="kpi-label">💸 المصاريف</div></div>
      <div class="kpi-card ${d.netBalance>=0?"success":"danger"}"><div class="kpi-value">${formatMoney(d.netBalance)}</div><div class="kpi-label">⚖️ الرصيد</div></div>
      <div class="kpi-card info"><div class="kpi-value">${formatMoney(totalSal)}</div><div class="kpi-label">👤 الأجور الشهرية</div></div>
    </div>
    <div class="split" style="margin-bottom:16px">
      <div class="form-panel">
        <h2>➕ تسجيل مداخل</h2>
        <form id="revenue-form" class="form-grid">
          <div class="field"><label>المصدر</label>
            <select name="source">
              <option value="water_invoice">فاتورة ماء</option><option value="transport">نقل مدرسي</option>
              <option value="grant">منحة</option><option value="other">أخرى</option>
            </select>
          </div>
          <div class="field"><label>المبلغ</label><input name="amount" type="number" step="0.01" required></div>
          <div class="field"><label>التاريخ</label><input name="revenueDate" type="date" value="${today()}"></div>
          <div class="field"><label>الوصف</label><input name="description"></div>
          <button type="submit" class="action-button" style="grid-column:1/-1;margin-top:6px">➕ تسجيل</button>
        </form>
      </div>
      <div class="form-panel">
        <h2>➕ تسجيل مصروف</h2>
        <form id="expense-form" class="form-grid">
          <div class="field"><label>الصنف</label>
            <select name="category">
              <option value="fuel">وقود</option><option value="electricity">كهرباء</option>
              <option value="salary">أجر</option><option value="maintenance">صيانة</option>
              <option value="supplies">لوازم</option><option value="other">أخرى</option>
            </select>
          </div>
          <div class="field"><label>المبلغ</label><input name="amount" type="number" step="0.01" required></div>
          <div class="field"><label>التاريخ</label><input name="expenseDate" type="date" value="${today()}"></div>
          <div class="field"><label>الوصف</label><input name="description"></div>
          <button type="submit" class="action-button danger-button" style="grid-column:1/-1;margin-top:6px">➕ تسجيل</button>
        </form>
      </div>
    </div>
    <div class="split">
      <section class="panel">
        <div class="panel-header"><h2>المداخيل</h2><button class="action-button" id="rev-csv">📥 CSV</button></div>
        ${tbl(["المصدر","المبلغ","التاريخ","الوصف"],
          revenues.slice().reverse().map(r=>`<tr><td>${r.source}</td><td><strong>${formatMoney(r.amount)}</strong></td><td>${r.revenueDate}</td><td>${safe(r.description)}</td></tr>`)
        )}
      </section>
      <section class="panel">
        <div class="panel-header"><h2>المصاريف</h2><button class="action-button" id="exp-csv">📥 CSV</button></div>
        ${tbl(["الصنف","المبلغ","التاريخ","الوصف"],
          expenses.slice().reverse().map(e=>`<tr><td>${e.category}</td><td><strong>${formatMoney(e.amount)}</strong></td><td>${e.expenseDate}</td><td>${safe(e.description)}</td></tr>`)
        )}
      </section>
    </div>`;
  byId("revenue-form").addEventListener("submit",async e=>{
    e.preventDefault(); const body=Object.fromEntries(new FormData(e.target)); body.amount=parseFloat(body.amount);
    try{await api("/api/v1/revenues",{method:"POST",body:JSON.stringify(body)});toast("تم تسجيل المداخل","success");e.target.reset();await load();}
    catch(err){toast(err.message,"error");}
  });
  byId("expense-form").addEventListener("submit",async e=>{
    e.preventDefault(); const body=Object.fromEntries(new FormData(e.target)); body.amount=parseFloat(body.amount);
    try{await api("/api/v1/expenses",{method:"POST",body:JSON.stringify(body)});toast("تم تسجيل المصروف","success");e.target.reset();await load();}
    catch(err){toast(err.message,"error");}
  });
  byId("rev-csv").addEventListener("click",()=>csvDownload("revenues.csv",["المصدر","المبلغ","التاريخ","الوصف"],revenues.map(r=>[r.source,r.amount,r.revenueDate,r.description]),"📥 المداخيل"));
  byId("exp-csv").addEventListener("click",()=>csvDownload("expenses.csv",["الصنف","المبلغ","التاريخ","الوصف"],expenses.map(e=>[e.category,e.amount,e.expenseDate,e.description]),"📤 المصاريف"));
}

function renderReports() {
  const now = new Date();
  let rYear  = now.getFullYear();
  let rMonth = now.getMonth() + 1;
  let rTab   = "summary";

  function pad(n){ return String(n).padStart(2,"0"); }
  function fmt(n){ return Number(n||0).toLocaleString("ar-MA",{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function statusBadge(s){
    const map={paid:"badge-paid",unpaid:"badge-unpaid",overdue:"badge-overdue",open:"badge-open",escalated:"badge-escalated",partial:"badge-partial"};
    const labels={paid:"مؤدى",unpaid:"غير مؤدى",overdue:"متأخر",open:"مفتوح",escalated:"متصاعد",partial:"جزئي"};
    return `<span class="rpt-badge ${map[s]||''}">${labels[s]||s}</span>`;
  }

  function buildBar(value, max, color){
    const pct = max ? Math.min(100, Math.round((value/max)*100)) : 0;
    return `<div class="rpt-bar-wrap"><div class="rpt-bar" style="width:${pct}%;background:${color}"></div><span>${pct}%</span></div>`;
  }

  async function loadAndRender(){
    const el = byId("view-reports");
    el.innerHTML = `<div class="rpt-loading">⏳ جارٍ التحميل…</div>`;
    let data;
    try{ data = await api(`/api/v1/reports/monthly?year=${rYear}&month=${rMonth}`); }
    catch(e){ el.innerHTML=`<div class="rpt-error">❌ ${e.message}</div>`; return; }

    const {monthlyAgg=[], current={}, summary={}, monthLabel=""} = data;
    const months = ["","يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليوز","غشت","شتنبر","أكتوبر","نونبر","دجنبر"];
    const maxInv  = Math.max(1,...monthlyAgg.map(m=>m.invoicesTotal));
    const maxExp  = Math.max(1,...monthlyAgg.map(m=>m.expensesTotal));
    const maxRev  = Math.max(1,...monthlyAgg.map(m=>m.revenuesTotal));
    const maxCons = Math.max(1,...monthlyAgg.map(m=>m.consumption));

    /* ---- KPI Cards ---- */
    const kpis = [
      {icon:"🧾",label:"إجمالي الفواتير",value:`${fmt(summary.invoicesTotal)} د.م.`,sub:`${summary.invoicesCount||0} فاتورة`},
      {icon:"✅",label:"المبالغ المؤداة",value:`${fmt(summary.paidTotal)} د.م.`,sub:"هذا الشهر"},
      {icon:"⚠️",label:"المتأخرات",value:`${fmt(summary.unpaidTotal)} د.م.`,sub:`${summary.debtsCount||0} دين`},
      {icon:"💧",label:"الاستهلاك",value:`${summary.consumption||0} م³`,sub:`${summary.readingsCount||0} قراءة`},
      {icon:"📤",label:"المصاريف",value:`${fmt(summary.expensesTotal)} د.م.`,sub:"هذا الشهر"},
      {icon:"💰",label:"الرصيد الصافي",value:`${fmt(summary.netBalance)} د.م.`,sub:summary.netBalance>=0?"إيجابي":"سلبي"},
    ];

    /* ---- Yearly bar chart rows ---- */
    const chartRows = monthlyAgg.map(m=>`
      <tr class="rpt-chart-row${m.month===rMonth?' rpt-current-month':''}">
        <td class="rpt-month-lbl">${months[m.month]}</td>
        <td>${buildBar(m.invoicesTotal,maxInv,"#3b82f6")}</td>
        <td>${buildBar(m.revenuesTotal,maxRev,"#10b981")}</td>
        <td>${buildBar(m.expensesTotal,maxExp,"#ef4444")}</td>
        <td>${buildBar(m.consumption,maxCons,"#f59e0b")}</td>
        <td class="rpt-num">${fmt(m.invoicesTotal)}</td>
        <td class="rpt-num rpt-green">${fmt(m.revenuesTotal)}</td>
        <td class="rpt-num rpt-red">${fmt(m.expensesTotal)}</td>
        <td class="rpt-num">${m.consumption} م³</td>
      </tr>`).join("");

    /* ---- Detail tabs content ---- */
    function tabInvoices(){
      if(!(current.invoices||[]).length) return `<p class="rpt-empty">لا توجد فواتير في ${months[rMonth]} ${rYear}</p>`;
      return `<div class="table-wrap"><table class="data-table"><thead><tr>
        <th>رقم الفاتورة</th><th>الزبون</th><th>العداد</th><th>الاستهلاك</th><th>المبلغ</th><th>المؤدى</th><th>الحالة</th><th>تاريخ الفاتورة</th>
      </tr></thead><tbody>
        ${(current.invoices||[]).map(i=>`<tr>
          <td>${i.invoiceNumber||""}</td><td>${i.customerName||""}</td><td>${i.meterSerial||""}</td>
          <td>${i.consumption||0} م³</td><td>${fmt(i.totalAmount)}</td><td>${fmt(i.paidAmount)}</td>
          <td>${statusBadge(i.status)}</td><td>${i.invoiceDate||""}</td>
        </tr>`).join("")}
      </tbody></table></div>`;
    }
    function tabPayments(){
      if(!(current.payments||[]).length) return `<p class="rpt-empty">لا توجد أداءات في ${months[rMonth]} ${rYear}</p>`;
      return `<div class="table-wrap"><table class="data-table"><thead><tr>
        <th>رقم الأداء</th><th>الزبون</th><th>المبلغ</th><th>طريقة الدفع</th><th>التاريخ</th>
      </tr></thead><tbody>
        ${(current.payments||[]).map(p=>`<tr>
          <td>${p.paymentNumber||""}</td><td>${p.customerName||""}</td>
          <td class="rpt-green">${fmt(p.amount)}</td><td>${p.method||""}</td><td>${p.paymentDate||""}</td>
        </tr>`).join("")}
      </tbody></table></div>`;
    }
    function tabDebts(){
      if(!(current.debts||[]).length) return `<p class="rpt-empty">لا توجد ديون في ${months[rMonth]} ${rYear}</p>`;
      return `<div class="table-wrap"><table class="data-table"><thead><tr>
        <th>الزبون</th><th>رقم الفاتورة</th><th>المبلغ</th><th>تاريخ الاستحقاق</th><th>الحالة</th>
      </tr></thead><tbody>
        ${(current.debts||[]).map(d=>`<tr>
          <td>${d.customerName||""}</td><td>${d.invoiceNumber||""}</td>
          <td class="rpt-red">${fmt(d.amount)}</td><td>${d.dueDate||""}</td><td>${statusBadge(d.status)}</td>
        </tr>`).join("")}
      </tbody></table></div>`;
    }
    function tabReadings(){
      if(!(current.readings||[]).length) return `<p class="rpt-empty">لا توجد قراءات في ${months[rMonth]} ${rYear}</p>`;
      return `<div class="table-wrap"><table class="data-table"><thead><tr>
        <th>الزبون</th><th>القراءة السابقة</th><th>القراءة الحالية</th><th>الاستهلاك</th><th>التاريخ</th>
      </tr></thead><tbody>
        ${(current.readings||[]).map(r=>`<tr>
          <td>${r.customerName||""}</td><td>${r.previousReading||0}</td><td>${r.currentReading||0}</td>
          <td>${r.consumption||0} م³</td><td>${r.readingDate||""}</td>
        </tr>`).join("")}
      </tbody></table></div>`;
    }
    function tabAccounting(){
      const expRows = (current.expenses||[]).map(e=>`<tr>
        <td>${e.category||""}</td><td>${e.description||""}</td>
        <td class="rpt-red">${fmt(e.amount)}</td><td>${e.expenseDate||""}</td>
      </tr>`).join("");
      const revRows = (current.revenues||[]).map(r=>`<tr>
        <td>${r.source||""}</td><td>${r.description||""}</td>
        <td class="rpt-green">${fmt(r.amount)}</td><td>${r.revenueDate||""}</td>
      </tr>`).join("");
      return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div><h3 class="rpt-sub">📤 المصاريف</h3>
            ${expRows?`<div class="table-wrap"><table class="data-table"><thead><tr><th>الفئة</th><th>الوصف</th><th>المبلغ</th><th>التاريخ</th></tr></thead><tbody>${expRows}</tbody></table></div>`:`<p class="rpt-empty">لا مصاريف</p>`}
          </div>
          <div><h3 class="rpt-sub">📥 المداخيل</h3>
            ${revRows?`<div class="table-wrap"><table class="data-table"><thead><tr><th>المصدر</th><th>الوصف</th><th>المبلغ</th><th>التاريخ</th></tr></thead><tbody>${revRows}</tbody></table></div>`:`<p class="rpt-empty">لا مداخيل</p>`}
          </div>
        </div>`;
    }

    const tabContents = {
      summary: `<div class="rpt-kpi-row">${kpis.map(k=>`
          <div class="rpt-kpi"><span class="rpt-kpi-icon">${k.icon}</span>
            <div><div class="rpt-kpi-val">${k.value}</div><div class="rpt-kpi-lbl">${k.label}</div><div class="rpt-kpi-sub">${k.sub}</div></div>
          </div>`).join("")}</div>`,
      chart: `<div class="rpt-chart-wrap"><table class="rpt-chart-table">
          <thead><tr><th>الشهر</th><th>الفواتير</th><th>المداخيل</th><th>المصاريف</th><th>الاستهلاك</th>
            <th>الفواتير (د.م.)</th><th>المداخيل</th><th>المصاريف</th><th>الاستهلاك</th></tr></thead>
          <tbody>${chartRows}</tbody></table></div>`,
      invoices:   tabInvoices(),
      payments:   tabPayments(),
      debts:      tabDebts(),
      readings:   tabReadings(),
      accounting: tabAccounting()
    };

    const tabs = [
      ["summary","📊 الملخص"],["chart","📈 المقارنة السنوية"],
      ["invoices","🧾 الفواتير"],["payments","✅ الأداءات"],
      ["debts","⚠️ الديون"],["readings","💧 القراءات"],["accounting","💼 المحاسبة"]
    ];

    el.innerHTML = `
      <div class="rpt-header">
        <h1 class="rpt-title">📑 التقارير الشهرية — <span id="rpt-month-title">${monthLabel}</span></h1>
        <div class="rpt-filters">
          <label>السنة
            <select id="rpt-year">${Array.from({length:5},(_,i)=>2024+i).map(y=>`<option value="${y}"${y===rYear?" selected":""}>${y}</option>`).join("")}</select>
          </label>
          <label>الشهر
            <select id="rpt-month">${months.slice(1).map((m,i)=>`<option value="${i+1}"${(i+1)===rMonth?" selected":""}>${m}</option>`).join("")}</select>
          </label>
          <button class="action-button" id="rpt-load-btn">🔄 تحميل</button>
          <button class="action-button" id="rpt-print-btn" style="background:#6b7280">🖨️ طباعة</button>
        </div>
      </div>
      <div class="rpt-tabs">
        ${tabs.map(([k,l])=>`<button class="rpt-tab${k===rTab?" active":""}" data-tab="${k}">${l}</button>`).join("")}
      </div>
      <div id="rpt-tab-content" class="rpt-tab-content">
        ${tabContents[rTab]}
      </div>`;

    /* events */
    el.querySelectorAll(".rpt-tab").forEach(btn=>{
      btn.addEventListener("click",()=>{
        rTab = btn.dataset.tab;
        el.querySelectorAll(".rpt-tab").forEach(b=>b.classList.toggle("active",b===btn));
        byId("rpt-tab-content").innerHTML = tabContents[rTab];
      });
    });
    byId("rpt-load-btn").addEventListener("click",()=>{
      rYear  = parseInt(byId("rpt-year").value,10);
      rMonth = parseInt(byId("rpt-month").value,10);
      loadAndRender();
    });
    byId("rpt-print-btn").addEventListener("click",()=>window.print());
  }

  loadAndRender();
}


function renderNotifications() {
  const notifs=state.data.notifications||[]; const customers=state.data.customers||[];
  byId("view-notifications").innerHTML=`
    <div class="form-panel" style="margin-bottom:16px">
      <h2>🔔 إرسال إشعار</h2>
      <form id="notification-form" class="form-grid">
        <div class="field"><label>القناة</label>
          <select name="channel">
            <option value="sms">SMS</option><option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option><option value="push">Push</option>
          </select>
        </div>
        <div class="field"><label>الحدث</label>
          <select name="eventType">
            <option value="invoice_created">فاتورة جديدة</option><option value="payment_late">تأخر الأداء</option>
            <option value="disconnection">قطع الخدمة</option><option value="subscription_renewal">تجديد الاشتراك</option>
          </select>
        </div>
        <div class="field wide"><label>الرسالة</label><input name="message" required value="نذكركم بضرورة تسوية الوضعية المالية."></div>
        <button type="submit" class="action-button" style="grid-column:1/-1;margin-top:6px">📨 إضافة للقائمة</button>
      </form>
    </div>
    <div class="section-toolbar">
      <span class="badge warn">${notifs.filter(n=>n.status==="pending").length} معلق</span>
      <span class="badge">${notifs.length} إشعار</span>
    </div>
    ${tbl(["المستلم","القناة","الحدث","الرسالة","الحالة"],
      notifs.slice().reverse().map(n=>`<tr>
        <td>${n.recipientType} #${n.recipientId}</td><td>${n.channel}</td><td>${n.eventType}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis">${n.message}</td>
        <td>${badge(n.status)}</td>
      </tr>`)
    )}`;
  byId("notification-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    body.recipientType="customer"; body.recipientId=customers[0]?.id||1; body.status="pending";
    try{await api("/api/v1/notifications",{method:"POST",body:JSON.stringify(body)});
      toast("تمت إضافة الإشعار","success"); e.target.reset(); await load();
    }catch(err){toast(err.message,"error");}
  });
}

function renderArchitecture() {
  byId("view-architecture").innerHTML=`
    <div class="split">
      <section class="panel">
        <h2>Business Analysis</h2>
        <div class="timeline">
          <div class="timeline-item">Multi-Tenant SaaS – كل جمعية عبر association_id منفصل.</div>
          <div class="timeline-item">RBAC – President, Treasurer, Meter Reader, Secretary, Auditor, Driver…</div>
          <div class="timeline-item">API-first – ربط React Web + Flutter Mobile بنفس الـ endpoints.</div>
          <div class="timeline-item">Offline-first – مزامنة قراءات العدادات عند عودة الاتصال.</div>
        </div>
      </section>
      <section class="panel">
        <h2>Deployment Architecture</h2>
        <div class="architecture">
          <span>React / Vue</span><b>→</b><span>Laravel API</span><b>→</b><span>PostgreSQL</span>
          <span>Flutter</span><b>→</b><span>Redis Cache</span><b>→</b><span>RabbitMQ</span>
          <span>MinIO / S3</span><b>→</b><span>SMS / WhatsApp</span><b>→</b><span>Reports</span>
        </div>
      </section>
    </div>
    <section class="panel" style="margin-top:16px">
      <h2>ERD المختصر</h2>
      <div class="erd-grid">
        ${["Users","Roles","Permissions","Customers","Sectors","Meters","MeterReadings",
           "Tariffs","Invoices","Payments","Debts","Disconnections","Repairs",
           "Students","Buses","Routes","Employees","Expenses","Revenues","Notifications","AuditLogs"]
          .map(e=>`<span>${e}</span>`).join("")}
      </div>
    </section>`;
}

function renderSettings() {
  const users=state.data.users||[];
  const roles=state.data.roles||[];
  const perms=state.data.permissions||[];
  const auditLogs=state.data.auditLogs||[];
  const settings=state.data.settings||{connectionFee:300,subscriptionFee:100};

  // regroupement des permissions par domaine
  const PERM_GROUPS = {
    "لوحة التحكم":    ["dashboard.view"],
    "الجمعية":        ["association.view","association.manage"],
    "المشتركون":      ["customers.view","customers.create","customers.manage"],
    "العدادات":       ["meters.read","meters.manage"],
    "القراءات":       ["readings.view","readings.create","readings.edit","readings.review"],
    "فترات القراءة":  ["periods.view","periods.manage"],
    "الفواتير":       ["invoices.view","invoices.generate","invoices.print","invoices.edit","invoices.delete"],
    "التحصيل":        ["payments.view","payments.collect"],
    "الديون":         ["debts.view","debts.manage","disconnections.manage"],
    "الصيانة":        ["repairs.view","repairs.manage"],
    "النقل":          ["transport.view","transport.manage"],
    "الموارد البشرية":["hr.view","hr.manage"],
    "المحاسبة":       ["accounting.view","accounting.manage"],
    "التقارير":       ["reports.view","reports.export"],
    "الإشعارات":      ["notifications.send"],
    "الإعدادات":      ["settings.view","settings.manage","audit.view","documents.manage"]
  };

  // تسميات عربية للصلاحيات (تُعرض في خانات الاختيار)
  const PERM_LABELS = {
    "dashboard.view":"عرض لوحة التحكم",
    "association.view":"عرض الجمعية","association.manage":"إدارة الجمعية",
    "customers.view":"عرض المشتركين","customers.create":"إضافة مشترك","customers.manage":"إدارة المشتركين",
    "meters.read":"قراءة العدادات","meters.manage":"إدارة العدادات",
    "readings.view":"عرض القراءات","readings.create":"إدخال قراءة","readings.edit":"تعديل القراءة","readings.review":"مراجعة القراءة",
    "periods.view":"عرض فترات القراءة","periods.manage":"إدارة فترات القراءة (فتح/إغلاق)",
    "invoices.view":"عرض الفواتير","invoices.generate":"توليد الفواتير","invoices.print":"طباعة الفواتير","invoices.edit":"تعديل الفاتورة","invoices.delete":"حذف الفاتورة",
    "payments.view":"عرض الأداءات","payments.collect":"تحصيل الأداء",
    "debts.view":"عرض الديون","debts.manage":"إدارة الديون","disconnections.manage":"إدارة القطع/الإرجاع",
    "repairs.view":"عرض الأعطاب","repairs.manage":"إدارة الأعطاب",
    "transport.view":"عرض النقل","transport.manage":"إدارة النقل",
    "hr.view":"عرض الموارد البشرية","hr.manage":"إدارة الموارد البشرية",
    "accounting.view":"عرض المحاسبة","accounting.manage":"إدارة المحاسبة","expenses.manage":"إدارة المصاريف","revenues.manage":"إدارة المداخيل",
    "reports.view":"عرض التقارير","reports.export":"تصدير التقارير",
    "notifications.send":"إرسال الإشعارات",
    "settings.view":"عرض الإعدادات","settings.manage":"إدارة الإعدادات","audit.view":"سجل التدقيق","documents.manage":"إدارة الوثائق"
  };
  const permLabel = p => PERM_LABELS[p] || p;

  const ROLE_ICONS = {
    "Super Admin":"👑","President":"🏛️","Treasurer":"💰","Secretary":"📋",
    "Billing Agent":"🧾","Meter Reader":"📟","Transport Manager":"🚌",
    "Driver":"🚗","Accountant":"📒","Auditor":"🔍"
  };

  const rbacRows = roles.map(role=>{
    const allPerms = role.permissions.includes("*") ? perms : role.permissions;
    const cells = Object.entries(PERM_GROUPS).map(([grp,ps])=>{
      const has = ps.some(p=>allPerms.includes(p)||role.permissions.includes("*"));
      const partial = !role.permissions.includes("*") && ps.some(p=>allPerms.includes(p)) && !ps.every(p=>allPerms.includes(p));
      return `<td style="text-align:center">${has?(partial?'<span title="جزئي" style="color:#d97706">◑</span>':'<span style="color:#16a34a">✅</span>'):'<span style="color:#e5e7eb">—</span>'}</td>`;
    }).join("");
    return `<tr>
      <td><strong>${ROLE_ICONS[role.name]||"👤"} ${role.name}</strong></td>
      ${cells}
    </tr>`;
  }).join("");

  const groupHeaders = Object.keys(PERM_GROUPS).map(g=>`<th style="font-size:11px;writing-mode:vertical-lr;text-align:right;min-width:28px;padding:4px 6px">${g}</th>`).join("");

  byId("view-settings").innerHTML=`
    <!-- إعدادات رسوم الربط والاشتراك (Super Admin) -->
    ${can("settings.manage")?`
    <section class="panel" style="margin-bottom:18px">
      <div class="panel-header">
        <h2>⚙️ رسوم الربط والاشتراك</h2>
      </div>
      <form id="form-connection-fees" class="form-grid" style="margin-top:10px">
        <div class="field">
          <label>مصاريف الربط (درهم)</label>
          <input type="number" name="connectionFee" min="0" step="0.01" value="${settings.connectionFee||300}" required>
        </div>
        <div class="field">
          <label>رسوم الاشتراك (درهم)</label>
          <input type="number" name="subscriptionFee" min="0" step="0.01" value="${settings.subscriptionFee||100}" required>
        </div>
        <div style="grid-column:1/-1;display:flex;gap:8px;align-items:center">
          <button type="submit" class="action-button">💾 حفظ الإعدادات</button>
          <span id="fees-save-msg" style="color:#16a34a;font-size:13px"></span>
        </div>
      </form>
      <p style="font-size:12px;color:#6b7280;margin-top:8px">⚠️ لا يمكن تركيب العداد أو الدخول في الفوترة الشهرية إلا بعد تسديد فاتورتي الربط والاشتراك.</p>
    </section>
    `:""}
    <!-- مستخدمو النظام -->
    <div class="split" style="margin-bottom:16px">
      <section class="panel">
        <div class="panel-header">
          <h2>👥 مستخدمو النظام</h2>
          <button class="action-button" id="btn-add-user-toggle">➕ إضافة مستخدم</button>
        </div>
        ${tbl(["الاسم","البريد","الدور","الحالة","إجراء"],
          users.map(u=>`<tr>
            <td>${u.name}</td><td>${u.email}</td>
            <td><span class="badge">${ROLE_ICONS[u.role]||""} ${u.role}</span></td>
            <td>${badge(u.status)}</td>
            <td>
              <button class="action-button btn-toggle-user" data-id="${u.id}" data-status="${u.status}">${u.status==="active"?"⛔ إيقاف":"✅ تفعيل"}</button>
              <button class="del-btn danger-button" data-res="users" data-id="${u.id}">🗑️</button>
            </td>
          </tr>`)
        )}
        <form id="add-user-form" class="form-grid" style="display:none;margin-top:12px">
          <div class="field"><label>الاسم الكامل</label><input name="name" required></div>
          <div class="field"><label>البريد الإلكتروني</label><input name="email" type="email" required></div>
          <div class="field"><label>كلمة المرور</label><input name="password" type="password" required></div>
          <div class="field"><label>الدور</label>
            <select name="role">
              ${roles.map(r=>`<option value="${r.name}">${ROLE_ICONS[r.name]||""} ${r.name}</option>`).join("")}
            </select>
          </div>
          <div style="grid-column:1/-1;display:flex;gap:8px">
            <button type="submit" class="action-button">💾 حفظ</button>
            <button type="button" class="danger-button" id="btn-cancel-user">إلغاء</button>
          </div>
        </form>
      </section>

      <!-- إدارة الأدوار — بطاقات تفاعلية -->
      <section class="panel roles-mgmt-panel">
        <div class="panel-header">
          <h2>🔑 إدارة الأدوار</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${can("settings.manage")?`
            <button class="action-button" id="btn-add-role-toggle">➕ دور جديد</button>
            <button class="action-button" id="btn-merge-role-toggle" style="background:var(--info,#3b82f6);color:#fff">🔗 دمج دورين</button>`:""}
          </div>
        </div>
        <!-- نموذج إضافة دور جديد -->
        ${can("settings.manage")?`
        <div id="add-role-form-wrapper" style="display:none;margin-bottom:14px">
          <form id="add-role-form" class="form-grid">
            <div class="field"><label>اسم الدور</label><input name="name" required placeholder="مثال: محرر"></div>
            <div class="field"><label>أيقونة (إيموجي)</label><input name="icon" placeholder="🧑‍💼" maxlength="4"></div>
            <div class="field"><label>لون السمة</label><input name="color" type="color" value="#3b82f6" style="height:38px;padding:2px 4px"></div>
            <div class="field" style="grid-column:1/-1"><label>رسالة ترحيب</label><input name="welcomeMsg" placeholder="مرحباً بك في النظام"></div>
            <div class="field" style="grid-column:1/-1">
              <label>الصلاحيات</label>
              <div class="perm-checkboxes" id="add-role-perms">
                ${perms.map(p=>`<label class="perm-pill" title="${p}"><input type="checkbox" name="perm_${p}" value="${p}"> ${permLabel(p)}</label>`).join("")}
              </div>
            </div>
            <div style="grid-column:1/-1;display:flex;gap:8px">
              <button type="submit" class="action-button">💾 حفظ الدور</button>
              <button type="button" class="danger-button" id="btn-cancel-add-role">إلغاء</button>
            </div>
          </form>
        </div>
        <!-- نموذج دمج دورين -->
        <div id="merge-role-form-wrapper" style="display:none;margin-bottom:14px">
          <form id="merge-role-form" class="form-grid">
            <div class="field"><label>الدور الأول</label>
              <select name="roleId1">${roles.map(r=>`<option value="${r.id}">${r.icon||ROLE_ICONS[r.name]||"👤"} ${r.name}</option>`).join("")}</select></div>
            <div class="field"><label>الدور الثاني</label>
              <select name="roleId2">${roles.map(r=>`<option value="${r.id}">${r.icon||ROLE_ICONS[r.name]||"👤"} ${r.name}</option>`).join("")}</select></div>
            <div class="field"><label>اسم الدور الجديد</label><input name="newName" required placeholder="مثال: مدير مالي+محاسب"></div>
            <div class="field"><label>أيقونة</label><input name="icon" placeholder="🧑‍💼" maxlength="4"></div>
            <div class="field"><label>لون السمة</label><input name="color" type="color" value="#8b5cf6" style="height:38px;padding:2px 4px"></div>
            <div style="grid-column:1/-1;display:flex;gap:8px">
              <button type="submit" class="action-button" style="background:#8b5cf6">🔗 دمج وإنشاء</button>
              <button type="button" class="danger-button" id="btn-cancel-merge-role">إلغاء</button>
            </div>
          </form>
        </div>`:""}
        <!-- بطاقات الأدوار -->
        <div class="roles-cards-grid" id="roles-cards-grid">
          ${roles.map(role=>{
            const ico = role.icon || ROLE_ICONS[role.name] || "👤";
            const clr = role.color || "#3b82f6";
            const permCount = role.permissions.includes("*") ? "كل الصلاحيات" : `${role.permissions.length} صلاحية`;
            return `<div class="role-card" data-id="${role.id}" style="--rc:${clr}">
              <div class="rc-head">
                <span class="rc-icon">${ico}</span>
                <div>
                  <div class="rc-name">${role.name}</div>
                  <div class="rc-count">${permCount}</div>
                </div>
              </div>
              ${role.welcomeMsg?`<div class="rc-welcome">${role.welcomeMsg}</div>`:""}
              <div class="rc-perms">
                ${role.permissions.includes("*")
                  ? '<span class="badge success">⚡ كل الصلاحيات</span>'
                  : role.permissions.slice(0,6).map(p=>`<span class="badge info" style="font-size:10px">${p}</span>`).join("")
                    + (role.permissions.length>6?`<span class="badge" style="font-size:10px">+${role.permissions.length-6}</span>`:"")
                }
              </div>
              ${can("settings.manage")?`
              <div class="rc-actions">
                <button class="action-button btn-edit-role" data-id="${role.id}" style="flex:1;font-size:12px">✏️ تعديل</button>
                ${role.name!=="Super Admin"?`<button class="danger-button btn-del-role" data-id="${role.id}" style="font-size:12px">🗑️</button>`:""}
              </div>`:""}
            </div>`;
          }).join("")}
        </div>
      </section>
    </div>

    <!-- جدول RBAC المصفوفة -->
    <section class="panel" style="margin-bottom:16px;overflow-x:auto">
      <div class="panel-header">
        <h2>📊 مصفوفة الصلاحيات (RBAC)</h2>
        <small style="color:var(--muted)">✅ كامل &nbsp; ◑ جزئي &nbsp; — لا يملك</small>
      </div>
      <div style="overflow-x:auto">
        <table style="font-size:12px;border-collapse:collapse;width:100%">
          <thead><tr><th style="text-align:right;padding:6px 10px">الدور</th>${groupHeaders}</tr></thead>
          <tbody>${rbacRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Modal تعديل الدور -->
    <div id="role-edit-modal" class="re-modal-overlay" style="display:none">
      <div class="re-modal">
        <div class="re-modal-header">
          <h3 id="re-modal-title">✏️ تعديل الدور</h3>
          <button id="re-modal-close" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
        </div>
        <form id="role-edit-form" class="form-grid">
          <input type="hidden" name="roleId">
          <div class="field"><label>اسم الدور</label><input name="name" required></div>
          <div class="field"><label>أيقونة (إيموجي)</label><input name="icon" maxlength="4"></div>
          <div class="field"><label>لون السمة</label><input name="color" type="color" style="height:38px;padding:2px 4px"></div>
          <div class="field" style="grid-column:1/-1"><label>رسالة ترحيب</label><input name="welcomeMsg" placeholder="رسالة تظهر للمستخدم عند الدخول"></div>
          <div class="field" style="grid-column:1/-1">
            <label>الصلاحيات</label>
            <div style="margin-bottom:6px;display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" id="re-sel-all" class="action-button" style="font-size:11px;padding:4px 10px">تحديد الكل</button>
              <button type="button" id="re-sel-none" class="danger-button" style="font-size:11px;padding:4px 10px">إلغاء الكل</button>
            </div>
            <div class="perm-checkboxes" id="re-perm-grid">
              ${Object.entries(PERM_GROUPS).map(([grp,ps])=>`
                <div class="perm-group-block">
                  <div class="perm-group-label">${grp}</div>
                  ${ps.map(p=>`<label class="perm-pill" title="${p}"><input type="checkbox" class="re-perm-cb" value="${p}"> ${permLabel(p)}</label>`).join("")}
                </div>
              `).join("")}
            </div>
          </div>
          <div style="grid-column:1/-1;display:flex;gap:8px">
            <button type="submit" class="action-button">💾 حفظ التعديلات</button>
            <button type="button" class="danger-button" id="re-modal-cancel">إلغاء</button>
          </div>
        </form>
      </div>
    </div>

    <!-- سجل التدقيق -->
    <section class="panel">
      <h2>📋 سجل التدقيق – Audit Logs</h2>
      ${tbl(["المستخدم","العملية","الكيان","التاريخ"],
        auditLogs.slice(-30).reverse().map(l=>{
          const actor = users.find(u=>u.id===l.userId);
          const actorName = actor ? actor.name : (l.userId ? '#'+l.userId : 'نظام');
          return `<tr>
            <td><span class="badge">${actorName}</span></td>
            <td><span class="badge ${l.action==="delete"?"danger":l.action==="create"?"success":"info"}">${l.action}</span></td>
            <td>${l.entityType} #${l.entityId}</td>
            <td style="font-size:11px">${(l.createdAt||"").replace("T"," ").slice(0,19)}</td>
          </tr>`;
        })
      )}
    </section>`;

  // Formulaire renseignement frais connexion/abonnement
  if (can("settings.manage") && byId("form-connection-fees")) {
    byId("form-connection-fees").addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const updated = await api("/api/v1/settings", { method: "PUT", body: JSON.stringify({ connectionFee: fd.get("connectionFee"), subscriptionFee: fd.get("subscriptionFee") }) });
        state.data.settings = updated;
        byId("fees-save-msg").textContent = "✅ تم الحفظ";
        setTimeout(()=>{ const el=byId("fees-save-msg"); if(el) el.textContent=""; }, 3000);
        toast("✅ تم حفظ إعدادات الرسوم", "success");
      } catch(err) { toast(err.message, "error"); }
    });
  }

  // Toggle formulaire ajout utilisateur
  byId("btn-add-user-toggle").addEventListener("click",()=>{
    byId("add-user-form").style.display="grid";
    byId("btn-add-user-toggle").style.display="none";
  });
  byId("btn-cancel-user").addEventListener("click",()=>{
    byId("add-user-form").style.display="none";
    byId("btn-add-user-toggle").style.display="";
  });
  byId("add-user-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    body.status="active";
    try{
      await api("/api/v1/users",{method:"POST",body:JSON.stringify(body)});
      toast("✅ تمت إضافة المستخدم","success"); e.target.reset();
      byId("add-user-form").style.display="none";
      byId("btn-add-user-toggle").style.display="";
      await load();
    }catch(err){toast(err.message,"error");}
  });

  // تفعيل / إيقاف مستخدم
  document.querySelectorAll(".btn-toggle-user").forEach(btn=>btn.addEventListener("click",async()=>{
    const newStatus=btn.dataset.status==="active"?"inactive":"active";
    try{
      await api(`/api/v1/users/${btn.dataset.id}`,{method:"PUT",body:JSON.stringify({status:newStatus})});
      toast(`${newStatus==="active"?"✅ تم التفعيل":"⛔ تم الإيقاف"}`,"success"); await load();
    }catch(err){toast(err.message,"error");}
  }));

  attachDeleteHandlers();

  /* ═══════════════ ROLE MANAGEMENT HANDLERS ═══════════════ */
  if (can("settings.manage")) {
    byId("btn-add-role-toggle")?.addEventListener("click",()=>{
      byId("add-role-form-wrapper").style.display="block";
      byId("add-role-form-wrapper").scrollIntoView({behavior:"smooth"});
    });
    byId("btn-cancel-add-role")?.addEventListener("click",()=>{ byId("add-role-form-wrapper").style.display="none"; });

    byId("btn-merge-role-toggle")?.addEventListener("click",()=>{
      byId("merge-role-form-wrapper").style.display="block";
      byId("merge-role-form-wrapper").scrollIntoView({behavior:"smooth"});
    });
    byId("btn-cancel-merge-role")?.addEventListener("click",()=>{ byId("merge-role-form-wrapper").style.display="none"; });

    byId("add-role-form")?.addEventListener("submit",async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const rolesPerms = state.data.permissions||[];
      const selectedPerms = rolesPerms.filter(p => {
        const cb = e.target.querySelector('input[name="perm_'+p+'"]');
        return cb && cb.checked;
      });
      const body = {
        name: fd.get("name"), icon: fd.get("icon")||null,
        color: fd.get("color")||null, welcomeMsg: fd.get("welcomeMsg")||null,
        permissions: selectedPerms
      };
      try{
        await api("/api/v1/roles",{method:"POST",body:JSON.stringify(body)});
        toast("✅ تم إنشاء الدور","success"); e.target.reset();
        byId("add-role-form-wrapper").style.display="none";
        await load();
      }catch(err){toast(err.message,"error");}
    });

    byId("merge-role-form")?.addEventListener("submit",async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        roleId1: Number(fd.get("roleId1")), roleId2: Number(fd.get("roleId2")),
        newName: fd.get("newName"), icon: fd.get("icon")||null, color: fd.get("color")||null
      };
      if (body.roleId1 === body.roleId2) { toast("اختر دورين مختلفين","warn"); return; }
      try{
        await api("/api/v1/roles/merge",{method:"POST",body:JSON.stringify(body)});
        toast("✅ تم دمج الدورين","success"); e.target.reset();
        byId("merge-role-form-wrapper").style.display="none";
        await load();
      }catch(err){toast(err.message,"error");}
    });

    document.querySelectorAll(".btn-del-role").forEach(btn=>btn.addEventListener("click",async()=>{
      const id = Number(btn.dataset.id);
      const role = (state.data.roles||[]).find(r=>r.id===id);
      if (!role) return;
      if (!confirm('حذف الدور "'+role.name+'"؟ سيُعاد تعيين المستخدمين لدور آخر.')) return;
      try{
        await api('/api/v1/roles/'+id,{method:"DELETE"});
        toast('🗑️ تم حذف الدور "'+role.name+'"',"success"); await load();
      }catch(err){toast(err.message,"error");}
    }));

    document.querySelectorAll(".btn-edit-role").forEach(btn=>btn.addEventListener("click",()=>{
      const id = Number(btn.dataset.id);
      const role = (state.data.roles||[]).find(r=>r.id===id);
      if (!role) return;
      const modal = byId("role-edit-modal");
      const form  = byId("role-edit-form");
      form.querySelector('[name="roleId"]').value = id;
      form.querySelector('[name="name"]').value   = unesc(role.name);
      form.querySelector('[name="icon"]').value   = unesc(role.icon || "");
      form.querySelector('[name="color"]').value  = role.color || "#3b82f6";
      form.querySelector('[name="welcomeMsg"]').value = unesc(role.welcomeMsg || "");
      const isAll = role.permissions.includes("*");
      form.querySelectorAll(".re-perm-cb").forEach(cb=>{
        cb.checked = isAll || role.permissions.includes(cb.value);
      });
      byId("re-modal-title").textContent = "✏️ تعديل: "+(role.icon||"")+" "+role.name;
      modal.style.display = "flex";
    }));

    byId("re-sel-all")?.addEventListener("click",()=>byId("re-perm-grid").querySelectorAll(".re-perm-cb").forEach(c=>c.checked=true));
    byId("re-sel-none")?.addEventListener("click",()=>byId("re-perm-grid").querySelectorAll(".re-perm-cb").forEach(c=>c.checked=false));
    byId("re-modal-close")?.addEventListener("click",()=>{ byId("role-edit-modal").style.display="none"; });
    byId("re-modal-cancel")?.addEventListener("click",()=>{ byId("role-edit-modal").style.display="none"; });
    byId("role-edit-modal")?.addEventListener("click",e=>{
      if (e.target===byId("role-edit-modal")) byId("role-edit-modal").style.display="none";
    });

    byId("role-edit-form")?.addEventListener("submit",async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const id = Number(fd.get("roleId"));
      const selectedPerms = [...e.target.querySelectorAll(".re-perm-cb")]
        .filter(c=>c.checked).map(c=>c.value);
      const body = {
        name: fd.get("name"), icon: fd.get("icon")||null,
        color: fd.get("color")||null, welcomeMsg: fd.get("welcomeMsg")||null,
        permissions: selectedPerms
      };
      try{
        await api('/api/v1/roles/'+id,{method:"PUT",body:JSON.stringify(body)});
        toast("✅ تم حفظ الدور","success");
        byId("role-edit-modal").style.display="none";
        await load();
      }catch(err){toast(err.message,"error");}
    });
  }
  /* ═══════ Gestion des périodes de relevé ═══════ */
  (function setupPeriodsPanel() {
    const periods2 = state.data.readingPeriods || [];
    const activePeriod2 = periods2.find(p => p.status === "open") || null;
    const canMngPeriods = can("periods.manage");
    const meterCountP = (state.data.meters || []).length;
    const doneCountP = activePeriod2 ? (state.data.meterReadings || []).filter(r => r.periodId === activePeriod2.id).length : 0;
    const container = document.createElement("section");
    container.className = "panel"; container.style.marginBottom = "16px";
    container.id = "periods-panel";
    container.innerHTML =
      "<div class=\"panel-header\"><h2>\uD83D\uDCC5 \u0641\u062A\u0631\u0627\u062A \u0642\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u0639\u062F\u0627\u062F\u0627\u062A</h2></div>" +
      (activePeriod2
        ? "<div class=\"period-banner\" style=\"margin-bottom:12px\">" +
          "<div><strong>" + activePeriod2.label + "</strong> \u2014 " + activePeriod2.startDate + " \u2013 " + activePeriod2.endDate + "</div>" +
          "<button class=\"action-button\" id=\"btn-close-period\">\uD83D\uDD12 \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0641\u062A\u0631\u0629</button></div>"
        : "<div style=\"margin-bottom:10px;color:var(--danger);font-weight:600\">\u26D4 \u0644\u0627 \u062A\u0648\u062C\u062F \u0641\u062A\u0631\u0629 \u0645\u0641\u062A\u0648\u062D\u0629</div>"
      ) +
      "<form id=\"new-period-form\" class=\"form-grid\" style=\"margin-top:10px\">" +
      "<div class=\"field\"><label>\u0627\u0633\u0645 \u0627\u0644\u0641\u062A\u0631\u0629</label><input name=\"label\" required placeholder=\"\u064A\u0648\u0644\u064A\u0648 2026\"></div>" +
      "<div class=\"field\"><label>\u0645\u0646</label><input name=\"startDate\" type=\"date\" required></div>" +
      "<div class=\"field\"><label>\u0625\u0644\u0649</label><input name=\"endDate\" type=\"date\" required></div>" +
      "<button type=\"submit\" class=\"action-button\" style=\"grid-column:1/-1\">\u2795 \u0641\u062A\u062D \u0641\u062A\u0631\u0629 \u062C\u062F\u064A\u062F\u0629</button></form>" +
      tbl(["\u0627\u0644\u0641\u062A\u0631\u0629","\u0627\u0644\u0628\u062F\u0627\u064A\u0629","\u0627\u0644\u0646\u0647\u0627\u064A\u0629","\u0627\u0644\u062D\u0627\u0644\u0629","\u0625\u062C\u0631\u0627\u0621"],
        periods2.slice().reverse().map(p =>
          "<tr><td><strong>" + p.label + "</strong></td><td>" + p.startDate + "</td><td>" + p.endDate + "</td>" +
          "<td>" + (p.status === "open"
            ? "<span class=\"badge success\">\u0645\u0641\u062A\u0648\u062D\u0629</span>"
            : "<span class=\"badge\">\u0645\u063A\u0644\u0642\u0629</span>") + "</td>" +
          "<td style=\"white-space:nowrap\">" +
          (canMngPeriods ? "<button class=\"action-button btn-edit-period\" data-id=\""+p.id+"\" title=\"\u062A\u0639\u062F\u064A\u0644\">\u270F\uFE0F</button> " : "") +
          (canMngPeriods && p.status !== "open" ? "<button class=\"del-btn danger-button btn-del-period\" data-id=\""+p.id+"\" title=\"\u062D\u0630\u0641\">\uD83D\uDDD1\uFE0F</button>" : "") +
          "</td></tr>"
        )
      );
    byId("view-settings").appendChild(container);

    // Statistiques de la période active (lectures saisies / total compteurs)
    if (activePeriod2) {
      const banner = container.querySelector(".period-banner");
      if (banner) {
        const pct = meterCountP ? Math.round((doneCountP / meterCountP) * 100) : 0;
        const s = document.createElement("div");
        s.style.cssText = "flex-basis:100%;font-size:12px;color:var(--muted);margin-top:6px";
        s.innerHTML = "📊 القراءات المُدخلة: <strong>" + doneCountP + "</strong> من " + meterCountP + " عداد (" + pct + "%)";
        banner.appendChild(s);
      }
    }

    // Gérer les périodes nécessite la permission periods.manage
    if (!canMngPeriods) {
      const f = byId("new-period-form"); if (f) f.style.display = "none";
      const cb = byId("btn-close-period"); if (cb) cb.style.display = "none";
    }

    // Edit period modal
    if (canMngPeriods) {
      container.querySelectorAll('.btn-edit-period').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = periods2.find(x => x.id === Number(btn.dataset.id)); if (!p) return;
          const ex = byId('period-edit-modal'); if(ex) ex.remove();
          const ist = 'width:100%;padding:6px 8px;border:1px solid var(--border,#ccc);border-radius:6px;box-sizing:border-box';
          const ov = document.createElement('div'); ov.id='period-edit-modal';
          ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
          ov.innerHTML='<div style="background:var(--bg,#fff);border-radius:14px;max-width:400px;width:100%;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3)">'
            +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0;font-size:16px">✏️ تعديل الفترة</h3><button id="pe-close" class="action-button" style="padding:4px 10px">✖</button></div>'
            +'<label style="display:block;margin-bottom:8px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">اسم الفترة</span><input id="pe-label" value="'+esc(unesc(p.label||''))+'" style="'+ist+'"></label>'
            +'<label style="display:block;margin-bottom:8px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">من</span><input id="pe-start" type="date" value="'+p.startDate+'" style="'+ist+'"></label>'
            +'<label style="display:block;margin-bottom:8px"><span style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">إلى</span><input id="pe-end" type="date" value="'+p.endDate+'" style="'+ist+'"></label>'
            +'<div style="display:flex;gap:8px;margin-top:10px"><button id="pe-save" class="action-button" style="flex:1;justify-content:center">💾 حفظ</button><button id="pe-cancel" class="secondary-button" style="flex:1;justify-content:center">إلغاء</button></div>'
            +'</div>';
          ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); }); document.body.appendChild(ov);
          byId('pe-close').onclick=()=>ov.remove(); byId('pe-cancel').onclick=()=>ov.remove();
          byId('pe-save').onclick=async()=>{
            const payload={label:byId('pe-label').value,startDate:byId('pe-start').value,endDate:byId('pe-end').value};
            try{ await api('/api/v1/reading-periods/'+p.id,{method:'PUT',body:JSON.stringify(payload)}); toast('✅ تم تحديث الفترة','success'); ov.remove(); await load(); }
            catch(err){toast(err.message,'error');}
          };
        });
      });

      container.querySelectorAll('.btn-del-period').forEach(btn => {
        btn.addEventListener('click', async () => {
          const p = periods2.find(x => x.id === Number(btn.dataset.id)); if (!p) return;
          if (!confirm('حذف الفترة "' + p.label + '"؟ لا يمكن حذف فترة بها قراءات أو فواتير.')) return;
          try{ await api('/api/v1/reading-periods/'+p.id,{method:'DELETE'}); toast('🗑️ تم حذف الفترة','success'); await load(); }
          catch(err){toast(err.message,'error');}
        });
      });
    }

    const closeBtn = document.getElementById("btn-close-period");
    if (closeBtn) {
      closeBtn.addEventListener("click", async () => {
        if (!confirm("\u062A\u0623\u0643\u064A\u062F \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0641\u062A\u0631\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629\u061F")) return;
        try {
          await api("/api/v1/reading-periods/close", { method: "POST", body: "{}" });
          toast("\u2705 \u062A\u0645 \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0641\u062A\u0631\u0629", "success"); await load();
        } catch(err) { toast(err.message, "error"); }
      });
    }

    document.getElementById("new-period-form").addEventListener("submit", async e => {
      e.preventDefault();
      if (activePeriod2) { toast("\u0623\u063A\u0644\u0642 \u0627\u0644\u0641\u062A\u0631\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0623\u0648\u0644\u0627\u064B \u0642\u0628\u0644 \u0641\u062A\u062D \u062C\u062F\u064A\u062F\u0629", "warn"); return; }
      const body = Object.fromEntries(new FormData(e.target));
      body.status = "open";
      body.year   = Number(body.startDate.slice(0, 4));
      body.month  = Number(body.startDate.slice(5, 7));
      body.createdAt = today();
      try {
        await api("/api/v1/reading-periods", { method: "POST", body: JSON.stringify(body) });
        toast("\u2705 \u062A\u0645 \u0641\u062A\u062D \u0641\u062A\u0631\u0629 \u062C\u062F\u064A\u062F\u0629", "success");
        e.target.reset(); await load();
      } catch(err) { toast(err.message, "error"); }
    });
  })();
}
/* Ne rend QUE la vue active (avant: les 16 vues étaient reconstruites à chaque load). */
const VIEW_RENDERERS = {
  dashboard: renderDashboard, association: renderAssociation, customers: renderCustomers,
  meters: renderMeters, readings: renderReadings, tariffs: renderTariffs,
  invoices: renderInvoices, debts: renderDebts, maintenance: renderMaintenance,
  transport: renderTransport, hr: renderHr, accounting: renderAccounting,
  reports: renderReports, notifications: renderNotifications,
  architecture: renderArchitecture, settings: renderSettings
};
function render() {
  if (!state.data) return;
  renderNav();
  const fn = VIEW_RENDERERS[state.activeView];
  if (!fn) return;
  try { fn(); }
  catch (err) { console.error("[render]", state.activeView, err); toast("خطأ في عرض الصفحة: " + err.message, "error"); }
}

/* ═════════════════════ CHARGEMENT ═════════════════════ */
async function load() {
  showLoading();
  try {
    // Barrière XSS: toutes les chaînes venant du serveur sont échappées une seule fois ici.
    state.data = deepEscape(await api("/api/v1/bootstrap"));
    // تحديث صلاحيات الجلسة الحالية من الدور المحدَّث في المتجر
    if (state.session && state.session.role !== "Super Admin") {
      const roles = state.data.roles || [];
      const allPerms = state.data.permissions || [];
      const roleObj = roles.find(r => r.name === state.session.role);
      if (roleObj) {
        const fresh = roleObj.permissions.includes("*") ? allPerms : (roleObj.permissions || []);
        state.session.permissions = fresh;
        saveSession(state.session);
      }
    }
    render();
  }
  catch(err) { toast("فشل تحميل البيانات: "+err.message,"error"); }
  finally { hideLoading(); }
}

byId("refresh-btn").addEventListener("click", async()=>{ await load(); toast("تم تحديث البيانات","success"); });
byId("print-btn").addEventListener("click", printCurrentView);
byId("export-csv-btn").addEventListener("click", exportCurrentViewCsv);

/* ══════ LOGIN / LOGOUT ══════ */
byId("logout-btn").addEventListener("click", ()=>{
  clearSession(); state.session = null; state.data = null;
  showLogin();
  byId("li-pass").value = "";
  byId("login-error").style.display = "none";
});

byId("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = byId("login-submit");
  const errDiv = byId("login-error");
  const email = byId("li-email").value.trim();
  const password = byId("li-pass").value;
  btn.disabled = true; btn.textContent = "...";
  errDiv.style.display = "none";
  try {
    const data = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    }).then(r => r.json().then(j => ({ ok: r.ok, ...j })));
    if (!data.ok) {
      errDiv.textContent = data.message || "خطأ في الدخول";
      errDiv.style.display = "block";
      btn.disabled = false; btn.textContent = "🔐 دخول";
      return;
    }
    state.session = { ...data.user, token: data.token };
    saveSession(state.session);
    showApp();
    renderSidebarUser();
    await load();
  } catch(err) {
    errDiv.textContent = "تعذر الاتصال بالخادم";
    errDiv.style.display = "block";
    btn.disabled = false; btn.textContent = "🔐 دخول";
  }
});

/* ══ Démarrage ══ */
(function boot() {
  attachDeleteHandlers();   // délégation globale branchée une seule fois
  const s = getSession();
  if (s) {
    state.session = s;
    showApp();
    renderSidebarUser();
    load();
  } else {
    showLogin();
  }
})();
