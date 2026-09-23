import { NextResponse } from 'next/server'

// POST /api/extension/suggest-list-name — RETIRED (2026-09-23).
//
// This used to ask Haiku to name a NEW list for a freshly saved bullet (with an
// embedding + neighbour-cluster pass first). We don't suggest list names anymore:
// no model call, no embed, nothing billed.
//
// The endpoint stays as a stub only because older clients still call it (store
// extension 0.5.2). It returns the same empty shape the route always returned
// when unconfigured, which every client already renders as "no suggestions".
// Delete it once no shipped client calls it.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST() {
  return NextResponse.json({ names: [], name: null }, { headers: CORS_HEADERS })
}
