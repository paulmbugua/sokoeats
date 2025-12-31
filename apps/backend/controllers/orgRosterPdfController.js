// controllers/orgRosterController.js
import pool from '../config/db.js';
import { renderOrgLearnerRosterPdf } from '../services/orgRosterPdfService.js';

function norm(v) {
  return String(v ?? '').trim();
}

function normalizeLower(v) {
  return String(v ?? '').trim().toLowerCase();
}

// Best-effort principal signature resolution
function resolvePrincipalSignature(orgRow) {
  return (
    orgRow.signature_url ||
    orgRow.principal_signature_url ||
    orgRow.headteacher_signature_url ||
    orgRow.registrar_signature_url ||
    null
  );
}

// ─────────────────────────────────────────────────────────────
// Safe rel helpers (schema-qualified, no-crash)
// ─────────────────────────────────────────────────────────────
function safeQualifiedRel(rel, fallback = 'public.organizations') {
  const s = String(rel || '').trim();
  if (/^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/.test(s)) return s;
  if (/^[a-zA-Z0-9_]+$/.test(s)) return `public.${s}`;
  return fallback;
}

async function resolveRel(client, preferredQualified, fallbacksQualified = []) {
  const candidates = [preferredQualified, ...fallbacksQualified];

  for (const cand of candidates) {
    try {
      const r = await client.query(`select to_regclass($1) as reg`, [cand]);
      const reg = r.rows?.[0]?.reg;
      if (reg) return safeQualifiedRel(reg, cand);
    } catch {
      // ignore and continue
    }
  }

  // last resort: use preferredQualified (still validated)
  return safeQualifiedRel(preferredQualified, preferredQualified);
}

async function resolveOrganizationsRel(client) {
  // prefer organizations, fallback orgs if you ever used that older name
  return resolveRel(client, 'public.organizations', ['public.orgs']);
}

// ─────────────────────────────────────────────────────────────
// Org meta loader (tolerates missing columns like fees controller)
// ─────────────────────────────────────────────────────────────
async function loadOrgMetaForRoster(clientOrPool, orgId) {
  const db =
    clientOrPool && typeof clientOrPool.query === 'function' ? clientOrPool : pool;

  if (!orgId) throw new Error('loadOrgMetaForRoster: missing orgId');

  const rel = await resolveOrganizationsRel(db);
  const [schema, table] = rel.split('.');

  // start broad; remove missing columns on 42703 and retry
  let cols = [
    'id',
    'name',
    'slug',
    'logo_url',
    'contact_email',
    'phone_number',
    'address_line1',
    'address_line2',
    'website_url',

    // signatures (some may not exist on older DBs)
    'signature_url',
    'teacher_signature_url',
    'instructor_signature_url',
    'principal_signature_url',
    'headteacher_signature_url',
    'registrar_signature_url',
  ];

  const run = async () => {
    const sql = `
      SELECT ${cols.join(', ')}
      FROM ${schema}.${table}
      WHERE id = $1
      LIMIT 1
    `;
    const r = await db.query(sql, [orgId]);
    return r.rows?.[0] || null;
  };

  let row = null;

  for (let i = 0; i < 10; i++) {
    try {
      row = await run();
      break;
    } catch (e) {
      if (e?.code === '42703') {
        const msg = String(e?.message || '');
        const m = msg.match(/column\s+"?([a-zA-Z0-9_\.]+)"?\s+does not exist/i);
        const missingRaw = m?.[1] || '';
        const missing = missingRaw.includes('.') ? missingRaw.split('.').pop() : missingRaw;

        if (missing && cols.includes(missing)) {
          cols = cols.filter((c) => c !== missing);
          continue; // retry without that column
        }

        // if we can't parse which column, fall back to a safe minimal list
        cols = [
          'id',
          'name',
          'slug',
          'logo_url',
          'contact_email',
          'phone_number',
          'address_line1',
          'address_line2',
          'signature_url',
          'instructor_signature_url',
        ];
        row = await run();
        break;
      }

      throw e;
    }
  }

  if (!row) return null;

  // normalize so downstream code never crashes when reading these keys
  const ensure = (k) => {
    if (row[k] === undefined) row[k] = null;
  };

  ensure('website_url');
  ensure('signature_url');
  ensure('teacher_signature_url');
  ensure('instructor_signature_url');
  ensure('principal_signature_url');
  ensure('headteacher_signature_url');
  ensure('registrar_signature_url');

  // roster should NOT “invent” a teacher signature from principal; keep strict fallback
  row.teacher_signature_resolved = row.teacher_signature_url || row.instructor_signature_url || null;

  return row;
}

