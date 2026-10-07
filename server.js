// Water & School Transport Association Management System — local API server
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
try { require("dotenv").config(); } catch(e) {}
const mysql = require("mysql2/promise");

const PORT = Number(process.env.PORT || 5173);
const ROOT = __dirname;
const PUBLIC_DIR = ROOT;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function uid(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Auth helpers: signed tokens + password hashing (no external deps) ──────

// ── MySQL connection pool ────────────────────────────────────────────────────
// cPanel note: DB_NAME must include the cPanel username prefix
// e.g. if cPanel user is "myuser" and DB is "association" → "myuser_association"
let _pool = null;
function getPool() {
  if (!_pool) {
    _pool = mysql.createPool({
      host:               process.env.DB_HOST         || "localhost",
      port:               Number(process.env.DB_PORT  || 3306),
      user:               process.env.DB_USER         || "root",
      password:           process.env.DB_PASS         || "",
      database:           process.env.DB_NAME         || "association",
      waitForConnections: true,
      connectionLimit:    5,
      queueLimit:         0,
      connectTimeout:     10000,
      timezone:           "+00:00",
      // Force UTF-8 on every new connection
      multipleStatements: false
    });
    // Ensure utf8mb4 on every acquired connection
    _pool.on("connection", conn => {
      conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
    });
  }
  return _pool;
}

// ── App secret (JWT signing key) stored in DB, overrideable via env ──────────
let _SECRET = null;
function getSecret() {
  if (!_SECRET) throw new Error("Secret not yet initialized — call ensureStore() first.");
  return _SECRET;
}
async function getOrCreateSecret(pool) {
  // Env var always wins — useful for cPanel env configuration
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 32) {
    return process.env.APP_SECRET;
  }
  const [rows] = await pool.execute(
    "SELECT cfg_value FROM app_config WHERE cfg_key = 'secret'"
  );
  if (rows.length && rows[0].cfg_value) return rows[0].cfg_value;
  // Generate and persist a new secret
  const newSecret = crypto.randomBytes(48).toString("hex");
  await pool.execute(
    "INSERT INTO app_config (cfg_key, cfg_value) VALUES ('secret', ?) ON DUPLICATE KEY UPDATE cfg_value = VALUES(cfg_value)",
    [newSecret]
  );
  return newSecret;
}
const b64url = buf => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecode = str => Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", getSecret()).update(body).digest());
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = b64url(crypto.createHmac("sha256", getSecret()).update(body).digest());
  const a = Buffer.from(sig || ""), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(body)); } catch { return null; }
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

// Password hashing using scrypt. Format: scrypt$<salt-hex>$<hash-hex>
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
function verifyPassword(plain, stored) {
  if (!stored) return false;
  if (!String(stored).startsWith("scrypt$")) {
    // Legacy plaintext password (pre-migration)
    return String(plain) === String(stored);
  }
  const [, saltHex, hashHex] = String(stored).split("$");
  const hash = crypto.scryptSync(String(plain), Buffer.from(saltHex, "hex"), 32);
  const a = Buffer.from(hashHex, "hex");
  return a.length === hash.length && crypto.timingSafeEqual(a, hash);
}
function isPlaintext(stored) {
  return stored && !String(stored).startsWith("scrypt$");
}

function seedData() {
  return {
    association: {
      id: 1,
      name: "جمعية الماء والنقل المدرسي",
      registrationNumber: "ASSOC-2026-001",
      phone: "0524000000",
      email: "contact@association.local",
      address: "المركز الجماعي"
    },
    users: [
      { id: 1, name: "المدير العام", email: "admin@example.com", role: "Super Admin", status: "active" },
      { id: 2, name: "أمين المال", email: "treasurer@example.com", role: "Treasurer", status: "active" },
      { id: 3, name: "قارئ العدادات", email: "reader@example.com", role: "Meter Reader", status: "active" }
    ],
    sectors: [
      { id: 1, code: "S-01", name: "قطاع النخلة", manager: "قارئ العدادات", subscribers: 2 },
      { id: 2, code: "S-02", name: "قطاع الزيتون", manager: "وكيل الفوترة", subscribers: 1 }
    ],
    customers: [
      {
        id: 1,
        subscriptionNumber: "SUB-2026-0001",
        customerNumber: "CUST-0001",
        fullName: "محمد العلوي",
        nationalId: "AB123456",
        phone: "0612345678",
        address: "دوار النخلة",
        village: "النخلة",
        sectorId: 1,
        gpsLat: 31.623,
        gpsLng: -7.989,
        subscriptionDate: "2026-01-10",
        status: "active"
      },
      {
        id: 2,
        subscriptionNumber: "SUB-2026-0002",
        customerNumber: "CUST-0002",
        fullName: "فاطمة المريني",
        nationalId: "CD222333",
        phone: "0661002003",
        address: "دوار النخلة",
        village: "النخلة",
        sectorId: 1,
        gpsLat: 31.626,
        gpsLng: -7.982,
        subscriptionDate: "2026-02-04",
        status: "active"
      },
      {
        id: 3,
        subscriptionNumber: "SUB-2026-0003",
        customerNumber: "CUST-0003",
        fullName: "عبد السلام بناني",
        nationalId: "EF444555",
        phone: "0677009988",
        address: "دوار الزيتون",
        village: "الزيتون",
        sectorId: 2,
        gpsLat: 31.635,
        gpsLng: -7.975,
        subscriptionDate: "2026-03-12",
        status: "disconnected"
      }
    ],
    meters: [
      { id: 1, customerId: 1, meterNumber: "MTR-99881", qrCode: "QR-MTR-99881", type: "mechanical", diameter: "15mm", brand: "Aquameter", installationDate: "2026-01-12", lastMaintenanceDate: null, status: "active", lastReading: 120 },
      { id: 2, customerId: 2, meterNumber: "MTR-99882", qrCode: "QR-MTR-99882", type: "mechanical", diameter: "15mm", brand: "Zenner", installationDate: "2026-02-05", lastMaintenanceDate: null, status: "active", lastReading: 72 },
      { id: 3, customerId: 3, meterNumber: "MTR-99883", qrCode: "QR-MTR-99883", type: "mechanical", diameter: "20mm", brand: "Itron", installationDate: "2026-03-13", lastMaintenanceDate: "2026-05-20", status: "disconnected", lastReading: 210 }
    ],
    tariffs: [
      {
        id: 1,
        name: "تعريفة الماء الرئيسية",
        type: "tiered",
        monthlyFee: 10,
        maintenanceFee: 5,
        taxRate: 0.05,
        active: true,
        tiers: [
          { min: 0, max: 10, price: 2 },
          { min: 11, max: 20, price: 3 },
          { min: 21, max: 40, price: 5 },
          { min: 41, max: null, price: 7 }
        ]
      }
    ],
    meterReadings: [
      { id: 1, meterId: 1, customerId: 1, readerId: 3, previousReading: 100, currentReading: 120, consumption: 20, readingDate: "2026-05-05", anomalyType: null },
      { id: 2, meterId: 2, customerId: 2, readerId: 3, previousReading: 60, currentReading: 72, consumption: 12, readingDate: "2026-05-05", anomalyType: null }
    ],
    invoices: [
      { id: 1, invoiceNumber: "INV-2026-0001", customerId: 1, meterId: 1, previousReading: 100, currentReading: 120, consumption: 20, consumptionAmount: 50, feesAmount: 15, taxAmount: 3.25, totalAmount: 68.25, paidAmount: 68.25, status: "paid", invoiceDate: "2026-05-05", dueDate: "2026-05-20" },
      { id: 2, invoiceNumber: "INV-2026-0002", customerId: 2, meterId: 2, previousReading: 60, currentReading: 72, consumption: 12, consumptionAmount: 26, feesAmount: 15, taxAmount: 2.05, totalAmount: 43.05, paidAmount: 0, status: "overdue", invoiceDate: "2026-05-05", dueDate: "2026-05-20" },
      { id: 3, invoiceNumber: "INV-2026-0003", customerId: 3, meterId: 3, previousReading: 188, currentReading: 210, consumption: 22, consumptionAmount: 60, feesAmount: 15, taxAmount: 3.75, totalAmount: 78.75, paidAmount: 0, status: "overdue", invoiceDate: "2026-04-05", dueDate: "2026-04-20" }
    ],
    payments: [
      { id: 1, paymentNumber: "PAY-2026-0001", invoiceId: 1, customerId: 1, amount: 68.25, method: "cash", paymentDate: "2026-05-08", receivedBy: 2, reference: "CASH-001" }
    ],
    debts: [
      { id: 1, customerId: 2, invoiceId: 2, amount: 43.05, dueDate: "2026-05-20", monthsOverdue: 1, status: "open" },
      { id: 2, customerId: 3, invoiceId: 3, amount: 78.75, dueDate: "2026-04-20", monthsOverdue: 2, status: "escalated" }
    ],
    disconnections: [
      { id: 1, customerId: 3, reason: "فواتير غير مؤداة", disconnectedAt: "2026-05-30T09:30:00", reconnectedAt: null, reconnectionFee: 50, status: "disconnected" }
    ],
    repairs: [
      { id: 1, type: "leak", description: "تسرب قرب دوار النخلة", reportedAt: "2026-06-01T11:00:00", assignedTo: "تقني الشبكة", status: "in_progress" }
    ],
    students: [
      { id: 1, registrationNumber: "STU-2026-0001", fullName: "سارة العلوي", schoolName: "إعدادية الأطلس", gradeLevel: "الأولى إعدادي", guardianName: "محمد العلوي", guardianPhone: "0612345678", village: "النخلة", status: "active" },
      { id: 2, registrationNumber: "STU-2026-0002", fullName: "يوسف المريني", schoolName: "ثانوية الأمل", gradeLevel: "جذع مشترك", guardianName: "فاطمة المريني", guardianPhone: "0661002003", village: "النخلة", status: "active" }
    ],
    buses: [
      { id: 1, busNumber: "BUS-01", driver: "الحسن السائق", assistant: "مساعد النقل", capacity: 28, status: "active" }
    ],
    routes: [
      { id: 1, busId: 1, village: "النخلة", startPoint: "النخلة", endPoint: "إعدادية الأطلس", scheduleTime: "07:15" }
    ],
    transportSubscriptions: [
      { id: 1, studentId: 1, routeId: 1, monthlyFee: 80, status: "active" },
      { id: 2, studentId: 2, routeId: 1, monthlyFee: 80, status: "unpaid" }
    ],
    employees: [
      { id: 1, fullName: "الحسن السائق", jobTitle: "Driver", phone: "0611002200", salary: 2500, status: "active" },
      { id: 2, fullName: "تقني الشبكة", jobTitle: "Technician", phone: "0622003300", salary: 3000, status: "active" }
    ],
    expenses: [
      { id: 1, category: "fuel", amount: 450, expenseDate: "2026-06-02", description: "وقود الحافلة" },
      { id: 2, category: "electricity", amount: 1200, expenseDate: "2026-06-03", description: "فاتورة الكهرباء للمضخة" }
    ],
    revenues: [
      { id: 1, source: "water_invoice", amount: 68.25, revenueDate: "2026-05-08", description: "أداء فاتورة ماء" },
      { id: 2, source: "transport", amount: 80, revenueDate: "2026-06-01", description: "اشتراك نقل مدرسي" }
    ],
    notifications: [],
    auditLogs: []
  };
}

