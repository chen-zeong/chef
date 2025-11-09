"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import App from "@/App";
import { RegionCaptureOverlay } from "@/features/system/region-capture/overlay/RegionCaptureOverlay";

function HomePageInner() {
  const searchParams = useSearchParams();
  const isOverlay = searchParams?.get("window") === "overlay";

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (isOverlay) {
      document.body.classList.add("region-capture-overlay");
      return () => {
        document.body.classList.remove("region-capture-overlay");
      };
    }

    document.body.classList.remove("region-capture-overlay");
  }, [isOverlay]);

  return isOverlay ? <RegionCaptureOverlay /> : <App />;
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}
