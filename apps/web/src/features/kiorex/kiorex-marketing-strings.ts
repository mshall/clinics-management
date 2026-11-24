/**
 * ALL marketing wording of the Kiorex front door lives in this ONE namespace (`kiorexMarketing`), so the founder and counsel can edit it in one place.
 * NEEDS_HUMAN: founder and counsel must approve every sentence here (benefits, reassurance, fee line, consent text) before launch.
 * Rules the wording follows: only what the product really does today; no prices, no patient numbers, no promises of volume. The fee sentence is built from the published
 * market fee schedule at run time (never typed here); with no schedule the page says the fees are confirmed by the Kiorex team.
 * Product wording that differs per edition uses the `_CLINIC` / `_NURSE` suffix. Functional labels (dashboard, states) live in `kiorexDoor` in kiorex-door-strings.ts.
 */
export const marketingEn = {
  headline: "Reach more patients with Kiorex",
  intro: "Your practice keeps working exactly as it does today. Kiorex is an optional way for new patients to find you and book.",
  benefitsTitle: "What you get",
  benefits: {
    search: { title: "Found in Kiorex search", body: "Patients search Kiorex, see your live open slots and book a time that really is free." },
    deposits: { title: "Optional deposits", body: "You can ask for a deposit when a patient books, to protect your time." },
    reviews: { title: "Verified-visit reviews", body: "Only patients who attended a visit can review you, and you can reply." },
    calendar: { title: "Same calendar, no double entry", body: "Kiorex bookings land in your normal appointment calendar next to everything else." },
    whatsapp: { title: "Optional WhatsApp booking", body: "Patients can also book through WhatsApp when you switch it on." },
    option_CLINIC: { title: "Optional video visits", body: "Offer telehealth visits to patients who cannot come in." },
    option_NURSE: { title: "Optional home visits", body: "Patients can book a visit at their home with your team." },
  },
  howTitle: "How it works",
  how: {
    prepare: { title: "Get ready", body: "Finish the checklist below: verified doctors, bookable visits with fees, availability and a complete profile." },
    request: { title: "Ask to go live", body: "Accept the marketplace terms and send your request." },
    review: { title: "Kiorex reviews", body: "The Kiorex team reviews your request. You can see the status here." },
    live: { title: "Go live", body: "Your doctors appear in Kiorex search and patients can book." },
  },
  readinessTitle: "Your readiness",
  readinessProgress: "{{done}} of {{total}} steps already done",
  readinessDone: "Done",
  readinessMissing: "Still to do",
  feeTitle: "Fees",
  fee: "Kiorex charges {{fee}} for each new patient who books through Kiorex and attends the visit. This is the fee published for your market; you see and accept the exact terms before anything goes live.",
  feeUnconfigured: "Fees are confirmed by the Kiorex team before you go live. You will see and accept them before anything is published.",
  reassureTitle: "You stay in control",
  reassure: {
    optional: "Connecting is optional. Your practice works fully without it.",
    reversible: "It is reversible: you can pause your listing at any time.",
    data: "You keep your data and your sign-in. Nothing is moved or copied away.",
    choose: "You choose which doctors and branches appear on Kiorex.",
  },
  start: "Start connecting",
  continue: "Continue connecting",
  talk: "Talk to us",
  talkTitle: "Talk to the Kiorex team",
  talkIntro: "Leave your details and someone from Kiorex will contact you at the time you choose. Nothing is changed in your account.",
  form: { name: "Your name", role: "Your role", phone: "Phone", email: "E-mail", time: "Best time to contact you", note: "Anything you would like us to know (optional)", consent: "I agree that Kiorex may contact me about connecting my organisation.", send: "Send", cancel: "Cancel", contactHint: "Give a phone number or an e-mail (or both).", sent: "Thank you. The Kiorex team will contact you.", sentAgain: "We already have your request. Send it again to update your details.", times: { MORNING: "Morning", AFTERNOON: "Afternoon", EVENING: "Evening", ANYTIME: "Any time" } },
  errors: { CONSENT_REQUIRED: "Please agree to be contacted.", CONTACT_REQUIRED: "Give a phone number or an e-mail.", INVALID_FIELD: "Please check the highlighted field.", KIOREX_UNREACHABLE: "Kiorex could not be reached. Nothing was sent. Try again.", KIOREX_BUSY: "Too many requests. Try again in a few minutes.", KIOREX_REJECTED_REQUEST: "Kiorex could not accept the request. Try again later.", KIOREX_NOT_CONFIGURED: "This installation is not connected to Kiorex.", generic: "Something went wrong. Nothing was sent." },
  homeCard: { title: "Connect to Kiorex", body: "Optional: let new patients find and book you on Kiorex. Your practice keeps working as it does today.", open: "Learn more", dismiss: "Hide this card", show: "Show the Kiorex card on the home page again", shown: "The card will show on your home page again." },
} as const;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
export type MarketingStrings = Widen<typeof marketingEn>;

