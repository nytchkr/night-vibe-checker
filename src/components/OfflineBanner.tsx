"use client";

import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const updateOnlineState = () => setIsOffline(!navigator.onLine);

    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] w-full bg-yellow-500/90 py-2 text-center text-sm text-[#0A0A0E]">
      You're offline — showing cached venues
    </div>
  );
}
