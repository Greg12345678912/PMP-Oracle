import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-pmp-gray-800', className)}
      aria-hidden="true"
    />
  )
}

export function PlayerCardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-pmp-gray-900 w-20 h-24 shrink-0">
      <Skeleton className="w-12 h-12 rounded-full" />
      <Skeleton className="w-14 h-3" />
      <Skeleton className="w-10 h-2" />
    </div>
  )
}