export const marketingAr: MarketingStrings = {
  headline: "اوصل إلى مرضى أكثر مع كيوريكس",
  intro: "تستمر عيادتك في العمل كما هي اليوم. كيوريكس طريقة اختيارية ليجدك المرضى الجدد ويحجزوا عندك.",
  benefitsTitle: "ماذا تحصل عليه",
  benefits: {
    search: { title: "تظهر في بحث كيوريكس", body: "يبحث المرضى في كيوريكس، ويرون مواعيدك المتاحة الآن، ويحجزون وقتا متاحا فعلا." },
    deposits: { title: "عربون اختياري", body: "يمكنك طلب عربون عند الحجز لحماية وقتك." },
    reviews: { title: "تقييمات من زيارات مؤكدة", body: "لا يقيّمك إلا مريض حضر زيارة فعلا، ويمكنك الرد." },
    calendar: { title: "نفس التقويم بلا إدخال مزدوج", body: "تصل حجوزات كيوريكس إلى تقويم مواعيدك المعتاد بجانب كل شيء آخر." },
    whatsapp: { title: "حجز اختياري عبر واتساب", body: "يستطيع المرضى الحجز أيضا عبر واتساب عندما تفعّل ذلك." },
    option_CLINIC: { title: "زيارات فيديو اختيارية", body: "قدّم زيارات عن بعد للمرضى الذين لا يستطيعون الحضور." },
    option_NURSE: { title: "زيارات منزلية اختيارية", body: "يستطيع المرضى حجز زيارة في منزلهم مع فريقك." },
  },
  howTitle: "كيف يعمل",
  how: {
    prepare: { title: "جهّز نفسك", body: "أكمل القائمة أدناه: أطباء موثقون، وزيارات قابلة للحجز بأسعارها، ومواعيد متاحة، وملف مكتمل." },
    request: { title: "اطلب الإطلاق", body: "اقبل شروط السوق وأرسل طلبك." },
    review: { title: "كيوريكس يراجع", body: "يراجع فريق كيوريكس طلبك، وتتابع الحالة من هنا." },
    live: { title: "ابدأ الظهور", body: "يظهر أطباؤك في بحث كيوريكس ويستطيع المرضى الحجز." },
  },
  readinessTitle: "جاهزيتك",
  readinessProgress: "اكتملت {{done}} من {{total}} خطوات",
  readinessDone: "تم",
  readinessMissing: "ما زال مطلوبا",
  feeTitle: "الرسوم",
  fee: "يحصّل كيوريكس {{fee}} عن كل مريض جديد يحجز عبر كيوريكس ويحضر الزيارة. هذه هي الرسوم المنشورة لسوقك، وسترى الشروط الكاملة وتوافق عليها قبل أن يظهر أي شيء.",
  feeUnconfigured: "يؤكد فريق كيوريكس الرسوم قبل الإطلاق. سترى الرسوم وتوافق عليها قبل نشر أي شيء.",
  reassureTitle: "القرار بيدك",
  reassure: {
    optional: "الربط اختياري. تعمل عيادتك بالكامل بدونه.",
    reversible: "يمكن التراجع عنه: تستطيع إيقاف ظهورك في أي وقت.",
    data: "تحتفظ ببياناتك وبتسجيل دخولك. لا ينتقل شيء ولا يُنسخ.",
    choose: "أنت تختار أي الأطباء والفروع تظهر على كيوريكس.",
  },
  start: "ابدأ الربط",
  continue: "تابع الربط",
  talk: "تحدث إلينا",
  talkTitle: "تحدث إلى فريق كيوريكس",
  talkIntro: "اترك بياناتك وسيتواصل معك أحد أفراد كيوريكس في الوقت الذي تختاره. لا يتغير شيء في حسابك.",
  form: { name: "اسمك", role: "وظيفتك", phone: "الهاتف", email: "البريد الإلكتروني", time: "أنسب وقت للتواصل", note: "أي شيء تريدنا أن نعرفه (اختياري)", consent: "أوافق على أن يتواصل معي كيوريكس بشأن ربط منشأتي.", send: "إرسال", cancel: "إلغاء", contactHint: "اكتب رقم هاتف أو بريدا إلكترونيا (أو الاثنين).", sent: "شكرا لك. سيتواصل معك فريق كيوريكس.", sentAgain: "لدينا طلبك بالفعل. أرسله مرة أخرى لتحديث بياناتك.", times: { MORNING: "صباحا", AFTERNOON: "بعد الظهر", EVENING: "مساء", ANYTIME: "أي وقت" } },
  errors: { CONSENT_REQUIRED: "يرجى الموافقة على التواصل معك.", CONTACT_REQUIRED: "اكتب رقم هاتف أو بريدا إلكترونيا.", INVALID_FIELD: "يرجى مراجعة الحقل المحدد.", KIOREX_UNREACHABLE: "تعذر الوصول إلى كيوريكس. لم يُرسل شيء. حاول مجددا.", KIOREX_BUSY: "طلبات كثيرة. حاول بعد دقائق.", KIOREX_REJECTED_REQUEST: "تعذر على كيوريكس قبول الطلب. حاول لاحقا.", KIOREX_NOT_CONFIGURED: "هذه النسخة غير مرتبطة بكيوريكس.", generic: "حدث خطأ. لم يُرسل شيء." },
  homeCard: { title: "اربط منشأتك بكيوريكس", body: "اختياري: دع المرضى الجدد يجدونك ويحجزون عندك على كيوريكس. تستمر عيادتك في العمل كما هي اليوم.", open: "اعرف المزيد", dismiss: "إخفاء هذه البطاقة", show: "أظهر بطاقة كيوريكس في الصفحة الرئيسية مجددا", shown: "ستظهر البطاقة في صفحتك الرئيسية مجددا." },
};
