@echo off
REM تشغيل مشروع association مع MySQL الخاص بـ XAMPP
REM يجب أن يكون XAMPP MySQL مشغّلاً (شغّل XAMPP Control Panel وفعّل MySQL)
REM ويجب تثبيت Node.js على الجهاز (https://nodejs.org)

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [خطأ] Node.js غير مثبت أو غير موجود في PATH.
  echo حمّله من https://nodejs.org ثم أعد المحاولة.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo تثبيت الحزم المطلوبة...
  call npm install
)

if not exist ".env" (
  echo [تنبيه] لا يوجد ملف .env — انسخ .env.example إلى .env واضبط بيانات قاعدة البيانات.
)

echo تشغيل السيرفر على http://127.0.0.1:5173 ...
node server.js
pause