function seedDataV2() {
  return {
    association: {
      id: 1,
      name: "جمعية الماء والنقل المدرسي",
      registrationNumber: "ASSOC-2026-001",
      phone: "0524000000",
      email: "contact@association.local",
      address: "المركز الجماعي",
      status: "active"
    },
    branches: [
      { id: 1, name: "الفرع الرئيسي", manager: "رئيس الجمعية", address: "المركز الجماعي" },
      { id: 2, name: "فرع النقل المدرسي", manager: "مسؤول النقل", address: "موقف الحافلات" }
    ],
    officeMembers: [
      { id: 1, name: "أحمد الإدريسي", position: "President", phone: "0610101010" },
      { id: 2, name: "أمين المال", position: "Treasurer", phone: "0620202020" },
      { id: 3, name: "الكاتب العام", position: "Secretary", phone: "0630303030" }
    ],
    legalDocuments: [
      { id: 1, title: "الوصل القانوني", number: "DOC-2026-001", expiresAt: "2027-12-31", status: "active" },
      { id: 2, title: "محضر الجمع العام", number: "PV-2026-001", expiresAt: "2026-12-31", status: "active" }
    ],
    roles: [
      { id: 1,  name: "Super Admin",        permissions: ["*"] },
      { id: 2,  name: "President",           permissions: ["dashboard.view","reports.view","association.view","association.manage","customers.view","invoices.view","payments.view","debts.view","accounting.view","hr.view","transport.view","notifications.send","periods.view","periods.manage"] },
      { id: 3,  name: "Treasurer",           permissions: ["dashboard.view","payments.collect","payments.view","invoices.view","invoices.generate","invoices.print","invoices.edit","invoices.delete","debts.view","debts.manage","accounting.view","accounting.manage","reports.view","reports.export","disconnections.manage","notifications.send","periods.view","periods.manage"] },
      { id: 4,  name: "Secretary",           permissions: ["dashboard.view","customers.view","customers.create","customers.manage","association.view","documents.manage","notifications.send"] },
      { id: 5,  name: "Billing Agent",       permissions: ["dashboard.view","customers.view","invoices.view","invoices.generate","invoices.print","invoices.edit","payments.collect","payments.view","debts.view","notifications.send"] },
      { id: 6,  name: "Meter Reader",        permissions: ["dashboard.view","meters.read","meters.manage","readings.create","readings.view","readings.edit","readings.review","periods.view","customers.view"] },
      { id: 7,  name: "Transport Manager",   permissions: ["dashboard.view","transport.view","transport.manage","hr.view","reports.view","notifications.send"] },
      { id: 8,  name: "Driver",              permissions: ["transport.view"] },
      { id: 9,  name: "Accountant",          permissions: ["dashboard.view","accounting.view","accounting.manage","reports.view","reports.export","payments.view","invoices.view","invoices.edit","invoices.delete","hr.view","hr.manage","expenses.manage","revenues.manage"] },
      { id: 10, name: "Auditor",             permissions: ["dashboard.view","audit.view","reports.view","accounting.view","payments.view","invoices.view","debts.view"] },
      { id: 11, name: "Maintenance Agent",   permissions: ["dashboard.view","repairs.view","repairs.manage","meters.read","customers.view"] }
    ],
    permissions: [
      "dashboard.view",
      "association.view", "association.manage",
      "customers.view", "customers.create", "customers.manage",
      "meters.read", "meters.manage",
      "readings.create", "readings.view", "readings.edit", "readings.review",
      "periods.view", "periods.manage",
      "invoices.view", "invoices.generate", "invoices.print", "invoices.edit", "invoices.delete",
      "payments.collect", "payments.view",
      "debts.view", "debts.manage",
      "disconnections.manage",
      "repairs.view", "repairs.manage",
      "transport.view", "transport.manage",
      "hr.view", "hr.manage",
      "accounting.view", "accounting.manage",
      "reports.view", "reports.export",
      "notifications.send",
      "audit.view",
      "settings.view", "settings.manage",
      "documents.manage"
    ],
    users: [
      { id: 1, name: "المدير العام", email: "admin@example.com", role: "Super Admin", status: "active", password: "admin123" },
      { id: 2, name: "أمين المال", email: "treasurer@example.com", role: "Treasurer", status: "active", password: "treas123" },
      { id: 3,  name: "قارئ العدادات",    email: "reader@example.com",      role: "Meter Reader",      status: "active",  password: "reader123" },
      { id: 4,  name: "مسؤول النقل",       email: "transport@example.com",   role: "Transport Manager",  status: "active",  password: "trans123" },
      { id: 5,  name: "المحاسب",           email: "accountant@example.com",  role: "Accountant",         status: "active",  password: "accnt123" },
      { id: 6,  name: "الرئيس",            email: "president@example.com",   role: "President",          status: "active",  password: "pres123" },
      { id: 7,  name: "أمين سر الجمعية",  email: "secretary@example.com",   role: "Secretary",          status: "active",  password: "secr123" },
      { id: 8,  name: "وكيل الفوترة",      email: "billing@example.com",     role: "Billing Agent",      status: "active",  password: "bill123" },
      { id: 9,  name: "عون الصيانة",       email: "maintenance@example.com", role: "Maintenance Agent",  status: "active",  password: "maint123" }
    ],
    sectors: [
      { id: 1, code: "S-01", name: "قطاع النخلة", manager: "قارئ العدادات", subscribers: 2, mapGeojson: { type: "Polygon" } },
      { id: 2, code: "S-02", name: "قطاع الزيتون", manager: "وكيل الفوترة", subscribers: 1, mapGeojson: { type: "Polygon" } }
    ],
    customers: [
      { id: 1, subscriptionNumber: "SUB-2026-0001", customerNumber: "CUST-0001", fullName: "محمد العلوي", nationalId: "AB123456", phone: "0612345678", address: "دوار النخلة", village: "النخلة", sectorId: 1, gpsLat: 31.623, gpsLng: -7.989, subscriptionDate: "2026-01-10", status: "active", documents: ["cin.jpg", "contract.pdf"] },
      { id: 2, subscriptionNumber: "SUB-2026-0002", customerNumber: "CUST-0002", fullName: "فاطمة المريني", nationalId: "CD222333", phone: "0661002003", address: "دوار النخلة", village: "النخلة", sectorId: 1, gpsLat: 31.626, gpsLng: -7.982, subscriptionDate: "2026-02-04", status: "active", documents: [] },
      { id: 3, subscriptionNumber: "SUB-2026-0003", customerNumber: "CUST-0003", fullName: "عبد السلام بناني", nationalId: "EF444555", phone: "0677009988", address: "دوار الزيتون", village: "الزيتون", sectorId: 2, gpsLat: 31.635, gpsLng: -7.975, subscriptionDate: "2026-03-12", status: "disconnected", documents: [] }
    ],
    meters: [
      { id: 1, customerId: 1, meterNumber: "MTR-99881", qrCode: "QR-MTR-99881", barcode: "BAR-MTR-99881", type: "mechanical", diameter: "15mm", brand: "Aquameter", installationDate: "2026-01-12", lastMaintenanceDate: null, status: "active", lastReading: 120 },
      { id: 2, customerId: 2, meterNumber: "MTR-99882", qrCode: "QR-MTR-99882", barcode: "BAR-MTR-99882", type: "mechanical", diameter: "15mm", brand: "Zenner", installationDate: "2026-02-05", lastMaintenanceDate: null, status: "active", lastReading: 72 },
      { id: 3, customerId: 3, meterNumber: "MTR-99883", qrCode: "QR-MTR-99883", barcode: "BAR-MTR-99883", type: "mechanical", diameter: "20mm", brand: "Itron", installationDate: "2026-03-13", lastMaintenanceDate: "2026-05-20", status: "disconnected", lastReading: 210 }
    ],
    tariffs: [
      {
        id: 1,
        name: "تعريفة الماء الرئيسية",
        type: "tiered",
        monthlyFee: 10,
        maintenanceFee: 5,
        taxRate: 0.05,
        active: true,
        tiers: [
          { min: 0, max: 10, price: 2 },
          { min: 11, max: 20, price: 3 },
          { min: 21, max: 40, price: 5 },
          { min: 41, max: null, price: 7 }
        ]
      }
    ],
    meterReadings: [
      { id: 1, meterId: 1, customerId: 1, readerId: 3, previousReading: 100, currentReading: 120, consumption: 20, readingDate: "2026-05-05", photoPath: "meters/1.jpg", anomalyType: null },
      { id: 2, meterId: 2, customerId: 2, readerId: 3, previousReading: 60, currentReading: 72, consumption: 12, readingDate: "2026-05-05", photoPath: "meters/2.jpg", anomalyType: null }
    ],
    invoices: [
      { id: 1, invoiceNumber: "INV-2026-0001", customerId: 1, meterId: 1, previousReading: 100, currentReading: 120, consumption: 20, consumptionAmount: 50, feesAmount: 15, taxAmount: 3.25, totalAmount: 68.25, paidAmount: 68.25, status: "paid", invoiceDate: "2026-05-05", dueDate: "2026-05-20", qrCode: "INV-2026-0001" },
      { id: 2, invoiceNumber: "INV-2026-0002", customerId: 2, meterId: 2, previousReading: 60, currentReading: 72, consumption: 12, consumptionAmount: 26, feesAmount: 15, taxAmount: 2.05, totalAmount: 43.05, paidAmount: 0, status: "overdue", invoiceDate: "2026-05-05", dueDate: "2026-05-20", qrCode: "INV-2026-0002" },
      { id: 3, invoiceNumber: "INV-2026-0003", customerId: 3, meterId: 3, previousReading: 188, currentReading: 210, consumption: 22, consumptionAmount: 60, feesAmount: 15, taxAmount: 3.75, totalAmount: 78.75, paidAmount: 0, status: "overdue", invoiceDate: "2026-04-05", dueDate: "2026-04-20", qrCode: "INV-2026-0003" }
    ],
    payments: [
      { id: 1, paymentNumber: "PAY-2026-0001", invoiceId: 1, customerId: 1, amount: 68.25, method: "cash", paymentDate: "2026-05-08", receivedBy: 2, reference: "CASH-001" }
    ],
    debts: [
      { id: 1, customerId: 2, invoiceId: 2, amount: 43.05, dueDate: "2026-05-20", monthsOverdue: 1, status: "open" },
      { id: 2, customerId: 3, invoiceId: 3, amount: 78.75, dueDate: "2026-04-20", monthsOverdue: 2, status: "escalated" }
    ],
    disconnections: [
      { id: 1, customerId: 3, reason: "فواتير غير مؤداة", disconnectedAt: "2026-05-30T09:30:00", reconnectedAt: null, reconnectionFee: 50, status: "disconnected" }
    ],
    repairs: [
      { id: 1, type: "leak", description: "تسرب قرب دوار النخلة", reportedAt: "2026-06-01T11:00:00", assignedTo: "تقني الشبكة", status: "in_progress" },
      { id: 2, type: "meter", description: "عداد متوقف عند الزبون CUST-0003", reportedAt: "2026-06-03T10:15:00", assignedTo: "تقني العدادات", status: "open" }
    ],
    students: [
      { id: 1, registrationNumber: "STU-2026-0001", fullName: "سارة العلوي", schoolName: "إعدادية الأطلس", gradeLevel: "الأولى إعدادي", guardianName: "محمد العلوي", guardianPhone: "0612345678", village: "النخلة", status: "active" },
      { id: 2, registrationNumber: "STU-2026-0002", fullName: "يوسف المريني", schoolName: "ثانوية الأمل", gradeLevel: "جذع مشترك", guardianName: "فاطمة المريني", guardianPhone: "0661002003", village: "النخلة", status: "active" }
    ],
    buses: [
      { id: 1, busNumber: "BUS-01", driver: "الحسن السائق", assistant: "مساعد النقل", capacity: 28, status: "active" }
    ],
    routes: [
      { id: 1, busId: 1, village: "النخلة", startPoint: "النخلة", endPoint: "إعدادية الأطلس", scheduleTime: "07:15" }
    ],
    transportSubscriptions: [
      { id: 1, studentId: 1, routeId: 1, monthlyFee: 80, startDate: "2026-01-01", endDate: null, status: "active" },
      { id: 2, studentId: 2, routeId: 1, monthlyFee: 80, startDate: "2026-01-01", endDate: null, status: "unpaid" }
    ],
    employees: [
      { id: 1, fullName: "الحسن السائق", jobTitle: "Driver", phone: "0611002200", salary: 2500, status: "active" },
      { id: 2, fullName: "تقني الشبكة", jobTitle: "Technician", phone: "0622003300", salary: 3000, status: "active" },
      { id: 3, fullName: "قارئ العدادات", jobTitle: "Meter Reader", phone: "0633004400", salary: 2200, status: "active" }
    ],
    attendances: [
      { id: 1, employeeId: 1, date: "2026-06-05", status: "present", notes: "" },
      { id: 2, employeeId: 2, date: "2026-06-05", status: "late", notes: "تدخل ميداني" },
      { id: 3, employeeId: 3, date: "2026-06-05", status: "present", notes: "" }
    ],
    expenses: [
      { id: 1, category: "fuel", amount: 450, expenseDate: "2026-06-02", description: "وقود الحافلة" },
      { id: 2, category: "electricity", amount: 1200, expenseDate: "2026-06-03", description: "فاتورة الكهرباء للمضخة" },
      { id: 3, category: "salary", amount: 2500, expenseDate: "2026-06-05", description: "راتب السائق" }
    ],
    revenues: [
      { id: 1, source: "water_invoice", amount: 68.25, revenueDate: "2026-05-08", description: "أداء فاتورة ماء" },
      { id: 2, source: "transport", amount: 80, revenueDate: "2026-06-01", description: "اشتراك نقل مدرسي" },
      { id: 3, source: "grant", amount: 5000, revenueDate: "2026-06-04", description: "منحة جماعية" }
    ],
    notifications: [
      { id: 1, recipientType: "customer", recipientId: 2, channel: "whatsapp", eventType: "payment_late", message: "تذكير بأداء فاتورة الماء.", status: "pending" },
      { id: 2, recipientType: "customer", recipientId: 1, channel: "sms", eventType: "invoice_created", message: "تم إصدار فاتورة جديدة.", status: "sent" }
    ],
    readingPeriods: [
      { id: 1, label: "ماي 2026", year: 2026, month: 5, startDate: "2026-05-01", endDate: "2026-05-31", status: "closed", createdAt: "2026-05-01", closedAt: "2026-06-01" },
      { id: 2, label: "يونيو 2026", year: 2026, month: 6, startDate: "2026-06-01", endDate: "2026-06-30", status: "open", createdAt: "2026-06-01" }
    ],
    settings: {
      connectionFee: 300,
      subscriptionFee: 100
    },
    customerCredits: [],
    auditLogs: []
  };
}

