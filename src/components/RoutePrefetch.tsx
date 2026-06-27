"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type RoutePrefetchProps = {
  href: string;
};

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
  };
};

export function canPrefetchRoute() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as NavigatorWithConnection).connection;
  return connection?.effectiveType !== "2g";
}

export function prefetchRoute(router: { prefetch: (href: string) => void }, href: string) {
  if (!canPrefetchRoute()) return;
  router.prefetch(href);
}

export function RoutePrefetch({ href }: RoutePrefetchProps) {
  const router = useRouter();

  useEffect(() => {
    prefetchRoute(router, href);
  }, [href, router]);

  return null;
}
