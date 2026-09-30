import { notFound } from 'next/navigation'

// Everything under /preview is a dev-only workbench (fixtures, the Fade Lab,
// the seeds board, the eval page). None of it belongs on the public site: some
// pages render live ScreenshotOne URLs or fan out server-side fetches. Run
// `npm run dev` to use them.
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound()
  return children
}