function upgradeStore(store) {
  if (!store || !store.association || String(store.association.name || "").includes("\u00D8")) {
    return seedDataV2();
  }
  const defaults = seedDataV2();
  for (const [key, value] of Object.entries(defaults)) {
    if (store[key] === undefined) store[key] = value;
  }
  store.association = { ...defaults.association, ...store.association };

  // Merge seed roles: add new seed roles if missing, but keep user-customised roles
  if (!Array.isArray(store.roles)) store.roles = [];
  for (const seedRole of defaults.roles) {
    const existing = store.roles.find(r => r.id === seedRole.id || r.name === seedRole.name);
    if (!existing) store.roles.push(seedRole);
    else {
      // preserve user customisations (color, icon, welcomeMsg) but keep seed id/name intact
      existing.id   = existing.id   || seedRole.id;
      existing.name = existing.name || seedRole.name;
      if (!existing.color)      existing.color      = seedRole.color      || null;
      if (!existing.icon)       existing.icon       = seedRole.icon       || null;
      if (!existing.welcomeMsg) existing.welcomeMsg = seedRole.welcomeMsg || null;
    }
  }
  store.permissions = defaults.permissions;

  // Garantir que le rôle Super Admin possède TOUJOURS toutes les permissions ("*")
  // et qu'il ne peut jamais être réduit accidentellement.
  const superAdmin = store.roles.find(r => r.name === "Super Admin");
  if (superAdmin) {
    if (!Array.isArray(superAdmin.permissions) || !superAdmin.permissions.includes("*")) {
      superAdmin.permissions = ["*"];
    }
  } else {
    store.roles.unshift({ id: 1, name: "Super Admin", permissions: ["*"], color: null, icon: null, welcomeMsg: null });
  }

  // Propagate passwords and roles from seed to existing users (migration)
  if (Array.isArray(store.users)) {
    const seedUsers = defaults.users;
    store.users = store.users.map(u => {
      const seed = seedUsers.find(s => s.id === u.id || s.email === u.email);
      if (seed) {
        const upd = { ...u };
        if (!upd.password && seed.password) upd.password = seed.password;
        if (seed.role) upd.role = seed.role;
        return upd;
      }
      return u;
    });
    for (const su of seedUsers) {
      if (!store.users.find(u => u.id === su.id)) store.users.push(su);
    }
    // Garantir que le compte admin reste Super Admin et actif
    const admin = store.users.find(u => u.email === "admin@example.com");
    if (admin) { admin.role = "Super Admin"; admin.status = "active"; }
  }

  // Ensure readingPeriods exist
  if (!Array.isArray(store.readingPeriods) || store.readingPeriods.length === 0) {
    store.readingPeriods = defaults.readingPeriods;
  }

  // Ensure customerCredits exist
  if (!Array.isArray(store.customerCredits)) store.customerCredits = [];

  // Ensure settings exist
  if (!store.settings || typeof store.settings !== "object") {
    store.settings = defaults.settings;
  } else {
    if (!store.settings.connectionFee)   store.settings.connectionFee   = defaults.settings.connectionFee;
    if (!store.settings.subscriptionFee) store.settings.subscriptionFee = defaults.settings.subscriptionFee;
  }

  return store;
}
// ── MySQL-backed store with graceful local fallback ─────────────────────────
// All data lives in a single row of store_data (id=1) as a JSON blob.
// If MySQL is offline, the server gracefully falls back to an in-memory/JSON store.

let _fallbackMode = false;
let _fallbackStore = null;

async function ensureStore() {
  try {
    const pool = getPool();

    // 1. App config table (stores JWT secret + future settings)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS app_config (
        cfg_key   VARCHAR(64)  NOT NULL PRIMARY KEY,
        cfg_value LONGTEXT     NOT NULL,
        updated_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    // 2. Main data store
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS store_data (
        id         INT          NOT NULL PRIMARY KEY,
        data       LONGTEXT     NOT NULL,
        updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    // 3. Initialize JWT secret (stored in DB, overrideable via APP_SECRET env)
    _SECRET = await getOrCreateSecret(pool);
    console.log("[DB] MySQL connected & secret ready.");

    // 4. Seed initial data if table is empty
    const [rows] = await pool.execute("SELECT id FROM store_data WHERE id = 1");
    if (!rows.length) {
      const seed = seedDataV2();
      await pool.execute(
        "INSERT INTO store_data (id, data) VALUES (1, ?)",
        [JSON.stringify(seed)]
      );
      console.log("[DB] Database initialized with seed data.");
    }
  } catch (dbErr) {
    console.warn(`[DB] MySQL connection notice: ${dbErr.message}`);
    console.warn("[DB] Switching server to in-memory local fallback mode (all features active).");
    _fallbackMode = true;
    _SECRET = process.env.APP_SECRET || crypto.randomBytes(48).toString("hex");
    _fallbackStore = seedDataV2();
  }
}

async function readStore() {
  if (_fallbackMode) {
    return _fallbackStore;
  }
  const [rows] = await getPool().execute("SELECT data FROM store_data WHERE id = 1");
  if (!rows.length) throw new Error("Store row not found. Ensure ensureStore() has run.");
  const parsed = JSON.parse(rows[0].data);
  const store = upgradeStore(parsed);
  // Persist if upgrade changed anything
  if (JSON.stringify(store) !== JSON.stringify(parsed)) {
    writeStore(store);
  }
  return store;
}

// Serialised write queue: prevents concurrent writes from overwriting each other
let _writeQueue = Promise.resolve();
function writeStore(store) {
  if (_fallbackMode) {
    _fallbackStore = store;
    return;
  }
  const snapshot = JSON.stringify(store);
  _writeQueue = _writeQueue.then(() =>
    getPool().execute("UPDATE store_data SET data = ? WHERE id = 1", [snapshot])
      .catch(err => console.error("[writeStore] MySQL error:", err.message))
  );
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

function calculateConsumptionAmount(consumption, tariff) {
  if (tariff.type === "fixed") return Number(tariff.fixedPrice || 0);
  const total = Math.max(0, Number(consumption) || 0);
  let amount = 0;
  // Tiers are treated as continuous ranges (m³). Each tier covers the volume
  // between the previous tier's upper bound and its own `max`.
  let lowerBound = 0;
  for (const tier of tariff.tiers) {
    const upper = tier.max === null || tier.max == null ? Number.POSITIVE_INFINITY : Number(tier.max);
    if (total <= lowerBound) break;
    const volumeInTier = Math.min(total, upper) - lowerBound;
    if (volumeInTier > 0) amount += volumeInTier * Number(tier.price || 0);
    lowerBound = upper;
  }
  return Number(amount.toFixed(2));
}

// Calcule les montants d'une facture d'eau à partir d'une consommation et d'un tarif
function computeWaterInvoiceFields(consumption, tariff) {
  const consumptionAmount = calculateConsumptionAmount(consumption, tariff);
  const feesAmount = Number(((tariff.monthlyFee || 0) + (tariff.maintenanceFee || 0)).toFixed(2));
  const taxAmount = Number(((consumptionAmount + feesAmount) * (tariff.taxRate || 0)).toFixed(2));
  const totalAmount = Number((consumptionAmount + feesAmount + taxAmount).toFixed(2));
  return {
    tariffId: tariff.id,
    consumptionAmount,
    monthlyFee: Number(tariff.monthlyFee || 0),
    maintenanceFee: Number(tariff.maintenanceFee || 0),
    feesAmount,
    taxRate: Number(tariff.taxRate || 0),
    taxAmount,
    totalAmount
  };
}

// Recalcule TOUTES les factures d'eau (basées sur la consommation) à partir du tarif actif.
// Les factures de raccordement/abonnement (onboarding/connection/subscription) ne sont pas touchées.
// Retourne le nombre de factures recalculées.
function recalcWaterInvoices(store) {
  const tariff = (store.tariffs || []).find(t => t.active) || (store.tariffs || [])[0];
  if (!tariff) return 0;
  let count = 0;
  for (const inv of store.invoices || []) {
    // Ne traiter que les factures de consommation d'eau
    if (inv.type && inv.type !== "water") continue;
    if (inv.consumption === undefined || inv.consumption === null) continue;
    const consumptionAmount = calculateConsumptionAmount(inv.consumption, tariff);
    const feesAmount = Number(((tariff.monthlyFee || 0) + (tariff.maintenanceFee || 0)).toFixed(2));
    const taxAmount = Number(((consumptionAmount + feesAmount) * (tariff.taxRate || 0)).toFixed(2));
    const totalAmount = Number((consumptionAmount + feesAmount + taxAmount).toFixed(2));
    inv.tariffId = tariff.id;
    inv.consumptionAmount = consumptionAmount;
    inv.monthlyFee = Number(tariff.monthlyFee || 0);
    inv.maintenanceFee = Number(tariff.maintenanceFee || 0);
    inv.feesAmount = feesAmount;
    inv.taxRate = Number(tariff.taxRate || 0);
    inv.taxAmount = taxAmount;
    inv.totalAmount = totalAmount;
    const paid = Number(inv.paidAmount || 0);
    if (paid >= totalAmount && totalAmount > 0) inv.status = "paid";
    else if (paid > 0) inv.status = "partial";
    else if (inv.status === "overdue") inv.status = "overdue";
    else inv.status = "unpaid";
    count++;
  }
  // Synchroniser les dettes liées
  for (const debt of store.debts || []) {
    const inv = (store.invoices || []).find(i => i.id === debt.invoiceId);
    if (!inv) continue;
    debt.amount = Number(Math.max(0, (inv.totalAmount || 0) - (inv.paidAmount || 0)).toFixed(2));
    if (debt.amount === 0 && debt.status !== "paid") debt.status = "paid";
  }
  return count;
}

function enrich(store) {
  const sectorById = new Map(store.sectors.map(item => [item.id, item]));
  const customerById = new Map(store.customers.map(item => [item.id, item]));
  const meterById = new Map(store.meters.map(item => [item.id, item]));
  return {
    customers: store.customers.map(customer => ({ ...customer, sectorName: sectorById.get(customer.sectorId)?.name || "" })),
    meters: store.meters.map(meter => ({ ...meter, customerName: customerById.get(meter.customerId)?.fullName || "" })),
    invoices: store.invoices.map(invoice => ({
      ...invoice,
      customerName: customerById.get(invoice.customerId)?.fullName || "",
      meterNumber: meterById.get(invoice.meterId)?.meterNumber || "",
      sectorName: sectorById.get(customerById.get(invoice.customerId)?.sectorId)?.name || ""
    })),
    debts: store.debts.map(debt => ({
      ...debt,
      customerName: customerById.get(debt.customerId)?.fullName || "",
      phone: customerById.get(debt.customerId)?.phone || ""
    }))
  };
}

function dashboard(store) {
  const totalDebt = store.invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.totalAmount - invoice.paidAmount), 0);
  const paidInvoices = store.invoices.filter(invoice => invoice.status === "paid").length;
  const unpaidInvoices = store.invoices.filter(invoice => invoice.status !== "paid").length;
  const monthConsumption = store.meterReadings.reduce((sum, reading) => sum + reading.consumption, 0);
  const revenue = store.revenues.reduce((sum, item) => sum + item.amount, 0);
  const expenses = store.expenses.reduce((sum, item) => sum + item.amount, 0);
  const invoiceCount = store.invoices.length || 1;
  return {
    customers: store.customers.length,
    activeCustomers: store.customers.filter(item => item.status === "active").length,
    meters: store.meters.length,
    sectors: store.sectors.length,
    monthConsumption,
    paidInvoices,
    unpaidInvoices,
    totalDebt: Number(totalDebt.toFixed(2)),
    students: store.students.length,
    buses: store.buses.length,
    revenue: Number(revenue.toFixed(2)),
    expenses: Number(expenses.toFixed(2)),
    netBalance: Number((revenue - expenses).toFixed(2)),
    collectionRate: Math.round((paidInvoices / invoiceCount) * 100),
    openRepairs: store.repairs.filter(item => item.status !== "resolved").length,
    pendingNotifications: store.notifications.filter(item => item.status === "pending").length
  };
}

