// services/newsletterEmailTemplate.js
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

function stripThemeFromContent(md = '') {
  return String(md || '').replace(/^\s*<!--THEME[\s\S]*?-->\s*/i, '').trim();
}

export function newsletterMarkdownToHtml(md) {
  const raw = marked.parse(stripThemeFromContent(md || ''));
  return sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      '*': ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

export function buildNewsletterEmailHtml({ org, newsletter, principalLabel }) {
  const logoUrl = org?.logo_url || '';
  const signatureUrl = org?.signature_url || '';
  const orgName = org?.name || 'School';

  const contactLine = [org?.address_line1, org?.address_line2].filter(Boolean).join(' • ');
  const contactLine2 = [
    org?.phone_number ? `Tel: ${org.phone_number}` : '',
    org?.contact_email ? `Email: ${org.contact_email}` : '',
    org?.website_url ? `Website: ${org.website_url}` : '',
  ].filter(Boolean).join(' • ');

  const contentHtml = newsletterMarkdownToHtml(newsletter?.content_md || '');

  // Email-safe layout: tables + simple CSS (works in Gmail/Outlook better than fancy divs)
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;background:#f6f7fb;font-family:Inter,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:680px;max-width:92vw;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:18px 20px;background:#eef2ff;border-bottom:1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:top;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-right:12px;vertical-align:top;">
                          ${logoUrl ? `<img src="${logoUrl}" alt="logo" width="52" height="52" style="display:block;border-radius:10px;background:#fff;object-fit:contain;" />` : ''}
                        </td>
                        <td style="vertical-align:top;">
                          <div style="font-size:18px;font-weight:800;color:#0f172a;line-height:1.2;">${orgName}</div>
                          ${contactLine ? `<div style="font-size:12px;color:#475569;margin-top:3px;">${contactLine}</div>` : ''}
                          ${contactLine2 ? `<div style="font-size:12px;color:#475569;margin-top:2px;">${contactLine2}</div>` : ''}
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align:top;">
                    <div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#1d4ed8;">Newsletter</div>
                    <div style="font-size:12px;color:#475569;margin-top:4px;">${newsletter?.term_label || ''}</div>
                    <div style="font-size:12px;color:#475569;margin-top:2px;">${new Date().toLocaleDateString()}</div>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:12px;">
                    <div style="font-size:24px;font-weight:800;color:#0f172a;line-height:1.2;">${newsletter?.title || 'Newsletter'}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px;">
              <div style="color:#0f172a;font-size:14px;line-height:1.65;">
                ${contentHtml}
              </div>

              <div style="height:1px;background:#e5e7eb;margin:18px 0;"></div>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:bottom;">
                    <div style="font-weight:800;color:#0f172a;font-size:14px;">${principalLabel || 'Head teacher / Principal'}</div>
                    <div style="color:#64748b;font-size:12px;margin-top:2px;">${orgName}</div>
                  </td>
                  <td align="right" style="vertical-align:bottom;">
                    ${signatureUrl ? `<img src="${signatureUrl}" alt="signature" height="44" style="display:block;object-fit:contain;max-width:220px;" />`
                      : `<div style="width:220px;height:44px;border-bottom:1px solid #cbd5e1;"></div>`}
                    <div style="color:#64748b;font-size:11px;margin-top:6px;">Signature</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <div style="font-size:11px;color:#64748b;margin-top:10px;">If you cannot view this email well, open the PDF attachment.</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
