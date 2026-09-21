import { ConsentCard } from '@/app/oauth/consent/ConsentCard'

// Fixture render of the OAuth consent screen — the live one only shows behind
// a real authorization_id + session (same rationale as /preview/owner).
// Approve/Deny POST a dead authorization_id, which lands on the consent
// page's expired-state, so clicking through here is harmless.

export default function ConsentPreview() {
  return (
    <ConsentCard
      clientName="Claude"
      email="tim@yourbulletin.com"
      authorizationId="preview-fixture"
    />
  )
}
