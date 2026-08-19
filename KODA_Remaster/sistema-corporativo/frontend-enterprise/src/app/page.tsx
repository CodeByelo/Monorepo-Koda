"use client";

import dynamic from "next/dynamic";

// LandingPage relies entirely on browser APIs (window, sessionStorage,
// IntersectionObserver, canvas, mousemove, Math.random in Preloader, etc.).
// Rendering it on the server produces HTML that can never match the client,
// causing a guaranteed hydration mismatch.  Disabling SSR eliminates the
// problem at its root.
const LandingPage = dynamic(() => import("./landing/LandingPage"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#010507",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
        color: "#0bbf8c",
        zIndex: 9999999,
      }}
    >
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: "50%",
          border: "2px solid #0bbf8c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 25px rgba(11,191,140,0.5)",
          background: "rgba(2,10,12,0.85)",
          overflow: "hidden",
        }}
      >
        <img
          src="/LogoGlass.webp"
          alt="Koda Logo"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <p
        style={{
          marginTop: "1rem",
          fontSize: "0.85rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Cargando KODA ERP...
      </p>
    </div>
  ),
});

export default function Home() {
  return <LandingPage />;
}
