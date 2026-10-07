/**
 * Association ERP — Standalone Interactive Demo Engine
 * Enables 100% client-side execution on GitHub Pages and offline previews.
 * Persists changes in localStorage and mirrors the local Node.js/MySQL API contract.
 */
(function() {
  const STORAGE_KEY = "association_erp_demo_store_v2";

  function getDefaultSeed() {
    return {
      association: {
        id: 1,
        name: "جمعية الماء والنقل المدرسي للتنمية",
        registrationNumber: "ASSOC-2026-001",
        phone: "0524000000",
        email: "contact@association-erp.ma",
        address: "الجماعة الترابية - إقليم الحوز",
        status: "active"
      },
      branches: [
        { id: 1, name: "الفرع الرئيسي (قطاع الماء)", manager: "رئيس الجمعية", address: "المركز الجماعي" },
        { id: 2, name: "فرع النقل المدرسي", manager: "مسؤول النقل", address: "موقف الحافلات المركزية" }
      ],
      officeMembers: [
        { id: 1, name: "أحمد الإدريسي", position: "President", phone: "0610101010" },
        { id: 2, name: "عمر التازي", position: "Treasurer", phone: "0620202020" },
        { id: 3, name: "رشيد العلمي", position: "Secretary", phone: "0630303030" }
      ],
      legalDocuments: [
        { id: 1, title: "الوصل القانوني النهائي", number: "DOC-2026-001", expiresAt: "2027-12-31", status: "active" },
        { id: 2, title: "محضر الجمع العام التجديدي", number: "PV-2026-001", expiresAt: "2026-12-31", status: "active" }
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
        { id: 1, name: "المدير العام (Super Admin)", email: "admin@example.com", role: "Super Admin", status: "active", password: "admin123" },
        { id: 2, name: "أمين المال", email: "treasurer@example.com", role: "Treasurer", status: "active", password: "treas123" },
        { id: 3, name: "قارئ العدادات", email: "reader@example.com", role: "Meter Reader", status: "active", password: "reader123" },
        { id: 4, name: "مسؤول النقل المدرسي", email: "transport@example.com", role: "Transport Manager", status: "active", password: "trans123" },
        { id: 5, name: "المحاسب", email: "accountant@example.com", role: "Accountant", status: "active", password: "accnt123" },
        { id: 6, name: "رئيس الجمعية", email: "president@example.com", role: "President", status: "active", password: "pres123" },
        { id: 7, name: "الكاتب العام", email: "secretary@example.com", role: "Secretary", status: "active", password: "secr123" },
        { id: 8, name: "وكيل الفوترة", email: "billing@example.com", role: "Billing Agent", status: "active", password: "bill123" },
        { id: 9, name: "تقني الصيانة", email: "maintenance@example.com", role: "Maintenance Agent", status: "active", password: "maint123" }
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
        { id: 1, meterId: 1, customerId: 1, readerId: 3, previousReading: 100, currentReading: 120, consumption: 20, readingDate: "2026-05-05", photoPath: "meters/1.jpg", anomalyType: null, status: "confirmed" },
        { id: 2, meterId: 2, customerId: 2, readerId: 3, previousReading: 60, currentReading: 72, consumption: 12, readingDate: "2026-05-05", photoPath: "meters/2.jpg", anomalyType: null, status: "confirmed" }
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
        { id: 1, customerId: 3, reason: "تراكم فواتير غير مؤداة (أكثر من شهرين)", disconnectedAt: "2026-05-30T09:30:00", reconnectedAt: null, reconnectionFee: 50, status: "disconnected" }
      ],
      repairs: [
        { id: 1, type: "leak", description: "تسرب في القناة الرئيسية قرب دوار النخلة", reportedAt: "2026-06-01T11:00:00", assignedTo: "تقني الشبكة", status: "in_progress" },
        { id: 2, type: "meter", description: "عطب وتوقف مؤشر العداد عند الزبون CUST-0003", reportedAt: "2026-06-03T10:15:00", assignedTo: "تقني العدادات", status: "open" }
      ],
      students: [
        { id: 1, registrationNumber: "STU-2026-0001", fullName: "سارة العلوي", schoolName: "إعدادية الأطلس", gradeLevel: "الأولى إعدادي", guardianName: "محمد العلوي", guardianPhone: "0612345678", village: "النخلة", status: "active" },
        { id: 2, registrationNumber: "STU-2026-0002", fullName: "يوسف المريني", schoolName: "ثانوية الأمل", gradeLevel: "جذع مشترك", guardianName: "فاطمة المريني", guardianPhone: "0661002003", village: "النخلة", status: "active" }
      ],
      buses: [
        { id: 1, busNumber: "BUS-01", driver: "الحسن السائق", assistant: "مساعد النقل", capacity: 28, status: "active" }
      ],
      routes: [
        { id: 1, busId: 1, village: "النخلة", startPoint: "دوار النخلة", endPoint: "إعدادية الأطلس", scheduleTime: "07:15" }
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
        { id: 1, employeeId: 1, date: "2026-06-05", status: "present", notes: "مسار منتظم" },
        { id: 2, employeeId: 2, date: "2026-06-05", status: "late", notes: "تدخل ميداني مستعجل" },
        { id: 3, employeeId: 3, date: "2026-06-05", status: "present", notes: "جولة قراءة القطاع 1" }
      ],
      expenses: [
        { id: 1, category: "fuel", amount: 450, expenseDate: "2026-06-02", description: "وقود الحافلة المدرسية رقم 01" },
        { id: 2, category: "electricity", amount: 1200, expenseDate: "2026-06-03", description: "فاتورة استهلاك كهرباء مضخة البئر" },
        { id: 3, category: "salary", amount: 2500, expenseDate: "2026-06-05", description: "راتب السائق الشهري" }
      ],
      revenues: [
        { id: 1, source: "water_invoice", amount: 68.25, revenueDate: "2026-05-08", description: "استخلاص فاتورة ماء INV-2026-0001" },
        { id: 2, source: "transport", amount: 80, revenueDate: "2026-06-01", description: "اشتراك النقل المدرسي - سارة العلوي" },
        { id: 3, source: "grant", amount: 5000, revenueDate: "2026-06-04", description: "دعم سنوي من الجماعة الترابية" }
      ],
      notifications: [
        { id: 1, recipientType: "customer", recipientId: 2, channel: "whatsapp", eventType: "payment_late", message: "تذكير ودي: يرجى أداء فاتورة الماء قبل حلول الأجل.", status: "sent", sentAt: "2026-05-15" },
        { id: 2, recipientType: "customer", recipientId: 1, channel: "sms", eventType: "invoice_created", message: "تم إصدار فاتورة شهر ماي بمبلغ 68.25 درهم.", status: "sent", sentAt: "2026-05-05" }
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

  function getStore() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("[DemoEngine] Failed to read store from localStorage", e);
    }
    const seed = getDefaultSeed();
    saveStore(seed);
    return seed;
  }

  function saveStore(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("[DemoEngine] Failed to save store", e);
    }
  }

  function resetStore() {
    const seed = getDefaultSeed();
    saveStore(seed);
    return seed;
  }

  // Next auto-increment ID helper
  function nextId(arr) {
    if (!Array.isArray(arr) || !arr.length) return 1;
    return Math.max(...arr.map(x => Number(x.id) || 0)) + 1;
  }

  // Response constructor helper
  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Determine if Demo mode should activate
  const isStaticEnv = (
    window.location.protocol === "file:" ||
    window.location.hostname.endsWith("github.io") ||
    window.location.search.includes("demo=true") ||
    window.location.hostname === "localhost" && window.location.port === ""
  );

  let demoActive = isStaticEnv;

  // Real-time API simulator
  async function handleDemoRequest(url, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const cleanUrl = url.split("?")[0];
    const query = new URLSearchParams(url.includes("?") ? url.split("?")[1] : "");
    let body = null;
    if (options.body) {
      try { body = typeof options.body === "string" ? JSON.parse(options.body) : options.body; } catch(e){}
    }

    const store = getStore();

    // 1. Auth: Login
    if (cleanUrl.endsWith("/api/v1/auth/login") && method === "POST") {
      const email = body?.email?.toLowerCase().trim();
      const user = store.users.find(u => u.email.toLowerCase() === email);
      if (!user) {
        return jsonResponse({ message: "البريد الإلكتروني غير مسجل" }, 401);
      }
      // Demo mode accepts the user's password or allows quick test
      if (body.password && user.password && body.password !== user.password && body.password !== "demo") {
        return jsonResponse({ message: "كلمة المرور غير صحيحة" }, 401);
      }
      const roleObj = store.roles.find(r => r.name === user.role);
      const permissions = user.role === "Super Admin" || roleObj?.permissions?.includes("*")
        ? store.permissions
        : (roleObj?.permissions || []);

      return jsonResponse({
        ok: true,
        token: "demo-session-token-" + Date.now(),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          permissions
        }
      });
    }

  function enrich(store) {
    const sectorById = new Map((store.sectors || []).map(item => [item.id, item]));
    const customerById = new Map((store.customers || []).map(item => [item.id, item]));
    const meterById = new Map((store.meters || []).map(item => [item.id, item]));
    return {
      customers: (store.customers || []).map(customer => ({
        ...customer,
        sectorName: sectorById.get(customer.sectorId)?.name || ""
      })),
      meters: (store.meters || []).map(meter => ({
        ...meter,
        customerName: customerById.get(meter.customerId)?.fullName || ""
      })),
      invoices: (store.invoices || []).map(invoice => ({
        ...invoice,
        customerName: customerById.get(invoice.customerId)?.fullName || "",
        meterNumber: meterById.get(invoice.meterId)?.meterNumber || "",
        sectorName: sectorById.get(customerById.get(invoice.customerId)?.sectorId)?.name || ""
      })),
      debts: (store.debts || []).map(debt => ({
        ...debt,
        customerName: customerById.get(debt.customerId)?.fullName || "",
        phone: customerById.get(debt.customerId)?.phone || ""
      }))
    };
  }

  function computeDashboard(store) {
    const totalDebt = (store.invoices || []).reduce((sum, invoice) => sum + Math.max(0, (invoice.totalAmount || 0) - (invoice.paidAmount || 0)), 0);
    const paidInvoices = (store.invoices || []).filter(invoice => invoice.status === "paid").length;
    const unpaidInvoices = (store.invoices || []).filter(invoice => invoice.status !== "paid").length;
    const monthConsumption = (store.meterReadings || []).reduce((sum, reading) => sum + (reading.consumption || 0), 0);
    const revenue = (store.revenues || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const expenses = (store.expenses || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const invoiceCount = (store.invoices || []).length || 1;
    return {
      customers: (store.customers || []).length,
      activeCustomers: (store.customers || []).filter(item => item.status === "active").length,
      meters: (store.meters || []).length,
      sectors: (store.sectors || []).length,
      monthConsumption,
      paidInvoices,
      unpaidInvoices,
      totalDebt: Number(totalDebt.toFixed(2)),
      students: (store.students || []).length,
      buses: (store.buses || []).length,
      revenue: Number(revenue.toFixed(2)),
      expenses: Number(expenses.toFixed(2)),
      netBalance: Number((revenue - expenses).toFixed(2)),
      collectionRate: Math.round((paidInvoices / invoiceCount) * 100),
      openRepairs: (store.repairs || []).filter(item => item.status !== "resolved").length,
      pendingNotifications: (store.notifications || []).filter(item => item.status === "pending").length
    };
  }

    // 2. Bootstrap
    if (cleanUrl.endsWith("/api/v1/bootstrap")) {
      const enriched = enrich(store);
      return jsonResponse({
        ...store,
        ...enriched,
        dashboard: computeDashboard(store)
      });
    }

    // 3. Payment collection
    if (cleanUrl.endsWith("/api/v1/payments/collect") && method === "POST") {
      const invoice = store.invoices.find(i => i.id === Number(body.invoiceId));
      if (!invoice) return jsonResponse({ message: "الفاتورة غير موجودة" }, 404);

      const payAmount = Number(body.amount) || invoice.totalAmount - (invoice.paidAmount || 0);
      invoice.paidAmount = (invoice.paidAmount || 0) + payAmount;
      invoice.status = invoice.paidAmount >= invoice.totalAmount ? "paid" : "partial";

      const newPay = {
        id: nextId(store.payments),
        paymentNumber: `PAY-2026-${String(nextId(store.payments)).padStart(4, "0")}`,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        amount: payAmount,
        method: body.method || "cash",
        paymentDate: new Date().toISOString().slice(0, 10),
        reference: body.reference || "CASH-DEMO"
      };
      store.payments.push(newPay);

      // Add to revenues
      store.revenues.push({
        id: nextId(store.revenues),
        source: "water_invoice",
        amount: payAmount,
        revenueDate: newPay.paymentDate,
        description: `أداء فاتورة ${invoice.invoiceNumber}`
      });

      // Remove or reduce debt if open
      const debt = store.debts.find(d => d.invoiceId === invoice.id);
      if (debt) {
        if (invoice.status === "paid") {
          store.debts = store.debts.filter(d => d.id !== debt.id);
        } else {
          debt.amount = Math.max(0, invoice.totalAmount - invoice.paidAmount);
        }
      }

      saveStore(store);
      return jsonResponse({ ok: true, invoice, payment: newPay });
    }

    // 4. Generate invoices from readings in period
    const genInvMatch = cleanUrl.match(/\/api\/v1\/reading-periods\/(\d+)\/generate-invoices/);
    if (genInvMatch && method === "POST") {
      const periodId = Number(genInvMatch[1]);
      const readings = store.meterReadings.filter(r => !store.invoices.some(inv => inv.readingId === r.id));
      let count = 0;
      const activeTariff = store.tariffs.find(t => t.active) || store.tariffs[0];

      readings.forEach(r => {
        const cons = Math.max(0, (r.currentReading || 0) - (r.previousReading || 0));
        let consAmount = 0;
        if (activeTariff && activeTariff.tiers) {
          activeTariff.tiers.forEach(tier => {
            if (cons >= tier.min) {
              const inTier = tier.max ? Math.min(cons, tier.max) - tier.min : cons - tier.min;
              consAmount += Math.max(0, inTier) * tier.price;
            }
          });
        } else {
          consAmount = cons * 3;
        }

        const fees = (activeTariff?.monthlyFee || 10) + (activeTariff?.maintenanceFee || 5);
        const tax = Math.round((consAmount + fees) * (activeTariff?.taxRate || 0.05) * 100) / 100;
        const total = Math.round((consAmount + fees + tax) * 100) / 100;

        const inv = {
          id: nextId(store.invoices),
          invoiceNumber: `INV-2026-${String(nextId(store.invoices)).padStart(4, "0")}`,
          customerId: r.customerId,
          meterId: r.meterId,
          readingId: r.id,
          previousReading: r.previousReading,
          currentReading: r.currentReading,
          consumption: cons,
          consumptionAmount: consAmount,
          feesAmount: fees,
          taxAmount: tax,
          totalAmount: total,
          paidAmount: 0,
          status: "pending",
          invoiceDate: new Date().toISOString().slice(0, 10),
          dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
          qrCode: `INV-2026-${String(nextId(store.invoices)).padStart(4, "0")}`
        };
        store.invoices.push(inv);
        count++;
      });

      saveStore(store);
      return jsonResponse({ ok: true, count });
    }

    // 5. Confirm meter reading
    const confReadingMatch = cleanUrl.match(/\/api\/v1\/meter-readings\/(\d+)\/confirm/);
    if (confReadingMatch && method === "POST") {
      const r = store.meterReadings.find(x => x.id === Number(confReadingMatch[1]));
      if (r) r.status = "confirmed";
      saveStore(store);
      return jsonResponse({ ok: true });
    }

    // 6. Disconnections and reconnects
    const reconnMatch = cleanUrl.match(/\/api\/v1\/disconnections\/(\d+)\/reconnect/);
    if (reconnMatch && method === "POST") {
      const disc = store.disconnections.find(d => d.id === Number(reconnMatch[1]));
      if (disc) {
        disc.status = "reconnected";
        disc.reconnectedAt = new Date().toISOString();
        const cust = store.customers.find(c => c.id === disc.customerId);
        if (cust) cust.status = "active";
      }
      saveStore(store);
      return jsonResponse({ ok: true });
    }

    if (cleanUrl.endsWith("/api/v1/disconnections") && method === "POST") {
      const cust = store.customers.find(c => c.id === Number(body.customerId));
      if (cust) cust.status = "disconnected";
      const disc = {
        id: nextId(store.disconnections),
        customerId: Number(body.customerId),
        reason: body.reason || "تراكم الديون",
        disconnectedAt: new Date().toISOString(),
        reconnectedAt: null,
        reconnectionFee: 50,
        status: "disconnected"
      };
      store.disconnections.push(disc);
      saveStore(store);
      return jsonResponse({ ok: true, id: disc.id });
    }

    // 7. Send debt reminders
    if (cleanUrl.endsWith("/api/v1/debts/send-reminders") && method === "POST") {
      store.debts.forEach(d => {
        store.notifications.push({
          id: nextId(store.notifications),
          recipientType: "customer",
          recipientId: d.customerId,
          channel: "sms",
          eventType: "debt_reminder",
          message: `تذكير بأداء المستحقات المتأخرة بمبلغ ${d.amount} د.م`,
          status: "sent",
          sentAt: new Date().toISOString()
        });
      });
      saveStore(store);
      return jsonResponse({ ok: true, count: store.debts.length });
    }

    // 8. Monthly reports
    if (cleanUrl.endsWith("/api/v1/reports/monthly")) {
      const y = Number(query.get("year")) || 2026;
      const m = Number(query.get("month")) || 6;
      const totalRev = store.revenues.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const totalExp = store.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return jsonResponse({
        ok: true,
        year: y,
        month: m,
        totalRevenues: totalRev,
        totalExpenses: totalExp,
        netBalance: totalRev - totalExp,
        invoicesIssued: store.invoices.length,
        activeSubscribers: store.customers.filter(c => c.status === "active").length
      });
    }

    // 9. Association update
    if (cleanUrl.endsWith("/api/v1/associations") && method === "PUT") {
      store.association = { ...store.association, ...body };
      saveStore(store);
      return jsonResponse({ ok: true, association: store.association });
    }

    // 10. Generic REST Collections (customers, meters, meter-readings, tariffs, students, buses, employees, expenses, revenues, etc.)
    const collectionMatch = cleanUrl.match(/\/api\/v1\/([a-zA-Z0-9_-]+)(?:\/(\d+))?$/);
    if (collectionMatch) {
      let resource = collectionMatch[1];
      const targetId = collectionMatch[2] ? Number(collectionMatch[2]) : null;

      // Map kebab-case or resource plurals to store keys
      const resourceMap = {
        "customers": "customers",
        "meters": "meters",
        "meter-readings": "meterReadings",
        "tariffs": "tariffs",
        "invoices": "invoices",
        "debts": "debts",
        "repairs": "repairs",
        "students": "students",
        "buses": "buses",
        "routes": "routes",
        "transport-subscriptions": "transportSubscriptions",
        "employees": "employees",
        "expenses": "expenses",
        "revenues": "revenues",
        "sectors": "sectors",
        "roles": "roles",
        "users": "users",
        "branches": "branches",
        "office-members": "officeMembers",
        "legal-documents": "legalDocuments",
        "reading-periods": "readingPeriods"
      };

      const key = resourceMap[resource] || resource;
      if (Array.isArray(store[key])) {
        if (method === "GET") {
          if (targetId !== null) {
            const item = store[key].find(x => x.id === targetId);
            return item ? jsonResponse(item) : jsonResponse({ message: "غير موجود" }, 404);
          }
          return jsonResponse(store[key]);
        }

        if (method === "POST") {
          const newItem = { id: nextId(store[key]), ...(body || {}) };
          store[key].push(newItem);
          saveStore(store);
          return jsonResponse({ ok: true, id: newItem.id, ...newItem }, 201);
        }

        if (method === "PUT" && targetId !== null) {
          const idx = store[key].findIndex(x => x.id === targetId);
          if (idx !== -1) {
            store[key][idx] = { ...store[key][idx], ...(body || {}), id: targetId };
            saveStore(store);
            return jsonResponse({ ok: true, item: store[key][idx] });
          }
          return jsonResponse({ message: "غير موجود" }, 404);
        }

        if (method === "DELETE" && targetId !== null) {
          store[key] = store[key].filter(x => x.id !== targetId);
          saveStore(store);
          return jsonResponse({ ok: true });
        }
      }
    }

    // Default fallback
    return jsonResponse({ ok: true, message: "Handled by Demo Engine" });
  }

  // Intercept window.fetch for /api/v1/
  const originalFetch = window.fetch;
  window.fetch = async function(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";

    if (url.includes("/api/v1/")) {
      if (demoActive) {
        return handleDemoRequest(url, init);
      }
      try {
        const resp = await originalFetch(input, init);
        // If server returned 404 or connection error for API, switch to demo mode
        if (resp.status === 404 || resp.status === 502 || resp.status === 503) {
          console.warn("[DemoEngine] Live backend not found, falling back to Demo Engine");
          demoActive = true;
          notifyDemoModeActive();
          return handleDemoRequest(url, init);
        }
        return resp;
      } catch (networkErr) {
        console.warn("[DemoEngine] Network failed, switching to Demo Engine", networkErr);
        demoActive = true;
        notifyDemoModeActive();
        return handleDemoRequest(url, init);
      }
    }

    return originalFetch.apply(this, arguments);
  };

  function notifyDemoModeActive() {
    window.IS_DEMO_MODE = true;
    document.dispatchEvent(new CustomEvent("association:demomode", { detail: { active: true } }));
    renderDemoBanner();
  }

  function renderDemoBanner() {
    if (document.getElementById("demo-mode-pill")) return;
    const pill = document.createElement("div");
    pill.id = "demo-mode-pill";
    pill.className = "demo-mode-pill";
    pill.innerHTML = `
      <span class="pulse-dot"></span>
      <span><strong>نمط المعاينة الحية</strong> (Interactive Demo)</span>
      <button id="btn-reset-demo" title="إعادة تعيين بيانات التجربة">🔄 استعادة البيانات الافتراضية</button>
    `;
    document.body.appendChild(pill);
    document.getElementById("btn-reset-demo")?.addEventListener("click", () => {
      if (confirm("هل ترغب في إعادة ضبط جميع بيانات التجربة إلى حالتها الافتراضية؟")) {
        resetStore();
        window.location.reload();
      }
    });
  }

  // Quick Demo Login helper for the portfolio UI
  window.quickDemoLogin = function(roleName = "Super Admin") {
    const store = getStore();
    const user = store.users.find(u => u.role === roleName) || store.users[0];
    const emailInput = document.getElementById("li-email");
    const passInput = document.getElementById("li-pass");
    const form = document.getElementById("login-form");

    if (emailInput && passInput && form) {
      emailInput.value = user.email;
      passInput.value = user.password || "admin123";
      form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  };

  window.resetDemoData = function() {
    resetStore();
    window.location.reload();
  };

  // Check backend availability on boot
  if (!demoActive) {
    originalFetch("/api/v1/bootstrap", { method: "HEAD", signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined })
      .then(res => {
        if (!res.ok) notifyDemoModeActive();
      })
      .catch(() => {
        notifyDemoModeActive();
      });
  } else {
    window.addEventListener("DOMContentLoaded", notifyDemoModeActive);
  }

  window.AssociationDemoEngine = {
    isActive: () => demoActive,
    getStore,
    saveStore,
    resetStore
  };
})();
