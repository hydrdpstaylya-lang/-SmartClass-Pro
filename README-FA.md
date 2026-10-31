# SmartClass Pro — بسته منبع آماده انتشار در Vercel

**این فایل یک پروژه منبع (Source) است، نه ZIP استاتیکِ آماده برای Drop.**
برای فعال‌شدن API واقعی، باید پروژه از یک مخزن GitHub در Vercel **Build و Deploy** شود. آپلود فقط `dist`، API را منتقل نمی‌کند.

## آنچه از ZIP ارسالی شما بررسی/اصلاح شده است

- فایل `index.html` در ZIP منبع وجود نداشت؛ فایل ورودی Vite اضافه شد.
- `tsconfig.json` در ZIP نبود؛ برای اینکه build بدون این فایل متوقف نشود، دستور build به `vite build` تغییر کرد. برای تست نوع‌ها در آینده `tsconfig` کامل نیاز است.
- `server/index.mjs` به `raiva/raiva-handler.mjs` اشاره می‌کرد که در ZIP نبود؛ برای اجرای محلی، یک ماژول جایگزین بدون رهگیری سروری ایجاد شد.
- رابط کوچک و **جدید** رایوا (`public/raiva-widget.js`) اضافه شد که از `/api/ai` استفاده می‌کند. این بازسازی دقیقِ رایوای قدیمی شما نیست، چون سورس اصلی آن ارسال نشده است.
- توابع Vercel در `api/index.mjs` و `server-vercel/` اضافه شد تا `/api/health`, `/api/ai`, حساب‌های کاربری و پنل کاربران و آزمون‌ساز به backend وصل شوند.
- حساب‌ها به جای فایل SQLite محلی، از جداول Supabase استفاده می‌کنند.
- فایل سرویس‌ورکر اصلاح شد تا نسخه سفید قدیمی در حافظه مرورگر گیر نکند.

## ۱ — انتشار پروژه با GitHub و Vercel

1. فایل ZIP این بسته را در ویندوز Extract کن.
2. **محتویات** پوشه `SmartClass-Vercel-Complete` را در ریشه مخزن GitHub مخصوص پروژه قرار بده. پوشه `src`، پوشه `api`، `public`، `package.json`، `index.html` و `vercel.json` باید در ریشه دیده شوند.
3. از GitHub مخزن خودت را در Vercel Import کن: `Vercel Dashboard → Add New → Project → Import Git Repository`.
4. **Root Directory** را روی ریشه مخزن بگذار (اگر فایل‌ها را در پوشه اضافه‌ای آپلود کردی، همان پوشه را انتخاب کن).
5. گزینه Framework Preset را `Vite` قرار بده؛ Build Command: `npm run build`؛ Output Directory: `dist`؛ Node.js version: `24.x`.
6. Deploy کن. اگر صفحه اصلی باز شد به آدرس `https://YOUR-SITE.vercel.app/api/health` برو.
7. اگر `{"ok":true,"ai":false,"db":false,...}` دیدی، مسیر backend درست است اما هنوز سرویس‌های بیرونی تنظیم نشده‌اند.

**هشدار:** برای این بسته **Vercel Drop/Upload dist به‌تنهایی کافی نیست**. Vercel باید `api` را به عنوان Serverless Function از روی منبع پروژه دریافت کند.

## ۲ — راه‌اندازی پایگاه داده آنلاین حساب مدیر و دانش‌آموز

1. در Supabase (supabase.com) یک پروژه بساز. برای افراد زیر سن قانونی، ثبت‌نام و مدیریت حساب سرویس‌ها باید با رعایت شرایط سنی و همراهی سرپرست انجام شود.
2. در `SQL Editor` فایل `database/setup.sql` را اجرا کن؛ این فایل جدول کاربران، نشست‌ها، پیشرفت و آزمون‌ها را می‌سازد.
3. در Supabase بخش Settings → API (یا API Keys)، Project URL و کلید **سری service_role برای استفاده فقط در سرور** را پیدا کن.
4. در Vercel → Project → Settings → Environment Variables مقدارهای زیر را تنظیم کن:

| Variable | Meaning |
|---|---|
| `SUPABASE_URL` | نشانی HTTPS پروژه Supabase مانند `https://PROJECT.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | کلید دسترسی سروری Supabase؛ **هرگز** در فایل عمومی یا مخزن GitHub قرار نده |

5. روی `Redeploy` بزن. حالا `https://YOUR-SITE.vercel.app/account/` را باز کن و حساب خودت را ایجاد کن.
6. **برای اولین مدیر:** در SQL Editor و فقط پس از ساخت حساب، این دستور را با نام کاربری واقعی خودت اجرا کن:

```sql
update public.sc_users set role='admin' where username='YOUR_USERNAME';
```

7. از حساب خارج و دوباره وارد شو. `/admin-users/` باید فهرست کاربران را فقط برای مدیر فعال نمایش بدهد.

