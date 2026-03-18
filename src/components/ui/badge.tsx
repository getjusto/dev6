import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-tight',
  {
    variants: {
      variant: {
        default: 'border-stone-200 bg-white text-stone-700',
        secondary: 'border-stone-200 bg-stone-100 text-stone-600',
        outline: 'border-stone-200 bg-transparent text-stone-600',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