// Acteur courant pour la journalisation (défini par requête dans handleApi)
let auditActorId = null;
function audit(store, action, entityType, entityId, newValues) {
  store.auditLogs.push({
    id: nextId(store.auditLogs),
    userId: auditActorId ?? null,
    action,
    entityType,
    entityId,
    newValues,
    createdAt: new Date().toISOString()
  });
}

async function handleApi(req, res, url) {
const store = await readStore();
  const pathname = url.pathname.replace(/\/$/, "");
  const method = req.method;

  if (method === "OPTIONS") return sendJson(res, 204, {});

  if (method === "POST" && pathname === "/api/v1/auth/login") {
    const body = await readBody(req);
    const user = store.users.find(item => item.email === body.email);
    const badCreds = { message: "\u0627\u0644\u0628\u0631\u064A\u062F \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" };
    if (!user) return sendJson(res, 401, badCreds);
    if (!user.password) return sendJson(res, 401, badCreds);
    if (!verifyPassword(body.password, user.password)) return sendJson(res, 401, badCreds);
    if (user.status === "inactive") return sendJson(res, 403, { message: "\u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0648\u0642\u0648\u0641" });
    if (isPlaintext(user.password)) {
      user.password = hashPassword(body.password);
      user.lastLoginAt = new Date().toISOString();
      writeStore(store);
    }
    const { password: _pw, ...safeUser } = user;
    // Résoudre les permissions du rôle pour les inclure dans la session
    const roleObj = (store.roles || []).find(r => r.name === user.role);
    const allPerms = store.permissions || [];
    const resolvedPerms = roleObj
      ? (roleObj.permissions.includes("*") ? allPerms : roleObj.permissions)
      : [];
    const token = signToken({ uid: user.id, email: user.email, role: user.role, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    return sendJson(res, 200, { token, user: { ...safeUser, permissions: resolvedPerms } });
  }

  // ── Middleware RBAC backend ──────────────────────────────────────────────
  // Résout l'utilisateur authentifié depuis un jeton signé (Authorization: Bearer).
  // Le header X-User-Email n'est plus une source de confiance (il était falsifiable).
  function currentUser() {
    const auth = req.headers["authorization"] || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : (req.headers["x-auth-token"] || "");
    const payload = verifyToken(token);
    if (!payload) return null;
    return store.users.find(x => x.id === payload.uid || x.email === payload.email) || null;
  }
  // Résoudre l'acteur courant pour la journalisation d'audit
  auditActorId = (currentUser() || {}).id ?? null;
  function rbacCheck(requiredPerm) {
    const u = currentUser();
    if (!u || u.status === "inactive") return false;
    const r = (store.roles || []).find(x => x.name === u.role);
    if (!r) return false;
    return r.permissions.includes("*") || r.permissions.includes(requiredPerm);
  }
  function rbacDeny(perm) {
    // Distinguer "non authentifi\u00E9" (jeton absent/expir\u00E9 -> 401) de "permission manquante" (403)
    if (!currentUser()) {
      return sendJson(res, 401, { message: "\u0627\u0646\u062A\u0647\u062A \u0627\u0644\u062C\u0644\u0633\u0629 \u0623\u0648 \u0644\u0645 \u062A\u0633\u062C\u0651\u0644 \u0627\u0644\u062F\u062E\u0648\u0644. \u0627\u0644\u0631\u062C\u0627\u0621 \u0625\u0639\u0627\u062F\u0629 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644.", required: perm });
    }
    return sendJson(res, 403, { message: `\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 (${perm})`, required: perm });
  }


  // Permission requise pour créer/modifier/supprimer chaque ressource (POST/PUT/DELETE génériques)
  const writePerm = {
    customers: "customers.manage", meters: "meters.manage", sectors: "customers.manage",
    users: "settings.manage", roles: "settings.manage", tariffs: "settings.manage",
    employees: "hr.manage", students: "transport.manage", buses: "transport.manage",
    routes: "transport.manage", transportSubscriptions: "transport.manage",
    expenses: "accounting.manage", revenues: "accounting.manage",
    repairs: "repairs.manage", branches: "association.manage",
    officeMembers: "association.manage", legalDocuments: "documents.manage",
    notifications: "notifications.send", attendances: "hr.manage",
    disconnections: "disconnections.manage", payments: "payments.collect",
    invoices: "invoices.generate",
    customerCredits: "invoices.edit"
  };

  /* ═══════════════════════ ROLES MANAGEMENT ═══════════════════════ */
  // POST /api/v1/roles           → create role
  if (method === "POST" && pathname === "/api/v1/roles") {
    if (!rbacCheck("settings.manage")) return rbacDeny("settings.manage");
    const body = await readBody(req);
    if (!body.name || !body.name.trim()) return sendJson(res, 400, { message: "اسم الدور مطلوب" });
    if ((store.roles||[]).find(r => r.name.toLowerCase() === body.name.trim().toLowerCase()))
      return sendJson(res, 400, { message: "الدور موجود مسبقاً" });
    const newRole = {
      id: Date.now(),
      name: body.name.trim(),
      permissions: Array.isArray(body.permissions) ? body.permissions : [],
      color:      body.color      || null,
      icon:       body.icon       || null,
      welcomeMsg: body.welcomeMsg || null
    };
    store.roles.push(newRole);
    audit(store, "create", "roles", newRole.id, newRole);
    writeStore(store);
    return sendJson(res, 201, newRole);
  }

  // PUT /api/v1/roles/:id        → update role (permissions + customisation)
  if (method === "PUT" && /^\/api\/v1\/roles\/\d+$/.test(pathname)) {
    if (!rbacCheck("settings.manage")) return rbacDeny("settings.manage");
    const id = Number(pathname.split("/").pop());
    const idx = (store.roles||[]).findIndex(r => r.id === id);
    if (idx === -1) return sendJson(res, 404, { message: "الدور غير موجود" });
    const body = await readBody(req);
    store.roles[idx] = { ...store.roles[idx], ...body, id };
    audit(store, "update", "roles", id, store.roles[idx]);
    writeStore(store);
    return sendJson(res, 200, store.roles[idx]);
  }

  // DELETE /api/v1/roles/:id     → delete role (forbidden for Super Admin)
  if (method === "DELETE" && /^\/api\/v1\/roles\/\d+$/.test(pathname)) {
    if (!rbacCheck("settings.manage")) return rbacDeny("settings.manage");
    const id = Number(pathname.split("/").pop());
    const role = (store.roles||[]).find(r => r.id === id);
    if (!role) return sendJson(res, 404, { message: "الدور غير موجود" });
    if (role.name === "Super Admin") return sendJson(res, 403, { message: "لا يمكن حذف دور Super Admin" });
    // Reassign users of deleted role to first available role
    const fallback = (store.roles.find(r => r.id !== id) || {}).name || "Super Admin";
    (store.users||[]).forEach(u => { if (u.role === role.name) u.role = fallback; });
    store.roles = store.roles.filter(r => r.id !== id);
    audit(store, "delete", "roles", id, { id, name: role.name });
    writeStore(store);
    return sendJson(res, 200, { deleted: true, id, reassignedTo: fallback });
  }

  // POST /api/v1/roles/merge     → merge two roles into a new one
  if (method === "POST" && pathname === "/api/v1/roles/merge") {
    if (!rbacCheck("settings.manage")) return rbacDeny("settings.manage");
    const body = await readBody(req);
    const { roleId1, roleId2, newName, color, icon, welcomeMsg } = body;
    const r1 = (store.roles||[]).find(r => r.id === Number(roleId1));
    const r2 = (store.roles||[]).find(r => r.id === Number(roleId2));
    if (!r1 || !r2) return sendJson(res, 400, { message: "أحد الدورين غير موجود" });
    if (!newName || !newName.trim()) return sendJson(res, 400, { message: "اسم الدور الجديد مطلوب" });
    const merged = [...new Set([...r1.permissions, ...r2.permissions])];
    const newRole = {
      id: Date.now(),
      name: newName.trim(),
      permissions: merged,
      color:      color      || null,
      icon:       icon       || null,
      welcomeMsg: welcomeMsg || null
    };
    store.roles.push(newRole);
    audit(store, "create", "roles", newRole.id, { merged: [r1.name, r2.name], result: newRole });
    writeStore(store);
    return sendJson(res, 201, newRole);
  }
  /* ════════════════════════════════════════════════════════════════ */

  // GET /api/v1/settings
  if (method === "GET" && pathname === "/api/v1/settings") {
    return sendJson(res, 200, store.settings || {});
  }

  // PUT /api/v1/settings  (Super Admin only)
  if (method === "PUT" && pathname === "/api/v1/settings") {
    if (!rbacCheck("settings.manage")) return rbacDeny("settings.manage");
    const body = await readBody(req);
    const connFee  = parseFloat(body.connectionFee);
    const subsFee  = parseFloat(body.subscriptionFee);
    if (isNaN(connFee) || connFee < 0) return sendJson(res, 400, { message: "\u0645\u0628\u0644\u063a \u0627\u0644\u0631\u0628\u0637 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d" });
    if (isNaN(subsFee) || subsFee < 0) return sendJson(res, 400, { message: "\u0645\u0628\u0644\u063a \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d" });
    if (!store.settings) store.settings = {};
    store.settings.connectionFee   = connFee;
    store.settings.subscriptionFee = subsFee;
    audit(store, "update", "settings", 0, store.settings);
    writeStore(store);
    return sendJson(res, 200, store.settings);
  }

  if (method === "GET" && pathname === "/api/v1/dashboard") {
    return sendJson(res, 200, dashboard(store));
  }

  if (method === "GET" && pathname === "/api/v1/bootstrap") {
    return sendJson(res, 200, { ...store, ...enrich(store), dashboard: dashboard(store) });
  }

  const resources = {
    "/api/v1/associations": "association",
    "/api/v1/branches": "branches",
    "/api/v1/office-members": "officeMembers",
    "/api/v1/legal-documents": "legalDocuments",
    "/api/v1/roles": "roles",
    "/api/v1/permissions": "permissions",
    "/api/v1/users": "users",
    "/api/v1/sectors": "sectors",
    "/api/v1/customers": "customers",
    "/api/v1/meters": "meters",
    "/api/v1/tariffs": "tariffs",
    "/api/v1/invoices": "invoices",
    "/api/v1/payments": "payments",
    "/api/v1/debts": "debts",
    "/api/v1/disconnections": "disconnections",
    "/api/v1/repairs": "repairs",
    "/api/v1/students": "students",
    "/api/v1/buses": "buses",
    "/api/v1/routes": "routes",
    "/api/v1/transport-subscriptions": "transportSubscriptions",
    "/api/v1/employees": "employees",
    "/api/v1/attendances": "attendances",
    "/api/v1/expenses": "expenses",
    "/api/v1/revenues": "revenues",
    "/api/v1/notifications": "notifications",
    "/api/v1/audit-logs": "auditLogs",
    "/api/v1/reading-periods": "readingPeriods",
    "/api/v1/customer-credits": "customerCredits"
  };

  if (method === "GET" && pathname === "/api/v1/meter-readings") {
    return sendJson(res, 200, store.meterReadings);
  }

  if (method === "GET" && pathname === "/api/v1/reading-periods/active") {
    const periods = store.readingPeriods || [];
    const active = periods.find(p => p.status === "open") || null;
    if (!active) return sendJson(res, 404, { message: "No active period" });
    const meterIds = (store.meters || []).map(m => m.id);
    const doneIds = (store.meterReadings || []).filter(r => r.periodId === active.id).map(r => r.meterId);
    return sendJson(res, 200, { ...active, totalMeters: meterIds.length, doneMeters: doneIds.length, doneIds });
  }

  if (method === "POST" && pathname === "/api/v1/reading-periods/close") {
    if (!rbacCheck("periods.manage")) return rbacDeny("periods.manage");
    const periods = store.readingPeriods || [];
    const active = periods.find(p => p.status === "open");
    if (!active) return sendJson(res, 404, { message: "لا توجد فترة مفتوحة لإغلاقها" });
    // Gate: all active meters must have readings in this period
    const activeMeters = (store.meters || []).filter(m => m.status === "active");
    const doneIds = (store.meterReadings || []).filter(r => r.periodId === active.id).map(r => r.meterId);
    const missingMeters = activeMeters.filter(m => !doneIds.includes(m.id));
    if (missingMeters.length > 0) {
      return sendJson(res, 422, {
        message: `لا يمكن إغلاق الفترة: ${missingMeters.length} عداد لم تُدخل قراءته بعد.`,
        missingCount: missingMeters.length,
        missingMeters: missingMeters.map(m => ({ id: m.id, meterNumber: m.meterNumber }))
      });
    }
    // Gate: no unresolved suspicious readings
    const suspicious = (store.meterReadings || []).filter(r => r.periodId === active.id && r.anomalyType && !r.anomalyResolved);
    if (suspicious.length > 0) {
      return sendJson(res, 422, {
        message: `لا يمكن إغلاق الفترة: ${suspicious.length} قراءة مشكوكة لم تُراجَع وتُعتمد بعد.`,
        suspiciousCount: suspicious.length
      });
    }
    active.status = "closed";
    active.closedAt = today();
    const meterIds = (store.meters || []).map(m => m.id);
    active.totalMeters = meterIds.length;
    active.doneMeters = doneIds.length;
    audit(store, "close_period", "readingPeriods", active.id, active);
    writeStore(store);
    return sendJson(res, 200, active);
  }

  // PUT /api/v1/reading-periods/:id → edit period label/dates (only if open)
  {
    const pm = pathname.match(/^\/api\/v1\/reading-periods\/(\d+)$/);
    if (method === "PUT" && pm) {
      if (!rbacCheck("periods.manage")) return rbacDeny("periods.manage");
      const id = Number(pm[1]);
      if (!Array.isArray(store.readingPeriods)) return sendJson(res, 404, { message: "الفترة غير موجودة" });
      const idx = store.readingPeriods.findIndex(p => p.id === id);
      if (idx === -1) return sendJson(res, 404, { message: "الفترة غير موجودة" });
      const period = store.readingPeriods[idx];
      const body = await readBody(req);
      const label = String(body.label || period.label || "").trim();
      const startDate = String(body.startDate || period.startDate || "").slice(0, 10);
      const endDate = String(body.endDate || period.endDate || "").slice(0, 10);
      if (!label) return sendJson(res, 400, { message: "اسم الفترة مطلوب" });
      if (startDate > endDate) return sendJson(res, 400, { message: "تاريخ البداية يجب أن يسبق تاريخ النهاية" });
      // Check no overlap with other periods
      const overlap = store.readingPeriods.find((p, i) => i !== idx && !(endDate < p.startDate || startDate > p.endDate));
      if (overlap) return sendJson(res, 422, { message: "تتداخل التواريخ مع فترة موجودة: " + overlap.label });
      store.readingPeriods[idx] = { ...period, label, startDate, endDate, year: Number(startDate.slice(0,4)), month: Number(startDate.slice(5,7)) };
      audit(store, "update", "readingPeriods", id, store.readingPeriods[idx]);
      writeStore(store);
      return sendJson(res, 200, store.readingPeriods[idx]);
    }
  }

  // DELETE /api/v1/reading-periods/:id → delete period (only if no readings and no invoices)
  {
    const pm = pathname.match(/^\/api\/v1\/reading-periods\/(\d+)$/);
    if (method === "DELETE" && pm) {
      if (!rbacCheck("periods.manage")) return rbacDeny("periods.manage");
      const id = Number(pm[1]);
      if (!Array.isArray(store.readingPeriods)) return sendJson(res, 404, { message: "الفترة غير موجودة" });
      const period = store.readingPeriods.find(p => p.id === id);
      if (!period) return sendJson(res, 404, { message: "الفترة غير موجودة" });
      const hasReadings = (store.meterReadings || []).some(r => r.periodId === id);
      if (hasReadings) return sendJson(res, 422, { message: "لا يمكن حذف الفترة: توجد قراءات مسجّلة فيها. احذف القراءات أولاً." });
      const hasInvoices = (store.invoices || []).some(inv => inv.periodId === id);
      if (hasInvoices) return sendJson(res, 422, { message: "لا يمكن حذف الفترة: توجد فواتير مرتبطة بها." });
      store.readingPeriods = store.readingPeriods.filter(p => p.id !== id);
      audit(store, "delete", "readingPeriods", id, { id, label: period.label });
      writeStore(store);
      return sendJson(res, 200, { deleted: true, id });
    }
  }

  // POST /api/v1/reading-periods → ouvrir une nouvelle période (validée, permission requise)
  if (method === "POST" && pathname === "/api/v1/reading-periods") {
    if (!rbacCheck("periods.manage")) return rbacDeny("periods.manage");
    if (!Array.isArray(store.readingPeriods)) store.readingPeriods = [];
    const body = await readBody(req);
    const label = String(body.label || "").trim();
    const startDate = String(body.startDate || "").slice(0, 10);
    const endDate = String(body.endDate || "").slice(0, 10);
    if (!label) return sendJson(res, 400, { message: "اسم الفترة مطلوب" });
    if (!startDate || !endDate) return sendJson(res, 400, { message: "تاريخا البداية والنهاية مطلوبان" });
    if (startDate > endDate) return sendJson(res, 400, { message: "تاريخ البداية يجب أن يسبق تاريخ النهاية" });
    // Une seule période ouverte à la fois
    const open = store.readingPeriods.find(p => p.status === "open");
    if (open) return sendJson(res, 422, { message: "توجد فترة مفتوحة بالفعل (" + open.label + "). أغلقها أولاً." });
    // Pas de doublon de libellé
    if (store.readingPeriods.some(p => String(p.label).trim() === label)) {
      return sendJson(res, 422, { message: "يوجد فترة بنفس الاسم" });
    }
    // Pas de chevauchement de dates avec une période existante
    const overlap = store.readingPeriods.find(p => !(endDate < p.startDate || startDate > p.endDate));
    if (overlap) return sendJson(res, 422, { message: "تتداخل التواريخ مع فترة موجودة: " + overlap.label + " (" + overlap.startDate + " – " + overlap.endDate + ")" });
    const period = {
      id: nextId(store.readingPeriods),
      label,
      year: Number(startDate.slice(0, 4)),
      month: Number(startDate.slice(5, 7)),
      startDate, endDate,
      status: "open",
      createdAt: today()
    };
    store.readingPeriods.push(period);
    audit(store, "open_period", "readingPeriods", period.id, period);
    writeStore(store);
    return sendJson(res, 201, period);
  }

  if (method === "GET" && resources[pathname]) {
    const key = resources[pathname];
    if (key === "association") return sendJson(res, 200, store.association);
    const enriched = enrich(store);
    return sendJson(res, 200, enriched[key] || store[key]);
  }

  if (method === "POST" && pathname === "/api/v1/disconnections") {
    if (!rbacCheck("disconnections.manage")) return rbacDeny("disconnections.manage");
    const body = await readBody(req);
    const customer = store.customers.find(c => c.id === Number(body.customerId));
    if (!customer) return sendJson(res, 404, { message: "Customer not found" });
    const disc = {
      id: nextId(store.disconnections),
      customerId: Number(body.customerId),
      reason: body.reason || "\u0641\u0648\u0627\u062A\u064A\u0631 \u063A\u064A\u0631 \u0645\u0624\u062F\u0627\u0629",
      disconnectedAt: new Date().toISOString(),
      reconnectedAt: null,
      reconnectionFee: Number(body.reconnectionFee || 50),
      status: "disconnected"
    };
    store.disconnections.push(disc);
    customer.status = "disconnected";
    const discMeter = store.meters.find(m => m.customerId === disc.customerId);
    if (discMeter) discMeter.status = "disconnected";
    audit(store, "disconnect", "disconnections", disc.id, disc);
    writeStore(store);
    return sendJson(res, 201, { disconnection: disc, customer, meter: discMeter || null });
  }

  if (method === "POST" && pathname === "/api/v1/meter-readings") {
    if (!rbacCheck("readings.create")) return rbacDeny("readings.create");
    const body = await readBody(req);
    const meter = store.meters.find(item => item.id === Number(body.meterId));
    if (!meter) return sendJson(res, 404, { message: "Meter not found" });
    // Gate: connection and subscription invoices must be paid before monthly billing
    const initInvoices = (store.invoices || []).filter(inv => inv.customerId === meter.customerId && (inv.type === "onboarding" || inv.type === "connection" || inv.type === "subscription"));
    const unpaidInit = initInvoices.filter(inv => inv.status !== "paid");
    if (unpaidInit.length > 0) {
      return sendJson(res, 422, {
        message: "\u0644\u0627 \u064a\u0645\u0643\u0646 \u0625\u062f\u062e\u0627\u0644 \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0639\u062f\u0627\u062f: \u064a\u062c\u0628 \u062a\u0633\u062f\u064a\u062f \u0641\u0627\u062a\u0648\u0631\u0629 \u0627\u0644\u0631\u0628\u0637 \u0648\u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643 \u0623\u0648\u0644\u0627\u064b",
        unpaidInvoices: unpaidInit.map(inv => ({ id: inv.id, invoiceNumber: inv.invoiceNumber, type: inv.type, totalAmount: inv.totalAmount, paidAmount: inv.paidAmount }))
      });
    }
    const periods = store.readingPeriods || [];
    const activePeriod = periods.find(p => p.status === "open");
    if (!activePeriod) return sendJson(res, 422, { message: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0641\u062A\u0631\u0629 \u0642\u0631\u0627\u0621\u0629 \u0645\u0641\u062A\u0648\u062D\u0629\u060C \u0627\u0641\u062A\u062D \u0641\u062A\u0631\u0629 \u062C\u062F\u064A\u062F\u0629 \u0645\u0646 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A" });
    const readingDate = body.readingDate || today();
    if (readingDate < activePeriod.startDate || readingDate > activePeriod.endDate) {
      return sendJson(res, 422, { message: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0642\u0631\u0627\u0621\u0629 (" + readingDate + ") \u062E\u0627\u0631\u062C \u0641\u062A\u0631\u0629 " + activePeriod.label + " (" + activePeriod.startDate + " \u2013 " + activePeriod.endDate + ")" });
    }
    const alreadyRead = (store.meterReadings || []).find(r => r.meterId === meter.id && r.periodId === activePeriod.id);
    if (alreadyRead) return sendJson(res, 422, { message: "\u062A\u0645 \u0625\u062F\u062E\u0627\u0644 \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0639\u062F\u0627\u062F " + meter.meterNumber + " \u0641\u064A \u0641\u062A\u0631\u0629 " + activePeriod.label + " \u0645\u0633\u0628\u0642\u0627\u064B" });
    const previousReading = Number(body.previousReading ?? meter.lastReading ?? 0);
    const currentReading = Number(body.currentReading);
    const consumption = currentReading - previousReading;
    const alerts = [];
    if (currentReading < previousReading) alerts.push({ type: "invalid_reading", message: "\u0627\u0644\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u0623\u0642\u0644 \u0645\u0646 \u0627\u0644\u0633\u0627\u0628\u0642\u0629" });
    if (consumption > 40) alerts.push({ type: "high_consumption", message: "\u0627\u0633\u062a\u0647\u0644\u0627\u0643 \u063a\u064a\u0631 \u0637\u0628\u064a\u0639\u064a" });
    if (meter.status !== "active") alerts.push({ type: "meter_not_active", message: "\u0627\u0644\u0639\u062f\u0627\u062f \u063a\u064a\u0631 \u0641\u0639\u0627\u0644" });
    // Resolve reader name from users store
    const readerId = Number(body.readerId || 0);
    const readerUser = (store.users || []).find(u => u.id === readerId);
    const readerName = body.readerName || (readerUser ? readerUser.name : (req.headers["x-user-email"] || ""));
    const enteredAt = new Date().toISOString();
    const reading = { id: nextId(store.meterReadings), meterId: meter.id, customerId: meter.customerId, readerId, readerName, enteredAt, periodId: activePeriod.id, periodLabel: activePeriod.label, previousReading, currentReading, consumption, readingDate, photoPath: body.photoPath || null, gpsLat: body.gpsLat || null, gpsLng: body.gpsLng || null, anomalyType: alerts[0]?.type || null, anomalyResolved: false, notes: body.notes || null };
    store.meterReadings.push(reading);
    meter.lastReading = currentReading;
    audit(store, "create", "meterReadings", reading.id, reading);
    writeStore(store);
    return sendJson(res, 201, { reading, alerts, invoiceCreated: false, invoice: null });
  }

  // POST /api/v1/reading-periods/:id/generate-invoices → bulk billing for a period
  {
    const gim = pathname.match(/^\/api\/v1\/reading-periods\/(\d+)\/generate-invoices$/);
    if (method === "POST" && gim) {
      if (!rbacCheck("invoices.generate")) return rbacDeny("invoices.generate");
      const periodId = Number(gim[1]);
      const body = await readBody(req);
      const force = body.force === true || body.force === "true";  // تجاوز القراءات المشكوكة
      const period = (store.readingPeriods || []).find(p => p.id === periodId);
      if (!period) return sendJson(res, 404, { message: "الفترة غير موجودة" });
      // Gate 1: all active meters must have readings
      const activeMeters = (store.meters || []).filter(m => m.status === "active");
      const periodReadings = (store.meterReadings || []).filter(r => r.periodId === periodId);
      const doneIds = periodReadings.map(r => r.meterId);
      const missingMeters = activeMeters.filter(m => !doneIds.includes(m.id));
      if (missingMeters.length > 0) {
        return sendJson(res, 422, {
          message: `لا يمكن الفوترة: ${missingMeters.length} عداد لم تُدخل قراءته بعد.`,
          missingCount: missingMeters.length,
          missingMeters: missingMeters.map(m => ({ id: m.id, meterNumber: m.meterNumber }))
        });
      }
      // Gate 2: unresolved suspicious readings — bloc seulement si force=false
      const suspicious = periodReadings.filter(r => r.anomalyType && !r.anomalyResolved);
      if (suspicious.length > 0 && !force) {
        return sendJson(res, 422, {
          message: `يوجد ${suspicious.length} قراءة مشكوكة لم تُراجَع — أرسل force=true للفوترة مع تخطّيها.`,
          suspiciousCount: suspicious.length,
          requiresForce: true,
          suspicious: suspicious.map(r => ({ id: r.id, meterId: r.meterId, anomalyType: r.anomalyType }))
        });
      }
      const tariff = (store.tariffs || []).find(t => t.active) || (store.tariffs || [])[0];
      if (!tariff) return sendJson(res, 422, { message: "لا توجد تعريفة نشطة" });
      const created = [];
      const skipped = [];
      for (const reading of periodReadings) {
        // Skip if invoice already exists for this reading
        const existing = (store.invoices || []).find(inv => inv.meterReadingId === reading.id);
        if (existing) { skipped.push({ readingId: reading.id, invoiceId: existing.id, reason: "موجودة مسبقاً" }); continue; }
        // Skip invalid readings (negative consumption)
        if (reading.currentReading < reading.previousReading) {
          skipped.push({ readingId: reading.id, reason: "قراءة سالبة — تم التخطي", meterId: reading.meterId, consumption: reading.consumption });
          continue;
        }
        // Skip unresolved suspicious if force (mark as skipped with reason)
        if (reading.anomalyType && !reading.anomalyResolved && force) {
          skipped.push({ readingId: reading.id, reason: `قراءة مشكوكة (${reading.anomalyType}) — تم التخطي`, meterId: reading.meterId });
          continue;
        }
        const meter = (store.meters || []).find(m => m.id === reading.meterId);
        const invoice = {
          id: nextId(store.invoices),
          invoiceNumber: uid("INV-" + period.year),
          type: "water",
          customerId: reading.customerId,
          meterId: reading.meterId,
          tariffId: tariff.id,
          meterReadingId: reading.id,
          periodId: period.id,
          periodLabel: period.label,
          previousReading: reading.previousReading,
          currentReading: reading.currentReading,
          consumption: reading.consumption,
          ...computeWaterInvoiceFields(reading.consumption, tariff),
          paidAmount: 0,
          status: "unpaid",
          invoiceDate: today(),
          dueDate: today(),
          qrCode: "invoice:" + reading.id
        };
        // Apply available customer credit automatically
        const credits = (store.customerCredits || []).filter(c => c.customerId === reading.customerId && c.remainingAmount > 0);
        let creditApplied = 0;
        for (const credit of credits) {
          if (invoice.paidAmount >= invoice.totalAmount) break;
          const apply = Math.min(credit.remainingAmount, invoice.totalAmount - invoice.paidAmount);
          if (apply > 0) {
            invoice.paidAmount = Number((invoice.paidAmount + apply).toFixed(2));
            credit.usedAmount = Number(((credit.usedAmount || 0) + apply).toFixed(2));
            credit.remainingAmount = Number((credit.remainingAmount - apply).toFixed(2));
            creditApplied += apply;
          }
        }
        if (invoice.paidAmount >= invoice.totalAmount && invoice.totalAmount > 0) invoice.status = "paid";
        else if (invoice.paidAmount > 0) invoice.status = "partial";
        if (meter) meter.lastReading = reading.currentReading;
        store.invoices.push(invoice);
        created.push(invoice);
      }
      audit(store, "generate_invoices", "readingPeriods", periodId, { created: created.length, skipped: skipped.length, force });
      writeStore(store);
      return sendJson(res, 201, { created: created.length, skipped: skipped.length, skippedList: skipped, invoices: created });
    }
  }

  // POST /api/v1/meter-readings/:id/confirm → confirmer une lecture signalée (anomalie) et générer la facture si valide
  {
    const cm = pathname.match(/^\/api\/v1\/meter-readings\/(\d+)\/confirm$/);
    if (method === "POST" && cm) {
      if (!rbacCheck("readings.review")) return rbacDeny("readings.review");
      const reading = (store.meterReadings || []).find(r => r.id === Number(cm[1]));
      if (!reading) return sendJson(res, 404, { message: "القراءة غير موجودة" });
      reading.anomalyResolved = true;
      reading.resolvedAt = new Date().toISOString();
      let invoice = store.invoices.find(inv => inv.meterReadingId === reading.id);
      let created = false;
      const valid = reading.currentReading >= reading.previousReading;
      if (!invoice && valid) {
        const meter = store.meters.find(m => m.id === reading.meterId);
        const tariff = store.tariffs.find(t => t.active) || store.tariffs[0];
        if (tariff) {
          invoice = {
            id: nextId(store.invoices), invoiceNumber: uid("INV-2026"), type: "water",
            customerId: reading.customerId, meterId: reading.meterId, meterReadingId: reading.id,
            periodId: reading.periodId, periodLabel: reading.periodLabel,
            previousReading: reading.previousReading, currentReading: reading.currentReading, consumption: reading.consumption,
            ...computeWaterInvoiceFields(reading.consumption, tariff),
            paidAmount: 0, status: "unpaid", invoiceDate: today(), dueDate: today(), qrCode: "invoice:" + reading.id
          };
          store.invoices.push(invoice);
          if (meter) meter.lastReading = reading.currentReading;
          created = true;
        }
      }
      audit(store, "confirm", "meterReadings", reading.id, { anomalyType: reading.anomalyType });
      writeStore(store);
      return sendJson(res, 200, { reading, invoiceCreated: created, invoice: invoice || null });
    }
  }

  // PUT /api/v1/meter-readings/:id → modifier une lecture (recalcule consommation, anomalie et facture liée)
  if (method === "PUT" && /^\/api\/v1\/meter-readings\/\d+$/.test(pathname)) {
    if (!rbacCheck("readings.edit")) return rbacDeny("readings.edit");
    const id = Number(pathname.split("/").pop());
    const reading = (store.meterReadings || []).find(r => r.id === id);
    if (!reading) return sendJson(res, 404, { message: "القراءة غير موجودة" });
    const body = await readBody(req);
    if (body.currentReading !== undefined) reading.currentReading = Number(body.currentReading);
    if (body.previousReading !== undefined) reading.previousReading = Number(body.previousReading);
    if (body.notes !== undefined) reading.notes = body.notes;
    reading.consumption = Number((reading.currentReading - reading.previousReading).toFixed(3));
    const meter = store.meters.find(m => m.id === reading.meterId);
    let anomaly = null;
    if (reading.currentReading < reading.previousReading) anomaly = "invalid_reading";
    else if (reading.consumption > 40) anomaly = "high_consumption";
    else if (meter && meter.status !== "active") anomaly = "meter_not_active";
    reading.anomalyType = anomaly;
    if (body.resolve || !anomaly) reading.anomalyResolved = true;
    const valid = reading.currentReading >= reading.previousReading;
    let invoice = store.invoices.find(inv => inv.meterReadingId === id);
    let created = false;
    const tariff = (invoice && store.tariffs.find(t => t.id === invoice.tariffId)) || store.tariffs.find(t => t.active) || store.tariffs[0];
    if (invoice && valid && tariff) {
      Object.assign(invoice, {
        previousReading: reading.previousReading, currentReading: reading.currentReading, consumption: reading.consumption,
        ...computeWaterInvoiceFields(reading.consumption, tariff)
      });
      const paid = Number(invoice.paidAmount || 0);
      invoice.status = (paid >= invoice.totalAmount && invoice.totalAmount > 0) ? "paid" : (paid > 0 ? "partial" : "unpaid");
      store.debts.forEach(d => { if (d.invoiceId === invoice.id) { d.amount = Number(Math.max(0, invoice.totalAmount - paid).toFixed(2)); if (d.amount === 0) d.status = "paid"; } });
      if (meter) meter.lastReading = reading.currentReading;
    } else if (!invoice && valid && anomaly !== "invalid_reading" && tariff) {
      invoice = {
        id: nextId(store.invoices), invoiceNumber: uid("INV-2026"), type: "water",
        customerId: reading.customerId, meterId: reading.meterId, meterReadingId: reading.id,
        periodId: reading.periodId, periodLabel: reading.periodLabel,
        previousReading: reading.previousReading, currentReading: reading.currentReading, consumption: reading.consumption,
        ...computeWaterInvoiceFields(reading.consumption, tariff),
        paidAmount: 0, status: "unpaid", invoiceDate: today(), dueDate: today(), qrCode: "invoice:" + reading.id
      };
      store.invoices.push(invoice);
      if (meter) meter.lastReading = reading.currentReading;
      created = true;
    } else if (invoice && !valid) {
      invoice.status = "cancelled";
    }
    audit(store, "update", "meterReadings", id, reading);
    writeStore(store);
    return sendJson(res, 200, { reading, invoice: invoice || null, invoiceCreated: created });
  }

  if (method === "POST" && pathname === "/api/v1/meters") {
    if (!rbacCheck("meters.manage")) return rbacDeny("meters.manage");
    const body = await readBody(req);
    const customerId = Number(body.customerId);
    if (!customerId) return sendJson(res, 400, { message: "\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u0634\u062a\u0631\u0643 \u0645\u0637\u0644\u0648\u0628" });
    // Gate: onboarding invoice (or legacy connection/subscription) must be paid
    const custInvoices = (store.invoices || []).filter(inv => inv.customerId === customerId && (inv.type === "onboarding" || inv.type === "connection" || inv.type === "subscription"));
    const unpaid = custInvoices.filter(inv => inv.status !== "paid");
    if (unpaid.length > 0) {
      return sendJson(res, 422, {
        message: "\u0644\u0627 \u064a\u0645\u0643\u0646 \u062a\u0631\u0643\u064a\u0628 \u0627\u0644\u0639\u062f\u0627\u062f: \u064a\u062c\u0628 \u062a\u0633\u062f\u064a\u062f \u0641\u0627\u062a\u0648\u0631\u0629 \u0627\u0644\u0631\u0628\u0637 \u0648\u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643 \u0623\u0648\u0644\u0627\u064b",
        unpaidInvoices: unpaid.map(inv => ({ id: inv.id, invoiceNumber: inv.invoiceNumber, type: inv.type, totalAmount: inv.totalAmount, paidAmount: inv.paidAmount }))
      });
    }
    // Contrainte: un seul compteur par abonné
    const existingMeter = (store.meters || []).find(m => m.customerId === customerId);
    if (existingMeter) {
      return sendJson(res, 422, { message: "هذا المشترك لديه عداد مركّب بالفعل: " + existingMeter.meterNumber, existingMeter });
    }
    // À l'installation: rattacher la période de relève active (ouverte)
    const activePeriod = (store.readingPeriods || []).find(p => p.status === "open") || null;
    const newMeter = {
      id: nextId(store.meters),
      ...body,
      customerId,
      installationDate: body.installationDate || today(),
      installPeriodId: activePeriod ? activePeriod.id : null,
      installPeriodLabel: activePeriod ? activePeriod.label : null
    };
    store.meters.push(newMeter);
    audit(store, "create", "meters", newMeter.id, newMeter);
    writeStore(store);
    return sendJson(res, 201, { ...newMeter, activePeriod: activePeriod ? { id: activePeriod.id, label: activePeriod.label } : null });
  }

  if (method === "POST" && pathname === "/api/v1/customers") {
    if (!rbacCheck("customers.create") && !rbacCheck("customers.manage")) return rbacDeny("customers.create");
    const body = await readBody(req);
    if (!body.fullName || !body.fullName.trim()) return sendJson(res, 400, { message: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0634\u062a\u0631\u0643 \u0645\u0637\u0644\u0648\u0628" });
    const custCount = (store.customers || []).length + 1;
    const newCustomer = {
      id: nextId(store.customers),
      subscriptionNumber: `SUB-${new Date().getFullYear()}-${String(custCount).padStart(4, "0")}`,
      customerNumber: `CUST-${String(custCount).padStart(4, "0")}`,
      ...body,
      status: body.status || "pending"
    };
    store.customers.push(newCustomer);
    // Auto-create single onboarding invoice (connection + subscription combined)
    const settings = store.settings || { connectionFee: 300, subscriptionFee: 100 };
    const invoiceDate = today();
    const connFee = Number(settings.connectionFee) || 0;
    const subsFee = Number(settings.subscriptionFee) || 0;
    const onboardingInvoice = {
      id: nextId(store.invoices),
      invoiceNumber: uid("INV-OBD"),
      type: "onboarding",
      customerId: newCustomer.id,
      meterId: null,
      description: "\u0645\u0635\u0627\u0631\u064a\u0641 \u0627\u0644\u0631\u0628\u0637 \u0648\u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643",
      connectionFee: connFee,
      subscriptionFee: subsFee,
      totalAmount: connFee + subsFee,
      paidAmount: 0,
      status: "unpaid",
      invoiceDate,
      dueDate: invoiceDate,
      qrCode: null
    };
    store.invoices.push(onboardingInvoice);
    audit(store, "create", "customers", newCustomer.id, newCustomer);
    writeStore(store);
    return sendJson(res, 201, { customer: newCustomer, invoices: [onboardingInvoice] });
  }

  if (method === "POST" && pathname === "/api/v1/tariffs") {
    if (!rbacCheck("settings.manage")) return rbacDeny("settings.manage");
    const body = await readBody(req);
    if (!body.name || !body.name.trim()) return sendJson(res, 400, { message: "اسم التعريفة مطلوب" });
    const tiers = Array.isArray(body.tiers) ? body.tiers.map(t => ({
      min: Number(t.min || 0),
      max: t.max != null && t.max !== "" ? Number(t.max) : null,
      price: Number(t.price || 0)
    })) : [];
    const newTariff = {
      id: nextId(store.tariffs),
      name: body.name.trim(),
      type: body.type || "tiered",
      monthlyFee: Number(body.monthlyFee || 0),
      maintenanceFee: Number(body.maintenanceFee || 0),
      taxRate: Number(body.taxRate || 0),
      active: body.active === true || body.active === "true" || false,
      tiers
    };
    if (newTariff.active) store.tariffs.forEach(t => { t.active = false; });
    store.tariffs.push(newTariff);
    // Le tarif s'applique uniquement aux NOUVELLES factures; les anciennes ne sont pas recalculées.
    audit(store, "create", "tariffs", newTariff.id, newTariff);
    writeStore(store);
    return sendJson(res, 201, newTariff);
  }

  // PUT /api/v1/tariffs/:id → modifier un tarif, garantir un seul tarif actif, et recalculer les factures
  if (method === "PUT" && /^\/api\/v1\/tariffs\/\d+$/.test(pathname)) {
    if (!rbacCheck("settings.manage")) return rbacDeny("settings.manage");
    const id = Number(pathname.split("/").pop());
    const idx = (store.tariffs || []).findIndex(t => t.id === id);
    if (idx === -1) return sendJson(res, 404, { message: "التعريفة غير موجودة" });
    const body = await readBody(req);
    const tiers = Array.isArray(body.tiers) ? body.tiers.map(t => ({
      min: Number(t.min || 0),
      max: t.max != null && t.max !== "" ? Number(t.max) : null,
      price: Number(t.price || 0)
    })) : store.tariffs[idx].tiers;
    const updated = { ...store.tariffs[idx], ...body, id, tiers };
    if (body.monthlyFee !== undefined) updated.monthlyFee = Number(body.monthlyFee || 0);
    if (body.maintenanceFee !== undefined) updated.maintenanceFee = Number(body.maintenanceFee || 0);
    if (body.taxRate !== undefined) updated.taxRate = Number(body.taxRate || 0);
    updated.active = body.active === true || body.active === "true" || (body.active === undefined ? store.tariffs[idx].active : false);
    store.tariffs[idx] = updated;
    // Un seul tarif actif à la fois
    if (updated.active) store.tariffs.forEach((t, i) => { if (i !== idx) t.active = false; });
    // Le tarif modifié s'applique uniquement aux NOUVELLES factures; les anciennes restent inchangées.
    audit(store, "update", "tariffs", id, updated);
    writeStore(store);
    return sendJson(res, 200, updated);
  }

  // POST /api/v1/invoices/recalculate → recalculer manuellement toutes les factures d'eau
  if (method === "POST" && pathname === "/api/v1/invoices/recalculate") {
    if (!rbacCheck("invoices.generate") && !rbacCheck("settings.manage")) return rbacDeny("invoices.generate");
    const recalculated = recalcWaterInvoices(store);
    audit(store, "recalculate", "invoices", 0, { count: recalculated });
    writeStore(store);
    return sendJson(res, 200, { recalculatedInvoices: recalculated });
  }

  // PUT /api/v1/invoices/:id → modifier une facture (recalcule le total et synchronise les dettes)
  if (method === "PUT" && /^\/api\/v1\/invoices\/\d+$/.test(pathname)) {
    if (!rbacCheck("invoices.edit")) return rbacDeny("invoices.edit");
    const id = Number(pathname.split("/").pop());
    const idx = store.invoices.findIndex(i => i.id === id);
    if (idx === -1) return sendJson(res, 404, { message: "الفاتورة غير موجودة" });
    const body = await readBody(req);
    const num = v => Number(v) || 0;
    const originalInv = store.invoices[idx];
    const originalTotal = Number(originalInv.totalAmount || 0);
    const originalPaid = Number(originalInv.paidAmount || 0);
    const inv = { ...originalInv, ...body, id };
    if (inv.type === "onboarding") {
      inv.connectionFee = num(inv.connectionFee);
      inv.subscriptionFee = num(inv.subscriptionFee);
      inv.totalAmount = Number((inv.connectionFee + inv.subscriptionFee).toFixed(2));
    } else {
      inv.consumptionAmount = num(inv.consumptionAmount);
      inv.monthlyFee = num(inv.monthlyFee);
      inv.maintenanceFee = num(inv.maintenanceFee);
      inv.feesAmount = Number((inv.monthlyFee + inv.maintenanceFee).toFixed(2));
      inv.taxAmount = num(inv.taxAmount);
      inv.totalAmount = Number((inv.consumptionAmount + inv.feesAmount + inv.taxAmount).toFixed(2));
    }
    const paid = num(inv.paidAmount);
    const newTotal = inv.totalAmount;
    let avoir = null;
    // Avoir logic: if invoice was previously paid and new total is different
    if (originalPaid > 0 && newTotal !== originalTotal) {
      if (originalPaid > newTotal) {
        // Credit: paid more than new total → create Avoir
        const creditAmount = Number((originalPaid - newTotal).toFixed(2));
        avoir = {
          id: nextId(store.invoices),
          invoiceNumber: uid("AVOIR"),
          type: "avoir",
          customerId: inv.customerId,
          relatedInvoiceId: inv.id,
          totalAmount: 0,
          creditAmount,
          paidAmount: creditAmount,
          status: "credit",
          invoiceDate: today(),
          description: `رصيد دائن ناتج عن تعديل الفاتورة ${inv.invoiceNumber}`
        };
        store.invoices.push(avoir);
        // Add to customer credits
        if (!Array.isArray(store.customerCredits)) store.customerCredits = [];
        const existCredit = store.customerCredits.find(c => c.customerId === inv.customerId && c.sourceInvoiceId === inv.id);
        if (existCredit) {
          existCredit.amount = Number((existCredit.amount + creditAmount).toFixed(2));
          existCredit.remainingAmount = Number((existCredit.remainingAmount + creditAmount).toFixed(2));
        } else {
          store.customerCredits.push({
            id: nextId(store.customerCredits),
            customerId: inv.customerId,
            sourceInvoiceId: inv.id,
            avoir: avoir.invoiceNumber,
            amount: creditAmount,
            usedAmount: 0,
            remainingAmount: creditAmount,
            createdAt: today()
          });
        }
        // The invoice is now fully paid with the new total
        inv.paidAmount = newTotal;
      } else {
        // New total > previously paid: difference is outstanding debt
        const extraDebt = Number((newTotal - originalPaid).toFixed(2));
        const existDebt = store.debts.find(d => d.invoiceId === id);
        if (existDebt) {
          existDebt.amount = extraDebt;
          existDebt.status = "open";
        } else if (extraDebt > 0) {
          store.debts.push({
            id: nextId(store.debts),
            customerId: inv.customerId,
            invoiceId: id,
            amount: extraDebt,
            dueDate: inv.dueDate || today(),
            monthsOverdue: 0,
            status: "open"
          });
        }
      }
    }
    const finalPaid = num(inv.paidAmount);
    inv.status = (finalPaid >= newTotal && newTotal > 0) ? "paid"
      : (finalPaid > 0 ? "partial" : (body.status === "cancelled" ? "cancelled" : (inv.status === "overdue" ? "overdue" : "unpaid")));
    store.invoices[idx] = inv;
    store.debts.forEach(d => { if (d.invoiceId === id) { d.amount = Number(Math.max(0, newTotal - finalPaid).toFixed(2)); if (d.amount === 0) d.status = "paid"; } });
    audit(store, "update", "invoices", id, { ...inv, avoir: avoir ? avoir.invoiceNumber : null });
    writeStore(store);
    return sendJson(res, 200, { ...inv, avoir: avoir || null });
  }

  // DELETE /api/v1/invoices/:id → suppression avec cascade (paiements + revenus liés + dettes)
  if (method === "DELETE" && /^\/api\/v1\/invoices\/\d+$/.test(pathname)) {
    if (!rbacCheck("invoices.delete")) return rbacDeny("invoices.delete");
    const id = Number(pathname.split("/").pop());
    const inv = store.invoices.find(i => i.id === id);
    if (!inv) return sendJson(res, 404, { message: "الفاتورة غير موجودة" });
    const relPayments = store.payments.filter(p => p.invoiceId === id);
    const payNums = relPayments.map(p => p.paymentNumber).filter(Boolean);
    store.payments = store.payments.filter(p => p.invoiceId !== id);
    store.revenues = store.revenues.filter(r => !(r.description && payNums.some(n => String(r.description).includes(n))));
    store.debts = store.debts.filter(d => d.invoiceId !== id);
    store.invoices = store.invoices.filter(i => i.id !== id);
    audit(store, "delete", "invoices", id, { id, invoiceNumber: inv.invoiceNumber, removedPayments: relPayments.length });
    writeStore(store);
    return sendJson(res, 200, { deleted: true, id, removedPayments: relPayments.length });
  }

  if (method === "POST" && resources[pathname]) {
    const key = resources[pathname];
    if (!Array.isArray(store[key])) return sendJson(res, 405, { message: "Resource is not appendable" });
    const perm = writePerm[key];
    if (perm && !rbacCheck(perm)) return rbacDeny(perm);
    const body = await readBody(req);
    // Ne jamais stocker un mot de passe en clair
    if (key === "users" && body.password) body.password = hashPassword(body.password);
    const item = { id: nextId(store[key]), ...body };
    store[key].push(item);
    audit(store, "create", key, item.id, item);
    writeStore(store);
    return sendJson(res, 201, item);
  }

  if (method === "POST" && pathname === "/api/v1/payments/collect") {
    if (!rbacCheck("payments.collect")) return rbacDeny("payments.collect");
    const body = await readBody(req);
    const invoice = store.invoices.find(item => item.id === Number(body.invoiceId));
    if (!invoice) return sendJson(res, 404, { message: "Invoice not found" });
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return sendJson(res, 400, { message: "مبلغ الأداء غير صحيح" });
    const remainingBefore = Number((invoice.totalAmount - invoice.paidAmount).toFixed(2));
    if (amount - remainingBefore > 0.001) return sendJson(res, 400, { message: `المبلغ يتجاوز المتبقي (${remainingBefore})` });

    const isCreditPayment = String(body.method || "").toLowerCase() === "credit";

    // إذا كانت الطريقة "credit": نقتطع من رصيد الزبون الدائن
    if (isCreditPayment) {
      if (!Array.isArray(store.customerCredits)) store.customerCredits = [];
      const credits = store.customerCredits
        .filter(c => c.customerId === invoice.customerId && (c.remainingAmount || 0) > 0)
        .sort((a, b) => a.id - b.id); // FIFO
      let toDeduct = amount;
      for (const credit of credits) {
        if (toDeduct <= 0) break;
        const deduct = Math.min(credit.remainingAmount, toDeduct);
        credit.usedAmount     = Number(((credit.usedAmount || 0) + deduct).toFixed(2));
        credit.remainingAmount = Number((credit.remainingAmount - deduct).toFixed(2));
        toDeduct = Number((toDeduct - deduct).toFixed(2));
      }
      if (toDeduct > 0.001) {
        return sendJson(res, 400, { message: `الرصيد الدائن غير كافٍ — ينقص ${toDeduct.toFixed(2)} د.م` });
      }
    }

    invoice.paidAmount = Number((invoice.paidAmount + amount).toFixed(2));
    invoice.status = invoice.paidAmount >= invoice.totalAmount ? "paid" : "partial";
    const actorId = (currentUser() || {}).id;
    const payment = {
      id: nextId(store.payments),
      paymentNumber: uid("PAY-2026"),
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      amount,
      method: body.method || "cash",
      paymentDate: body.paymentDate || today(),
      receivedBy: Number(body.receivedBy || actorId || 0) || null,
      reference: body.reference || null
    };
    store.payments.push(payment);
    // تحديث الديون المرتبطة
    store.debts = store.debts.map(debt => {
      if (debt.invoiceId !== invoice.id) return debt;
      const newAmount = Number(Math.max(0, debt.amount - amount).toFixed(2));
      return { ...debt, amount: newAmount, status: (invoice.status === "paid" || newAmount === 0) ? "paid" : debt.status };
    });
    // تسجيل المداخيل (الأداء بالرصيد لا يُعدّ مدخلاً نقدياً)
    if (!isCreditPayment) {
      const revenueSource = invoice.type === "onboarding" ? "onboarding"
        : invoice.type === "transport" ? "transport"
        : invoice.type === "connection" || invoice.type === "subscription" ? invoice.type
        : "water_invoice";
      store.revenues.push({ id: nextId(store.revenues), source: revenueSource, amount, revenueDate: payment.paymentDate, description: `Payment ${payment.paymentNumber}` });
    }
    audit(store, "collect", "payments", payment.id, payment);
    writeStore(store);
    return sendJson(res, 201, { payment, invoiceStatus: invoice.status, receiptUrl: `/api/v1/payments/${payment.id}/receipt` });
  }

  if (method === "POST" && pathname === "/api/v1/debts/send-reminders") {
    if (!rbacCheck("debts.manage")) return rbacDeny("debts.manage");
    const body = await readBody(req);
    const channel = body.channel || "sms";
    const openDebts = store.debts.filter(debt => debt.status !== "paid");
    const notifications = openDebts.map(debt => ({
      id: nextId(store.notifications),
      recipientType: "customer",
      recipientId: debt.customerId,
      channel,
      eventType: "payment_late",
      message: `تذكير بأداء مبلغ ${debt.amount} درهم قبل اتخاذ إجراءات إضافية.`,
      status: "pending"
    }));
    for (const notification of notifications) {
      store.notifications.push(notification);
    }
    audit(store, "send_reminders", "debts", 0, { channel, count: notifications.length });
    writeStore(store);
    return sendJson(res, 201, { created: notifications.length, notifications });
  }

  const reconnectMatch = pathname.match(/^\/api\/v1\/disconnections\/(\d+)\/reconnect$/);
  if (method === "POST" && reconnectMatch) {
    if (!rbacCheck("disconnections.manage")) return rbacDeny("disconnections.manage");
    const disconnection = store.disconnections.find(item => item.id === Number(reconnectMatch[1]));
    if (!disconnection) return sendJson(res, 404, { message: "Disconnection order not found" });
    disconnection.status = "reconnected";
    disconnection.reconnectedAt = new Date().toISOString();
    const customer = store.customers.find(item => item.id === disconnection.customerId);
    if (customer) customer.status = "active";
    const meter = store.meters.find(item => item.customerId === disconnection.customerId);
    if (meter) meter.status = "active";
    audit(store, "reconnect", "disconnections", disconnection.id, disconnection);
    writeStore(store);
    return sendJson(res, 200, { disconnection, customer, meter });
  }

  if (method === "GET" && pathname === "/api/v1/reports/monthly") {
    const qYear  = parseInt(url.searchParams.get("year")  || new Date().getFullYear(), 10);
    const qMonth = parseInt(url.searchParams.get("month") || (new Date().getMonth() + 1), 10);
    const pad = n => String(n).padStart(2, "0");
    const prefix = `${qYear}-${pad(qMonth)}`;

    const monthInvoices  = store.invoices.filter(i => (i.invoiceDate || "").startsWith(prefix));
    const monthPayments  = store.payments.filter(p => (p.paymentDate || "").startsWith(prefix));
    const monthExpenses  = store.expenses.filter(e => (e.expenseDate || "").startsWith(prefix));
    const monthRevenues  = store.revenues.filter(r => (r.revenueDate || "").startsWith(prefix));
    const monthReadings  = store.meterReadings.filter(r => (r.readingDate || "").startsWith(prefix));
    const monthDebts     = (store.debts || []).filter(d => (d.dueDate || "").startsWith(prefix));
    const enriched       = enrich(store);
    const custById       = new Map(store.customers.map(c => [c.id, c.fullName || c.name || ""]));
    const meterByCustomer= new Map(store.meters.map(m => [m.customerId, m.serialNumber || m.id]));

    // Agrégats par mois (12 mois de l'année sélectionnée)
    const monthlyAgg = Array.from({ length: 12 }, (_, i) => {
      const mp = `${qYear}-${pad(i + 1)}`;
      const inv = store.invoices.filter(x => (x.invoiceDate || "").startsWith(mp));
      const pay = store.payments.filter(x => (x.paymentDate || "").startsWith(mp));
      const exp = store.expenses.filter(x => (x.expenseDate || "").startsWith(mp));
      const rev = store.revenues.filter(x => (x.revenueDate || "").startsWith(mp));
      const rds = store.meterReadings.filter(x => (x.readingDate || "").startsWith(mp));
      return {
        month: i + 1,
        label: new Date(qYear, i, 1).toLocaleDateString("ar-MA", { month: "long" }),
        invoicesCount: inv.length,
        invoicesTotal: Number(inv.reduce((s, x) => s + (x.totalAmount || 0), 0).toFixed(2)),
        paidCount: inv.filter(x => x.status === "paid").length,
        paidTotal: Number(inv.reduce((s, x) => s + (x.paidAmount || 0), 0).toFixed(2)),
        unpaidTotal: Number(inv.reduce((s, x) => s + Math.max(0, (x.totalAmount || 0) - (x.paidAmount || 0)), 0).toFixed(2)),
        paymentsTotal: Number(pay.reduce((s, x) => s + (x.amount || 0), 0).toFixed(2)),
        expensesTotal: Number(exp.reduce((s, x) => s + (x.amount || 0), 0).toFixed(2)),
        revenuesTotal: Number(rev.reduce((s, x) => s + (x.amount || 0), 0).toFixed(2)),
        netBalance: Number((rev.reduce((s, x) => s + (x.amount || 0), 0) - exp.reduce((s, x) => s + (x.amount || 0), 0)).toFixed(2)),
        consumption: rds.reduce((s, x) => s + (x.consumption || 0), 0),
        readingsCount: rds.length
      };
    });

    return sendJson(res, 200, {
      year: qYear,
      month: qMonth,
      monthLabel: new Date(qYear, qMonth - 1, 1).toLocaleDateString("ar-MA", { month: "long", year: "numeric" }),
      generatedAt: new Date().toISOString(),
      monthlyAgg,
      current: {
        invoices: monthInvoices.map(i => ({
          ...i,
          customerName: custById.get(i.customerId) || "",
          meterSerial: meterByCustomer.get(i.customerId) || ""
        })),
        payments: monthPayments.map(p => ({
          ...p,
          customerName: custById.get(p.customerId) || ""
        })),
        expenses: monthExpenses,
        revenues: monthRevenues,
        readings: monthReadings.map(r => ({
          ...r,
          customerName: custById.get(r.customerId) || ""
        })),
        debts: monthDebts.map(d => ({
          ...d,
          customerName: custById.get(d.customerId) || "",
          invoiceNumber: (store.invoices.find(i => i.id === d.invoiceId) || {}).invoiceNumber || ""
        }))
      },
      summary: {
        invoicesCount: monthInvoices.length,
        invoicesTotal: Number(monthInvoices.reduce((s, x) => s + (x.totalAmount || 0), 0).toFixed(2)),
        paidTotal: Number(monthInvoices.reduce((s, x) => s + (x.paidAmount || 0), 0).toFixed(2)),
        unpaidTotal: Number(monthInvoices.reduce((s, x) => s + Math.max(0, (x.totalAmount || 0) - (x.paidAmount || 0)), 0).toFixed(2)),
        paymentsTotal: Number(monthPayments.reduce((s, x) => s + (x.amount || 0), 0).toFixed(2)),
        expensesTotal: Number(monthExpenses.reduce((s, x) => s + (x.amount || 0), 0).toFixed(2)),
        revenuesTotal: Number(monthRevenues.reduce((s, x) => s + (x.amount || 0), 0).toFixed(2)),
        netBalance: Number((monthRevenues.reduce((s, x) => s + (x.amount || 0), 0) - monthExpenses.reduce((s, x) => s + (x.amount || 0), 0)).toFixed(2)),
        consumption: monthReadings.reduce((s, x) => s + (x.consumption || 0), 0),
        readingsCount: monthReadings.length,
        debtsCount: monthDebts.length,
        debtsTotal: Number(monthDebts.reduce((s, x) => s + (x.amount || 0), 0).toFixed(2))
      }
    });
  }

  if (method === "GET" && pathname.startsWith("/api/v1/reports/")) {
    const report = pathname.split("/").pop();
    const d = dashboard(store);
    return sendJson(res, 200, {
      report,
      generatedAt: new Date().toISOString(),
      dashboard: d,
      summary: {
        report,
        generatedAt: new Date().toISOString(),
        customers: d.customers,
        meters: d.meters,
        invoices: store.invoices.length,
        paidInvoices: d.paidInvoices,
        unpaidInvoices: d.unpaidInvoices,
        totalDebt: d.totalDebt,
        revenue: d.revenue,
        expenses: d.expenses,
        netBalance: d.netBalance
      },
      invoices: enrich(store).invoices,
      debts: enrich(store).debts,
      expenses: store.expenses,
      revenues: store.revenues
    });
  }

  if (method === "PUT" && pathname === "/api/v1/associations") {
    if (!rbacCheck("association.manage")) return rbacDeny("association.manage");
    const body = await readBody(req);
    store.association = { ...store.association, ...body };
    audit(store, "update", "association", 1, store.association);
    writeStore(store);
    return sendJson(res, 200, store.association);
  }

  const idPathMatch = pathname.match(/^\/api\/v1\/([a-z-]+)\/(\d+)$/);
  // Map resource -> permission domain pour RBAC PUT/DELETE (réutilise writePerm)
  const resPerm = writePerm;
  if (method === "PUT" && idPathMatch) {
    const key = resources[`/api/v1/${idPathMatch[1]}`];
    const id = Number(idPathMatch[2]);
    if (!key || !Array.isArray(store[key])) return sendJson(res, 404, { message: "Resource not found" });
    const perm = resPerm[key];
    if (perm && !rbacCheck(perm)) return rbacDeny(perm);
    const idx = store[key].findIndex(item => item.id === id);
    if (idx === -1) return sendJson(res, 404, { message: "Record not found" });
    const body = await readBody(req);
    // Hacher tout nouveau mot de passe; ne jamais écraser par une valeur vide
    if (key === "users") {
      if (body.password) body.password = hashPassword(body.password);
      else delete body.password;
    }
    store[key][idx] = { ...store[key][idx], ...body, id };
    audit(store, "update", key, id, store[key][idx]);
    writeStore(store);
    return sendJson(res, 200, store[key][idx]);
  }

  if (method === "DELETE" && idPathMatch) {
    const key = resources[`/api/v1/${idPathMatch[1]}`];
    const id = Number(idPathMatch[2]);
    if (!key || !Array.isArray(store[key])) return sendJson(res, 404, { message: "Resource not found" });
    const perm = resPerm[key];
    if (perm && !rbacCheck(perm)) return rbacDeny(perm);
    const before = store[key].length;
    store[key] = store[key].filter(item => item.id !== id);
    if (store[key].length === before) return sendJson(res, 404, { message: "Record not found" });
    audit(store, "delete", key, id, { id });
    writeStore(store);
    return sendJson(res, 200, { deleted: true, id });
  }

  return sendJson(res, 404, { message: "Endpoint not found" });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackContent) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fallbackContent);
      });
      return;
    }
    res.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch(error => sendJson(res, 500, { message: error.message }));
    return;
  }
  serveStatic(req, res, url);
});

ensureStore()
.then(() => {
  server.listen(PORT, () => {
    console.log(`Water & School Transport Association Management System running on http://127.0.0.1:${PORT}`);
  });
})
.catch(err => {
  console.error("[DB] Failed to initialize database:", err.message);
  process.exit(1);
});
