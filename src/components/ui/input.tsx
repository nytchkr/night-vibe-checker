import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, "aria-label": ariaLabel, ...props }, ref) => {
    return (
      <input aria-label={ariaLabel}
        type={type}
        className={cn(
          "flex h-10 w-full rounded-[12px] border border-white/[0.08] bg-white/[0.07] px-3 py-2 text-base text-[#F4F5F8] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#F4F5F8] placeholder:text-[#9CA2AE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
