"use client";
import React, { useEffect, useState } from "react";
import BillingModule from "../dashboard/components/BillingModule";

export default function FacturacionPage() {
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark") || true;
    setDarkMode(isDark);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#0a1415" }}>
      <BillingModule darkMode={darkMode} />
    </div>
  );
}
