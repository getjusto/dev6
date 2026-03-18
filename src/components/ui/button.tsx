import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-[12px] font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-[3px] focus-visible:ring-stone-300/60',
  {
    variants: {
      variant: {
        default: 'bg-stone-900 text-white hover:bg-stone-800',
        secondary: 'bg-stone-100 text-stone-700 hover:bg-stone-200',
        outline: 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
        ghost: 'text-stone-600 hover:bg-stone-100',
      },
      size: {
        default: 'h-8 px-3.5',
        sm: 'h-7 rounded-lg px-2.5 text-[11px]',
        lg: 'h-9 px-4 text-[12px]',
        icon: 'size-8 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button }
