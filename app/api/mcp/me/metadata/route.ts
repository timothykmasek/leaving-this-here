import { NextResponse } from 'next/server'
import { PERSONAL_RESOURCE } from '../../handler'

// RFC 9728 protected-resource metadata for the personal MCP mount, served at
// /.well-known/oauth-protected-resource/mcp/me (via rewrite — app-router
// route files can't live under a dot-directory). This is what tells an MCP
// client that Supabase's OAuth 2.1 server (auth/v1 on the project domain) is
// the authorization server for /mcp/me. Deliberately NOT served at the
// well-known root: the public /mcp mount must never advertise auth, or
// clients would demand a Bulletin account to read public lists.

export async function GET() {
  return NextResponse.json(
    {
      resource: PERSONAL_RESOURCE,
      authorization_servers: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ['header'],
      resource_name: 'Bulletin',
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  )
}
