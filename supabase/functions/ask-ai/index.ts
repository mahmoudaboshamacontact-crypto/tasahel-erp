// Edge Function: ask-ai (v9) — للمدير فقط. بتجاوب بأرقام مجمّعة (من غير أسماء عملاء ولا تليفونات).
// وضعين:
//  1) الجديد (الافتراضي): الـ AI بينادي أدوات get_report / get_late_orders → دوال SQL للمدير بس (sql/part-l-ai-tools.sql).
//  2) الوضع القديم (context من المتصفح) اتلغى لأسباب الخصوصية.
// Secrets: GEMINI_API_KEY، و GEMINI_MODEL (اختياري، الافتراضي gemini-3.8-flash). gemini-2.5-flash اتوقف للمستخدمين الجداد.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const RULES = `إنت مساعد تحليل أرقام لشركة "تساهيل | قسم الخدمات الحكومية". هترد بالعامية المصرية باختصار ووضوح.
- المبالغ بالجنيه المصري. اذكر الشهر أو الفترة اللي بتتكلم عنها.
- لو السؤال محتاج مقارنة أو حساب، اعمله وبيّن الأرقام اللي استخدمتها.
- ممنوع تطلب أو تذكر بيانات عملاء شخصية (مفيش أصلاً). أسماء الموظفين مجهولة (موظف 1، موظف 2…) ومتحاولش تعرف مين هو.`;

const systemTools = (today: string) => RULES + `
- النهارده ${today} (بتوقيت القاهرة). لو الفترة مش محددة في السؤال افترض الشهر الحالي وقول كده.
- لازم تجيب أي رقم من الأدوات: get_report (مبيعات وتكلفة وهامش تقديري وعمولة وعدد المعاملات، مجمّعة حسب شهر/يوم/خدمة/موظف/طريقة دفع/حالة) و get_late_orders (البنود المتأخرة حسب خدمة أو موظف). ممنوع تخمّن أو تخترع رقم.
- للمقارنة بين فترتين نادي get_report مرتين (مرة لكل فترة). حدّد from_date و to_date بصيغة YYYY-MM-DD لأول وآخر يوم في الفترة (الحد الأقصى 400 يوم).
- لو الأداة رجّعت rows فاضية قول مفيش بيانات للفترة دي. الهامش التقديري = المبيعات - تكلفة التنفيذ.`;

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'get_report',
      description: 'تقرير مجمّع للمبيعات من بنود الطلبات: المبيعات، تكلفة التنفيذ، الهامش التقديري، العمولة، عدد البنود والمعاملات والكمية. للمدير فقط.',
      parameters: {
        type: 'OBJECT',
        properties: {
          group_by: { type: 'STRING', enum: ['month', 'day', 'service', 'employee', 'payment', 'status'], description: 'التجميع حسب إيه' },
          from_date: { type: 'STRING', description: 'بداية الفترة YYYY-MM-DD (اختياري، الافتراضي أول الشهر الحالي)' },
          to_date: { type: 'STRING', description: 'نهاية الفترة YYYY-MM-DD شاملة (اختياري، الافتراضي النهارده)' },
          service: { type: 'STRING', description: 'اسم خدمة بالظبط للفلترة (اختياري)' },
          limit: { type: 'INTEGER', description: 'أقصى عدد صفوف (1-50، الافتراضي 20)' },
        },
        required: ['group_by'],
      },
    },
    {
      name: 'get_late_orders',
      description: 'البنود المتأخرة حالياً عن موعد تسليمها (غير مكتملة ولا مسلّمة)، مجمّعة حسب خدمة أو موظف مع عدد البنود وأقصى وأوسط تأخير بالأيام.',
      parameters: {
        type: 'OBJECT',
        properties: {
          group_by: { type: 'STRING', enum: ['service', 'employee'] },
          limit: { type: 'INTEGER', description: 'أقصى عدد صفوف (1-50، الافتراضي 15)' },
        },
        required: ['group_by'],
      },
    },
  ],
}];

const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (s: unknown, n = 120) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);
const int = (s: unknown) => (Number.isFinite(Number(s)) ? Math.trunc(Number(s)) : null);

// بتنفّذ أداة واحدة بصلاحيات المدير (JWT بتاع المتصل) — الـ SQL بيرفض أي حد غير مدير.
async function runTool(sb: any, name: string, a: Record<string, unknown>) {
  let r;
  if (name === 'get_report') {
    r = await sb.rpc('ai_report', {
      p_group: String(a.group_by || ''),
      p_from: isDate(a.from_date) ? a.from_date : null,
      p_to: isDate(a.to_date) ? a.to_date : null,
      p_service: str(a.service), p_employee: null, p_limit: int(a.limit),
    });
  } else if (name === 'get_late_orders') {
    r = await sb.rpc('ai_late_orders', { p_group: String(a.group_by || ''), p_limit: int(a.limit) });
  } else {
    return { error: 'أداة غير معروفة' };
  }
  if (r.error) return { error: String(r.error.message || 'خطأ في الاستعلام').slice(0, 200) };
  const out = r.data ?? {};
  if (JSON.stringify(out).length > 14000) return { error: 'النتيجة كبيرة، قلّل الفترة أو limit' };
  return out;
}

const MODEL_DEFAULT = 'gemini-3.5-flash-lite';
async function gemini(key: string, model: string, body: Record<string, unknown>) {
  const gen = { ...((body.generationConfig as Record<string, unknown>) || {}) };
  if (/gemini-2/.test(model)) gen.temperature = 0.2; else delete gen.temperature;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ ...body, generationConfig: gen }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'خطأ من Gemini'), { status: r.status });
  return j;
}
const textOf = (c: any) => ((c && c.parts) || []).map((p: any) => p.text || '').join('').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') || '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: role, error } = await sb.rpc('my_role');
    if (error || role !== 'manager') return json({ error: 'الميزة دي للمدير فقط' }, 403);

    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'GEMINI_API_KEY مش متضاف في Secrets' }, 500);
    const model = Deno.env.get('GEMINI_MODEL') || MODEL_DEFAULT;
    const gen: Record<string, unknown> = { maxOutputTokens: 1200 };

    const body = await req.json();
    const question = String(body.question || '').slice(0, 500).trim();
    if (!question) return json({ error: 'اكتب سؤال' }, 400);
    const history = (Array.isArray(body.history) ? body.history : []).slice(-6).map((h: any) => ({
      role: h.role === 'model' ? 'model' : 'user', parts: [{ text: String(h.text || '').slice(0, 1500) }],
    }));

    // الوضع القديم (إرسال context جاهز من المتصفح) اتلغى: كان بيبعت أي JSON للنموذج من غير قائمة حقول مسموحة.
    if (body.context) return json({ error: 'النسخة دي من الواجهة قديمة. حدّث الصفحة (Ctrl+F5).' }, 400);

    // ---- الوضع الجديد: أدوات ----
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    const contents: any[] = [...history, { role: 'user', parts: [{ text: question }] }];
    const system = { parts: [{ text: systemTools(today) }] };
    let calls = 0;
    for (let round = 0; round < 3; round++) {
      const last = round === 2; // آخر دورة من غير أدوات عشان يرد
      const j = await gemini(key, model, { systemInstruction: system, contents, ...(last ? {} : { tools: TOOLS }), generationConfig: gen });
      const content = j.candidates?.[0]?.content;
      const fcs = ((content && content.parts) || []).filter((p: any) => p.functionCall);
      if (!fcs.length || last) return json({ answer: textOf(content) || 'مفيش رد من النموذج، جرّب صياغة تانية.', tool_calls: calls });
      contents.push(content); // بنرجّع رد النموذج كما هو (بما فيه أي thought signature)
      const parts: any[] = [];
      for (const p of fcs.slice(0, 2)) {
        calls++;
        const out = await runTool(sb, p.functionCall.name, p.functionCall.args || {});
        parts.push({ functionResponse: { name: p.functionCall.name, response: { result: out } } });
      }
      contents.push({ role: 'user', parts });
    }
    return json({ answer: 'معرفتش أوصل لإجابة، جرّب سؤال أبسط.' });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') return json({ error: 'النموذج تأخر في الرد. جرّب تاني.' }, 504);
    return json({ error: String((e as Error).message || e) }, (e as any).status === 429 ? 429 : 500);
  }
});
