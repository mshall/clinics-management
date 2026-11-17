# ETA rejection runbook (MN-04)

Use with **Administration → Governance → Failing operations** (category **FISCAL**) and **ETA production health**. UI strings: `compliance.etaRunbook.*` (EN + AR).

## credentials — / بيانات الاعتماد

**EN:** Rotate client ID/secret on the ETA portal. Clinic → Receipt devices → Credentials → save; confirm **Test connection**. Worker marks device `CREDENTIALS_EXPIRED` on 401/403.

**AR:** جدّد معرّف العميل والسر على بوابة ETA. العيادة → أجهزة الإيصال → بيانات الاعتماد → احفظ؛ اختبر الاتصال. يعلّم العامل الجهاز `CREDENTIALS_EXPIRED` عند 401/403.

## validation — / رفض التحقق

**EN:** Open rejected row → **Fix & resend** with corrected buyer name, item code, RIN, or branch. Permanent 4xx stays `REJECTED`; do not edit the original UUID.

**AR:** افتح الصف المرفوض → **إصلاح وإعادة إرسال** مع تصحيح اسم المشتري أو رمز الصنف أو RIN أو الفرع. رفض 4xx الدائم يبقى `REJECTED`؛ لا تعدّل UUID الأصلي.

## duplicate — / مكرر

**EN:** ETA already registered the UUID. System polls status; if **VALID**, submission finalizes. If unclear, use Governance trace and ETA toolkit lookup.

**AR:** ETA سجّل UUID مسبقًا. النظام يستعلم الحالة؛ إذا **VALID** يُكمَل الإرسال. إن لم يتضح، راجع التتبع في الحوكمة وأداة ETA.

## temporary — / مؤقت

**EN:** 5xx, timeout, or rate limit — worker retries with backoff. No manual resubmit unless stuck &gt; 24h after attempts.

**AR:** 5xx أو مهلة أو حد معدل — يعيد العامل المحاولة. لا إعادة إرسال يدوية إلا إذا علِق الإرسال أكثر من 24 ساعة بعد المحاولات.

## buyer_name — / اسم المشتري

**EN:** Amounts ≥ EGP 150,000 need real buyer name at payment. Fix patient name on payment, then resubmit corrected receipt.

**AR:** المبالغ ≥ 150,000 جنيه تحتاج اسم مشتري حقيقي عند الدفع. صحّح اسم المريض على الدفعة ثم أعد الإرسال المصحح.

## item_code — / رمز الصنف

**EN:** Align GPC/item code with org **ETA item code** defaults and clinic overrides. Update Admin → Organization ETA defaults or clinic ETA settings.

**AR:** طابق رمز GPC/الصنف مع افتراضيات المنظمة وإعدادات العيادة. حدّث الإدارة → ETA المنظمة أو إعدادات العيادة.

## branch_trn — / الفرع والرقم الضريبي

**EN:** Verify clinic TRN, licence, branch/POS code, and taxpayer activity code on clinic settings and invoice tax fields.

**AR:** تحقق من الرقم الضريبي والترخيص ورمز الفرع/نقطة البيع ورمز النشاط في إعدادات العيادة والفوترة.

## unknown — / أخرى

**EN:** Copy `errorMessage` from Governance; escalate with correlation id. Do not disable worker for the whole clinic without ops approval.

**AR:** انسخ `errorMessage` من الحوكمة؛ صعّد مع معرّف الارتباط. لا تعطّل عامل الإرسال للعيادة كاملة دون موافقة العمليات.