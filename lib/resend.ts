// Thin wrapper around the Resend transactional email API.
// https://resend.com/docs/api-reference/emails/send-email
//
// If RESEND_API_KEY is missing (local dev without the key, or a preview build
// before the env var is set), we log the email payload and return a fake
// success — lets the rest of the flow work end-to-end in dev.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

// Until a custom domain is verified in Resend we use their always-on sender.
// Swap this in one place when `mail.leavingthishere.com` (or similar) goes live.
const DEFAULT_FROM = 'leaving this here <onboarding@resend.dev>'

export interface SendEmailArgs {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
}

export interface SendEmailResult {
  id: string | null
  delivered: boolean
  error?: string
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[resend] RESEND_API_KEY not set — logging email instead of sending')
    console.warn('[resend] to:', args.to, 'subject:', args.subject)
    return { id: null, delivered: false, error: 'RESEND_API_KEY not set' }
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: args.from || DEFAULT_FROM,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[resend] send failed', res.status, data)
      return { id: null, delivered: false, error: `resend ${res.status}: ${JSON.stringify(data)}` }
    }
    return { id: data.id || null, delivered: true }
  } catch (err: any) {
    console.error('[resend] exception', err)
    return { id: null, delivered: false, error: err?.message || 'unknown' }
  }
}
