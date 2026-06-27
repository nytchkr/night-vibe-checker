"use client";

import { div as MotionDiv } from "framer-motion/client";
import type { ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type PageTransitionProps = {
  children: ReactNode;
  className?: string;
};

export function PageTransition({ children, className }: PageTransitionProps) {
  const prefersReduced = useReducedMotion();

  return (
    <MotionDiv
      initial={prefersReduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReduced ? 0 : 0.18, ease: "easeOut" }}
      className={className}
    >
      {children}
    </MotionDiv>
  );
}
