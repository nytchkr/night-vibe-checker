"use client";

import dynamic from "next/dynamic";

const PWAInstallPromptSheet = dynamic(() => import("@/components/PWAInstallPromptSheet"), {
  ssr: false,
});

export default function PWAInstallPrompt() {
  return <PWAInstallPromptSheet />;
}
