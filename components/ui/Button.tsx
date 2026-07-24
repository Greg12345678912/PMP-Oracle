import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-200 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pmp-red disabled:opacity-50 disabled:pointer-events-none',
          {
            'bg-pmp-red text-pmp-white hover:bg-pmp-red/90 active:scale-95': variant === 'primary',
            'bg-transparent text-pmp-white border border-pmp-gray-700 hover:border-pmp-gray-500 active:scale-95': variant === 'ghost',
            'bg-transparent text-pmp-red/70 hover:text-pmp-red/90 active:scale-95': variant === 'danger',
            'text-xs px-3 py-1.5': size === 'sm',
            'text-sm px-4 py-2': size === 'md',
            'text-base px-6 py-3': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
