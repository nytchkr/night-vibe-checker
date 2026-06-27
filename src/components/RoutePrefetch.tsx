"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type RoutePrefetchProps = {
  href: string;
};

export function RoutePrefetch({ href }: RoutePrefetchProps) {
  const router = useRouter();

  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);

  return null;
}
