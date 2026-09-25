import { NextResponse } from 'next/server'
import { INTERESTS, SEED_LIBRARY, seedImageUrl } from '@/lib/seedLibrary'

// The /start wizard's interests + pick-3 library, for clients that can't
// import lib/seedLibrary (the iOS app). Public and static: the same list the
// web wizard renders, with each seed's baked preview image resolved, so the
// library keeps one source of truth. /api/onboarding/setup validates picks
// against SEED_LIBRARY, so a client can only submit urls from this list.
export async function GET() {
  return NextResponse.json(
    {
      interests: INTERESTS,
      seeds: SEED_LIBRARY.map((s) => ({
        title: s.title,
        url: s.url,
        domain: s.domain,
        type: s.type,
        interests: s.interests,
        image: seedImageUrl(s),
      })),
    },
    { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } },
  )
}
