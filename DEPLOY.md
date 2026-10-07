# دليل التشغيل والنشر — Association Management System

> ملاحظة: النسخة السابقة من هذا الملف كانت تالفة (ترميز غير صالح)، تمت إعادة كتابتها هنا.

المشروع عبارة عن سيرفر Node.js خام (بدون Express) يتصل بقاعدة بيانات MySQL عبر حزمة
`mysql2`، وواجهة أمامية بـ HTML/CSS/JS عادي بدون إطار عمل.

---

## 1) التشغيل المحلي عبر XAMPP

XAMPP هنا يوفّر **MySQL/MariaDB و phpMyAdmin فقط**. Apache غير مستخدم لأن المشروع Node.js
وليس PHP، والسيرفر يخدم نفسه على منفذه الخاص (5173 افتراضياً).

1. شغّل خدمة **MySQL** من XAMPP Control Panel.
2. أنشئ قاعدة بيانات باسم `association` عبر `http://localhost/phpmyadmin`.
3. نفّذ محتوى `schema.sql` من تبويب **SQL** في phpMyAdmin (ينشئ جدولي `app_config` و `store_data`).
4. تأكد من وجود ملف `.env` بالجذر (منسوخ مسبقاً بإعدادات XAMPP الافتراضية: `root` بدون كلمة سر).
5. من الطرفية داخل مجلد المشروع:
   ```powershell
   npm install
   npm run dev
   ```
   أو انقر مرتين على `start.cmd`.
6. افتح `http://127.0.0.1:5173` — بيانات دخول تجريبية: `admin@example.com` / `admin123`.

---

## 2) النشر على استضافة تدعم Node.js (مثل cPanel)

| المتطلب | الحد الأدنى |
|---------|------------|
| Node.js | 18 أو 20 (عبر Node.js Selector في cPanel) |
| MySQL | 5.7+ أو MariaDB 10.4+ |

### الخطوات

1. **قاعدة البيانات**: cPanel → MySQL Databases → أنشئ قاعدة (مثلاً `cpaneluser_association`)
   ومستخدماً بصلاحيات كاملة عليها، ثم نفّذ `schema.sql` عبر phpMyAdmin.
2. **رفع الملفات**: ارفع مجلد المشروع (بدون `node_modules`) عبر File Manager أو Git، ثم
   عبر SSH أو Terminal في cPanel:
   ```bash
   npm install --omit=dev
   ```
3. **ملف `.env`** على الخادم:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=cpaneluser_association
   DB_PASS=your_password
   DB_NAME=cpaneluser_association
   ```
4. **Setup Node.js App** في cPanel: حدد نسخة Node، مجلد التطبيق، ورابط التطبيق، واجعل
   ملف البدء `server.js`، ثم Run NPM Install و Start.

### مشاكل شائعة

| المشكلة | الحل |
|---------|------|
| `Access denied for user` | تحقق من `DB_USER`/`DB_PASS` في `.env` |
| `Unknown database` | تأكد أن `DB_NAME` مطابق لاسم القاعدة الفعلي |
| `Cannot find module mysql2` | نفّذ `npm install` من جديد |
| الواجهة لا تظهر | تأكد أن `PUBLIC_DIR` في `server.js` يشير لمجلد المشروع نفسه |

---

## 3) النشر على GitHub Pages (للمعاينة الحية التفاعلية)

يدعم المشروع وضع **Interactive Client-side Demo** عبر محرك `demo-engine.js` الذي يعمل في المتصفح تلقائياً دون الحاجة إلى تشغيل خادم خلفي:

1. ادخل إلى إعدادات المستودع على GitHub: **Settings** -> **Pages**.
2. في قسم **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main** / Folder: **/ (root)**
3. انقر **Save**.
4. خلال دقيقة، سيتم نشر المعاينة الحية على الرابط:
   `https://<username>.github.io/<repository-name>/`
   *(يستطيع أي زائر أو زبون تجربة النظام بكامل وظائفه مع حفظ البيانات محلياً في متصفحه)*.

---

## 4) النسخ الاحتياطي

جميع بيانات التطبيق مخزّنة في صف واحد داخل جدول `store_data` (JSON). النسخ الاحتياطي عبر
تصدير الجدول من phpMyAdmin، أو:

```bash
mysqldump -u root association > backup_$(date +%Y%m%d).sql
```

