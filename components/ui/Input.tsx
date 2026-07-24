import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full bg-pmp-gray-800 border border-pmp-gray-700 text-pmp-white placeholder:text-pmp-gray-500 rounded-lg px-4 py-2.5 text-sm transition-colors duration-200 focus:outline-none focus:border-pmp-red',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
