'use client'

// PREVIEW-ONLY: the full owner ProfileClient on fixtures, so session-gated
// profile chrome (search glass + drop-in bar, toolbar, tabs, save panel) can
// be rendered and looked at without logging in. Supabase calls inside the
// client fail quietly against fake ids — this page is for looking, not saving.
// Safe to delete.

import { Suspense } from 'react'
import ProfileClient from '@/app/[username]/ProfileClient'

const OWNER_ID = 'preview-owner'

const PROFILE = {
  id: OWNER_ID,
  username: 'tim',
  display_name: 'Tim Masek',
  bio: 'Building startups @ founders factory\nExited founder of 1-800-D2C',
  links: { linkedin: 'https://linkedin.com/in/tim', website: 'https://example.com' },
}

const BULLETS = [
  {
    id: 'b1',
    user_id: OWNER_ID,
    url: 'https://leftlane.com',
    title: 'Left Lane Capital — Large ambitions, early',
    description: 'Growth equity for internet companies.',
    card_type: 'bare',
    created_at: '2026-09-01T09:53:00Z',
  },
  {
    id: 'b2',
    user_id: OWNER_ID,
    url: 'https://hilltop.com',
    title: 'HILLTOP',
    description: 'A venture studio.',
    card_type: 'bare',
    created_at: '2026-08-30T12:00:00Z',
  },
  {
    id: 'b3',
    user_id: OWNER_ID,
    url: 'https://allegory.com',
    title: 'ALLEGORY — Allegory apparel',
    description: 'The fit check.',
    card_type: 'bare',
    created_at: '2026-08-28T12:00:00Z',
  },
  {
    id: 'b4',
    user_id: OWNER_ID,
    url: 'https://priv.y',
    title: 'PRIV.Y',
    description: 'Privacy tools.',
    card_type: 'bare',
    created_at: '2026-08-27T12:00:00Z',
  },
]

const LISTS = [
  {
    id: 'l1',
    name: 'VCs / Investors',
    slug: null, // slugless → stays on the in-page list view, no navigation
    is_private: false,
    description: null,
    created_at: '2026-08-01T12:00:00Z',
    bookmark_ids: ['b1', 'b2'],
  },
]

export default function OwnerProfilePreview() {
  return (
    <Suspense>
      <ProfileClient
        username="tim"
        initialProfile={PROFILE}
        initialBookmarks={BULLETS}
        initialLists={LISTS}
        currentUserId={OWNER_ID}
        mightHaveMore={false}
      />
    </Suspense>
  )
}
