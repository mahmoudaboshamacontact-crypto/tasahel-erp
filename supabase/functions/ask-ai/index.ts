// Edge Function: ask-ai (v17) — للمدير فقط. بتجاوب بأرقام مجمّعة + Fallback تلقائي لو الموديل عليه ضغط.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
  'https://system-erp-v3.vercel.app',
  'https://system-erp-v3-git-courier-tickets-v1-mahmoud-978b.vercel.app',
]);
function corsFor(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const isPreview = /^https:\/\/system-erp-v3-[a-z0-9-]+\.vercel\.app$/i.test(origin);
  const allow = (ALLOWED_ORIGINS.has(origin) || isPreview) ? origin : 'https://system-erp-v3.vercel.app';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
const json = (req: Request, o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsFor(req), 'Content-Type': 'application/json' } });

const RULES = `إنت مساعد ذكي لتحليل الأرقام والتشغيل لشركة "تساهيل | قسم الخدمات الحكومية". هترد بالعامية المصرية باختصار ووضوح وذكاء.
- المبالغ بالجنيه المصري. اذكر الشهر أو الفترة اللي بتتكلم عنها.
- لو السؤال محتاج مقارنة أو حساب أو استنتاج عملي، اعمله وبيّن الأرقام اللي استخدمتها.
- ممكن المدير يسألك أي سؤال حر عن الشغل أو يطلب نصيحة إدارية بناءً على الأرقام — جاوبه بطبيعية وذكاء.
- ممنوع تطلب أو تذكر بيانات عملاء شخصية (مفيش أصلاً). أسماء الموظفين مجهولة (موظف 1، موظف 2…) ومتحاولش تعرف مين هو.`;

const systemTools = (today: string) => RULES + `
- النهارده ${today} (بتوقيت القاهرة). لو الفترة مش محددة في السؤال افترض الشهر الحالي وقول كده.
- أي رقم عن الشركة لازم تجيبه من الأدوات دي:
  1) get_report: مبيعات وتكلفة وهامش تقديري وعمولة وعدد المعاملات والبنود (حسب month/day/service/employee/payment/status). لسؤال عن النهارده فقط حط from_date=${today} و to_date=${today}.
  2) get_late_orders: البنود المتأخرة حالياً حسب خدمة أو موظف.
  3) get_ops_snapshot: ملخص الاستردادات، تيكتات الاستلام وعهدة الورق، مشاوير المناديب، المهام، آخر تقفيل كاش، ومستحقات الشريك الخارجي.
- ممنوع تخمّن أو تخترع رقم. للمقارنة بين فترتين نادي get_report مرتين (مرة لكل فترة، الحد الأقصى 400 يوم).
- لو الأداة رجّعت rows فاضية قول مفيش بيانات للفترة دي. الهامش التقديري = المبيعات - تكلفة التنفيذ.`;

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'get_report',
      description: 'تقرير مجمّع للمبيعات والطلبات من بنود المعاملات: المبيعات، تكلفة التنفيذ، الهامش التقديري، العمولة، عدد البنود والمعاملات والكمية حسب الفترة أو الحالة (Delivered/Complete/In Progress/Under Review).',
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
    {
      name: 'get_ops_snapshot',
      description: 'ملخص التشغيل الحالي: الاستردادات، تيكتات الاستلام وعهدة الورق، مشاوير المناديب، المهام المفتوحة والمتأخرة، آخر تقفيل كاش، والشريك الخارجي.',
      parameters: { type: 'OBJECT', properties: {} },
    },
  ],
}];

const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (s: unknown, n = 120) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);
const int = (s: unknown) => (Number.isFinite(Number(s)) ? Math.trunc(Number(s)) : null);

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
  } else if (name === 'get_ops_snapshot') {
    r = await sb.rpc('ai_ops_snapshot');
  } else {
    return { error: 'أداة غير معروفة' };
  }
  if (r.error) return { error: String(r.error.message || 'خطأ في الاستعلام').slice(0, 200) };
  const out = r.data ?? {};
  if (JSON.stringify(out).length > 14000) return { error: 'النتيجة كبيرة، قلّل الفترة أو limit' };
  return out;
}

const MODEL_DEFAULT = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash'];

