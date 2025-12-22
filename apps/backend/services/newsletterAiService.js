// apps/backend/services/newsletterAiService.js
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const NEWSLETTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titleSuggestion', 'sections', 'closing'],
  properties: {
    titleSuggestion: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'bullets', 'paragraphs'],
        properties: {
          heading: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' }, default: [] },
          paragraphs: { type: 'array', items: { type: 'string' }, default: [] },
        },
      },
    },
    closing: { type: 'string' },
  },
};


export function newsletterDraftToMarkdown(draft, opts = {}) {
  const orgName = opts.orgName || 'our school';
  const termLabel = opts.termLabel || 'the term';

  const title = (draft?.titleSuggestion || '').trim() || 'End of Term Newsletter';

  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`Hello families,`);
  lines.push('');
  lines.push(`Thank you for supporting **${orgName}** throughout **${termLabel}**.`);
  lines.push('');

  for (const sec of draft?.sections || []) {
    const heading = (sec?.heading || '').trim();
    if (!heading) continue;

    lines.push(`## ${heading}`);
    lines.push('');

    const paras = Array.isArray(sec.paragraphs) ? sec.paragraphs : [];
    for (const p of paras) {
      const t = String(p || '').trim();
      if (t) {
        lines.push(t);
        lines.push('');
      }
    }

    const bullets = Array.isArray(sec.bullets) ? sec.bullets : [];
    if (bullets.length) {
      for (const b of bullets) {
        const t = String(b || '').trim();
        if (t) lines.push(`- ${t}`);
      }
      lines.push('');
    }
  }

  const closing = (draft?.closing || '').trim();
  if (closing) {
    lines.push('---');
    lines.push('');
    lines.push(closing);
    lines.push('');
  }

  return lines.join('\n');
}

export async function generateNewsletterDraftAI(input) {
  if (!process.env.OPENAI_API_KEY) {
    const err = new Error('OPENAI_API_KEY not set');
    err.status = 501;
    throw err;
  }

  const model =
    process.env.OPENAI_MODEL_NEWSLETTER ||
    process.env.OPENAI_MODEL ||
    'gpt-4o-mini';

  const payload = {
    orgName: input.orgName || 'our school',
    termLabel: input.termLabel || 'the term',
    titleHint: input.title || null,
    notes: input.notes || null,
    audience: input.audience || 'Parents/Guardians',
    tone: input.tone || 'Warm, clear, professional, simple English',
  };

  const system = `
You write school newsletters for parents/guardians.
Output MUST match the JSON schema exactly.
Rules:
- Keep it practical, warm, and easy to skim.
- No fake stats. If unsure, write general but realistic statements.
- You MUST follow any instructions inside "notes" (they override defaults).
- If notes specify exact headings/structure, follow them verbatim.
- Always include bullets and paragraphs arrays (use [] when not used).
- Avoid private personal data. No learner names.
- Prefer 4–7 sections max.
- Each section: either 2–5 bullets OR 1–2 paragraphs (or both), but keep it short.
- closing should include a friendly sign-off and placeholder for school name.
`.trim();

  const user = `
Create an end-of-term newsletter draft based on this input:
${JSON.stringify(payload, null, 2)}
`.trim();

  // ✅ LOGS (before request)
  console.log('[newsletterAi] model:', model);
  console.log('[newsletterAi] org:', payload.orgName, 'term:', payload.termLabel);
  console.log('[newsletterAi] notes length:', (payload.notes || '').length);

  const resp = await client.chat.completions.create({
    model,
    temperature: 0.6,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'org_newsletter_draft',
        schema: NEWSLETTER_SCHEMA,
        strict: true,
      },
    },
  });

  // ✅ LOGS (after response)
  console.log(
    '[newsletterAi] got response, finish_reason:',
    resp?.choices?.[0]?.finish_reason,
  );

  const content = resp?.choices?.[0]?.message?.content || '';
  console.log('[newsletterAi] raw content preview:', content.slice(0, 200));

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    const err = new Error('AI returned invalid JSON');
    err.status = 502;
    err.detail = String(content).slice(0, 500);
    console.error('[newsletterAi] JSON parse failed:', err.detail);
    throw err;
  }

  // Extra safety normalization
  parsed.titleSuggestion = String(parsed.titleSuggestion || '').trim();
  parsed.closing = String(parsed.closing || '').trim();
  parsed.sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  parsed.sections = parsed.sections.map((s) => ({
    heading: String(s?.heading || '').trim(),
    bullets: Array.isArray(s?.bullets)
      ? s.bullets.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
    paragraphs: Array.isArray(s?.paragraphs)
      ? s.paragraphs.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
  }));

  // ✅ LOGS (normalized output)
  console.log('[newsletterAi] parsed sections:', parsed.sections.length);
  console.log('[newsletterAi] first heading:', parsed.sections?.[0]?.heading || '(none)');

  return parsed;
}