// OPTIONAL: try find a class teacher signature if you have a table (safe/no-crash)
// (kept here in case you want to re-enable later)
async function tryGetClassTeacherSignatureUrl(client, orgId, classLabel) {
  if (!classLabel) return null;

  const candidates = [
    'org_class_teachers',
    'org_class_teacher_signatures',
    'org_classes',
    'org_classrooms',
  ];

  for (const t of candidates) {
    const reg = await client.query('select to_regclass($1) as reg', [`public.${t}`]);
    if (!reg.rows?.[0]?.reg) continue;

    const cols = await client.query(
      `
        select column_name
        from information_schema.columns
        where table_schema='public' and table_name=$1
      `,
      [t]
    );
    const names = new Set(cols.rows.map((r) => r.column_name));

    const hasOrg = names.has('org_id');
    const classCol =
      names.has('class_label')
        ? 'class_label'
        : names.has('class')
          ? 'class'
          : names.has('class_name')
            ? 'class_name'
            : null;

    const sigCol =
      names.has('class_teacher_signature_url')
        ? 'class_teacher_signature_url'
        : names.has('teacher_signature_url')
          ? 'teacher_signature_url'
          : names.has('signature_url')
            ? 'signature_url'
            : null;

    if (!hasOrg || !classCol || !sigCol) continue;

    try {
      const r = await client.query(
        `select ${sigCol} as sig from public.${t} where org_id=$1 and ${classCol}=$2 limit 1`,
        [orgId, classLabel]
      );
      if (r.rows?.[0]?.sig) return r.rows[0].sig;
    } catch {
      // ignore and continue
    }
  }

  return null;
}

// GET /api/orgs/:orgId/learners/roster.pdf?class_label=&q=&field=
export async function downloadOrgLearnerRosterPdf(req, res) {
  const { orgId } = req.params;
  const classLabel = norm(req.query.class_label || '');
  const q = normalizeLower(req.query.q || '');
  const field = norm(req.query.field || 'all');

  if (!orgId) return res.status(400).json({ message: 'orgId is required' });

  const client = await pool.connect();
  try {
    // 1) org (SAFE loader)
    const org = await loadOrgMetaForRoster(client, orgId);
    if (!org) return res.status(404).json({ message: 'Org not found' });

    // 2) resolve tables safely (optional but helps if names ever changed)
    const membershipsRel = await resolveRel(client, 'public.org_memberships', [
      'public.org_membership',
      'public.organization_memberships',
    ]);
    const usersRel = await resolveRel(client, 'public.users');
    const learnerProfilesRel = await resolveRel(client, 'public.org_learner_profiles', [
      'public.org_student_profiles',
      'public.org_learners_profiles',
    ]);

    // 3) learners (join membership + learner profile)
    const params = [orgId];
    const where = [`m.org_id = $1`, `lower(m.role) = 'learner'`];

    if (classLabel) {
      params.push(classLabel);
      where.push(`lp.class_label = $${params.length}`);
    }

    if (q) {
      const addLike = (sqlExpr) => {
        params.push(`%${q}%`);
        where.push(`${sqlExpr} like $${params.length}`);
      };

      if (field === 'name') addLike(`lower(u.name)`);
      else if (field === 'email') addLike(`lower(u.email)`);
      else if (field === 'admission_code') addLike(`lower(lp.admission_code)`);
      else if (field === 'class_label') addLike(`lower(lp.class_label)`);
      else {
        params.push(`%${q}%`);
        const p = `$${params.length}`;
        where.push(
          `(lower(u.name) like ${p} or lower(u.email) like ${p} or lower(lp.admission_code) like ${p} or lower(lp.class_label) like ${p})`
        );
      }
    }

    const learnersRes = await client.query(
      `
      select
        u.id,
        u.name,
        u.email,
        lp.admission_code,
        lp.class_label,
        lp.guardian_email
      from ${membershipsRel} m
      join ${usersRel} u on u.id = m.user_id
      left join ${learnerProfilesRel} lp
        on lp.org_id = m.org_id and lp.user_id = u.id
      where ${where.join(' and ')}
      order by
        lp.class_label nulls last,
        lp.admission_code nulls last,
        u.name asc
      `,
      params
    );

    const learners = learnersRes.rows || [];

    // 4) signatures (UPDATED per your request)
    // If you later want class override, you can do:
    // const classTeacherSig = await tryGetClassTeacherSignatureUrl(client, orgId, classLabel);
    // const teacherSignatureUrl = classTeacherSig || org.teacher_signature_resolved || null;
    const teacherSignatureUrl = org.teacher_signature_resolved || null;
    const principalSignatureUrl = resolvePrincipalSignature(org);

    // 5) pdf
    const pdfBuf = await renderOrgLearnerRosterPdf({
      org,
      classLabel: classLabel || 'All classes',
      learners,
      teacherSignatureUrl,
      principalSignatureUrl,
    });

    const safeSlug = String(org.slug || org.name || org.id).replace(/[^a-z0-9-_]+/gi, '_');
    const safeClass = String(classLabel || 'all').replace(/[^a-z0-9-_]+/gi, '_');
    const filename = `roster-${safeSlug}-${safeClass}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).end(pdfBuf);
  } catch (err) {
    console.error('[downloadOrgLearnerRosterPdf] error', err);
    return res.status(500).json({ message: 'Failed to generate roster PDF' });
  } finally {
    client.release();
  }
}

