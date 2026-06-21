# HQQ OMS — تطبيق أندرويد (TWA)

تطبيق أندرويد يغلّف الموقع `https://hqq-tech.com` كتطبيق أصلي (Trusted Web Activity)
عبر [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). أونلاين (يتطلب إنترنت).

- معرّف الحزمة: `com.hqq.oms`
- الاسم: `HQQ OMS`
- الإصدار: 1.0.0 (versionCode 1)

## المخرجات
بعد البناء تُوضع في `dist/` (غير محفوظة في git):
- `HQQ-OMS.apk` — للتثبيت المباشر على الجوال (sideload).
- `HQQ-OMS.aab` — للرفع على Google Play.

## متطلبات البناء (مثبّتة على هذا الجهاز)
- JDK 17 — `C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot`
- Android SDK — `C:\Android\sdk` (build-tools 34.0.0, platform android-34, platform-tools)

## إعادة البناء
```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
$env:ANDROID_HOME = "C:\Android\sdk"
cd C:\Users\Lenovo\Projects\hqq-oms\apps\android
.\gradlew.bat assembleRelease bundleRelease
```
ثم التوقيع (zipalign + apksigner للـ APK، و jarsigner للـ AAB) باستخدام `android.keystore`.

## مفتاح التوقيع (مهم جداً)
- الملف: `android.keystore` (alias: `hqq`) — **غير محفوظ في git**.
- كلمة المرور في `KEYSTORE-SECRET.txt` — **غير محفوظ في git**.
- ⚠️ احتفظ بنسخة احتياطية من الملفين في مكان آمن. فقدانهما يمنع تحديث التطبيق على Google Play لاحقاً.

## ربط الدومين (لإخفاء شريط العنوان)
حتى يفتح التطبيق بملء الشاشة بدون شريط عنوان، يجب نشر ملف التحقق على الموقع:
`apps/web/public/.well-known/assetlinks.json` → يُخدَم على `https://hqq-tech.com/.well-known/assetlinks.json`

بصمة التوقيع (SHA-256):
```
20:BD:DF:CA:A1:84:16:44:DA:68:AA:B3:64:20:DF:5E:32:FD:7E:F3:72:B2:A5:8E:BE:78:BF:FA:64:72:C9:B1
```
بعد نشر الموقع، تحقّق: `https://hqq-tech.com/.well-known/assetlinks.json` يرجّع الـ JSON.

## التثبيت على الجوال
انقل `dist/HQQ-OMS.apk` إلى الجوال وافتحه، واسمح بالتثبيت من "مصادر غير معروفة".
