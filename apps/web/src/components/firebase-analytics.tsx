"use client";

import { initFirebaseAnalytics } from "@/lib/firebase";
import { useEffect } from "react";

export function FirebaseAnalytics() {
  useEffect(() => {
    initFirebaseAnalytics();
  }, []);
  return null;
}
