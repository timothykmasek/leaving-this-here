import { createSupabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /folio/unsubscribe?token=...
// Flips unsubscribed_at via the folio_unsubscribe RPC. Token is permanent
// per subscriber — included in every digest email's unsubscribe link.

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = (searchParams?.token || '').trim()
  if (!token) return <Shell title="Link is missing a token." />

  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('folio_unsubscribe', { p_token: token })

  if (error) {
    if (/folio_unsubscribe|folio_subscribers/i.test(error.message || '')) {
      return <Shell title="Subscribe is spinning up — check back shortly." />
    }
    console.error('[folio/unsubscribe] RPC error', error)
    return <Shell title="Something went wrong — try the link again." />
  }

  const row = Array.isArray(data) ? data[0] : null
  if (!row) {
    return <Shell title="You're already unsubscribed." />
  }

  return (
    <Shell title="Unsubscribed.">
      <p className="text-sm text-gray-500 leading-relaxed">
        You won&apos;t receive any more digest emails. Change of heart? Just hit
        subscribe on the folio again.
      </p>
    </Shell>
  )
}

function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-3xl font-light text-gray-900 mb-4">{title}</h1>
        {children}
      </div>
    </main>
  )
}
