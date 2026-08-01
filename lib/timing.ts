// Lightweight server-side perf instrumentation. A no-op unless PERF_LOG is set,
// so it can live permanently in the hot render paths without shipping console
// noise. Wrap a query/stage to log its wall-clock duration:
//
//   const rows = await timed('list:bullets', () => supabase.from(...)...)
//
// Then run the server with PERF_LOG=1 and read the per-stage breakdown from the
// server logs to see where a navigation actually spends its time.
export async function timed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!process.env.PERF_LOG) return fn()
  const start = performance.now()
  try {
    return await fn()
  } finally {
    console.log(`[perf] ${label}: ${(performance.now() - start).toFixed(1)}ms`)
  }
}
