"use client";

import { useEffect, useState } from "react";

type DeviceInfo = {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isStandalone: boolean;
  hasTouch: boolean;
  viewport: { w: number; h: number };
};

const mobileDefaults: DeviceInfo = {
  isMobile: true,
  isTablet: false,
  isDesktop: false,
  isIOS: false,
  isAndroid: false,
  isSafari: false,
  isChrome: false,
  isStandalone: false,
  hasTouch: false,
  viewport: { w: 0, h: 0 },
};

function getDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return mobileDefaults;
  }

  const userAgent = navigator.userAgent;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const hasTouch = navigator.maxTouchPoints > 0;
  const isIOS =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return {
    isMobile: width < 768 || hasTouch,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
    isIOS,
    isAndroid: /Android/i.test(userAgent),
    isSafari: /^((?!chrome|android).)*safari/i.test(userAgent),
    isChrome: /Chrome/i.test(userAgent) && !/Edge|Edg/i.test(userAgent),
    isStandalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    hasTouch,
    viewport: { w: width, h: height },
  };
}

export function useDevice(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(mobileDefaults);

  useEffect(() => {
    let resizeTimer: number | null = null;

    function updateDeviceInfo() {
      setDeviceInfo(getDeviceInfo());
    }

    function handleResize() {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(updateDeviceInfo, 150);
    }

    updateDeviceInfo();
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return deviceInfo;
}

export type { DeviceInfo };
