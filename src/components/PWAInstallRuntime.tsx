"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { PWAInstallVisitTracker } from "@/components/PWAInstallVisitTracker";

export function PWAInstallRuntime() {
  const [Banner, setBanner] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;

    void import("@/components/PWAInstallBanner").then((mod) => {
      if (active) setBanner(() => mod.default);
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <PWAInstallVisitTracker>
      {Banner ? <Banner /> : null}
    </PWAInstallVisitTracker>
  );
}
