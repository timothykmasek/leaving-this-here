// HTML digest email — clean, editorial, mail-client-safe.
// Table-based because Gmail / Outlook still apply fewer CSS rules than a
// modern browser. We keep it inline-styled and reasonably narrow.

interface DigestLink {
  url: string
  title: string | null
  description: string | null
  image_url: string | null
  screenshot_url: string | null
  favicon_url: string | null
  note: string | null
  created_at: string
}

export interface DigestArgs {
  ownerName: string
  ownerUsername: string
  ownerUrl: string
  links: DigestLink[]
  unsubscribeUrl: string
}

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function renderLink(link: DigestLink): string {
  const title = link.title?.trim() || getDomain(link.url) || link.url
  const description = link.description?.trim().slice(0, 180)
  const domain = getDomain(link.url)
  const image = link.image_url || link.screenshot_url || null
  const note = link.note?.trim()

  return `
    <tr>
      <td style="padding: 0 0 28px;">
        ${image ? `
          <a href="${esc(link.url)}" style="display: block; text-decoration: none;">
            <img src="${esc(image)}" alt="" width="540" style="display: block; width: 100%; max-width: 540px; height: auto; border-radius: 8px; margin: 0 0 12px; border: 1px solid #f0f0f0;" />
          </a>
        ` : ''}
        <a href="${esc(link.url)}" style="color: #111; text-decoration: none;">
          <h2 style="margin: 0 0 4px; font-size: 18px; font-weight: 600; line-height: 1.35; letter-spacing: -0.01em;">
            ${esc(title)}
          </h2>
        </a>
        ${description ? `
          <p style="margin: 0 0 8px; font-size: 14px; color: #555; line-height: 1.5;">
            ${esc(description)}
          </p>
        ` : ''}
        <p style="margin: 0 0 ${note ? '10' : '0'}px; font-size: 12px; color: #999;">
          ${esc(domain)}
        </p>
        ${note ? `
          <p style="margin: 10px 0 0; padding: 0 0 0 12px; border-left: 2px solid #e5e5e5; font-size: 14px; color: #555; font-style: italic; line-height: 1.5;">
            ${esc(note)}
          </p>
        ` : ''}
      </td>
    </tr>
  `
}

export function renderDigestHTML(args: DigestArgs): string {
  const count = args.links.length
  const plural = count === 1 ? 'link' : 'links'

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(args.ownerName)}'s folio</title>
  </head>
  <body style="margin: 0; padding: 0; background: #fafaf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; color: #1a1a1a;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #fafaf9;">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="width: 540px; max-width: 100%; background: #ffffff; border-radius: 12px; border: 1px solid #f0f0f0;">
            <tr>
              <td style="padding: 32px 32px 24px;">
                <p style="margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #999;">
                  New in your folio
                </p>
                <h1 style="margin: 0 0 4px; font-size: 24px; font-weight: 300; letter-spacing: -0.01em;">
                  <a href="${esc(args.ownerUrl)}" style="color: #111; text-decoration: none;">${esc(args.ownerName)}</a>
                </h1>
                <p style="margin: 0; font-size: 13px; color: #777;">
                  ${count} new ${plural} since your last digest.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px 8px;">
                <hr style="border: 0; border-top: 1px solid #f0f0f0; margin: 0 0 24px;" />
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  ${args.links.map(renderLink).join('')}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 32px 32px; border-top: 1px solid #f0f0f0; text-align: center;">
                <p style="margin: 0 0 6px; font-size: 12px; color: #999;">
                  <a href="${esc(args.ownerUrl)}" style="color: #555; text-decoration: underline;">Read on leaving this here</a>
                </p>
                <p style="margin: 0; font-size: 11px; color: #bbb;">
                  <a href="${esc(args.unsubscribeUrl)}" style="color: #bbb; text-decoration: underline;">unsubscribe</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function renderDigestText(args: DigestArgs): string {
  const lines: string[] = []
  lines.push(`${args.ownerName}'s folio — ${args.links.length} new link${args.links.length === 1 ? '' : 's'}`)
  lines.push('')
  for (const link of args.links) {
    const title = link.title?.trim() || getDomain(link.url) || link.url
    lines.push(`— ${title}`)
    lines.push(`  ${link.url}`)
    if (link.note?.trim()) lines.push(`  "${link.note.trim()}"`)
    lines.push('')
  }
  lines.push(`Read on: ${args.ownerUrl}`)
  lines.push(`Unsubscribe: ${args.unsubscribeUrl}`)
  return lines.join('\n')
}
