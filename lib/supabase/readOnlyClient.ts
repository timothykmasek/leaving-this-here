import { createClient } from '@/lib/supabase/client'

// PREVIEW-ONLY. The browser client with every write swapped for a no-op, so a
// dev preview can render the REAL owner screens (real components, real data)
// and be clicked through end to end without touching the database. Reads pass
// straight through. insert/update/delete/upsert resolve { data, error: null };
// an insert chained into .select().single() hands back a fake row id, which is
// all the callers read. Auth sign-out is a no-op too.
const WRITES = new Set(['insert', 'update', 'delete', 'upsert'])

function fakeWrite(): any {
  const result = { data: { id: `preview-${Math.random().toString(36).slice(2, 10)}` }, error: null }
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (res: any, rej: any) => Promise.resolve(result).then(res, rej)
        return () => chain
      },
    },
  )
  return chain
}

export function createReadOnlyClient() {
  const real = createClient()
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          const builder = target.from(table)
          return new Proxy(builder, {
            get(b, p, r) {
              if (typeof p === 'string' && WRITES.has(p)) return () => fakeWrite()
              const v = Reflect.get(b, p, r)
              return typeof v === 'function' ? v.bind(b) : v
            },
          })
        }
      }
      if (prop === 'auth') {
        const auth = target.auth
        return new Proxy(auth, {
          get(a, p, r) {
            if (p === 'signOut') return async () => ({ error: null })
            const v = Reflect.get(a, p, r)
            return typeof v === 'function' ? v.bind(a) : v
          },
        })
      }
      const v = Reflect.get(target, prop, receiver)
      return typeof v === 'function' ? v.bind(target) : v
    },
  }) as ReturnType<typeof createClient>
}
