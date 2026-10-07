# 📘 توثيق مشروع نظام إدارة الجمعية
**Association Management System — Water & School Transport**
> نسخة: MVP v2 | التاريخ: 2026-06 | البيئة: Node.js + Vanilla JS (بدون إطار خارجي)

---

## 📋 فهرس المحتويات

1. [نظرة عامة](#-نظرة-عامة)
2. [هيكل المشروع](#-هيكل-المشروع)
3. [التشغيل والإعداد](#-التشغيل-والإعداد)
4. [المعمارية التقنية](#-المعمارية-التقنية)
5. [نظام المصادقة والأدوار RBAC](#-نظام-المصادقة-والأدوار-rbac)
6. [نظام فترات القراءة](#-نظام-فترات-القراءة)
7. [REST API — المسارات الكاملة](#-rest-api--المسارات-الكاملة)
8. [نموذج البيانات](#-نموذج-البيانات)
9. [الوحدات الوظيفية](#-الوحدات-الوظيفية)
10. [واجهة المستخدم](#-واجهة-المستخدم)
11. [التقارير الشهرية](#-التقارير-الشهرية)
12. [قاعدة البيانات PostgreSQL](#-قاعدة-البيانات-postgresql)
13. [مسارات التطوير المستقبلي](#-مسارات-التطوير-المستقبلي)

---

## 🌐 نظرة عامة

نظام ERP محلي متكامل لإدارة جمعية توزيع **الماء الصالح للشرب** و**النقل المدرسي**، يشمل:

| المجال | الوصف |
|--------|-------|
| 💧 الماء | المشتركون، العدادات، القراءات، الفواتير، التحصيل، القطع، الديون |
| 🚌 النقل المدرسي | التلاميذ، الحافلات، المسارات، الاشتراكات |
| 💼 المالية | المحاسبة، المداخيل، المصاريف، التقارير الشهرية |
| 👥 الموارد البشرية | الموظفون، الحضور، الرواتب |
| 🏛️ الجمعية | الفروع، أعضاء المكتب، الوثائق القانونية |
| 🔐 الأمن | مصادقة بكلمة مرور + صلاحيات RBAC كاملة |
| 📊 التقارير | تقارير شهرية مفصّلة بأشرطة بصرية ومقارنة سنوية |

---

## 📁 هيكل المشروع

```
Association Management System/
│
├── server.js              # الخادم الرئيسي (API + static files)  ~936 سطر
├── package.json           # إعدادات npm (script: npm run dev)
├── README.md              # دليل التشغيل السريع
├── DOCUMENTATION.md       # هذا الملف — التوثيق الشامل
│
├── public/
│   ├── index.html         # واجهة HTML (شاشة الدخول + هيكل التطبيق)  ~180 سطر
│   ├── app.js             # منطق الواجهة (Vanilla JS)  ~1773 سطر
│   └── styles.css         # التنسيق (RTL + login + period + reports)  ~950 سطر
│
├── data/
│   └── store.json         # قاعدة بيانات JSON (تُحفظ تلقائياً)
│
└── database/
	└── schema.sql         # مخطط PostgreSQL الجاهز للنقل
```

---

## 🚀 التشغيل والإعداد

### المتطلبات
- **Node.js** v18+ (تم الاختبار على v24.14.1)
- لا حاجة لـ npm install (لا حزم خارجية)

### التشغيل
```powershell
npm run dev
# أو مباشرة:
node server.js
```

### فتح التطبيق
```
http://127.0.0.1:5173
```

### بيانات الدخول الافتراضية

| الدور | البريد الإلكتروني | كلمة المرور |
|-------|------------------|-------------|
| المدير العام (Super Admin) | admin@example.com | admin123 |
| أمين المال (Treasurer) | treasurer@example.com | treas123 |
| قارئ العدادات (Meter Reader) | reader@example.com | reader123 |
| مسؤول النقل (Transport Manager) | transport@example.com | trans123 |
| المحاسب (Accountant) | accountant@example.com | accnt123 |

---

## 🏗️ المعمارية التقنية

```
┌─────────────────────────────────────────────────┐
│             المتصفح (Browser)                    │
│  public/index.html + app.js + styles.css         │
│  ┌──────────┐  ┌────────────┐  ┌─────────────┐ │
│  │ Login UI │  │  SPA Views │  │ RBAC Client │ │
│  └──────────┘  └────────────┘  └─────────────┘ │
└────────────────────┬────────────────────────────┘
					 │ HTTP fetch (JSON)
					 │ Header: X-User-Email
┌────────────────────▼────────────────────────────┐
│             server.js (Node.js http)             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Auth API │  │ RBAC MW  │  │ Static Serve │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│  ┌──────────────────────────────────────────┐   │
│  │         REST API /api/v1/*               │   │
│  │  CRUD + readings + payments + reports    │   │
│  └──────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────┘
					 │ readStore / writeStore
┌────────────────────▼────────────────────────────┐
│           data/store.json                        │
│     (JSON persistence — all entities)            │
└─────────────────────────────────────────────────┘
```

### مكدس التقنيات

| الطبقة | التقنية |
|--------|---------|
| الخادم | Node.js (built-in `http`, `fs`, `path`, `crypto`) |
| الواجهة | Vanilla JS ES6+ (بدون React/Vue) |
| التنسيق | CSS3 مخصص (RTL، متجاوب) |
| البيانات | JSON store (قابل للنقل إلى PostgreSQL) |
| الأمن | كلمة مرور نصية + RBAC + X-User-Email header |
| المنفذ | 5173 (قابل للتغيير بـ env PORT) |

---

## 🔐 نظام المصادقة والأدوار RBAC

### آلية المصادقة

```
1. POST /api/v1/auth/login { email, password }
2. الخادم يتحقق من كلمة المرور ويعيد { token, user: { ...userData, permissions: [...] } }
3. الجلسة تُحفظ في localStorage
4. كل طلب API يرسل header: X-User-Email للتحقق من الصلاحيات
5. الخادم يستخدم rbacCheck(permission) على كل عملية حساسة
```

### الأدوار والصلاحيات

| الدور | الصلاحيات |
|-------|-----------|
| **Super Admin** | `*` — كل الصلاحيات |
| **Treasurer** | `payments.collect`, `accounting.manage`, `reports.export` |
| **Meter Reader** | `meters.read`, `readings.create` |
| **Transport Manager** | `transport.manage` |
| **Accountant** | `accounting.manage` |
| **President** | `dashboard.view`, `reports.view`, `association.manage` |
| **Secretary** | `customers.manage`, `documents.manage` |
| **Billing Agent** | `invoices.generate`, `payments.collect` |
| **Auditor** | `audit.view`, `reports.view` |

### قائمة الصلاحيات الكاملة

```
dashboard.view
association.view  | association.manage
customers.view    | customers.create    | customers.manage
meters.read       | meters.manage
readings.create   | readings.view
invoices.view     | invoices.generate   | invoices.print
payments.collect  | payments.view
debts.view        | debts.manage
disconnections.manage
repairs.view      | repairs.manage
transport.view    | transport.manage
hr.view           | hr.manage
accounting.view   | accounting.manage
reports.view      | reports.export
notifications.send
audit.view
settings.view     | settings.manage
documents.manage
```

### فلترة التنقل بالدور

كل عنصر في شريط التنقل مرتبط بصلاحية. إذا لم يكن للمستخدم الصلاحية، يُخفى العنصر:

| الصفحة | الصلاحية المطلوبة |
|--------|------------------|
| لوحة التحكم | `dashboard.view` |
| إدارة الجمعية | `association.view` |
| المشتركون | `customers.view` |
| العدادات | `meters.read` |
| القراءات | `readings.view` |
| التعريفة | `settings.view` |
| الفواتير | `invoices.view` |
| الديون | `debts.view` |
| الصيانة | `repairs.view` |
| النقل المدرسي | `transport.view` |
| الموارد البشرية | `hr.view` |
| المحاسبة | `accounting.view` |
| التقارير | `reports.view` |
| الإشعارات | `notifications.send` |
| الإعدادات | `settings.view` |

---

## 📅 نظام فترات القراءة

### آلية الفترات

```
فترة القراءة = شهر محدد (label، startDate، endDate، status: open/closed)
```

### القواعد المُطبَّقة

| القاعدة | الوصف |
|---------|-------|
| **فترة واحدة مفتوحة** | لا يمكن وجود أكثر من فترة مفتوحة في نفس الوقت |
| **تاريخ في نطاق الفترة** | يُرفض أي إدخال تاريخه خارج [startDate, endDate] |
| **عدم التكرار** | لا يمكن إدخال نفس العداد مرتين في الفترة الواحدة |
| **إغلاق الفترة** | بعد إغلاق الفترة، لا يمكن إضافة قراءات جديدة لها |

### مسارات الفترات

```
GET  /api/v1/reading-periods         → قائمة الفترات
GET  /api/v1/reading-periods/active  → الفترة المفتوحة الحالية
POST /api/v1/reading-periods         → فتح فترة جديدة
POST /api/v1/reading-periods/close   → إغلاق الفترة الحالية
```

### واجهة إدارة الفترات (صفحة الإعدادات)

- بانر يعرض: اسم الفترة، النطاق الزمني، تقدم الإنجاز (N/M عداد)
- زر إغلاق الفترة الحالية
- نموذج فتح فترة جديدة (يُعطَّل إذا كانت فترة مفتوحة)
- جدول تاريخ الفترات

---

## 🔌 REST API — المسارات الكاملة

### المصادقة
```
POST /api/v1/auth/login
  Body: { email, password }
  Response: { token, user: { id, name, email, role, permissions[] } }
```

### الإحصائيات
```
GET /api/v1/bootstrap     → كل البيانات (للتهيئة الأولية)
GET /api/v1/dashboard     → مؤشرات لوحة التحكم
```

### الجمعية
```
GET  /api/v1/associations
PUT  /api/v1/associations         → تعديل بيانات الجمعية
GET  /api/v1/branches
POST /api/v1/branches
PUT  /api/v1/branches/:id
DELETE /api/v1/branches/:id
GET  /api/v1/office-members
POST /api/v1/office-members
GET  /api/v1/legal-documents
POST /api/v1/legal-documents
```

### المشتركون
```
GET    /api/v1/customers
POST   /api/v1/customers
PUT    /api/v1/customers/:id
DELETE /api/v1/customers/:id
GET    /api/v1/sectors
POST   /api/v1/sectors
```

### العدادات والقراءات
```
GET    /api/v1/meters
POST   /api/v1/meters              [requires: meters.manage]
PUT    /api/v1/meters/:id          [requires: meters.manage]
DELETE /api/v1/meters/:id          [requires: meters.manage]
GET    /api/v1/meter-readings
POST   /api/v1/meter-readings      [requires: readings.create]
  Body: { meterId, currentReading, readingDate, previousReading?, notes? }
  → يتحقق من الفترة، التاريخ، عدم التكرار
  → ينشئ فاتورة تلقائياً إذا كانت القراءة صحيحة
GET  /api/v1/reading-periods
GET  /api/v1/reading-periods/active
POST /api/v1/reading-periods
POST /api/v1/reading-periods/close
```

### التعريفة
```
GET  /api/v1/tariffs
POST /api/v1/tariffs
PUT  /api/v1/tariffs/:id
```

### الفواتير والتحصيل
```
GET  /api/v1/invoices
POST /api/v1/payments/collect      [requires: payments.collect]
  Body: { invoiceId, amount, method, paymentDate?, reference? }
  → يُحدِّث حالة الفاتورة + يُنشئ مدخل في revenues
GET  /api/v1/payments
GET  /api/v1/debts
POST /api/v1/debts/send-reminders  [requires: debts.manage]
  Body: { channel: sms|whatsapp|email|push }
```

### القطع وإرجاع الخدمة
```
GET  /api/v1/disconnections
POST /api/v1/disconnections        [requires: disconnections.manage]
  Body: { customerId, reason, reconnectionFee? }
POST /api/v1/disconnections/:id/reconnect  [requires: disconnections.manage]
```

### الصيانة
```
GET    /api/v1/repairs
POST   /api/v1/repairs             [requires: repairs.manage]
PUT    /api/v1/repairs/:id         [requires: repairs.manage]
DELETE /api/v1/repairs/:id         [requires: repairs.manage]
```

### النقل المدرسي
```
GET    /api/v1/students
POST   /api/v1/students            [requires: transport.manage]
PUT    /api/v1/students/:id
DELETE /api/v1/students/:id
GET    /api/v1/buses
POST   /api/v1/buses
GET    /api/v1/routes
POST   /api/v1/routes
GET    /api/v1/transport-subscriptions
POST   /api/v1/transport-subscriptions
PUT    /api/v1/transport-subscriptions/:id
```

### الموارد البشرية
```
GET    /api/v1/employees
POST   /api/v1/employees           [requires: hr.manage]
PUT    /api/v1/employees/:id
DELETE /api/v1/employees/:id
GET    /api/v1/attendances
POST   /api/v1/attendances
```

### المحاسبة
```
GET    /api/v1/expenses
POST   /api/v1/expenses            [requires: accounting.manage]
PUT    /api/v1/expenses/:id
DELETE /api/v1/expenses/:id
GET    /api/v1/revenues
POST   /api/v1/revenues
```

### الإشعارات
```
GET  /api/v1/notifications
POST /api/v1/notifications
```

### التقارير
```
GET /api/v1/reports/monthly?year=YYYY&month=MM
  Response: {
	year, month, monthLabel, monthlyAgg[12], 
	current: { invoices, payments, expenses, revenues, readings, debts },
	summary: { invoicesCount, invoicesTotal, paidTotal, unpaidTotal,
			   paymentsTotal, expensesTotal, revenuesTotal, netBalance,
			   consumption, readingsCount, debtsCount, debtsTotal }
  }
GET /api/v1/reports/:type     → تقرير عام (financial-year, consumption, etc.)
```

### الإعدادات
```
GET    /api/v1/roles
POST   /api/v1/roles
PUT    /api/v1/roles/:id
GET    /api/v1/users
POST   /api/v1/users
PUT    /api/v1/users/:id         [requires: settings.manage]
DELETE /api/v1/users/:id         [requires: settings.manage]
GET    /api/v1/audit-logs
```

---

## 🗄️ نموذج البيانات

### الجداول الرئيسية

```
association          → بيانات الجمعية (id, name, registrationNumber, phone, email...)
branches             → الفروع (id, name, location, managerId...)
officeMembers        → أعضاء المكتب (id, name, position, phone...)
legalDocuments       → الوثائق القانونية (id, title, number, expiresAt, status)
users                → المستخدمون (id, name, email, password, role, status)
roles                → الأدوار (id, name, permissions[])
permissions          → قائمة الصلاحيات []
sectors              → القطاعات (id, code, name, manager, subscribers)
customers            → المشتركون (id, subscriptionNumber, fullName, nationalId, phone, sectorId, status)
meters               → العدادات (id, customerId, meterNumber, type, diameter, brand, installationDate, status, lastReading)
tariffs              → التعريفة (id, name, type, monthlyFee, maintenanceFee, taxRate, tiers[])
meterReadings        → قراءات العدادات (id, meterId, customerId, periodId, previousReading, currentReading, consumption, readingDate)
readingPeriods       → فترات القراءة (id, label, startDate, endDate, status, year, month)
invoices             → الفواتير (id, invoiceNumber, customerId, meterId, periodId, consumption, totalAmount, paidAmount, status, invoiceDate)
payments             → الأداءات (id, paymentNumber, invoiceId, customerId, amount, method, paymentDate)
debts                → الديون (id, customerId, invoiceId, amount, dueDate, monthsOverdue, status)
disconnections       → القطع (id, customerId, reason, disconnectedAt, reconnectedAt, reconnectionFee, status)
repairs              → الصيانة (id, type, description, reportedAt, assignedTo, status)
students             → التلاميذ (id, registrationNumber, fullName, schoolName, gradeLevel, guardianName, guardianPhone, village, status)
buses                → الحافلات (id, busNumber, driver, assistant, capacity, status)
routes               → المسارات (id, busId, village, startPoint, endPoint, scheduleTime)
transportSubscriptions → اشتراكات النقل (id, studentId, routeId, monthlyFee, startDate, endDate, status)
employees            → الموظفون (id, fullName, jobTitle, phone, salary, status)
attendances          → الحضور (id, employeeId, date, status, notes)
expenses             → المصاريف (id, category, amount, expenseDate, description)
revenues             → المداخيل (id, source, amount, revenueDate, description)
notifications        → الإشعارات (id, recipientType, recipientId, channel, eventType, message, status)
auditLogs            → سجل التدقيق (id, userId, action, entityType, entityId, newValues, createdAt)
```

### حساب الفواتير (التعريفة الشرائحية)

```
الاستهلاك (م³) | السعر (د.م./م³)
0  – 10         → 2.00
11 – 20         → 3.00
21 – 40         → 5.00
41+             → 7.00

المبلغ الكلي = استهلاك + رسم شهري (10) + رسم صيانة (5) + ضريبة 5%
```

---

## 📦 الوحدات الوظيفية

### 1. 🏠 لوحة التحكم
- 6 بطاقات KPI: المشتركون النشطون، العدادات، الفواتير غير المؤداة، الديون، المداخيل، التلاميذ
- قائمة الأعطاب المفتوحة
- آخر الأداءات
- شريط المؤشرات: نسبة التحصيل، الأعطاب المفتوحة، الإشعارات المعلقة

### 2. 🏛️ إدارة الجمعية
- تعديل بيانات الجمعية (اسم، رقم التسجيل، عنوان، هاتف)
- إدارة الفروع (إضافة/تعديل/حذف)
- إدارة أعضاء المكتب
- إدارة الوثائق القانونية مع تتبع الانتهاء

### 3. 👥 المشتركون والقطاعات
- إضافة/تعديل/حذف مشترك (البيانات الكاملة: CIN، الهاتف، القطاع، GPS)
- إدارة القطاعات الجغرافية
- فلتر بحث فوري
- حالة المشترك: فعال / مفصول

### 4. 📟 العدادات
- ربط العداد بالمشترك
- تتبع: النوع، القطر، الماركة، تاريخ التركيب، آخر صيانة
- عرض آخر قراءة
- حالة العداد: فعال / مفصول / صيانة

### 5. 📊 قراءات العدادات (مقيَّدة بالفترة)
- بانر الفترة: اسم الفترة، النطاق الزمني، تقدم الإنجاز
- العدادات المُسجَّلة تظهر معطَّلة (تم التسجيل ✅)
- حقل التاريخ مقيَّد بـ min/max للفترة
- إنشاء فاتورة تلقائي عند القراءة الصحيحة
- كشف الشذوذات: قراءة سالبة، استهلاك غير طبيعي

### 6. 💲 التعريفة والشرائح
- تعديل الشرائح الأربع
- الرسوم الشهرية والصيانة والضريبة
- عرض جدول حساب تجريبي

### 7. 🧾 الفواتير والتحصيل
- قائمة الفواتير مع الفلترة (حالة الدفع، الفترة)
- طباعة فاتورة لكل مشترك (print CSS مخصص)
- إرسال تذكير
- تسجيل أداء (دفع كلي أو جزئي)
- نسخة QR لكل فاتورة

### 8. ⚠️ الديون والقطع
- قائمة الديون المتراكمة مع شهور التأخر
- إرسال تذكيرات جماعية (SMS/WhatsApp/Email/Push)
- إصدار أمر القطع
- إرجاع الخدمة (مع رسم إعادة التوصيل)
- طباعة كشف الديون

### 9. 🔧 الصيانة والأعطاب
- تسجيل الأعطاب (تسرب، عداد، شبكة...)
- تعيين التقني المسؤول
- تتبع الحالة: مفتوح / قيد الإصلاح / تم الإغلاق

### 10. 🚌 النقل المدرسي
- إدارة التلاميذ (البيانات الكاملة + ولي الأمر)
- إدارة الحافلات (السائق، المساعد، الطاقة)
- إدارة المسارات (نقطة الانطلاق، الوجهة، التوقيت)
- اشتراكات النقل الشهرية مع تتبع الحالة

### 11. 👤 الموارد البشرية
- قائمة الموظفين مع الراتب
- تسجيل الحضور (حاضر / غائب / متأخر)
- كشف رواتب (نموذج بيانات)

### 12. 📒 المحاسبة
- تسجيل المصاريف (الوقود، الكهرباء، الرواتب، صيانة...)
- تسجيل المداخيل (فواتير الماء، النقل، المنح...)
- ملخص مالي: مداخيل، مصاريف، الرصيد الصافي

### 13. 🔔 الإشعارات
- إرسال إشعارات مخصصة (SMS / WhatsApp / Email / Push)
- قائمة الإشعارات المرسلة والمعلقة

---

## 📈 التقارير الشهرية

### صفحة التقارير — 7 أبواب

| الباب | المحتوى |
|-------|---------|
| **📊 الملخص** | 6 بطاقات KPI للشهر المحدد |
| **📈 المقارنة السنوية** | جدول 12 شهراً بأشرطة بصرية ملوّنة |
| **🧾 الفواتير** | جدول تفصيلي: الزبون، العداد، الاستهلاك، المبلغ، الحالة |
| **✅ الأداءات** | جدول: الزبون، المبلغ، طريقة الدفع، التاريخ |
| **⚠️ الديون** | جدول: الزبون، الفاتورة، المبلغ، تاريخ الاستحقاق |
| **💧 القراءات** | جدول: الزبون، القراءة السابقة/الحالية، الاستهلاك |
| **💼 المحاسبة** | المصاريف والمداخيل جنباً إلى جنب |

### فلاتر التقارير
- اختيار السنة (2024–2028)
- اختيار الشهر (يناير–دجنبر)
- زر تحميل + زر طباعة

### Endpoint التقارير
```
GET /api/v1/reports/monthly?year=2026&month=6
```

---

## 🗃️ قاعدة البيانات PostgreSQL

الملف `database/schema.sql` يحتوي على مخطط كامل لجميع الجداول جاهز للنقل من JSON إلى PostgreSQL. يشمل:

- جميع الجداول المذكورة في نموذج البيانات
- المفاتيح الأجنبية (Foreign Keys)
- الفهارس (Indexes)
- نوع البيانات المناسب (VARCHAR، INTEGER، DECIMAL، TIMESTAMP...)

---

## 🔮 مسارات التطوير المستقبلي

### قريباً (النسخة التالية)
- [ ] واجهة إدخال احترافية لكل دور (Meter Reader، Accountant، Transport Manager...)
- [ ] تصدير التقارير PDF حقيقي (باستخدام مكتبة jsPDF أو Puppeteer)
- [ ] تصدير Excel حقيقي (XLSX)
- [ ] إشعارات فورية (WebSocket)

### على المدى المتوسط
- [ ] النقل إلى **Laravel 12** + PostgreSQL (المسارات والجداول جاهزة)
- [ ] تطبيق موبايل (React Native أو Flutter)
- [ ] تكامل SMS حقيقي (Twilio / Nexmo)
- [ ] خريطة تفاعلية للعدادات (Leaflet.js)
- [ ] نسخ احتياطي تلقائي لقاعدة البيانات

### على المدى البعيد
- [ ] نظام SaaS متعدد المستأجرين (Multi-tenant)
- [ ] ذكاء اصطناعي لكشف الشذوذات في الاستهلاك
- [ ] دعم دفع إلكتروني (CMI، PayPal)
- [ ] تطبيق قارئ العدادات على الهاتف مع GPS والكاميرا

---

## ⚙️ ملاحظات تقنية مهمة

### البيانات المحفوظة
- كل العمليات (إضافة، تعديل، حذف) تُحفظ فوراً في `data/store.json`
- `upgradeStore()` يُجري نقل البيانات تلقائياً عند التشغيل

### ترميز الملفات
- جميع الملفات بترميز **UTF-8 بدون BOM** لتجنب أخطاء JSON.parse

### RBAC — تدفق الأمان
```
Client → X-User-Email header → rbacCheck(permission) → rbacDeny(403) أو المتابعة
```

### نقل البيانات إلى Laravel
```
1. تثبيت PHP 8.2+ و Composer
2. laravel new association-system
3. نقل schema.sql إلى migrations
4. نقل المسارات من server.js إلى routes/api.php
5. نقل البيانات من store.json إلى seeders
```

---

*آخر تحديث: يونيو 2026 | المطوّر: GitHub Copilot + فريق المشروع*
