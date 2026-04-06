import { NextRequest, NextResponse } from 'next/server'
import { extractMetadata } from '@/lib/metadata'
export type { MetadataResult } from '@/lib/metadata'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    // Validate URL
    let validUrl: string
    try {
      validUrl = new URL(url).toString()
    } catch {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 })
    }

    const result = await extractMetadata(validUrl)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({
      title: null, image: null, description: null, siteName: null, favicon: null,
    })
  }
}
