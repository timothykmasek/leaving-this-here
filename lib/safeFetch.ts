import { lookup } from 'dns/promises'
import { isIP } from 'net'

// fetch() for URLs that came from a user (a saved link, its og:image, a list
// cover). Without this the server would fetch anything it's handed, including
// localhost, private networks and cloud metadata addresses, and some callers
// store what comes back in the public bucket.
//
// Rules: http(s) only; the host must resolve to a public address; redirects are
// followed by hand (max 5) and every hop is checked again. Same signature as
// fetch. Throws on a blocked URL, which callers already treat as a failed fetch.

const MAX_REDIRECTS = 5

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast, reserved, broadcast
  )
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateV4(ip)
  const v6 = ip.toLowerCase()
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateV4(mapped[1])
  return (
    v6 === '::' ||
    v6 === '::1' ||
    /^f[cd]/.test(v6) || // unique local fc00::/7
    /^fe[89ab]/.test(v6) || // link-local fe80::/10
    /^ff/.test(v6) // multicast
  )
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`blocked scheme ${u.protocol}`)
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error('blocked host')
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('blocked address')
  return u
}

export async function safeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const follow = (init.redirect ?? 'follow') === 'follow'
  let url = input
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(url)
    const res = await fetch(url, { ...init, redirect: 'manual' })
    const location = res.headers.get('location')
    if (!follow || res.status < 300 || res.status >= 400 || !location) return res
    if (hop >= MAX_REDIRECTS) throw new Error('too many redirects')
    url = new URL(location, url).toString()
  }
}
