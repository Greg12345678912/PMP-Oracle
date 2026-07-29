'use client'

export type MobileTab = 'players' | 'board' | 'team'

interface MobileTabsProps {
  active: MobileTab
  onChange: (tab: MobileTab) => void
}

const TABS: { id: MobileTab; label: string }[] = [
  { id: 'players', label: 'Players' },
  { id: 'board', label: 'Board' },
  { id: 'team', label: 'My Team' },
]

export function MobileTabs({ active, onChange }: MobileTabsProps) {
  return (
    <div className="flex border-b border-pmp-gray-800 md:hidden">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
            active === tab.id
              ? 'text-pmp-red border-b-2 border-pmp-red'
              : 'text-pmp-gray-500'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