**نکته:** حساب‌های SQLite قبلی لپ‌تاپ به طور خودکار منتقل نمی‌شوند. این یک پایگاه داده جدید است؛ برای انتقال حساب‌های قبلی باید مهاجرتِ جداگانه و امن انجام شود. برای حساب مدیر یک رمز جدید و قوی بساز؛ رمزهای قبلی را در GitHub یا گفتگو منتشر نکن.

## ۳ — اتصال رایوا و API هوش مصنوعی

در Vercel → Settings → Environment Variables این موارد را مطابق سرویس خودت تنظیم کن:

**Cloudflare Workers AI:**

```text
AI_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=your_32_character_account_id
CLOUDFLARE_API_TOKEN=your_secret_token
AI_ACCESS_CODE=a_long_private_access_code
```

`CLOUDFLARE_MODEL` اختیاری است؛ مدل پیش‌فرض پروژه از `server/ai-provider.mjs` خوانده می‌شود.

**Groq (جایگزین):**

```text
AI_PROVIDER=groq
GROQ_API_KEY=your_secret_key
GROQ_MODEL=openai/gpt-oss-20b
AI_ACCESS_CODE=a_long_private_access_code
```

فقط **یکی از سرویس‌ها** را انتخاب کن. برای تغییر متغیرها Redeploy بزن.

بعد از تنظیم، `/api/health` باید `ai:true` نشان بدهد. روی «رایوا» در گوشه صفحه کلیک کن. اگر وارد حساب نشده‌ای، کد محرمانه AI را در کادر وارد کن. کد فقط در sessionStorage مرورگر ذخیره می‌شود.

**امنیت و هزینه:** اگر AI برای همه کاربران باز باشد، هزینه/سهمیه سرویس مصرف می‌شود. دسترسی AI فقط با حساب فعال یا کد AI امکان‌پذیر است. محدودسازی درون تابع اولیه است و در چند اجرای همزمان سرور تضمین کامل ندارد؛ برای انتشار عمومیِ گسترده نیاز به محدودسازی سراسری و پایش هزینه است.

## ۴ — آدرس‌های آزمایش

- `/` : صفحه اصلی SmartClass
- `/api/health` : وضعیت سرور، AI و DB
- `/account/` : ساخت حساب، ورود، خروج و بازیابی رمز
- `/admin-users/` : مدیریت کاربران (فقط نقش admin)
- `/teacher-exams/` : آزمون‌ساز (فقط نقش teacher و admin)
- «رایوا» : گفت‌وگوی هوشمند از طریق `/api/ai`

## ۵ — محدودیت‌هایی که هنوز برطرف نشده‌اند

- کد اصلی و قدیمی رایوا در ZIP ارسالی نبود؛ نسخهٔ جدیدی از رابط رایوا جایگزین شده است.
- بخش **کلاس زنده / تخته مشترک و تمام امکانات مدرسه (تکلیف/کلاس)** هنوز با SQLite سرور محلی نوشته شده‌اند؛ در Vercel با پیام مشخص `501` غیرفعال می‌مانند. نباید ادعا شود که همه امکانات کامل‌اند.
- قابلیت‌های هوش مصنوعیِ تصویر/PDF برای مدل‌های متنی Cloudflare/Groq فعال نیستند.
- پروژه را به علت نبود دسترسی npm در محیط تهیه بسته، نتوانستم با `npm install` و Vite واقعی Build کنم؛ کدهای JS و تنظیمات JSON با آزمون‌های آفلاین بررسی شده‌اند. اگر Deploy خطا داد، خروجی Build Logs را برای اصلاح دقیق ارسال کن.
- این پروژه قبل از استفاده واقعی توسط کودکان به آزمایش امنیتی، حفظ حریم خصوصی، محدودیت ثبت‌نام و نظارت یک بزرگسال مسئول نیاز دارد.

## عیب‌یابی

- **404 برای صفحه اصلی:** پروژه را به جای Drop از مخزن دارای `index.html`, `src`, `api`, `package.json` به عنوان پروژه **Vite** Import کن.
- **404 برای /api/health:** مطمئن شو `api/index.mjs` و `vercel.json` در ریشه مخزن قرار دارند و Deployment جدید از منبع ساخته شده.
- **`ai:false`:** کلید و مدل API را در Environment Variables بررسی کن؛ حتماً Redeploy.
- **`db:false`:** `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` تنظیم نشده‌اند.
- **صفحه سفید:** F12 → Console را باز کن، خطای نخست را بررسی کن و `Ctrl+Shift+R` بزن. بعد از تغییرات سرویس‌ورکر، از Application → Service Workers نسخه قدیمی را Unregister کن و Reload کن.
- **Admin فقط قفل است:** با حساب جدید وارد شو و نقش `admin` را در SQL تنظیم کن.