async function callGeminiOnce(key: string, model: string, body: Record<string, unknown>) {
  const gen = { ...((body.generationConfig as Record<string, unknown>) || {}) };
  if (/gemini-2/.test(model)) gen.temperature = 0.2; else delete gen.temperature;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ ...body, generationConfig: gen }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = Object.assign(new Error((j.error && j.error.message) || 'خطأ من Gemini'), { status: r.status });
    throw err;
  }
  return { data: j, usedModel: model };
}

async function geminiWithFallback(key: string, primaryModel: string, body: Record<string, unknown>) {
  const candidates = [primaryModel, ...FALLBACK_MODELS.filter((m) => m !== primaryModel)];
  let lastErr: any = null;
  for (const m of candidates) {
    try {
      return await callGeminiOnce(key, m, body);
    } catch (e: any) {
      lastErr = e;
      const st = e && e.status;
      if (st === 503 || st === 429 || st === 500 || st === 404) continue;
      throw e;
    }
  }
  throw lastErr || new Error('كل النماذج مشغولة حالياً');
}

const textOf = (c: any) => ((c && c.parts) || []).map((p: any) => p.text || '').join('').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsFor(req) });
  try {
    const auth = req.headers.get('Authorization') || '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: role, error } = await sb.rpc('my_role');
    if (error || role !== 'manager') return json(req, { error: 'الميزة دي للمدير فقط' }, 403);

    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json(req, { error: 'GEMINI_API_KEY مش متضاف في Secrets' }, 500);
    const primaryModel = Deno.env.get('GEMINI_MODEL') || MODEL_DEFAULT;
    let activeModel = primaryModel;
    const gen: Record<string, unknown> = { maxOutputTokens: 1400 };

    const body = await req.json();
    const question = String(body.question || '').slice(0, 500).trim();
    if (!question) return json(req, { error: 'اكتب سؤال' }, 400);
    const history = (Array.isArray(body.history) ? body.history : []).slice(-6).map((h: any) => ({
      role: h.role === 'model' ? 'model' : 'user', parts: [{ text: String(h.text || '').slice(0, 1500) }],
    }));
    if (body.context) return json(req, { error: 'النسخة دي من الواجهة قديمة. حدّث الصفحة (Ctrl+F5).' }, 400);

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    const contents: any[] = [...history, { role: 'user', parts: [{ text: question }] }];
    const system = { parts: [{ text: systemTools(today) }] };
    let calls = 0;
    let promptTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;

    for (let round = 0; round < 3; round++) {
      const last = round === 2;
      const res = await geminiWithFallback(key, activeModel, { systemInstruction: system, contents, ...(last ? {} : { tools: TOOLS }), generationConfig: gen });
      activeModel = res.usedModel;
      const j = res.data;
      const um = j.usageMetadata || {};
      promptTokens += Number(um.promptTokenCount || 0);
      outputTokens += Number(um.candidatesTokenCount || 0);
      totalTokens += Number(um.totalTokenCount || 0);

      const content = j.candidates?.[0]?.content;
      const fcs = ((content && content.parts) || []).filter((p: any) => p.functionCall);
      if (!fcs.length || last) {
        return json(req, {
          answer: textOf(content) || 'مفيش رد من النموذج، جرّب صياغة تانية.',
          tool_calls: calls,
          model: activeModel,
          usage: { prompt_tokens: promptTokens, output_tokens: outputTokens, total_tokens: totalTokens },
        });
      }
      contents.push(content);
      const parts: any[] = [];
      for (const p of fcs.slice(0, 2)) {
        calls++;
        const out = await runTool(sb, p.functionCall.name, p.functionCall.args || {});
        parts.push({ functionResponse: { name: p.functionCall.name, response: { result: out } } });
      }
      contents.push({ role: 'user', parts });
    }
    return json(req, { answer: 'معرفتش أوصل لإجابة، جرّب سؤال أبسط.' });
  } catch (e) {
    const st = (e as any).status;
    if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') return json(req, { error: 'السيرفر اتأخر شوية في الرد، جرّب تبعت السؤال تاني.' }, 504);
    if (st === 503 || st === 429) return json(req, { error: 'فيه ضغط لحظي على سيرفرات Gemini دلوقتي، استنى ثواني وجرّب تاني.' }, st);
    return json(req, { error: String((e as Error).message || e) }, 500);
  }
});
