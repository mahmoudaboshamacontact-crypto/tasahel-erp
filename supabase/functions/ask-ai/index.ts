// Edge Function: ask-ai (v18) — للمدير فقط. يغطي السيستم بالكامل (مبيعات، تأخيرات، تشغيل، HR وحضور، مناديب، مالية) بدون أي بيانات عملاء.
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

const RULES = `إنت المساعد الذكي الشامل لإدارة شركة "تساهيل | قسم الخدمات الحكومية". هترد بالعامية المصرية باختصار ووضوح وذكاء عملي.
- المبالغ بالجنيه المصري. اذكر اليوم أو الشهر اللي بتتكلم عنه.
- لو السؤال محتاج مقارنة أو حساب أو استنتاج عملي، اعمله وبيّن الأرقام اللي استخدمتها.
- تقدر تذكر أسماء الموظفين والمناديب الداخليين لما المدير يسأل عن الحضور أو الإجازات أو المشاوير أو الأهداف.
- ممنوع تماماً طلب أو ذكر أي بيانات عملاء (أسماء عملاء أو تليفونات أو عناوين — مفيش أصلاً في الأدوات).`;

const systemTools = (today: string) => RULES + `
- النهارده ${today} (بتوقيت القاهرة). لو الفترة مش محددة افترض اليوم أو الشهر الحالي حسب سياق السؤال وقول كده.
- عندك 6 أدوات بتغطي السيستم كله — استخدم الأداة المناسبة (أو أكتر من أداة مع بعض) قبل ما ترد:
  1) get_report: مبيعات وتكلفة وهامش تقديري وعمولة وعدد المعاملات والبنود (حسب month/day/service/employee/payment/status). لسؤال عن النهارده حط from_date=${today} و to_date=${today}.
  2) get_late_orders: البنود المتأخرة حالياً حسب خدمة أو موظف.
  3) get_ops_snapshot: ملخص الاستردادات، تيكتات الاستلام وعهدة الورق، مشاوير المناديب، المهام، آخر تقفيل كاش، ومستحقات الشريك الخارجي.
  4) get_hr_snapshot: الحضور والانصراف النهارده (أو أي يوم YYYY-MM-DD)، مين بصم ومين مبصمش، الإجازات الموافق عليها والمعلقة، والخصومات/السلف الشهرية.
  5) get_couriers_snapshot: تفاصيل كل مندوب (مشاوير النهارده، الرسوم، غير المؤكد، التيكتات المفتوحة)، تسليمات الكاش المعلقة، قرارات الرادار المعلقة، والتقفيلات غير المدفوعة.
  6) get_finance_snapshot: أهداف الموظفين الشهرية (targets)، طلبات الخصم، مدفوعات المنفذين، مطابقة المحافظ، أخطاء السيستم، وعدد الخدمات في الكتالوج.
- ممنوع تخمّن أو تخترع أي رقم. الهامش التقديري = المبيعات - تكلفة التنفيذ.`;

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'get_report',
      description: 'تقرير مجمّع للمبيعات والطلبات: المبيعات، التكلفة، الهامش التقديري، العمولة، عدد البنود والمعاملات حسب الفترة أو الحالة.',
      parameters: {
        type: 'OBJECT',
        properties: {
          group_by: { type: 'STRING', enum: ['month', 'day', 'service', 'employee', 'payment', 'status'] },
          from_date: { type: 'STRING', description: 'YYYY-MM-DD' },
          to_date: { type: 'STRING', description: 'YYYY-MM-DD' },
          service: { type: 'STRING' },
          limit: { type: 'INTEGER' },
        },
        required: ['group_by'],
      },
    },
    {
      name: 'get_late_orders',
      description: 'البنود المتأخرة حالياً عن موعد تسليمها حسب خدمة أو موظف.',
      parameters: {
        type: 'OBJECT',
        properties: {
          group_by: { type: 'STRING', enum: ['service', 'employee'] },
          limit: { type: 'INTEGER' },
        },
        required: ['group_by'],
      },
    },
    {
      name: 'get_ops_snapshot',
      description: 'ملخص التشغيل العام: الاستردادات، التيكتات، عهدة الورق، المهام، آخر تقفيل كاش، ومستحقات الشريك الخارجي.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'get_hr_snapshot',
      description: 'الموارد البشرية والحضور: مين بصم حضور ومين مبصمش، الإجازات النهارده والمعلقة، وتعديلات/سلف الشهر.',
      parameters: {
        type: 'OBJECT',
        properties: {
          day: { type: 'STRING', description: 'تاريخ اليوم YYYY-MM-DD (اختياري، الافتراضي النهارده)' },
        },
      },
    },
    {
      name: 'get_couriers_snapshot',
      description: 'المناديب بالتفصيل: مشاوير ورسوم وتيكتات كل مندوب، تسليمات الكاش المعلقة، قرارات الرادار، وتقفيلات المناديب غير المدفوعة.',
      parameters: {
        type: 'OBJECT',
        properties: {
          day: { type: 'STRING', description: 'تاريخ اليوم YYYY-MM-DD (اختياري، الافتراضي النهارده)' },
        },
      },
    },
    {
      name: 'get_finance_snapshot',
      description: 'المالية والأهداف: أهداف الموظفين (targets)، طلبات الخصومات، مدفوعات المنفذين، مطابقة المحافظ، أخطاء السيستم، وكتالوج الخدمات.',
      parameters: {
        type: 'OBJECT',
        properties: {
          month: { type: 'STRING', description: 'الشهر بصيغة YYYY-MM (اختياري، الافتراضي الشهر الحالي)' },
        },
      },
    },
  ],
}];

const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMonth = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
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
  } else if (name === 'get_hr_snapshot') {
    r = await sb.rpc('ai_hr_snapshot', { p_day: isDate(a.day) ? a.day : null });
  } else if (name === 'get_couriers_snapshot') {
    r = await sb.rpc('ai_couriers_snapshot', { p_day: isDate(a.day) ? a.day : null });
  } else if (name === 'get_finance_snapshot') {
    r = await sb.rpc('ai_finance_snapshot', { p_month: isMonth(a.month) ? a.month : null });
  } else {
    return { error: 'أداة غير معروفة' };
  }
  if (r.error) return { error: String(r.error.message || 'خطأ في الاستعلام').slice(0, 200) };
  const out = r.data ?? {};
  if (JSON.stringify(out).length > 18000) return { error: 'النتيجة كبيرة، قلّل الفترة أو limit' };
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
    throw Object.assign(new Error((j.error && j.error.message) || 'خطأ من Gemini'), { status: r.status });
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
    const gen: Record<string, unknown> = { maxOutputTokens: 1600 };

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
    let calls = 0, promptTokens = 0, outputTokens = 0, totalTokens = 0;

    for (let round = 0; round < 4; round++) {
      const last = round === 3;
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
      for (const p of fcs.slice(0, 3)) {
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
