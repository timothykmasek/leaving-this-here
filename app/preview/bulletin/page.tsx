// PREVIEW-ONLY scratch route for iterating the rebrand bulletin page against
// Figma (node 695:856). Not linked anywhere; safe to delete. Mock data only.
import { LinkCard } from '@/components/LinkCard'
import { BulletinHeader, BracketLabel } from '@/components/BulletinHeader'

const FINDS = [
  { url: '#', title: 'Taste Labs - The Taste Layer of the Internet', listName: 'List name', seed: 'taste' },
  { url: '#', title: 'Buck Mason', listName: 'Affordable Art To Buy', seed: 'buck' },
  { url: '#', title: 'Crosby', listName: 'Tools I Use Daily', seed: 'crosby' },
  { url: '#', title: 'Kiki — the accountability monster', listName: 'Productivity', seed: 'kiki' },
  { url: '#', title: 'The Design Office of David McGillivray', listName: 'Portfolios', seed: 'dmcg' },
  { url: '#', title: 'Basis', listName: 'AI Tools', seed: 'basis' },
  { url: '#', title: 'Upgrade Your Sock Drawer', listName: 'Affordable Art To Buy', seed: 'pairs' },
  { url: '#', title: 'Find your advocate, covered by insurance.', listName: 'Health', seed: 'baba' },
]

export default function BulletinPreview() {
  return (
    <div className="min-h-screen bg-paper">
      <BulletinHeader />

      <main className="px-10 pb-24 pt-10">
        <div className="mx-auto w-[1184px] max-w-full">
          {/* profile info strip */}
          <div className="mb-12 flex items-end justify-between text-black/50">
            <div className="flex flex-col gap-[9px]">
              <BracketLabel>Tim Masek</BracketLabel>
              <BracketLabel>a bit of consumer tech, some dtc, some b2b.</BracketLabel>
              <BracketLabel>linkedin · website · instagram</BracketLabel>
            </div>
            <div className="flex items-center gap-3">
              <BracketLabel>Recent bullets</BracketLabel>
              <BracketLabel>Lists</BracketLabel>
            </div>
          </div>

          {/* grid */}
          <div className="grid grid-cols-4 gap-x-8 gap-y-12 [perspective:2400px]">
            {FINDS.map((f) => (
              <LinkCard
                key={f.seed}
                url={f.url}
                title={f.title}
                listName={f.listName}
                image={`https://picsum.photos/seed/${f.seed}/368/236`}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
