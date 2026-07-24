import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn(
      'bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4',
      className
    )}>
      {children}
    </div>
  )
}
