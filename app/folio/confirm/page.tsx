import { createSupabaseServer } from '@/lib/supabase/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

// GET /folio/confirm?token=...
// Finalizes a pending subscription by calling the folio_confirm RPC.

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = (searchParams?.token || '').trim()
  if (!token) return <Shell title="Link is missing a token." />

  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('folio_confirm', { p_token: token })

  if (error) {
    if (/folio_confirm|folio_subscribers/i.test(error.message || '')) {
      return <Shell title="Subscribe is spinning up — check back shortly." />
    }
    console.error('[folio/confirm] RPC error', error)
    return <Shell title="Something went wrong confirming your subscription." />
  }

  const row = Array.isArray(data) ? data[0] : null
  if (!row) {
    return <Shell title="This link has already been used — you're subscribed." />
  }

  const { data: owner } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('id', row.owner_id)
    .single()

  const name = owner?.display_name || owner?.username || 'the folio'
  const href = owner ? `/${owner.username}` : '/'

  return (
    <Shell title={`You're in.`}>
      <p className="text-sm text-gray-500 leading-relaxed mb-8">
        Welcome to <strong className="text-gray-900">{name}</strong>&apos;s folio. Your
        first digest will land in your inbox when {name} saves 10 new links — or
        once a month, whichever comes first.
      </p>
      {owner && (
        <Link
          href={href}
          className="inline-block px-6 py-3 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800"
        >
          Visit {name}&apos;s folio →
        </Link>
      )}
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
