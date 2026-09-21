import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'
import { ConsentCard, ConsentShell } from './ConsentCard'

// OAuth consent — the one screen the connector flow forces us to own. Supabase
// (the OAuth 2.1 authorization server) redirects here with ?authorization_id=;
// we show who's asking and what they get, and POST the decision to
// /api/oauth/decision, which hands back the redirect that returns the user to
// the client. Configured in Supabase under Authentication → OAuth Server
// (authorization path = /oauth/consent).

export const metadata: Metadata = {
  title: 'Connect to Bulletin',
  robots: { index: false },
}

export const dynamic = 'force-dynamic'

function ConsentError({ message }: { message: string }) {
  return (
    <ConsentShell>
      <p className="mt-8 text-center font-serif text-[16px] leading-[1.5] text-black/60">
        {message}
      </p>
      <p className="mt-6 text-center font-serif text-[14px] text-black/40">
        Start the connection again from the app you were using.
      </p>
    </ConsentShell>
  )
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: { authorization_id?: string }
}) {
  const authorizationId = searchParams?.authorization_id
  if (!authorizationId) {
    return <ConsentError message="This consent link is missing its authorization request." />
  }

  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`,
    )
  }

  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !details) {
    return (
      <ConsentError message="This authorization request has expired or was already handled." />
    )
  }

  // Consent was already granted for this client — no second ask, but the
  // return trip still has to go through approveAuthorization: details.
  // redirect_uri is the client's BARE callback, and bouncing there without
  // the freshly-minted code (and the client's own `state` echoed back)
  // strands the client with "state: Field required".
  if (details.redirect_uri) {
    const { data: approved } = await supabase.auth.oauth.approveAuthorization(authorizationId)
    redirect(approved?.redirect_url || details.redirect_uri)
  }

  return (
    <ConsentCard
      clientName={details.client?.client_name || 'An application'}
      email={user!.email || details.user?.email || ''}
      authorizationId={authorizationId}
    />
  )
}
