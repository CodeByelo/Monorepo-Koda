"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ShoppingBag, FileText, ShoppingCart, Package, Landmark, BookOpen,
  PieChart, ArrowRight, ChevronDown, Zap, Shield, Globe, CheckCircle,
  Building2, Database, Star, Layers, TrendingUp, Activity, Users,
  ShieldCheck, Bell, CreditCard, BarChart3,
  Terminal, Play, RefreshCw, Cpu, Code, ArrowUpRight, Settings, AlertTriangle, Check,
  Sparkles, Lock, Rocket, Crown
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   ALL CSS
   ═══════════════════════════════════════════════════════════════ */
const CSS = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

    .lp, .lp * { box-sizing: border-box; margin: 0; padding: 0; }
    .lp {
      overflow-x: hidden;
      background: #020608;
      color: #fff;
      font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;
      cursor: none;
      -webkit-font-smoothing: antialiased;
    }
    .lp a, .lp button, .lp select, .lp input { cursor: none !important; }

    /* ── UNIQUE CURSOR: Logo Glass Lens ── */
    .lp-cursor-core {
      position: fixed; pointer-events: none; z-index: 999999;
      top: 0; left: 0;
      width: 28px; height: 28px;
      transform: translate(-50%, -50%);
      transition: width .3s, height .3s, background .3s;
      background: rgba(0, 255, 180, 0.04);
      border-radius: 50%;
      border: 1px solid rgba(0, 255, 180, 0.25);
      backdrop-filter: blur(2px);
      box-shadow: 0 0 12px rgba(0, 255, 180, 0.15);
      display: flex; align-items: center; justify-content: center;
    }
    .lp-cursor-core svg { width: 55%; height: 55%; filter: drop-shadow(0 0 3px #00ffb4); }
    .lp-cursor-ring {
      position: fixed; pointer-events: none; z-index: 999998;
      top: 0; left: 0;
      width: 58px; height: 58px;
      transform: translate(-50%, -50%);
      border: 1.5px dashed rgba(0, 255, 180, 0.22);
      border-radius: 50%;
      transition: width .45s cubic-bezier(.16,1,.3,1), height .45s cubic-bezier(.16,1,.3,1), border-color .3s, border-style .3s;
      animation: lp-cursor-spin 20s linear infinite;
    }
    .lp-cursor-trail {
      position: fixed; pointer-events: none; z-index: 999997;
      top: 0; left: 0;
      width: 6px; height: 6px;
      transform: translate(-50%, -50%);
      background: radial-gradient(circle, rgba(56,189,248,.85), transparent);
      border-radius: 50%;
      filter: blur(1px);
    }
    .lp-cursor-ring.hover {
      width: 84px; height: 84px;
      border-color: rgba(0, 255, 180, 0.6);
      border-style: solid;
    }
    .lp-cursor-ring.click {
      width: 34px; height: 34px;
      border-color: rgba(56,189,248, 1);
      border-style: solid;
    }

    /* ── Noise overlay ── */
    .lp-noise {
      position:fixed; inset:0; z-index:99997; pointer-events:none;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      background-repeat: repeat;
      background-size: 200px 200px;
      opacity: 0.025;
    }

    /* ── Keyframes ── */
    @keyframes lp-orb1  { 0%,100%{transform:translate(0,0)scale(1);}   33%{transform:translate(10vw,8vh)scale(1.2);}  66%{transform:translate(-5vw,12vh)scale(.88);} }
    @keyframes lp-orb2  { 0%,100%{transform:translate(0,0)scale(1);}   33%{transform:translate(-12vw,-10vh)scale(1.25);} 66%{transform:translate(8vw,-4vh)scale(.85);} }
    @keyframes lp-orb3  { 0%,100%{transform:translate(0,0)scale(1);}   50%{transform:translate(-8vw,15vh)scale(1.15);} }
    @keyframes lp-grid  { from{transform:translate(0,0);}               to{transform:translate(65px,65px);}  }
    @keyframes lp-scan  { 0%{top:-2px;opacity:0;} 4%{opacity:1;} 92%{opacity:1;} 100%{top:100%;opacity:0;} }
    @keyframes lp-fadein { from{opacity:0;transform:translateY(26px);} to{opacity:1;transform:translateY(0);} }
    @keyframes lp-shimmer { 0%{background-position:200% center;} 100%{background-position:-200% center;} }
    @keyframes lp-cursor { 0%,100%{opacity:1;} 50%{opacity:0;} }
    @keyframes lp-bounce { 0%,100%{transform:translateY(0);} 50%{transform:translateY(10px);} }
    @keyframes lp-spin  { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
    @keyframes lp-cursor-spin { from{transform:translate(-50%,-50%)rotate(0deg);} to{transform:translate(-50%,-50%)rotate(360deg);} }
    @keyframes lp-float { 0%,100%{transform:translateY(0px) rotate(0deg);} 50%{transform:translateY(-16px) rotate(1deg);} }
    @keyframes lp-float2 { 0%,100%{transform:translateY(0px) rotate(0deg);} 50%{transform:translateY(12px) rotate(-1deg);} }
    @keyframes lp-glow-pulse { 0%,100%{box-shadow:0 0 24px rgba(0,255,180,.3);} 50%{box-shadow:0 0 60px rgba(0,255,180,.65),0 0 120px rgba(0,255,180,.15);} }
    @keyframes lp-ring-pulse { 0%{transform:translate(-50%,-50%)scale(.9);opacity:.7;} 100%{transform:translate(-50%,-50%)scale(2);opacity:0;} }
    @keyframes lp-bar  { from{transform:scaleX(0);} to{transform:scaleX(1);} }
    @keyframes lp-ping  { 0%{transform:scale(1);opacity:.8;} 100%{transform:scale(2.5);opacity:0;} }
    @keyframes lp-number { from{transform:translateY(100%);opacity:0;} to{transform:translateY(0);opacity:1;} }
    @keyframes lp-spark { 0%,100%{opacity:.3;transform:scaleY(.6);} 50%{opacity:1;transform:scaleY(1);} }
    @keyframes lp-warp  { 0%{border-radius:60% 40% 30% 70% / 60% 30% 70% 40%;} 50%{border-radius:30% 60% 70% 40% / 50% 60% 30% 60%;} 100%{border-radius:60% 40% 30% 70% / 60% 30% 70% 40%;} }
    @keyframes lp-dash { to { stroke-dashoffset: -40; } }
    @keyframes lp-dash-rev { to { stroke-dashoffset: 40; } }
    @keyframes lp-glitch {
      0% { clip-path: inset(0 0 95% 0); transform: translate(-2px, 0); }
      10% { clip-path: inset(50% 0 40% 0); transform: translate(2px, 0); }
      20% { clip-path: inset(20% 0 60% 0); transform: translate(-1px, 0); }
      30% { clip-path: inset(80% 0 5% 0); transform: translate(0, 0); }
      40% { clip-path: inset(0 0 0 0); transform: translate(0, 0); }
      100% { clip-path: inset(0 0 0 0); transform: translate(0, 0); }
    }
    @keyframes lp-hex-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes lp-node-pulse { 0%, 100% { r: 5; opacity: 0.8; } 50% { r: 8; opacity: 1; } }
    @keyframes lp-data-flow {
      0% { stroke-dashoffset: 200; opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { stroke-dashoffset: 0; opacity: 0; }
    }
    @keyframes lp-marquee-fwd { from{transform:translateX(0);} to{transform:translateX(-50%);} }
    @keyframes lp-marquee-rev { from{transform:translateX(-50%);} to{transform:translateX(0);} }
    @keyframes lp-holo {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes lp-tilt-float {
      0%, 100% { transform: perspective(1000px) rotateX(2deg) rotateY(-3deg) translateY(0); }
      50% { transform: perspective(1000px) rotateX(-1deg) rotateY(3deg) translateY(-8px); }
    }
    @keyframes lp-scale-in { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes lp-slide-up { from { transform: translateY(60px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes lp-counter-up { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes lp-beam { 0% { opacity: 0; transform: scaleX(0) translateX(-100%); } 50% { opacity: 1; } 100% { opacity: 0; transform: scaleX(1) translateX(0%); } }

    /* ── Gradient Text ── */
    .lp-grad-text {
      background: linear-gradient(135deg, #00ffb4 0%, #38bdf8 45%, #a78bfa 80%, #00ffb4 100%);
      background-size: 300% 100%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: lp-shimmer 5s linear infinite;
      display: inline-block;
    }
    .lp-grad-text-2 {
      background: linear-gradient(135deg, #38bdf8 0%, #a78bfa 50%, #ec4899 100%);
      background-size: 250% 100%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: lp-shimmer 6s linear infinite reverse;
      display: inline-block;
    }

    /* ── Nav ── */
    .lp-nav { position:fixed; top:0; left:0; right:0; z-index:9990; display:flex; align-items:center; justify-content:space-between; padding:1.1rem 3.5rem; backdrop-filter:blur(20px) saturate(180%); border-bottom:1px solid rgba(0,255,180,.06); background:rgba(2,6,8,.7); transition:all .3s; }
    .lp-navlink { color:rgba(255,255,255,.42); font-size:13px; font-weight:600; letter-spacing:.04em; text-decoration:none; transition:color .25s; outline:none; position: relative; }
    .lp-navlink::after { content: ''; position: absolute; bottom: -2px; left: 0; width: 0; height: 1px; background: #00ffb4; transition: width .3s; }
    .lp-navlink:hover { color:rgba(0,255,180,.9); }
    .lp-navlink:hover::after { width: 100%; }

    /* ── Grid line ── */
    .lp-gridline { position:absolute; inset:-80px; pointer-events:none; z-index:0;
      background-image:linear-gradient(rgba(0,255,180,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,180,.04) 1px,transparent 1px);
      background-size:65px 65px; animation:lp-grid 28s linear infinite; }

    /* ── Buttons ── */
    .lp-cta {
      display:inline-flex; align-items:center; gap:11px;
      padding:1.05rem 2.6rem; border-radius:14px;
      font-weight:800; font-size:15px; letter-spacing:.03em; color:#000;
      text-decoration:none; position:relative; overflow:hidden;
      background: #00ffb4;
      box-shadow:0 0 32px rgba(0,255,180,.45), 0 10px 30px rgba(0,0,0,.35);
      transition: box-shadow .3s ease, transform .2s ease;
      will-change: transform;
    }
    .lp-cta::before { content:''; position:absolute; inset:0; background:linear-gradient(135deg,rgba(255,255,255,.25) 0%,transparent 60%); opacity:0; transition:opacity .3s; }
    .lp-cta:hover { box-shadow:0 0 80px rgba(0,255,180,.7),0 24px 60px rgba(0,0,0,.45); transform: translateY(-2px); }
    .lp-cta:hover::before { opacity:1; }

    .lp-ghost {
      display:inline-flex; align-items:center; gap:9px;
      padding:1.05rem 2.2rem; border-radius:14px; font-weight:700; font-size:15px;
      color:rgba(255,255,255,.62); text-decoration:none;
      border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04);
      backdrop-filter:blur(10px); transition:all .3s;
    }
    .lp-ghost:hover { border-color:rgba(0,255,180,.5); background:rgba(0,255,180,.08); color:rgba(255,255,255,.92); }

    /* ── Module card ── */
    .lp-mcard {
      position:relative; overflow:hidden; border-radius:22px; padding:1.75rem;
      background:rgba(4,14,16,.7); border:1px solid rgba(0,255,180,.1);
      backdrop-filter:blur(14px);
      transition:border-color .35s, box-shadow .35s, transform .14s ease;
      will-change:transform;
    }
    .lp-mcard:hover { border-color:rgba(0,255,180,.32); box-shadow:0 30px 80px rgba(0,255,180,.1),0 0 0 1px rgba(0,255,180,.08) inset; }

    /* ── Reveal ── */
    .rev { opacity:0; transform:translateY(50px); transition:opacity .9s cubic-bezier(.16,1,.3,1),transform .9s cubic-bezier(.16,1,.3,1); }
    .rev.fl { transform:translateX(-50px); }
    .rev.fr { transform:translateX(50px); }
    .rev.on { opacity:1 !important; transform:translate(0) !important; }

    /* ── Word reveal ── */
    .wr-word { display:inline-block; overflow:hidden; vertical-align:bottom; }
    .wr-inner { display:inline-block; transform:translateY(115%); transition:transform .75s cubic-bezier(.16,1,.3,1); }
    .wr-inner.on { transform:translateY(0); }

    /* ── Pill badge ── */
    .lp-pill { display:inline-flex; align-items:center; gap:7px; padding:6px 16px; border-radius:50px; font-size:11px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }

    /* ── Stats (Cyber HUD Sensor Modules) ── */
    .lp-stat-card {
      text-align: center;
      padding: 2.2rem 1.8rem;
      background: rgba(4,14,16,.65);
      border: 1px solid rgba(255,255,255,.04);
      border-radius: 18px;
      backdrop-filter: blur(12px);
      transition: border-color .3s, transform .3s, box-shadow .3s;
      position: relative;
    }
    .lp-stat-card:hover {
      border-color: rgba(0,255,180,.25);
      transform: translateY(-6px);
      box-shadow: 0 12px 30px rgba(0,255,180,0.06);
    }
    .lp-stat-card::before {
      content: '// SYS_LOG';
      position: absolute;
      top: 10px;
      left: 14px;
      font-size: 8px;
      font-family: 'Space Mono', monospace;
      color: rgba(255,255,255,.2);
      letter-spacing: .08em;
    }
    .lp-stat-card::after {
      content: '';
      position: absolute;
      top: 8px;
      right: 8px;
      width: 6px;
      height: 6px;
      border-top: 1px solid rgba(0, 255, 180, 0.4);
      border-right: 1px solid rgba(0, 255, 180, 0.4);
    }

    /* ── Check list ── */
    .lp-checklist { display:flex; flex-direction:column; gap:.7rem; }
    .lp-checkitem { display:flex; align-items:flex-start; gap:10px; }
    .lp-checkdot { width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px; }

    /* ── Plan cards (Futuristic Cyber-Deck Module) ── */
    .lp-plan-card {
      position: relative;
      border-radius: 24px;
      padding: 1px;
      overflow: hidden;
      transition: transform .4s cubic-bezier(.16,1,.3,1), box-shadow .4s;
      background: rgba(2, 6, 8, 0.6);
    }
    .lp-plan-card:hover {
      transform: translateY(-12px);
      box-shadow: 0 20px 40px rgba(0, 255, 180, 0.08), 0 0 30px rgba(0, 255, 180, 0.03);
    }
    .lp-plan-card::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 24px;
      padding: 1.5px;
      background: linear-gradient(135deg, rgba(0,255,180,.25), transparent 40%, transparent 60%, rgba(56,189,248,.25));
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: destination-out;
      mask-composite: exclude;
      transition: opacity .4s;
    }
    .lp-plan-card:hover::before {
      background: linear-gradient(135deg, rgba(0,255,180,.6), rgba(56,189,248,.4), rgba(167,139,250,.5), rgba(0,255,180,.6));
    }
    .lp-plan-inner {
      background: rgba(4, 12, 14, 0.93);
      border-radius: 23px;
      height: 100%;
      border: 1px solid rgba(255,255,255,.05);
      backdrop-filter: blur(24px);
      overflow: hidden;
      position: relative;
    }
    /* Technical corner decorations for cards */
    .lp-plan-inner::before {
      content: '';
      position: absolute;
      top: 12px;
      right: 12px;
      width: 12px;
      height: 12px;
      border-top: 1.5px solid rgba(0, 255, 180, 0.3);
      border-right: 1.5px solid rgba(0, 255, 180, 0.3);
      pointer-events: none;
    }
    .lp-plan-inner::after {
      content: '';
      position: absolute;
      bottom: 12px;
      left: 12px;
      width: 12px;
      height: 12px;
      border-bottom: 1.5px solid rgba(0, 255, 180, 0.3);
      border-left: 1.5px solid rgba(0, 255, 180, 0.3);
      pointer-events: none;
    }
    .lp-plan-card.featured .lp-plan-inner {
      border-color: rgba(0,255,180,.35);
      box-shadow: 0 0 60px rgba(0,255,180,.12), inset 0 0 40px rgba(0,255,180,.04);
    }

    /* ── Compliance grid ── */
    .compliance-pill {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 20px; border-radius: 100px;
      font-size: 12px; font-weight: 700; letter-spacing: .06em;
      white-space: nowrap; flex-shrink: 0;
      border: 1px solid rgba(0,255,180,.18);
      background: rgba(0,255,180,.05);
      color: rgba(0,255,180,.8);
      transition: all .3s;
      position: relative; overflow: hidden;
    }
    .compliance-pill::before {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(135deg, rgba(0,255,180,.1), transparent);
      opacity: 0; transition: opacity .3s;
    }
    .compliance-pill:hover::before { opacity: 1; }
    .compliance-pill:hover { border-color: rgba(0,255,180,.4); box-shadow: 0 0 20px rgba(0,255,180,.12); }

    /* ── CTA final (cinematic) ── */
    .lp-cta-section {
      position: relative; overflow: hidden;
      background: #020608;
    }

    /* ── Flow Connections ── */
    .flow-line { stroke: rgba(0,255,180,0.15); stroke-dasharray: 5, 5; transition: stroke 0.3s; }
    .flow-line.active { stroke: #00ffb4; animation: lp-dash 1.5s linear infinite; filter: drop-shadow(0 0 4px #00ffb4); }

    /* ── Conic border ── */
    .lp-conic-wrap {
      position:relative; border-radius:23px; padding:1.5px;
      overflow:hidden; display:flex; align-items:stretch;
    }
    .lp-conic-wrap::before {
      content:''; position:absolute; top:-50%; left:-50%; width:200%; height:200%;
      background:conic-gradient(from 0deg,#00ffb4,#38bdf8,#a78bfa,#ec4899,#00ffb4);
      animation:lp-spin 6s linear infinite;
      z-index:0;
    }
    .lp-conic-inner {
      border-radius:22px; position:relative; z-index:1; width:100%; height:100%;
      background:rgba(4,16,18,.95); backdrop-filter:blur(16px);
      display:flex; flex-direction:column;
    }

    /* ── Tab buttons ── */
    .lp-tab-btn {
      flex: 1; padding: 12px 6px; background: transparent; border: none;
      color: rgba(255,255,255,.4); font-size: 10px; font-weight: 800;
      text-transform: uppercase; letter-spacing: .08em; cursor: none !important;
      border-bottom: 2px solid transparent; transition: all 0.3s;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      font-family: 'Space Mono', monospace;
    }
    .lp-tab-btn:hover { color: rgba(255,255,255,.75); background: rgba(0,255,180,.03); }
    .lp-tab-btn.active { color: #00ffb4; background: rgba(0,255,180,.07); border-bottom-color: #00ffb4; }

    .lp-sim-input {
      background: rgba(2,6,8,.7); border: 1px solid rgba(0,255,180,.2);
      border-radius: 8px; color: #fff; padding: 6px 12px; font-size: 12px;
      outline: none; transition: border-color 0.2s; width: 100%;
    }
    .lp-sim-input:focus { border-color: #00ffb4; }
    .lp-sim-select {
      background: rgba(2,6,8,.7); border: 1px solid rgba(0,255,180,.2);
      border-radius: 8px; color: #fff; padding: 6px 12px; font-size: 12px;
      outline: none; transition: border-color 0.2s; width: 100%; cursor: none !important;
    }
    .lp-sim-select:focus { border-color: #00ffb4; }
    .lp-term-input {
      background: transparent; border: none; color: #00ffb4; font-family: 'Space Mono', monospace;
      font-size: 11px; outline: none; flex: 1; margin-left: 6px;
    }

    /* ── Responsive ── */
    @media (max-width:1100px) {
      .lp-hero-split { grid-template-columns:1fr !important; }
      .lp-hero-right { display:none !important; }
      .lp-showcase-grid { grid-template-columns:1fr !important; gap:2.5rem !important; }
    }
    @media (max-width:900px) { .lp-feat-grid { grid-template-columns:1fr !important; gap:2.5rem !important; } .lp-feat-r { order:-1; } }
    @media (max-width:768px) {
      .lp-bento { grid-template-columns:1fr 1fr !important; }
      .lp-bento .feat { grid-column:span 2 !important; grid-row:span 1 !important; }
      .lp-bento .wide { grid-column:span 2 !important; }
      .lp-nav { padding:1.2rem 1.5rem; }
      .lp-navlinks { display:none !important; }
      .lp-stats { grid-template-columns:1fr 1fr !important; }
    }
    @media (max-width:520px) { .lp-bento { grid-template-columns:1fr !important; } .lp-bento .feat,.lp-bento .wide { grid-column:span 1 !important; } }

    /* ── Magnetic button ── */
    .lp-mag { will-change: transform; display: inline-flex; }

    /* ── 3D Hero ERP Node Graph ── */
    .lp-erp-node {
      position: absolute;
      display: flex; align-items: center; justify-content: center;
      border-radius: 16px;
      backdrop-filter: blur(12px);
      transition: transform .2s ease, box-shadow .3s;
    }
    .lp-erp-node:hover {
      transform: scale(1.08) !important;
      z-index: 10 !important;
    }

    /* ── Parallax 3D CTA ── */
    .lp-parallax-text {
      position: absolute;
      pointer-events: none;
      font-weight: 900;
      letter-spacing: -.04em;
      line-height: 1;
      white-space: nowrap;
      -webkit-text-stroke: 1px;
      user-select: none;
    }

    /* ── Holographic shimmer on plan featured badge ── */
    .lp-holo-badge {
      background: linear-gradient(135deg, #00ffb4, #38bdf8, #a78bfa, #00ffb4);
      background-size: 300% 100%;
      animation: lp-shimmer 3s linear infinite;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    /* ── Beam effect ── */
    .lp-beam {
      position: absolute;
      height: 1px;
      background: linear-gradient(90deg, transparent, #00ffb4, transparent);
      animation: lp-beam 3s ease infinite;
      pointer-events: none;
    }

    /* ── Stat counter glow ── */
    .lp-stat-glow {
      text-shadow: 0 0 30px rgba(0,255,180,.5), 0 0 60px rgba(0,255,180,.2);
    }
  `}</style>
);

/* ═══════════════════════════════════════════════════════════════
   PRELOADER
   ═══════════════════════════════════════════════════════════════ */
const Preloader = ({ onComplete }) => {
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const logQueue = [
    "KODA OS v3.5.0-ENTERPRISE INITIALIZED",
    "Cargando módulos del núcleo seguro... [OK]",
    "Mapeando registro modular (Bento suite)... [OK]",
    "Validando cadenas SSL/TLS... [SECURE]",
    "Conectando a la pasarela fiscal SENIAT... [ONLINE]",
    "Sincronizando tasas del Banco Central de Venezuela... [LIVE]",
    "Handshake con base de datos. Nodos activos: 12",
    "Espacio de trabajo KODA inicializado... [COMPLETADO]"
  ];
  useEffect(() => {
    let c = 0;
    const li = setInterval(() => { if (c < logQueue.length) { setLogs(p => [...p, logQueue[c]]); c++; } else clearInterval(li); }, 40);
    const pi = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(pi); setTimeout(onComplete, 200); return 100; }
        return Math.min(p + Math.floor(Math.random() * 22 + 12), 100);
      });
    }, 22);
    return () => { clearInterval(li); clearInterval(pi); };
  }, []);
  return (
    <div style={{ position:'fixed',inset:0,background:'#020608',zIndex:9999999,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Space Mono',monospace",color:'#00ffb4',padding:'2rem' }}>
      <div style={{ position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(0,255,180,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,180,.04) 1px,transparent 1px)',backgroundSize:'65px 65px',opacity:.5 }} />
      <div style={{ maxWidth:'540px',width:'100%',position:'relative',zIndex:10 }}>
        <div style={{ display:'flex',alignItems:'center',gap:'1.2rem',marginBottom:'2rem',justifyContent:'center' }}>
          <div style={{ width:54,height:54,borderRadius:'50%',border:'2px solid #00ffb4',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 30px rgba(0,255,180,.6)',background:'rgba(2,6,8,.9)',overflow:'hidden' }}>
            <img src="/LogoGlass.webp" alt="Koda" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
          </div>
          <div>
            <h1 style={{ margin:0,fontSize:'1.4rem',fontWeight:900,letterSpacing:'.12em',color:'#fff' }}>KODA ERP</h1>
            <p style={{ margin:0,fontSize:'.68rem',color:'rgba(0,255,180,.55)',textTransform:'uppercase',letterSpacing:'.22em' }}>Imagina · programa · evoluciona</p>
          </div>
        </div>
        <div style={{ background:'rgba(2,6,8,.96)',border:'1px solid rgba(0,255,180,.2)',borderRadius:'14px',padding:'1.2rem',minHeight:'170px',marginBottom:'1.5rem',boxShadow:'0 20px 50px rgba(0,0,0,.6),inset 0 0 25px rgba(0,255,180,.05)',display:'flex',flexDirection:'column',gap:'6px',fontSize:'.78rem',lineHeight:'1.4' }}>
          {logs.map((log, i) => (<div key={i} style={{ display:'flex',gap:'8px' }}><span style={{ color:'rgba(0,255,180,.38)',fontWeight:'bold' }}>&gt;</span><span>{log}</span></div>))}
          <div style={{ width:'6px',height:'12px',background:'#00ffb4',animation:'lp-cursor 1s infinite',marginTop:'3px' }} />
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:'1rem' }}>
          <div style={{ flex:1,height:'3px',background:'rgba(0,255,180,.08)',borderRadius:'2px',overflow:'hidden' }}>
            <div style={{ width:`${progress}%`,height:'100%',background:'linear-gradient(90deg,#00ffb4,#38bdf8)',transition:'width 0.08s ease',boxShadow:'0 0 12px #00ffb4' }} />
          </div>
          <span style={{ fontSize:'.85rem',width:'38px',textAlign:'right',fontWeight:'bold',color:'#38bdf8' }}>{Math.min(progress,100)}%</span>
        </div>
      </div>
      <button onClick={onComplete} style={{ position:'absolute',bottom:'2.5rem',right:'2.5rem',background:'transparent',border:'1px solid rgba(0,255,180,.22)',color:'rgba(0,255,180,.55)',padding:'.55rem 1.1rem',borderRadius:'8px',fontSize:'.72rem',textTransform:'uppercase',letterSpacing:'.12em',cursor:'pointer',zIndex:12,transition:'all .25s' }}
        onMouseEnter={e=>{e.target.style.borderColor='#00ffb4';e.target.style.color='#00ffb4';}}
        onMouseLeave={e=>{e.target.style.borderColor='rgba(0,255,180,.22)';e.target.style.color='rgba(0,255,180,.55)';}}>
        Omitir Intro
      </button>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   UNIQUE CURSOR — Holographic Crosshair
   ═══════════════════════════════════════════════════════════════ */
const CustomCursor = () => {
  const core = useRef(null);
  const ring = useRef(null);
  const trail1 = useRef(null);
  const trail2 = useRef(null);
  const pos = useRef({ x: 0, y: 0 });
  const ring1Pos = useRef({ x: 0, y: 0 });
  const ring2Pos = useRef({ x: 0, y: 0 });
  const ring3Pos = useRef({ x: 0, y: 0 });
  const raf = useRef(null);

  useEffect(() => {
    const onMove = (e) => { pos.current = { x: e.clientX, y: e.clientY }; };
    const onDown = () => { ring.current?.classList.add('click'); ring.current?.classList.remove('hover'); };
    const onUp = () => { ring.current?.classList.remove('click'); };
    const onEnter = () => { ring.current?.classList.add('hover'); ring.current?.classList.remove('click'); };
    const onLeave = () => { ring.current?.classList.remove('hover'); };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    document.querySelectorAll('a, button, select, input, [data-cursor]').forEach(el => {
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
    });

    const lerp = (a, b, t) => a + (b - a) * t;
    const tick = () => {
      ring1Pos.current.x = lerp(ring1Pos.current.x, pos.current.x, 0.13);
      ring1Pos.current.y = lerp(ring1Pos.current.y, pos.current.y, 0.13);
      ring2Pos.current.x = lerp(ring2Pos.current.x, pos.current.x, 0.06);
      ring2Pos.current.y = lerp(ring2Pos.current.y, pos.current.y, 0.06);
      ring3Pos.current.x = lerp(ring3Pos.current.x, pos.current.x, 0.035);
      ring3Pos.current.y = lerp(ring3Pos.current.y, pos.current.y, 0.035);

      if (core.current) {
        core.current.style.left = pos.current.x + 'px';
        core.current.style.top = pos.current.y + 'px';
      }
      if (ring.current) {
        ring.current.style.left = ring1Pos.current.x + 'px';
        ring.current.style.top = ring1Pos.current.y + 'px';
      }
      if (trail1.current) {
        trail1.current.style.left = ring2Pos.current.x + 'px';
        trail1.current.style.top = ring2Pos.current.y + 'px';
        trail1.current.style.opacity = '0.35';
      }
      if (trail2.current) {
        trail2.current.style.left = ring3Pos.current.x + 'px';
        trail2.current.style.top = ring3Pos.current.y + 'px';
        trail2.current.style.opacity = '0.18';
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <>
      {/* Core stylized K logo cursor */}
      <div ref={core} className="lp-cursor-core">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 3V21M6 12H9.5L16.5 3M9.5 12L17.5 21" stroke="#00ffb4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {/* Spinning conic ring */}
      <div ref={ring} className="lp-cursor-ring" />
      {/* Trailing ghost dots */}
      <div ref={trail1} className="lp-cursor-trail" style={{ width:6, height:6 }} />
      <div ref={trail2} className="lp-cursor-trail" style={{ width:8, height:8 }} />
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════
   PARTICLE CANVAS
   ═══════════════════════════════════════════════════════════════ */
const Particles = ({ density = 10000 }) => {
  const cvs = useRef(null);
  const mouse = useRef({ x: -9999, y: -9999 });
  useEffect(() => {
    const c = cvs.current; if (!c) return;
    const ctx = c.getContext('2d');
    let raf, W = c.width = window.innerWidth, H = c.height = window.innerHeight;
    const onResize = () => { W = c.width = window.innerWidth; H = c.height = window.innerHeight; };
    const onMove = (e) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMove, { passive: true });
    const N = Math.min(Math.floor(W * H / density), W < 768 ? 40 : 150);
    const COLS = ['rgba(0,255,180,', 'rgba(56,189,248,', 'rgba(0,230,160,', 'rgba(7,81,89,'];
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .45, vy: (Math.random() - .5) * .45,
      r: Math.random() * 1.8 + .3, c: COLS[Math.floor(Math.random() * COLS.length)],
    }));
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const { x: mx, y: my } = mouse.current;
      pts.forEach(p => {
        const dx = p.x - mx, dy = p.y - my, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) { const f = (130 - d) / 130 * .28; p.vx += dx / d * f; p.vy += dy / d * f; }
        p.vx *= .984; p.vy *= .984;
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (sp > 2) { p.vx = p.vx / sp * 2; p.vy = p.vy / sp * 2; }
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx = -p.vx;
        if (p.y < 0 || p.y > H) p.vy = -p.vy;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c + '.65)'; ctx.fill();
      });
      const MD = W < 768 ? 75 : 115;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.sqrt(dx*dx+dy*dy);
        if (d < MD) { ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.strokeStyle=`rgba(0,255,180,${(1-d/MD)*.12})`; ctx.lineWidth=.5; ctx.stroke(); }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); window.removeEventListener('mousemove', onMove); };
  }, [density]);
  return <canvas ref={cvs} style={{ position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:1,mixBlendMode:'screen' }} />;
};

/* ═══════════════════════════════════════════════════════════════
   WORD REVEAL
   ═══════════════════════════════════════════════════════════════ */
const WordReveal = ({ text, className = '', delay = 0, once = true, isGradient = false, isGradient2 = false }) => {
  const ref = useRef(null);
  const words = text.split(' ');
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        const inners = ref.current?.querySelectorAll('.wr-inner');
        inners?.forEach((el, i) => setTimeout(() => el.classList.add('on'), delay + i * 80));
        if (once) obs.disconnect();
      }
    }, { threshold: .1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [delay, once]);
  return (
    <span ref={ref} className={className} style={{ display:'block' }}>
      {words.map((w, i) => (
        <span key={i} className="wr-word">
          <span className={`wr-inner ${isGradient ? 'lp-grad-text' : ''} ${isGradient2 ? 'lp-grad-text-2' : ''}`}>{w}</span>
          {i < words.length - 1 && <>&nbsp;</>}
        </span>
      ))}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════════
   TYPED TEXT
   ═══════════════════════════════════════════════════════════════ */
const Typed = ({ text, delay = 0, speed = 48 }) => {
  const [out, setOut] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      let i = 0;
      const iv = setInterval(() => { i++; setOut(text.slice(0, i)); if (i >= text.length) { setDone(true); clearInterval(iv); } }, speed);
      return () => clearInterval(iv);
    }, delay);
    return () => clearTimeout(t);
  }, [text, delay, speed]);
  return <>{out}{!done && <span style={{ borderRight:'2px solid #00ffb4', marginLeft:2, animation:'lp-cursor 1s infinite' }}>&hairsp;</span>}</>;
};

/* ═══════════════════════════════════════════════════════════════
   ANIMATED COUNTER
   ═══════════════════════════════════════════════════════════════ */
const Counter = ({ target, suffix='', prefix='', dur=2200 }) => {
  const [val, setVal] = useState(0);
  const ref = useRef(null); const done = useRef(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true;
        const t0 = performance.now();
        const tick = now => {
          const p = Math.min((now-t0)/dur, 1);
          setVal(Math.round((1-Math.pow(1-p,4))*target));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold:.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, dur]);
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
};

/* ═══════════════════════════════════════════════════════════════
   SCROLL REVEAL
   ═══════════════════════════════════════════════════════════════ */
const Reveal = ({ children, delay=0, dir='up', className='', style }) => {
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(() => ref.current?.classList.add('on'), delay); obs.disconnect(); }
    }, { threshold:.07 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [delay]);
  const d = dir==='left'?'fl':dir==='right'?'fr':'';
  return <div ref={ref} className={`rev ${d} ${className}`} style={style}>{children}</div>;
};

/* ═══════════════════════════════════════════════════════════════
   MAGNETIC BUTTON
   ═══════════════════════════════════════════════════════════════ */
const MagBtn = ({ children, href, className='lp-cta', onClick, style }) => {
  const ref = useRef(null);
  const onMove = (e) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width/2) * .2;
    const y = (e.clientY - r.top - r.height/2) * .2;
    ref.current.style.transform = `translate(${x}px, ${y}px)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ''; };
  if (onClick) return <button ref={ref} className={className} onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick} style={{ border:'none', ...style }}>{children}</button>;
  return <Link ref={ref} href={href||'#'} className={className} onMouseMove={onMove} onMouseLeave={onLeave} style={style}>{children}</Link>;
};

/* ═══════════════════════════════════════════════════════════════
   HERO RIGHT — 3D ERP UNIVERSE (unique, not seen before)
   ═══════════════════════════════════════════════════════════════ */
const ERPUniverse = ({ mouseX, mouseY }) => {
  const [tick, setTick] = useState(0);
  const [activeNode, setActiveNode] = useState(null);
  const [bcvRate, setBcvRate] = useState(null);
  const [liveRevenue, setLiveRevenue] = useState(1842650);

  useEffect(() => {
    fetch('/api/v1/rates/current', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d?.USD?.rate) setBcvRate(d.USD.rate); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setTick(t => t + 1);
      setLiveRevenue(p => p + Math.floor(Math.random() * 5000 + 800));
    }, 2600);
    return () => clearInterval(iv);
  }, []);

  const tx = (mouseX * -12).toFixed(2);
  const ty = (mouseY * 8).toFixed(2);

  const nodes = [
    { id: 'ventas', label: 'Ventas', icon: ShoppingBag, x: '50%', y: '8%', color: '#00ffb4', size: 68, info: 'CxC activas' },
    { id: 'factura', label: 'Facturación', icon: FileText, x: '82%', y: '30%', color: '#a78bfa', size: 58, info: 'SENIAT OK' },
    { id: 'tesoreria', label: 'Tesorería', icon: Landmark, x: '85%', y: '65%', color: '#38bdf8', size: 58, info: 'Flujo positivo' },
    { id: 'contab', label: 'Contabilidad', icon: BookOpen, x: '55%', y: '88%', color: '#f59e0b', size: 58, info: 'Balance OK' },
    { id: 'compras', label: 'Compras', icon: ShoppingCart, x: '18%', y: '68%', color: '#ec4899', size: 58, info: '12 OC activas' },
    { id: 'inventario', label: 'Inventario', icon: Package, x: '15%', y: '32%', color: '#0ea5e9', size: 58, info: 'Stock OK' },
  ];

  const centerX = 50, centerY = 50;

  return (
    <div style={{ position:'relative', width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
      {/* Ambient glow */}
      <div style={{ position:'absolute', inset:'5%', background:'radial-gradient(ellipse, rgba(0,255,180,.14) 0%, transparent 70%)', borderRadius:'50%', filter:'blur(50px)', animation:'lp-warp 10s ease-in-out infinite', pointerEvents:'none' }} />

      {/* 3D wrapper */}
      <div style={{ transform:`perspective(1200px) rotateY(${tx}deg) rotateX(${ty}deg)`, transition:'transform 1s ease', position:'relative', width:'min(480px,100%)', aspectRatio:'1', animation:'lp-tilt-float 8s ease-in-out infinite' }}>

        {/* Orbital rings */}
        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:1 }} viewBox="0 0 480 480">
          <defs>
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(0,255,180,.25)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          {/* Outer ring */}
          <circle cx="240" cy="240" r="190" fill="none" stroke="rgba(0,255,180,.06)" strokeWidth="1" strokeDasharray="4 8" />
          <circle cx="240" cy="240" r="190" fill="none" stroke="rgba(0,255,180,.12)" strokeWidth="1" strokeDasharray="1 200" style={{ animation:'lp-spin 20s linear infinite', transformOrigin:'240px 240px' }}/>
          {/* Inner ring */}
          <circle cx="240" cy="240" r="120" fill="none" stroke="rgba(56,189,248,.08)" strokeWidth="1" strokeDasharray="3 12" />
          <circle cx="240" cy="240" r="120" fill="none" stroke="rgba(56,189,248,.15)" strokeWidth="1" strokeDasharray="1 120" style={{ animation:'lp-spin 14s linear infinite reverse', transformOrigin:'240px 240px' }}/>

          {/* Lines from center to nodes */}
          {nodes.map(n => {
            const nx = parseFloat(n.x) / 100 * 480;
            const ny = parseFloat(n.y) / 100 * 480;
            return (
              <g key={n.id}>
                <line x1="240" y1="240" x2={nx} y2={ny}
                  stroke={activeNode === n.id ? n.color : 'rgba(0,255,180,.12)'}
                  strokeWidth={activeNode === n.id ? 1.5 : 1}
                  strokeDasharray="6 6"
                  style={{ animation: activeNode === n.id ? 'lp-dash 1.2s linear infinite' : 'none', transition:'stroke .3s' }}
                />
                {/* Data packet dot */}
                {activeNode === n.id && (
                  <circle r="3" fill={n.color}>
                    <animateMotion dur="1.5s" repeatCount="indefinite" path={`M 240 240 L ${nx} ${ny}`} />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Center glow */}
          <circle cx="240" cy="240" r="60" fill="url(#centerGlow)" />
        </svg>

        {/* Center KODA core */}
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:5,
          width:76, height:76, borderRadius:'50%',
          background:'rgba(2,6,8,.95)', border:'2px solid rgba(0,255,180,.5)',
          boxShadow:'0 0 40px rgba(0,255,180,.35), inset 0 0 20px rgba(0,255,180,.1)',
          display:'flex', alignItems:'center', justifyContent:'center',
          flexDirection:'column', gap:2
        }}>
          <div style={{ animation:'lp-ring-pulse 2.5s ease-out infinite', position:'absolute', top:'50%', left:'50%', width:'100%', height:'100%', borderRadius:'50%', border:'1px solid rgba(0,255,180,.3)' }} />
          <img src="/LogoGlass.webp" alt="K" style={{ width:36, height:36, objectFit:'cover', borderRadius:'50%' }} />
          <span style={{ fontSize:8, fontWeight:900, color:'#00ffb4', letterSpacing:'.1em', fontFamily:"'Space Mono',monospace" }}>CORE</span>
        </div>

        {/* Nodes */}
        {nodes.map(n => {
          const Icon = n.icon;
          const isActive = activeNode === n.id;
          return (
            <div key={n.id}
              onMouseEnter={() => setActiveNode(n.id)}
              onMouseLeave={() => setActiveNode(null)}
              style={{
                position:'absolute', left:n.x, top:n.y,
                transform:'translate(-50%,-50%)',
                zIndex: isActive ? 10 : 4,
                width: n.size, height: n.size,
                borderRadius:18,
                background: isActive ? `${n.color}18` : 'rgba(4,12,14,.9)',
                border: `1px solid ${isActive ? n.color : `${n.color}35`}`,
                backdropFilter:'blur(14px)',
                display:'flex', alignItems:'center', justifyContent:'center',
                flexDirection:'column', gap:4,
                transition:'all .3s',
                boxShadow: isActive ? `0 0 30px ${n.color}40, 0 0 60px ${n.color}15` : `0 8px 32px rgba(0,0,0,.5)`,
                cursor:'none',
              }}
            >
              <Icon size={isActive ? 22 : 18} color={n.color} />
              <span style={{ fontSize:9, fontWeight:800, color: isActive ? n.color : 'rgba(255,255,255,.6)', letterSpacing:'.06em', textTransform:'uppercase', lineHeight:1, textAlign:'center', fontFamily:"'Space Mono',monospace" }}>{n.label}</span>
              {isActive && <span style={{ fontSize:8, color:'rgba(255,255,255,.5)', fontWeight:600, marginTop:1 }}>{n.info}</span>}
            </div>
          );
        })}

        {/* Floating data cards */}
        {/* BCV rate card */}
        <div style={{ position:'absolute', top:'-10%', left:'-20%', zIndex:8,
          background:'rgba(2,6,8,.92)', border:'1px solid rgba(56,189,248,.35)',
          borderRadius:14, padding:'.75rem 1rem', backdropFilter:'blur(16px)',
          boxShadow:'0 20px 50px rgba(0,0,0,.5), 0 0 30px rgba(56,189,248,.1)',
          animation:'lp-float 5.5s ease-in-out infinite', minWidth:128
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
            <div style={{ width:5, height:5, borderRadius:'50%', background:'#00ffb4', boxShadow:'0 0 8px #00ffb4', animation:'lp-ping 1.8s ease infinite' }} />
            <span style={{ fontSize:9, color:'rgba(255,255,255,.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', fontFamily:"'Space Mono',monospace" }}>BCV Live</span>
          </div>
          <div style={{ fontSize:'1.1rem', fontWeight:900, color:'#38bdf8', letterSpacing:'-.02em' }}>
            {bcvRate !== null ? `Bs. ${bcvRate.toFixed(2)}` : 'Cargando...'}
          </div>
          <div style={{ fontSize:8, color:'rgba(56,189,248,.55)', marginTop:2, fontWeight:600 }}>Tasa oficial en vivo</div>
        </div>

        {/* Revenue card */}
        <div style={{ position:'absolute', bottom:'-5%', right:'-18%', zIndex:8,
          background:'rgba(2,6,8,.92)', border:'1px solid rgba(0,255,180,.3)',
          borderRadius:14, padding:'.75rem 1rem', backdropFilter:'blur(16px)',
          boxShadow:'0 20px 50px rgba(0,0,0,.5), 0 0 30px rgba(0,255,180,.1)',
          animation:'lp-float2 6s ease-in-out infinite', minWidth:148
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
            <TrendingUp size={10} color="#00ffb4" />
            <span style={{ fontSize:9, color:'rgba(255,255,255,.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', fontFamily:"'Space Mono',monospace" }}>Ingresos</span>
          </div>
          <div key={tick} style={{ fontSize:'1.1rem', fontWeight:900, color:'#00ffb4', animation:'lp-number .4s ease', display:'inline-block' }}>
            ${(liveRevenue/1000000).toFixed(3)}M
          </div>
          <div style={{ fontSize:8, color:'rgba(0,255,180,.55)', marginTop:2, fontWeight:600 }}>↑ +14.8% este mes</div>
        </div>

        {/* SENIAT badge */}
        <div style={{ position:'absolute', top:'55%', left:'-22%', zIndex:8,
          background:'rgba(2,6,8,.92)', border:'1px solid rgba(167,139,250,.3)',
          borderRadius:14, padding:'.65rem .9rem', backdropFilter:'blur(16px)',
          boxShadow:'0 20px 50px rgba(0,0,0,.5)',
          animation:'lp-float 7s ease-in-out 1s infinite', minWidth:120
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
            <ShieldCheck size={10} color="#a78bfa" />
            <span style={{ fontSize:9, color:'rgba(255,255,255,.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', fontFamily:"'Space Mono',monospace" }}>SENIAT</span>
          </div>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {['IVA','IGTF','ISLR'].map(t => (
              <span key={t} style={{ padding:'2px 7px', borderRadius:20, background:'rgba(167,139,250,.12)', border:'1px solid rgba(167,139,250,.25)', fontSize:9, fontWeight:800, color:'#a78bfa' }}>✓ {t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   INTERACTIVE WORKFLOW BUILDER
   ═══════════════════════════════════════════════════════════════ */
const WorkflowBuilder = () => {
  const [activeTrigger, setActiveTrigger] = useState(null);
  const triggers = [
    { id: 'pos', name: 'Nueva Venta POS', desc: 'Registrada en sucursal' },
    { id: 'web', name: 'Facturación Web', desc: 'Emitida desde API/Tienda' },
    { id: 'pay', name: 'Cobro de Cuenta', desc: 'Pago recibido del cliente' }
  ];
  const processSteps = [
    { id: 'bcv', name: 'Conversión BCV', desc: 'Sincroniza tasas al instante' },
    { id: 'tax', name: 'Cálculo de Impuestos', desc: 'Aplica IVA 16% + IGTF 3%' },
    { id: 'sign', name: 'Firma Digital', desc: 'Certifica hash criptográfico' }
  ];
  const actions = [
    { id: 'seniat', name: 'SENIAT Gateway', desc: 'Reporte directo a plataforma' },
    { id: 'ledger', name: 'Diario Contable', desc: 'Asiento contable automático' },
    { id: 'email', name: 'Notificación Cliente', desc: 'Envío automático PDF/XML' }
  ];
  return (
    <div style={{ background:'rgba(3,10,12,.75)',border:'1px solid rgba(0,255,180,.14)',borderRadius:24,padding:'2.5rem',backdropFilter:'blur(20px)',boxShadow:'0 40px 80px rgba(0,0,0,.45)',maxWidth:1100,margin:'2.5rem auto',position:'relative',overflow:'hidden' }}>
      <div style={{ position:'absolute',inset:'20%',background:'radial-gradient(circle,rgba(0,255,180,.06) 0%,transparent 70%)',borderRadius:'50%',filter:'blur(40px)',pointerEvents:'none' }} />
      <h3 style={{ fontSize:'1.4rem',fontWeight:800,color:'#fff',marginBottom:'.5rem',textAlign:'center' }}>Flujo de Integración Automatizado</h3>
      <p style={{ fontSize:'.88rem',color:'rgba(255,255,255,.38)',marginBottom:'2.5rem',textAlign:'center',maxWidth:650,margin:'0 auto 2.5rem' }}>Haz clic en cualquier disparador para ver cómo viajan los datos a través del sistema.</p>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 0.25fr 1.2fr 0.25fr 1fr',gap:'1rem',alignItems:'center',position:'relative',zIndex:2 }}>
        <div style={{ display:'flex',flexDirection:'column',gap:'1.2rem' }}>
          <h4 style={{ fontSize:'.7rem',fontWeight:800,color:'rgba(0,255,180,.75)',textTransform:'uppercase',letterSpacing:'.12em',marginBottom:'.5rem',textAlign:'center',fontFamily:"'Space Mono',monospace" }}>1. Disparador</h4>
          {triggers.map(t => (
            <button key={t.id} onClick={() => setActiveTrigger(t.id)} style={{ background:activeTrigger===t.id?'rgba(0,255,180,.1)':'rgba(255,255,255,.02)',border:activeTrigger===t.id?'1px solid rgba(0,255,180,.55)':'1px solid rgba(255,255,255,.06)',borderRadius:14,padding:'1rem',textAlign:'left',cursor:'none !important',transition:'all .3s',boxShadow:activeTrigger===t.id?'0 0 20px rgba(0,255,180,.2)':'none',width:'100%' }}>
              <div style={{ fontSize:'.88rem',fontWeight:800,color:'#fff',display:'flex',alignItems:'center',gap:'8px' }}>
                <div style={{ width:6,height:6,borderRadius:'50%',background:'#00ffb4',boxShadow:'0 0 6px #00ffb4' }} />{t.name}
              </div>
              <div style={{ fontSize:'.73rem',color:'rgba(255,255,255,.38)',marginTop:3 }}>{t.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ display:'flex',flexDirection:'column',justifyContent:'space-around',height:'170px',opacity:activeTrigger?1:.18,transition:'opacity .4s' }}>
          {[1,2,3].map(i => (<svg key={i} width="100%" height="20" viewBox="0 0 40 20"><path d="M 0 10 L 40 10" className={`flow-line ${activeTrigger?'active':''}`} strokeWidth="1.5" /></svg>))}
        </div>
        <div style={{ display:'flex',flexDirection:'column',gap:'1rem' }}>
          <h4 style={{ fontSize:'.7rem',fontWeight:800,color:'rgba(56,189,248,.75)',textTransform:'uppercase',letterSpacing:'.12em',marginBottom:'.5rem',textAlign:'center',fontFamily:"'Space Mono',monospace" }}>2. Motor de Reglas</h4>
          {processSteps.map((s,idx) => (
            <div key={s.id} style={{ background:activeTrigger?'rgba(56,189,248,.07)':'rgba(255,255,255,.01)',border:activeTrigger?'1px solid rgba(56,189,248,.38)':'1px solid rgba(255,255,255,.03)',borderRadius:14,padding:'.9rem',transition:'all .4s',transitionDelay:`${idx*.12}s`,boxShadow:activeTrigger?'0 0 14px rgba(56,189,248,.1)':'none' }}>
              <div style={{ fontSize:'.84rem',fontWeight:800,color:'#fff',display:'flex',alignItems:'center',gap:'6px' }}><Cpu size={12} color="#38bdf8" />{s.name}</div>
              <div style={{ fontSize:'.72rem',color:'rgba(255,255,255,.33)',marginTop:2 }}>{s.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex',flexDirection:'column',justifyContent:'space-around',height:'170px',opacity:activeTrigger?1:.18,transition:'opacity .4s' }}>
          {[1,2,3].map(i => (<svg key={i} width="100%" height="20" viewBox="0 0 40 20"><path d="M 0 10 L 40 10" className={`flow-line ${activeTrigger?'active':''}`} strokeWidth="1.5" style={{ stroke:'#38bdf8' }} /></svg>))}
        </div>
        <div style={{ display:'flex',flexDirection:'column',gap:'1.2rem' }}>
          <h4 style={{ fontSize:'.7rem',fontWeight:800,color:'rgba(167,139,250,.75)',textTransform:'uppercase',letterSpacing:'.12em',marginBottom:'.5rem',textAlign:'center',fontFamily:"'Space Mono',monospace" }}>3. Destino</h4>
          {actions.map((a,idx) => (
            <div key={a.id} style={{ background:activeTrigger?'rgba(167,139,250,.07)':'rgba(255,255,255,.01)',border:activeTrigger?'1px solid rgba(167,139,250,.38)':'1px solid rgba(255,255,255,.03)',borderRadius:14,padding:'.9rem',transition:'all .4s',transitionDelay:`${(idx+3)*.12}s` }}>
              <div style={{ fontSize:'.84rem',fontWeight:800,color:'#fff',display:'flex',alignItems:'center',gap:'6px' }}><Check size={12} color="#a78bfa" />{a.name}</div>
              <div style={{ fontSize:'.72rem',color:'rgba(255,255,255,.33)',marginTop:2 }}>{a.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop:'2rem',background:'rgba(2,6,8,.9)',border:'1px solid rgba(0,255,180,.2)',borderRadius:12,padding:'1rem',fontFamily:"'Space Mono',monospace",fontSize:'.76rem',color:'#00ffb4',minHeight:'42px',display:'flex',alignItems:'center',gap:'8px',position:'relative',zIndex:2 }}>
        <span style={{ color:'rgba(0,255,180,.35)' }}>$</span>
        <span>
          {activeTrigger==='pos' && "FLUJO: Venta POS → Convirtiendo divisas BCV → IVA 16% → Asiento Libro Diario → SENIAT Gateway..."}
          {activeTrigger==='web' && "FLUJO: Factura Web → Validando RIF → Firma digital → PDF/XML SENIAT → Email automático al cliente..."}
          {activeTrigger==='pay' && "FLUJO: Abono CxC → Conciliación Tesorería → IGTF si aplica → P&G actualizados → Dashboard live..."}
          {!activeTrigger && "Esperando disparador... Selecciona una opción para iniciar la animación de flujo de datos."}
        </span>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   MODULE CARD
   ═══════════════════════════════════════════════════════════════ */
const ModCard = ({ icon: Icon, label, desc, accent, size='normal', badge, bullets, delay=0, miniChart }) => {
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ rx:0, ry:0, gx:50, gy:50 });
  const [vis, setVis] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(()=>setVis(true),delay); obs.disconnect(); }
    },{threshold:.06});
    if (ref.current) obs.observe(ref.current);
    return ()=>obs.disconnect();
  },[delay]);

  const onMove = e => {
    const r=ref.current.getBoundingClientRect();
    const cx=r.left+r.width/2,cy=r.top+r.height/2;
    setTilt({ rx:-(e.clientY-cy)/(r.height/2)*10, ry:(e.clientX-cx)/(r.width/2)*10, gx:(e.clientX-r.left)/r.width*100, gy:(e.clientY-r.top)/r.height*100 });
  };
  const onLeave=()=>setTilt({rx:0,ry:0,gx:50,gy:50});
  const isFeat=size==='featured', isWide=size==='wide';

  const inner = (
    <div ref={isFeat?null:ref} className="lp-mcard" onMouseMove={onMove} onMouseLeave={onLeave}
      style={{ gridColumn:isWide?'span 2':undefined, gridRow:isFeat?'span 2':undefined,
        padding:isFeat?'2.1rem':'1.75rem',
        transform:`perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) ${vis?'translateY(0)':'translateY(40px)'}`,
        opacity:vis?1:0, transition:vis?'transform .16s ease,box-shadow .3s,border-color .3s,opacity .6s':'opacity .6s ease,transform .65s cubic-bezier(.16,1,.3,1)',
        background:`radial-gradient(ellipse at ${tilt.gx}% ${tilt.gy}%,${accent}09 0%,rgba(4,14,16,.72) 60%)`,
      }}>
      <div style={{ position:'absolute',top:0,right:0,width:120,height:120,background:`radial-gradient(circle at top right,${accent}18,transparent 70%)`,borderRadius:'0 22px 0 0',pointerEvents:'none' }} />
      {badge && <span style={{ position:'absolute',top:'1.2rem',right:'1.2rem',background:`${accent}14`,border:`1px solid ${accent}35`,color:accent,fontSize:'9px',fontWeight:800,padding:'3px 9px',borderRadius:20,textTransform:'uppercase',letterSpacing:'.1em',fontFamily:"'Space Mono',monospace" }}>{badge}</span>}
      <div style={{ width:isFeat?52:42,height:isFeat?52:42,borderRadius:14,background:`linear-gradient(135deg,${accent}20,${accent}06)`,border:`1px solid ${accent}40`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:isFeat?'1.5rem':'1rem',boxShadow:`0 0 24px ${accent}20`,flexShrink:0 }}>
        <Icon size={isFeat?22:17} color={accent} />
      </div>
      <h3 style={{ color:'#fff',fontSize:isFeat?'1.25rem':'.97rem',fontWeight:800,marginBottom:'.4rem',letterSpacing:'-.01em' }}>{label}</h3>
      <p style={{ color:'rgba(255,255,255,.38)',fontSize:isFeat?'.85rem':'.77rem',lineHeight:1.55,fontWeight:500 }}>{desc}</p>
      {miniChart && (
        <div style={{ display:'flex',alignItems:'flex-end',gap:2,height:32,marginTop:'1rem',opacity:.7 }}>
          {miniChart.map((h,i)=>(
            <div key={i} style={{ flex:1,height:`${h}%`,borderRadius:'2px 2px 0 0',background:i===miniChart.length-1?accent:`${accent}55`,animation:`lp-spark ${1+i*.12}s ease infinite`,animationDelay:`${i*.08}s` }} />
          ))}
        </div>
      )}
      {isFeat && bullets && (
        <div style={{ marginTop:'1.5rem',display:'flex',flexDirection:'column',gap:'.55rem' }}>
          {bullets.map(b=>(<div key={b} style={{ display:'flex',alignItems:'flex-start',gap:10 }}><div style={{ width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,255,180,.1)',border:'1px solid rgba(0,255,180,.3)',flexShrink:0,marginTop:2 }}><CheckCircle size={10} color="#00ffb4" /></div><span style={{ color:'rgba(255,255,255,.55)',fontSize:'.82rem',lineHeight:1.4 }}>{b}</span></div>))}
        </div>
      )}
    </div>
  );

  if (isFeat) {
    return (
      <div ref={ref} className="lp-conic-wrap" style={{ gridColumn:'span 2',gridRow:'span 2',opacity:vis?1:0,transform:vis?'translateY(0)':'translateY(40px)',transition:'opacity .7s ease,transform .7s cubic-bezier(.16,1,.3,1)' }}>
        <div className="lp-conic-inner" style={{ height:'100%' }}>
          <div className="lp-mcard" onMouseMove={onMove} onMouseLeave={onLeave} style={{ height:'100%',padding:'2.1rem',border:'none',borderRadius:22,background:`radial-gradient(ellipse at ${tilt.gx}% ${tilt.gy}%,rgba(0,255,180,.07) 0%,transparent 60%)`,transform:`perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,transition:'transform .16s ease' }}>
            <div style={{ position:'absolute',top:0,right:0,width:140,height:140,background:'radial-gradient(circle at top right,rgba(0,255,180,.12),transparent 70%)',borderRadius:'0 22px 0 0',pointerEvents:'none' }} />
            {badge && <span style={{ position:'absolute',top:'1.2rem',right:'1.2rem',background:'rgba(0,255,180,.12)',border:'1px solid rgba(0,255,180,.3)',color:'#00ffb4',fontSize:'9px',fontWeight:800,padding:'3px 9px',borderRadius:20,textTransform:'uppercase',letterSpacing:'.1em',fontFamily:"'Space Mono',monospace" }}>{badge}</span>}
            <div style={{ width:54,height:54,borderRadius:15,background:'linear-gradient(135deg,rgba(0,255,180,.2),rgba(0,255,180,.06))',border:'1px solid rgba(0,255,180,.4)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'1.5rem',boxShadow:'0 0 28px rgba(0,255,180,.22)' }}>
              <Icon size={22} color="#00ffb4" />
            </div>
            <h3 style={{ color:'#fff',fontSize:'1.25rem',fontWeight:800,marginBottom:'.45rem',letterSpacing:'-.01em' }}>{label}</h3>
            <p style={{ color:'rgba(255,255,255,.38)',fontSize:'.85rem',lineHeight:1.55,fontWeight:500 }}>{desc}</p>
            {bullets && (<div style={{ marginTop:'1.5rem',display:'flex',flexDirection:'column',gap:'.55rem' }}>{bullets.map(b=>(<div key={b} style={{ display:'flex',alignItems:'flex-start',gap:10 }}><div style={{ width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,255,180,.1)',border:'1px solid rgba(0,255,180,.3)',flexShrink:0,marginTop:2 }}><CheckCircle size={10} color="#00ffb4" /></div><span style={{ color:'rgba(255,255,255,.55)',fontSize:'.82rem',lineHeight:1.4 }}>{b}</span></div>))}</div>)}
          </div>
        </div>
      </div>
    );
  }
  return inner;
};

/* ═══════════════════════════════════════════════════════════════
   CHECK LIST
   ═══════════════════════════════════════════════════════════════ */
const CheckList = ({ items, accent='#00ffb4' }) => (
  <div style={{ display:'flex',flexDirection:'column',gap:'.7rem' }}>
    {items.map(item => (
      <div key={item} style={{ display:'flex',alignItems:'flex-start',gap:10 }}>
        <div style={{ width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2,background:`${accent}14`,border:`1px solid ${accent}32` }}>
          <CheckCircle size={10} color={accent} />
        </div>
        <span style={{ color:'rgba(255,255,255,.6)',fontSize:'.9rem',lineHeight:1.45 }}>{item}</span>
      </div>
    ))}
  </div>
);

const Label = ({ icon: I, text, color='#00ffb4', bg='rgba(0,255,180,.07)', border='rgba(0,255,180,.2)' }) => (
  <span style={{ display:'inline-flex',alignItems:'center',gap:7,padding:'6px 16px',borderRadius:50,fontSize:11,fontWeight:800,letterSpacing:'.12em',textTransform:'uppercase',background:bg,border:`1px solid ${border}`,color,marginBottom:'1.5rem',fontFamily:"'Space Mono',monospace" }}>
    {I && <I size={12} />} {text}
  </span>
);

const SectionH = ({ line1, line2grad, size='clamp(2rem,4.5vw,3.8rem)' }) => (
  <h2 style={{ fontSize:size,fontWeight:900,letterSpacing:'-.025em',lineHeight:1.04,margin:'0 0 1.25rem' }}>
    <WordReveal text={line1} style={{ color:'#fff' }} />
    {line2grad && <WordReveal text={line2grad} delay={100} isGradient={true} />}
  </h2>
);

/* ═══════════════════════════════════════════════════════════════
   PREMIUM PRICING CARD
   ═══════════════════════════════════════════════════════════════ */
const planMeta = {
  'Básico': {
    desc: 'Automatización esencial fiscal',
    max_users: 3,
    max_range: 10,
    features: ['Emisión de Factura Fiscal', 'Sincronización BCV Diaria', 'Reportes básicos en PDF', 'Soporte vía tickets'],
    accent: '#38bdf8',
    status: 'ACTIVE_CORE',
    version: 'v1.4'
  },
  'Pro': {
    desc: 'La suite completa de gestión',
    max_users: 15,
    max_range: 50,
    features: ['Facturación ilimitada', 'Módulos integrados', 'Libros Fiscales en tiempo real', 'Dashboard de KPIs', 'Soporte prioritario 24/7'],
    accent: '#00ffb4',
    status: 'SYS_OPTIMAL',
    version: 'v3.2'
  },
  'Corporativo': {
    desc: 'Control y escala total',
    max_users: 100,
    max_range: 100,
    features: ['Multi-empresa & Sucursales', 'Auditoría completa de logs', 'API de integración', 'Acceso al módulo desarrollador', 'Consultor asignado'],
    accent: '#a78bfa',
    status: 'MAX_POWER',
    version: 'v6.0'
  }
};

const PlanCard = ({ plan, i, total }) => {
  const isFeatured = i === 1 && total >= 3;
  const meta = planMeta[plan.name] || {
    desc: 'Gestión integrada KODA',
    max_users: 5,
    max_range: 20,
    features: plan.features || [],
    accent: '#00ffb4',
    status: 'SYS_RUNNING',
    version: 'v1.0'
  };
  const accentColor = meta.accent;
  const TierIcon = i === 0 ? Shield : i === 1 ? Zap : Crown;

  // Circle Gauge coordinates
  const pct = (meta.max_users / meta.max_range) * 100;
  const strokeDashoffset = 100 - pct;

  return (
    <Reveal delay={i * 120}>
      <div className={`lp-plan-card ${isFeatured ? 'featured' : ''}`} style={{ height:'100%' }}>
        <div className="lp-plan-inner" style={{ padding: '2.5rem 2rem 2.2rem', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
          
          {/* Tech hardware header details */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', borderBottom:'1px solid rgba(255,255,255,.05)', paddingBottom:'1rem' }}>
            <span style={{ fontSize:9, fontFamily:"'Space Mono',monospace", color:'rgba(255,255,255,.25)', letterSpacing:'.1em' }}>
              UNIT // {meta.version}
            </span>
            <span style={{ fontSize:9, fontFamily:"'Space Mono',monospace", color:accentColor, fontWeight:800, letterSpacing:'.1em', display:'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:accentColor, boxShadow:`0 0 6px ${accentColor}`, display:'inline-block' }} />
              {meta.status}
            </span>
          </div>

          <div>
            {isFeatured && (
              <div style={{ textAlign:'center', marginBottom:'1.25rem' }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 12px', borderRadius:4, background:'rgba(0,255,180,.08)', border:'1px solid rgba(0,255,180,.25)', fontSize:9, fontWeight:900, letterSpacing:'.12em' }}>
                  <Sparkles size={8} color="#00ffb4" />
                  <span className="lp-holo-badge" style={{ fontFamily:"'Space Mono',monospace" }}>MODULE_POPULAR</span>
                </span>
              </div>
            )}

            {/* Icon + Name + Description */}
            <div style={{ display:'flex', alignItems:'center', gap:'1.25rem', marginBottom:'1.5rem' }}>
              <div style={{ width:54, height:54, borderRadius:12, background:`${accentColor}10`, border:`1px solid ${accentColor}30`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 20px ${accentColor}15`, flexShrink:0 }}>
                <TierIcon size={22} color={accentColor} />
              </div>
              <div>
                <h3 style={{ fontSize:'1.4rem', fontWeight:900, color:'#fff', letterSpacing:'-.01em', lineHeight:1 }}>{plan.name}</h3>
                <p style={{ fontSize:'.74rem', color:'rgba(255,255,255,.4)', marginTop:4, lineHeight:1.2 }}>
                  {meta.desc}
                </p>
              </div>
            </div>

            {/* Blueprint Grid Price Block */}
            <div style={{ 
              padding:'1.5rem', 
              background:'rgba(255,255,255,.01)', 
              borderRadius:16, 
              border:`1px solid rgba(255,255,255,.06)`, 
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
              backgroundSize: '12px 12px',
              marginBottom:'1.5rem', 
              position:'relative', 
              overflow:'hidden',
              display:'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize:8, fontFamily:"'Space Mono',monospace", color:'rgba(255,255,255,.3)', textTransform:'uppercase', marginBottom:2 }}>Montaje de Licencia</div>
                <div style={{ display:'flex', alignItems:'flex-start', gap:1 }}>
                  <span style={{ fontSize:'.9rem', fontWeight:700, color:accentColor, marginTop:'.2rem' }}>$</span>
                  <span style={{ fontSize:'2.6rem', fontWeight:900, color:'#fff', letterSpacing:'-.04em', lineHeight:1 }}>{plan.price}</span>
                  <span style={{ color:'rgba(255,255,255,.35)', fontSize:'.75rem', alignSelf:'flex-end', marginBottom:'.2rem', fontFamily:"'Space Mono',monospace" }}>/mes</span>
                </div>
              </div>

              {/* High-tech Circular Gauge inside the Card */}
              <div style={{ position:'relative', width:54, height:54, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="54" height="54" viewBox="0 0 36 36" style={{ transform:'rotate(-90deg)' }}>
                  <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3.5" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke={accentColor} strokeWidth="3.5" strokeDasharray="100" strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ filter:`drop-shadow(0 0 3px ${accentColor}50)` }} />
                </svg>
                <div style={{ position:'absolute', fontSize:'8px', fontWeight:900, fontFamily:"'Space Mono',monospace", color:'#fff', display:'flex', flexDirection:'column', alignItems:'center', lineHeight:1 }}>
                  <span>{meta.max_users === 100 ? 'MAX' : `${meta.max_users}U`}</span>
                </div>
              </div>
            </div>

            {/* Features (Console Terminal style list) */}
            <div style={{ marginBottom:'2.2rem' }}>
              <div style={{ fontSize:'.68rem', color:'rgba(255,255,255,.3)', fontWeight:800, marginBottom:'.85rem', textTransform:'uppercase', letterSpacing:'.1em', display:'flex', alignItems:'center', gap:6, fontFamily:"'Space Mono',monospace" }}>
                <span>// CAPABILITIES</span>
                <div style={{ flex:1, height:1, background:'rgba(255,255,255,.06)' }} />
              </div>
              <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:'.65rem' }}>
                <li style={{ display:'flex', alignItems:'center', gap:'.65rem' }}>
                  <span style={{ color:accentColor, fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700 }}>[+]</span>
                  <span style={{ color:'rgba(255,255,255,.75)', fontSize:'.85rem' }}>Hasta <strong style={{ color:'#fff' }}>{meta.max_users === 100 ? 'Ilimitados' : meta.max_users}</strong> usuarios</span>
                </li>
                {meta.features.map((feat, idx) => (
                  <li key={idx} style={{ display:'flex', alignItems:'center', gap:'.65rem' }}>
                    <span style={{ color:accentColor, fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700 }}>[+]</span>
                    <span style={{ color:'rgba(255,255,255,.75)', fontSize:'.85rem' }}>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action Trigger Button */}
          <MagBtn href="/registro"
            className={isFeatured ? 'lp-cta' : 'lp-ghost'}
            style={{
              width:'100%', justifyContent:'center', padding:'.95rem',
              borderRadius:10, fontSize:13, fontWeight:900,
              fontFamily:"'Space Mono',monospace",
              letterSpacing:'.05em',
              textTransform:'uppercase',
              transition:'all .3s',
              ...(isFeatured ? {} : { borderColor:`rgba(255,255,255,.1)`, color:'#fff', background:'rgba(255,255,255,.02)' }),
            }}>
            {isFeatured ? 'MOUNT_MODULE_NOW' : 'SELECT_MODULE'}
            <ArrowUpRight size={14} style={{ marginLeft:4 }} />
          </MagBtn>
        </div>
      </div>
    </Reveal>
  );
};

/* ═══════════════════════════════════════════════════════════════
   COMPLIANCE MARQUEE — Two-row opposing scroll (not boring)
   ═══════════════════════════════════════════════════════════════ */
const ComplianceMarquee = () => {
  const row1 = [
    { icon: Zap, text: 'IVA 16% Automático', color: '#00ffb4' },
    { icon: Lock, text: 'IGTF 3% Calculado', color: '#38bdf8' },
    { icon: BarChart3, text: 'ISLR Integrado', color: '#a78bfa' },
    { icon: RefreshCw, text: 'BCV Live Sync', color: '#f59e0b' },
    { icon: ShieldCheck, text: 'SENIAT Validado', color: '#10b981' },
    { icon: FileText, text: 'Factura Electrónica', color: '#00ffb4' },
    { icon: BookOpen, text: 'Libro Fiscal', color: '#38bdf8' },
    { icon: Landmark, text: 'Multi-Moneda', color: '#a78bfa' },
  ];
  const row2 = [
    { icon: Building2, text: 'Multi-Empresa', color: '#38bdf8' },
    { icon: Terminal, text: 'POS Integrado', color: '#a78bfa' },
    { icon: Layers, text: 'Balance General', color: '#00ffb4' },
    { icon: TrendingUp, text: 'Estado de Resultados', color: '#10b981' },
    { icon: Landmark, text: 'Conciliación Bancaria', color: '#f59e0b' },
    { icon: Activity, text: 'Auditoría de Logs', color: '#00ffb4' },
    { icon: Database, text: 'Respaldo Nube', color: '#38bdf8' },
    { icon: FileText, text: 'Retenciones', color: '#a78bfa' },
  ];

  return (
    <section style={{ padding:'3rem 0', borderTop:'1px solid rgba(0,255,180,.08)', borderBottom:'1px solid rgba(0,255,180,.08)', background:'rgba(0,255,180,.015)', overflow:'hidden' }}>
      {/* Row 1 — Forward */}
      <div style={{ overflow:'hidden', marginBottom:'1rem' }}>
        <div style={{ display:'flex', gap:'1rem', animation:'lp-marquee-fwd 30s linear infinite', width:'max-content' }}
          onMouseEnter={e=>e.currentTarget.style.animationPlayState='paused'}
          onMouseLeave={e=>e.currentTarget.style.animationPlayState='running'}>
          {[...row1,...row1].map((b,i)=>{
            const Icon = b.icon;
            return (
              <div key={i} className="compliance-pill" style={{ borderColor: `${b.color}25`, background: `${b.color}05`, color: b.color }}>
                <Icon size={14} style={{ marginRight: 6 }} />
                <span>{b.text}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* Row 2 — Reverse */}
      <div style={{ overflow:'hidden' }}>
        <div style={{ display:'flex', gap:'1rem', animation:'lp-marquee-rev 28s linear infinite', width:'max-content' }}
          onMouseEnter={e=>e.currentTarget.style.animationPlayState='paused'}
          onMouseLeave={e=>e.currentTarget.style.animationPlayState='running'}>
          {[...row2,...row2].map((b,i)=>{
            const Icon = b.icon;
            return (
              <div key={i} className="compliance-pill" style={{ borderColor: `${b.color}25`, background: `${b.color}05`, color: b.color }}>
                <Icon size={14} style={{ marginRight: 6 }} />
                <span>{b.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════════
   CINEMATIC FINAL CTA — 3D Parallax Text Layers
   ═══════════════════════════════════════════════════════════════ */
const CinematicCTA = ({ mouse }) => {
  const ref = useRef(null);
  const [scrollRatio, setScrollRatio] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const ratio = 1 - Math.max(0, Math.min(1, rect.top / window.innerHeight));
      setScrollRatio(ratio);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const mx = mouse.x * -18;
  const my = mouse.y * 12;
  const scrollY = scrollRatio * -30;

  return (
    <section ref={ref} className="lp-cta-section" style={{ padding:'clamp(6rem,12vw,12rem) clamp(1.5rem,5vw,4rem)', position:'relative', overflow:'hidden' }}>
      {/* Layered BG glow */}
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'80vw', height:'80vh', background:'radial-gradient(ellipse, rgba(0,255,180,.12) 0%, rgba(56,189,248,.04) 40%, transparent 70%)', borderRadius:'50%', filter:'blur(80px)', pointerEvents:'none', animation:'lp-orb1 15s ease-in-out infinite' }} />
      <div style={{ position:'absolute', top:'30%', right:'10%', width:'40vw', height:'40vh', background:'radial-gradient(ellipse, rgba(167,139,250,.08) 0%, transparent 70%)', borderRadius:'50%', filter:'blur(60px)', pointerEvents:'none' }} />

      {/* Grid in background */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(0,255,180,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,180,.03) 1px,transparent 1px)', backgroundSize:'65px 65px', pointerEvents:'none' }} />

      {/* Ghost text layers (parallax depth) */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }}>
        {/* Layer 1 — deepest, most blurred */}
        <div className="lp-parallax-text" style={{
          top:'15%', left:'5%',
          fontSize:'clamp(5rem,14vw,13rem)',
          color:'transparent',
          WebkitTextStroke:'1px rgba(0,255,180,.04)',
          transform:`translate(${mx * 0.6}px, ${my * 0.6 + scrollY * 0.8}px)`,
          transition:'transform .8s ease',
        }}>KODA</div>
        {/* Layer 2 */}
        <div className="lp-parallax-text" style={{
          bottom:'10%', right:'3%',
          fontSize:'clamp(4rem,10vw,9rem)',
          color:'transparent',
          WebkitTextStroke:'1px rgba(56,189,248,.05)',
          transform:`translate(${mx * -0.4}px, ${my * -0.4 + scrollY * 0.5}px)`,
          transition:'transform .9s ease',
        }}>ERP</div>
        {/* Scan beam */}
        <div style={{ position:'absolute', left:0, right:0, height:'1.5px', background:'linear-gradient(90deg,transparent,rgba(0,255,180,.3),transparent)', animation:'lp-scan 6s linear infinite', pointerEvents:'none' }} />
      </div>

      {/* Main content */}
      <Reveal>
        <div style={{ maxWidth:1000, margin:'0 auto', textAlign:'center', position:'relative', zIndex:10 }}>
          {/* Label */}
          <Label icon={Rocket} text="Listo para comenzar" />

          {/* 3D Headline with mouse parallax */}
          <div style={{ transform:`perspective(800px) rotateY(${mx * 0.02}deg) rotateX(${my * 0.01}deg)`, transition:'transform .6s ease', marginBottom:'1rem' }}>
            <h2 style={{ fontSize:'clamp(3rem,6.5vw,5.5rem)', fontWeight:900, letterSpacing:'-.04em', lineHeight:.95, color:'#fff', margin:'0 0 .5rem' }}>
              <WordReveal text="Tu empresa" />
              <WordReveal text="merece operar" delay={80} />
              <span style={{ display:'block', overflow:'hidden' }}>
                <span style={{ display:'inline-block', background:'linear-gradient(135deg,#00ffb4 0%,#38bdf8 35%,#a78bfa 70%,#00ffb4 100%)', backgroundSize:'300% 100%', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'lp-shimmer 4s linear infinite' }}>
                  <WordReveal text="sin límites." delay={160} />
                </span>
              </span>
            </h2>
          </div>

          <p style={{ color:'rgba(255,255,255,.42)', fontSize:'1.1rem', maxWidth:520, margin:'0 auto 2.5rem', lineHeight:1.72 }}>
            La plataforma ERP más completa construida para la realidad empresarial venezolana. Fiscal, contable y operativa — en un solo sistema.
          </p>

          {/* Floating compliance badges */}
          <div style={{ display:'flex', justifyContent:'center', gap:'.75rem', flexWrap:'wrap', marginBottom:'2.5rem' }}>
            {['✓ IVA 16% Sincronizado', '✓ Tasas BCV en Vivo', '✓ Providencia 00071'].map((b, i) => (
              <span key={i} style={{
                padding:'7px 16px', borderRadius:50,
                background: i===0 ? 'rgba(0,255,180,.08)' : i===1 ? 'rgba(56,189,248,.08)' : 'rgba(167,139,250,.08)',
                border: `1px solid ${i===0 ? 'rgba(0,255,180,.25)' : i===1 ? 'rgba(56,189,248,.25)' : 'rgba(167,139,250,.25)'}`,
                color: i===0 ? '#00ffb4' : i===1 ? '#38bdf8' : '#a78bfa',
                fontSize:11, fontWeight:800, letterSpacing:'.08em',
                animation:`lp-float ${5+i*1.2}s ease-in-out ${i*.5}s infinite`,
                display:'inline-block',
              }}>{b}</span>
            ))}
          </div>

          {/* CTA Buttons */}
          <div style={{ display:'flex', gap:'.85rem', flexWrap:'wrap', justifyContent:'center', position:'relative', zIndex:10 }}>
            <MagBtn href="/login" className="lp-cta" style={{ padding:'1.2rem 3.2rem', fontSize:16, borderRadius:18, gap:12 }}>
              Acceder al Sistema <ArrowRight size={20} />
            </MagBtn>
            <MagBtn href="#modulos" className="lp-ghost" style={{ padding:'1.2rem 2.6rem', fontSize:15, borderRadius:18 }}>
              Explorar Módulos
            </MagBtn>
          </div>

          {/* Trust strip */}
          <div style={{ marginTop:'3rem', paddingTop:'2rem', borderTop:'1px solid rgba(255,255,255,.05)', display:'flex', justifyContent:'center', alignItems:'center', gap:'2rem', flexWrap:'wrap' }}>
            {[
              { icon: Shield, text:'SSL Seguro', color:'#00ffb4' },
              { icon: Activity, text:'99.9% Uptime', color:'#38bdf8' },
              { icon: Users, text:'Multi-empresa', color:'#a78bfa' },
              { icon: Zap, text:'Soporte Live', color:'#f59e0b' },
            ].map(({ icon: I, text, color }) => (
              <div key={text} style={{ display:'flex', alignItems:'center', gap:7, color:'rgba(255,255,255,.35)', fontSize:12, fontWeight:700 }}>
                <I size={14} color={color} />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════════
   MAIN LANDING
   ═══════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const [booted, setBooted] = useState(false);
  const [mouse, setMouse] = useState({ x:0, y:0 });
  const [navScrolled, setNavScrolled] = useState(false);
  const [publicPlans, setPublicPlans] = useState([]);

  useEffect(() => {
    if (sessionStorage.getItem('koda_intro_played') === 'true') { setBooted(true); }
    const onMove = e => setMouse({ x:e.clientX/window.innerWidth-.5, y:e.clientY/window.innerHeight-.5 });
    const onScroll = () => setNavScrolled(window.scrollY > 60);
    window.addEventListener('mousemove', onMove, { passive:true });
    window.addEventListener('scroll', onScroll, { passive:true });
    fetch('/api/public/plans')
      .then(res => res.json())
      .then(data => setPublicPlans(data || []))
      .catch(() => {});
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('scroll', onScroll); };
  }, []);

  const mods = [
    { icon:Building2, label:'Gestor Empresarial', desc:'Suite corporativa completa. Dashboard ejecutivo, gestión multi-empresa y control de accesos con auditoría en tiempo real.', accent:'#00ffb4', size:'featured', badge:'Core', bullets:['Gestión multi-empresa y multi-sucursal','Dashboard ejecutivo con KPIs en vivo','Control granular de roles y permisos','Auditoría completa de actividad'] },
    { icon:ShoppingBag, label:'Ventas', desc:'Cotizaciones, órdenes y seguimiento comercial integrado.', accent:'#38bdf8', size:'normal', delay:80, miniChart:[55,70,48,85,60,92,75,88] },
    { icon:FileText, label:'Facturación', desc:'Emisión fiscal conforme al SENIAT. IVA, IGTF e ISLR.', accent:'#a78bfa', size:'wide', badge:'SENIAT', delay:140 },
    { icon:ShoppingCart, label:'Compras', desc:'Proveedores, órdenes y aprobaciones en un flujo unificado.', accent:'#f59e0b', size:'normal', delay:100, miniChart:[40,58,35,72,55,68,45,80] },
    { icon:Package, label:'Inventario', desc:'Stock, kardex, trazabilidad y toma física digital.', accent:'#ec4899', size:'normal', delay:180, miniChart:[65,78,52,88,70,83,60,91] },
    { icon:Landmark, label:'Tesorería', desc:'Flujo de caja, bancos y conciliación automática.', accent:'#00ffb4', size:'normal', delay:220, miniChart:[48,62,55,78,52,85,68,74] },
    { icon:BookOpen, label:'Contabilidad', desc:'Asientos, estados financieros y cierre contable.', accent:'#38bdf8', size:'normal', delay:260, miniChart:[58,72,45,82,67,90,75,86] },
    { icon:PieChart, label:'Reportes & BI', desc:'Business Intelligence y exportación de datos.', accent:'#a78bfa', size:'normal', delay:300, miniChart:[62,75,58,88,72,95,80,92] },
  ];

  if (!booted) {
    return (
      <>
        <CSS />
        <Preloader onComplete={() => { setBooted(true); if (typeof window !== 'undefined') sessionStorage.setItem('koda_intro_played','true'); }} />
      </>
    );
  }

  return (
    <div className="lp">
      <CSS />
      <CustomCursor />

      {/* GLOBAL ANIMATED BACKGROUND */}
      <div style={{ position:'fixed',inset:0,zIndex:0,overflow:'hidden',pointerEvents:'none' }}>
        <Particles density={11000} />
        <div className="lp-gridline" style={{ opacity:.7 }} />
        <div style={{ position:'absolute',top:'10%',left:'25%',width:'45vw',height:'45vh',background:'radial-gradient(circle,rgba(0,255,180,.1) 0%,transparent 65%)',filter:'blur(55px)',animation:'lp-orb1 20s ease-in-out infinite',pointerEvents:'none' }} />
        <div style={{ position:'absolute',bottom:'12%',right:'15%',width:'35vw',height:'35vh',background:'radial-gradient(circle,rgba(56,189,248,.07) 0%,transparent 70%)',filter:'blur(55px)',animation:'lp-orb2 16s ease-in-out infinite',pointerEvents:'none' }} />
        <div style={{ position:'absolute',top:'60%',left:'-10%',width:'40vw',height:'40vh',background:'radial-gradient(circle,rgba(0,200,160,.05) 0%,transparent 70%)',filter:'blur(65px)',animation:'lp-orb3 24s ease-in-out infinite',pointerEvents:'none' }} />
      </div>
      <div className="lp-noise" style={{ zIndex:1 }} />

      {/* ═══════════════════════ NAV ═══════════════════════ */}
      <nav className="lp-nav" style={{ background:navScrolled?'rgba(2,6,8,.92)':'rgba(2,6,8,.55)', borderBottomColor:navScrolled?'rgba(0,255,180,.1)':'rgba(0,255,180,.05)' }}>
        <div style={{ display:'flex',alignItems:'center',gap:'.75rem' }}>
          <div style={{ position:'relative',width:38,height:38 }}>
            <div style={{ position:'absolute',top:'50%',left:'50%',width:'100%',height:'100%',borderRadius:'50%',border:'1px solid rgba(0,255,180,.4)',animation:'lp-ring-pulse 2.5s ease-out infinite' }} />
            <div style={{ width:'100%',height:'100%',borderRadius:'50%',overflow:'hidden',border:'1.5px solid rgba(0,255,180,.45)',animation:'lp-glow-pulse 3s ease infinite',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(2,6,8,.9)' }}>
              <img src="/LogoGlass.webp" alt="Koda" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
            </div>
          </div>
          <div>
            <span style={{ fontWeight:900,fontSize:'1.12rem',letterSpacing:'.06em',background:'linear-gradient(135deg,#fff 20%,#00ffb4 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',display:'block' }}>KODA</span>
            <span style={{ display:'block',fontSize:'9px',color:'rgba(0,255,180,.45)',letterSpacing:'.15em',textTransform:'uppercase',lineHeight:1,marginTop:'-1px',fontFamily:"'Space Mono',monospace" }}>ERP Enterprise</span>
          </div>
        </div>
        <div className="lp-navlinks" style={{ display:'flex',alignItems:'center',gap:'2.25rem' }}>
          {['#modulos','#caracteristicas','#cumplimiento','#planes'].map((h,i)=>(
            <a key={h} href={h} className="lp-navlink">{['Módulos','Características','Cumplimiento','Planes'][i]}</a>
          ))}
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:'.75rem' }}>
          <div style={{ display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:20,background:'rgba(0,255,180,.07)',border:'1px solid rgba(0,255,180,.18)',fontSize:11,color:'#00ffb4',fontWeight:700,letterSpacing:'.04em',fontFamily:"'Space Mono',monospace" }}>
            <div style={{ width:5,height:5,borderRadius:'50%',background:'#00ffb4',animation:'lp-ping 1.8s ease infinite' }} />
            Sistema Activo
          </div>
          <MagBtn href="/login" className="lp-cta" style={{ padding:'0.65rem 1.6rem',fontSize:'13px',borderRadius:'12px' }}>
            Acceder al Sistema
          </MagBtn>
        </div>
      </nav>

      {/* ═══════════════════════ HERO ═══════════════════════ */}
      <section style={{ minHeight:'100vh',position:'relative',display:'flex',flexDirection:'column',justifyContent:'space-between',overflow:'hidden',paddingTop:'7.5rem' }}>
        <div className="lp-hero-split" style={{ maxWidth:1380,margin:'0 auto',width:'100%',padding:'0 clamp(1.5rem,5vw,4rem)',display:'grid',gridTemplateColumns:'1.1fr 1fr',gap:'3rem',alignItems:'center',position:'relative',zIndex:10,flex:1 }}>
          <div style={{ animation:'lp-fadein 1s ease both' }}>
            <Label icon={Shield} text="Koda Enterprise Suite" />
            <h1 style={{ fontSize:'clamp(2.6rem,5.5vw,4.8rem)',fontWeight:900,lineHeight:.96,letterSpacing:'-.035em',margin:'0 0 1.5rem',color:'#fff' }}>
              El software que<br/>
              <span style={{ display:'inline-block',background:'linear-gradient(135deg,#00ffb4 0%,#38bdf8 50%,#a78bfa 100%)',backgroundSize:'250%',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',animation:'lp-shimmer 5s linear infinite' }}>
                transforma
              </span> tu empresa.
            </h1>
            <p style={{ color:'rgba(255,255,255,.42)',fontSize:'clamp(1rem,1.8vw,1.18rem)',lineHeight:1.72,maxWidth:560,margin:'0 0 2.5rem' }}>
              Koda ERP integra administración, contabilidad y facturación fiscal venezolana en una sola plataforma fluida, automatizada y de alto rendimiento.
            </p>
            <div style={{ display:'flex',gap:'.85rem',flexWrap:'wrap',marginBottom:'3.5rem' }}>
              <MagBtn href="/login" className="lp-cta">
                Acceder al Sistema <ArrowRight size={18} />
              </MagBtn>
              <MagBtn href="#modulos" className="lp-ghost">
                Explorar Módulos
              </MagBtn>
            </div>
            <div style={{ borderTop:'1px solid rgba(255,255,255,.06)',paddingTop:'1.5rem' }}>
              <p style={{ fontSize:10,fontWeight:800,letterSpacing:'.1em',textTransform:'uppercase',color:'rgba(0,255,180,.5)',marginBottom:'.75rem',fontFamily:"'Space Mono',monospace" }}>Slogan corporativo</p>
              <div style={{ fontSize:'clamp(1rem,1.8vw,1.38rem)',fontStyle:'italic',fontWeight:700,color:'rgba(255,255,255,.75)',letterSpacing:'-.01em' }}>
                "<Typed text="Imagina, programa y evoluciona." delay={900} speed={50} />"
              </div>
            </div>
          </div>
          <div className="lp-hero-right" style={{ height:560,position:'relative',animation:'lp-fadein 1.2s ease .8s both' }}>
            <ERPUniverse mouseX={mouse.x} mouseY={mouse.y} />
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{ position:'relative',zIndex:10,textAlign:'center',paddingBottom:'2rem',animation:'lp-fadein .8s ease 2.5s both' }}>
          <div style={{ display:'inline-flex',flexDirection:'column',alignItems:'center',gap:4,animation:'lp-bounce 2.5s ease infinite' }}>
            <span style={{ fontSize:9,color:'rgba(0,255,180,.3)',letterSpacing:'.18em',textTransform:'uppercase',fontWeight:700,fontFamily:"'Space Mono',monospace" }}>scroll</span>
            <ChevronDown size={16} color="rgba(0,255,180,.3)" />
          </div>
        </div>
      </section>

      {/* ═══════════════════════ LIVE METRICS STRIP ═══════════════════════ */}
      <section style={{ background:'rgba(0,255,180,.02)',borderTop:'1px solid rgba(0,255,180,.08)',borderBottom:'1px solid rgba(0,255,180,.08)',padding:'3.5rem clamp(1.5rem,5vw,4rem)' }}>
        <div className="lp-stats" style={{ maxWidth:1200,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1.5rem',alignItems:'stretch' }}>
          {[
            {label:'Módulos Integrados', target:12, suffix:'+', icon:Layers},
            {label:'Uptime Garantizado', target:99, suffix:'.9%', icon:Activity},
            {label:'Procesos Automáticos', target:48, suffix:'+', icon:Zap},
            {label:'Configuración', static:'Multi-Empresa', icon:Building2},
          ].map(({label,target,suffix,static:st,icon:I},i)=>(
            <Reveal key={label} delay={i*80} style={{ height:'100%',display:'flex',flexDirection:'column' }}>
              <div className="lp-stat-card" style={{ height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',alignItems:'stretch' }}>
                {/* HUD module numbering */}
                <div style={{ position:'absolute', bottom:10, right:14, fontSize:8, fontFamily:"'Space Mono',monospace", color:'rgba(255,255,255,0.15)', letterSpacing:'.1em' }}>
                  [0{i+1}]
                </div>
                <div>
                  <div style={{ width:40,height:40,borderRadius:8,background:'rgba(0,255,180,.05)',border:'1px solid rgba(0,255,180,.15)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1.25rem', transition:'all .3s' }}>
                    <I size={18} color="#00ffb4" />
                  </div>
                  <div style={{ height:'64px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:target!=null?'clamp(2.4rem,4.5vw,3rem)':'clamp(1.1rem,2vw,1.5rem)',fontWeight:900,letterSpacing:'-.02em',background:'linear-gradient(135deg,#00ffb4,#38bdf8)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',lineHeight:1.1,marginBottom:'.5rem', fontFamily:"'Space Grotesk',sans-serif" }}>
                    {target!=null ? <Counter target={target} suffix={suffix} /> : <span style={{ whiteSpace:'nowrap' }}>{st}</span>}
                  </div>
                </div>
                <p style={{ color:'rgba(255,255,255,.35)',fontSize:'.68rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'.12em',margin:0,fontFamily:"'Space Mono',monospace" }}>{label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════════ VENEZUELA SECTION ═══════════════════════ */}
      <section style={{ padding:'clamp(5rem,9vw,9rem) clamp(1.5rem,5vw,4rem)',position:'relative',overflow:'hidden',borderTop:'1px solid rgba(255,255,255,.04)' }}>
        <div style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'80vw',height:'60vh',background:'radial-gradient(ellipse,rgba(0,255,180,.04) 0%,transparent 70%)',pointerEvents:'none' }} />
        <div className="lp-showcase-grid" style={{ maxWidth:1220,margin:'0 auto',display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:'4rem',alignItems:'center' }}>
          <Reveal dir="left">
            <div>
              <Label icon={Globe} text="Localización y Presencia" color="#38bdf8" bg="rgba(56,189,248,.07)" border="rgba(56,189,248,.2)" />
              <h2 style={{ fontSize:'clamp(2.3rem,4vw,3.4rem)',fontWeight:900,letterSpacing:'-.03em',lineHeight:1.06,color:'#fff',marginBottom:'1.5rem' }}>
                <WordReveal text="Diseñado para Venezuela." />
                <WordReveal text="Potenciado para el mundo." delay={100} isGradient={true} />
              </h2>
              <p style={{ color:'rgba(255,255,255,.38)',fontSize:'1.05rem',lineHeight:1.75,marginBottom:'2.5rem' }}>
                El único ERP que entiende el entorno bimonetario venezolano, el cumplimiento fiscal del SENIAT, la sincronización BCV y la realidad empresarial local.
              </p>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.25rem' }}>
                {[
                  { title:"IVA & IGTF", desc:"Cálculo automático conforme a las providencias oficiales vigentes.", color:'#00ffb4' },
                  { title:"BCV Sincro", desc:"Tasas referenciales actualizadas automáticamente todos los días.", color:'#38bdf8' },
                  { title:"Libros Fiscales", desc:"Generación automática y descarga en un clic de tus Libros.", color:'#a78bfa' },
                  { title:"Multi-Moneda", desc:"Transacciones cruzadas y conversión al instante en USD y VES.", color:'#f59e0b' }
                ].map((item,idx)=>(
                  <div key={idx} style={{ background:'rgba(255,255,255,.025)',border:`1px solid ${item.color}18`,borderRadius:14,padding:'1.2rem',backdropFilter:'blur(10px)',transition:'border-color .3s',cursor:'default' }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=`${item.color}45`}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=`${item.color}18`}>
                    <div style={{ fontSize:'.88rem',fontWeight:800,color:item.color,marginBottom:4 }}>{item.title}</div>
                    <div style={{ fontSize:'.74rem',color:'rgba(255,255,255,.36)',lineHeight:1.4 }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal dir="right" delay={200}>
            <div style={{ background:'rgba(3,10,12,.8)',border:'1px solid rgba(0,255,180,.18)',borderRadius:28,padding:'2rem',backdropFilter:'blur(20px)',boxShadow:'0 40px 80px rgba(0,0,0,.55),0 0 60px rgba(0,255,180,.05)',textAlign:'center' }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',paddingBottom:'1rem',borderBottom:'1px solid rgba(255,255,255,.05)' }}>
                <span style={{ fontSize:10,fontWeight:800,color:'rgba(255,255,255,.3)',letterSpacing:'.08em',textTransform:'uppercase',fontFamily:"'Space Mono',monospace" }}>Red de Operaciones</span>
                <span style={{ padding:'3px 10px',borderRadius:20,background:'rgba(0,255,180,.1)',border:'1px solid rgba(0,255,180,.28)',fontSize:9,fontWeight:800,color:'#00ffb4',fontFamily:"'Space Mono',monospace" }}>SOPORTE NACIONAL</span>
              </div>
              <svg viewBox="0 0 320 260" style={{ width:'100%',height:'auto',maxHeight:'280px',zIndex:2 }}>
                <path d="M 170 80 Q 120 70 80 85" className="flow-line active" strokeWidth="1.5" />
                <path d="M 170 80 Q 150 110 100 160" className="flow-line active" strokeWidth="1.5" />
                <path d="M 170 80 Q 210 110 260 140" className="flow-line active" strokeWidth="1.5" />
                <polygon points="120,40 180,45 220,55 270,70 300,90 270,130 290,160 250,190 200,210 170,170 120,190 80,170 60,110 80,80 110,65" fill="rgba(0,255,180,.03)" stroke="rgba(0,255,180,.16)" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="170" cy="80" r="4" fill="#00ffb4" />
                <circle cx="170" cy="80" r="10" fill="#00ffb4" fillOpacity="0.25" style={{ animation:'lp-ping 2s ease infinite' }} />
                <text x="175" y="76" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="monospace">Caracas (HQ)</text>
                <circle cx="80" cy="85" r="3" fill="#38bdf8" />
                <circle cx="80" cy="85" r="8" fill="#38bdf8" fillOpacity="0.25" style={{ animation:'lp-ping 2.5s ease infinite' }} />
                <text x="40" y="80" fill="#38bdf8" fontSize="8" fontWeight="bold" fontFamily="monospace">Maracaibo</text>
                <circle cx="140" cy="90" r="3" fill="#00ffb4" />
                <text x="125" y="104" fill="rgba(255,255,255,0.65)" fontSize="8" fontFamily="monospace">Valencia</text>
                <circle cx="100" cy="160" r="3" fill="#a78bfa" />
                <circle cx="100" cy="160" r="8" fill="#a78bfa" fillOpacity="0.25" style={{ animation:'lp-ping 3s ease infinite' }} />
                <text x="45" y="164" fill="#a78bfa" fontSize="8" fontWeight="bold" fontFamily="monospace">San Cristóbal</text>
                <circle cx="260" cy="140" r="3" fill="#38bdf8" />
                <circle cx="260" cy="140" r="8" fill="#38bdf8" fillOpacity="0.25" style={{ animation:'lp-ping 2.2s ease infinite' }} />
                <text x="235" y="155" fill="#38bdf8" fontSize="8" fontWeight="bold" fontFamily="monospace">Pto. Ordaz</text>
              </svg>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════ MODULES BENTO ═══════════════════════ */}
      <section id="modulos" style={{ padding:'clamp(4rem,8vw,8rem) clamp(1.5rem,5vw,4rem)',borderTop:'1px solid rgba(255,255,255,.04)' }}>
        <div style={{ maxWidth:1340,margin:'0 auto' }}>
          <Reveal>
            <div style={{ textAlign:'center',marginBottom:'3.5rem' }}>
              <Label icon={Layers} text="Suite Completa" />
              <SectionH line1="Todo en un ecosistema." line2grad="Sin silos. Sin fricción." />
              <p style={{ color:'rgba(255,255,255,.34)',fontSize:'1rem',maxWidth:480,margin:'0 auto',lineHeight:1.65 }}>
                Módulos que se comunican entre sí, eliminan duplicidades y mantienen cada proceso sincronizado.
              </p>
            </div>
          </Reveal>
          <div className="lp-bento" style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1rem',gridAutoRows:'minmax(185px,auto)' }}>
            <ModCard {...mods[0]} />
            <ModCard {...mods[1]} />
            <ModCard {...mods[3]} />
            <ModCard {...mods[2]} />
            <ModCard {...mods[4]} />
            <ModCard {...mods[5]} />
            <ModCard {...mods[6]} />
            <ModCard {...mods[7]} />
          </div>
        </div>
      </section>

      {/* ═══════════════════════ AUTOMATION FLOW ═══════════════════════ */}
      <section style={{ padding:'clamp(4rem,8vw,8rem) clamp(1.5rem,5vw,4rem)',background:'rgba(0,255,180,.01)',borderTop:'1px solid rgba(255,255,255,.04)' }}>
        <div style={{ maxWidth:1220,margin:'0 auto' }}>
          <Reveal>
            <div style={{ textAlign:'center',marginBottom:'3rem' }}>
              <Label icon={Cpu} text="Motor de Reglas & Automatización" color="#00ffb4" />
              <SectionH line1="Integración sin silos." line2grad="Datos fluyendo al instante." />
              <p style={{ color:'rgba(255,255,255,.34)',fontSize:'1rem',maxWidth:600,margin:'0 auto',lineHeight:1.65 }}>
                Descubre cómo viajan tus operaciones desde el origen hasta los libros y reportes oficiales.
              </p>
            </div>
          </Reveal>
          <WorkflowBuilder />
        </div>
      </section>

      {/* ═══════════════════════ FEATURE 1 ═══════════════════════ */}
      <section id="caracteristicas" style={{ padding:'clamp(4rem,8vw,8rem) clamp(1.5rem,5vw,4rem)',borderTop:'1px solid rgba(255,255,255,.04)' }}>
        <div className="lp-feat-grid" style={{ maxWidth:1220,margin:'0 auto',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5rem',alignItems:'center' }}>
          <Reveal dir="left">
            <div>
              <Label icon={Building2} text="Gestor Empresarial" />
              <SectionH line1="El núcleo de tu" line2grad="operación corporativa." size="clamp(1.9rem,3.5vw,3.2rem)" />
              <p style={{ color:'rgba(255,255,255,.42)',lineHeight:1.8,marginBottom:'2rem',fontSize:'1rem' }}>Gestiona múltiples empresas, controla accesos por roles y obtén reportes ejecutivos en tiempo real desde un solo panel centralizado.</p>
              <CheckList items={['Panel ejecutivo consolidado con KPIs en vivo','Gestión multi-empresa y multi-sucursal','Control granular de roles y permisos','Integración BCV para tasas automáticas','Auditoría completa de actividad','Respaldo automático en nube']} />
            </div>
          </Reveal>
          <Reveal dir="right" delay={180} className="lp-feat-r">
            <div style={{ background:'rgba(3,10,12,.85)',border:'1px solid rgba(0,255,180,.16)',borderRadius:24,padding:'1.6rem',backdropFilter:'blur(20px)',boxShadow:'0 48px 96px rgba(0,0,0,.45),0 0 60px rgba(0,255,180,.06)' }}>
              <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:'1.25rem',paddingBottom:'1rem',borderBottom:'1px solid rgba(0,255,180,.08)' }}>
                {['#ff5f57','#febc2e','#28c840'].map(c=><div key={c} style={{ width:10,height:10,borderRadius:'50%',background:c }} />)}
                <span style={{ marginLeft:8,fontSize:12,fontWeight:800,color:'rgba(255,255,255,.35)',letterSpacing:'.05em',fontFamily:"'Space Mono',monospace" }}>Dashboard Ejecutivo</span>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'.75rem',marginBottom:'1rem' }}>
                {[['$1.24M','Ingresos','#00ffb4','↑12.4%'],['$284K','CxC','#38bdf8','↓3.1%'],['98.3%','Cumpl.','#a78bfa','↑2.1%']].map(([v,l,c,t])=>(
                  <div key={l} style={{ background:'rgba(255,255,255,.025)',borderRadius:12,padding:'.75rem',border:`1px solid ${c}12` }}>
                    <div style={{ fontSize:'1.05rem',fontWeight:900,color:c,marginBottom:2 }}>{v}</div>
                    <div style={{ fontSize:9,color:'rgba(255,255,255,.28)',textTransform:'uppercase',letterSpacing:'.1em',fontFamily:"'Space Mono',monospace" }}>{l}</div>
                    <div style={{ fontSize:9,color:c,fontWeight:700,marginTop:2 }}>{t}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex',alignItems:'flex-end',gap:3,height:80,background:'rgba(255,255,255,.015)',borderRadius:12,padding:'.75rem',border:'1px solid rgba(255,255,255,.04)',marginBottom:'.75rem' }}>
                {[35,62,48,80,55,90,70,85,58,95,75,88].map((h,i)=>(
                  <div key={i} style={{ flex:1,height:`${h}%`,borderRadius:'3px 3px 0 0',background:i===11?'rgba(0,255,180,.75)':i%3===1?'rgba(56,189,248,.45)':'rgba(0,200,160,.35)' }} />
                ))}
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem' }}>
                {[['Sesión Activa','#00ffb4'],['BCV Sincronizado','#38bdf8']].map(([t,c])=>(
                  <div key={t} style={{ padding:'.55rem .75rem',borderRadius:10,background:`${c}08`,border:`1px solid ${c}20`,fontSize:10,fontWeight:800,color:c,textTransform:'uppercase',letterSpacing:'.07em',textAlign:'center',fontFamily:"'Space Mono',monospace" }}>✓ {t}</div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════ FEATURE 2 ═══════════════════════ */}
      <section style={{ padding:'clamp(4rem,8vw,8rem) clamp(1.5rem,5vw,4rem)',borderTop:'1px solid rgba(255,255,255,.04)' }}>
        <div className="lp-feat-grid" style={{ maxWidth:1220,margin:'0 auto',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5rem',alignItems:'center' }}>
          <Reveal dir="left" delay={180} className="lp-feat-r">
            <div style={{ background:'rgba(3,10,12,.85)',border:'1px solid rgba(167,139,250,.18)',borderRadius:24,padding:'1.6rem',backdropFilter:'blur(20px)',boxShadow:'0 48px 96px rgba(0,0,0,.45),0 0 60px rgba(167,139,250,.05)' }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',paddingBottom:'1rem',borderBottom:'1px solid rgba(167,139,250,.1)' }}>
                <span style={{ fontWeight:900,fontSize:'.88rem',color:'#fff' }}>Factura #00-000847</span>
                <span style={{ padding:'3px 10px',borderRadius:50,background:'rgba(0,255,180,.12)',border:'1px solid rgba(0,255,180,.28)',fontSize:11,fontWeight:800,color:'#00ffb4' }}>ACTIVA</span>
              </div>
              {[['Cliente','Distribuidora ABC, C.A.'],['RIF','J-12345678-9'],['Subtotal','$1,240.00'],['IVA 16%','$198.40'],['IGTF 3%','$43.14'],['Total USD','$1,481.54']].map(([k,v])=>(
                <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'.4rem 0',borderBottom:'1px solid rgba(255,255,255,.04)',fontSize:'.82rem' }}>
                  <span style={{ color:'rgba(255,255,255,.35)' }}>{k}</span>
                  <span style={{ color:k.includes('Total')?'#00ffb4':'rgba(255,255,255,.75)',fontWeight:k.includes('Total')?900:500 }}>{v}</span>
                </div>
              ))}
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem',marginTop:'1rem' }}>
                {[['Libro de Ventas ✓','#a78bfa'],['SENIAT ✓','#00ffb4']].map(([t,c])=>(
                  <div key={t} style={{ padding:'.55rem',borderRadius:10,background:`${c}08`,border:`1px solid ${c}20`,textAlign:'center',fontSize:10,color:c,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em',fontFamily:"'Space Mono',monospace" }}>{t}</div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal dir="right">
            <div>
              <Label icon={FileText} text="Facturación Fiscal" color="#a78bfa" bg="rgba(167,139,250,.07)" border="rgba(167,139,250,.2)" />
              <SectionH line1="Cumplimiento fiscal" line2grad="total con Venezuela." size="clamp(1.9rem,3.5vw,3.2rem)" />
              <p style={{ color:'rgba(255,255,255,.42)',lineHeight:1.8,marginBottom:'2rem' }}>Emisión conforme a la Providencia 00071. IVA, IGTF, ISLR y retenciones calculadas automáticamente. Libro de Ventas generado al instante.</p>
              <CheckList accent="#a78bfa" items={['Facturación bimonetaria USD + Bolívares','IVA 16% e IGTF 3% automáticos','Punto de Venta (POS) integrado','Libro de Ventas SENIAT automático','Notas de Crédito y Débito conformes','PDF y XML fiscal']} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════ FEATURE 3 ═══════════════════════ */}
      <section style={{ padding:'clamp(4rem,8vw,8rem) clamp(1.5rem,5vw,4rem)',borderTop:'1px solid rgba(255,255,255,.04)' }}>
        <div className="lp-feat-grid" style={{ maxWidth:1220,margin:'0 auto',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5rem',alignItems:'center' }}>
          <Reveal dir="left">
            <div>
              <Label icon={BookOpen} text="Suite Financiera" color="#38bdf8" bg="rgba(56,189,248,.07)" border="rgba(56,189,248,.2)" />
              <SectionH line1="Control financiero" line2grad="total en tiempo real." size="clamp(1.9rem,3.5vw,3.2rem)" />
              <p style={{ color:'rgba(255,255,255,.42)',lineHeight:1.8,marginBottom:'2rem' }}>Desde el asiento contable hasta el balance general. Tesorería integrada con conciliación bancaria automática y proyección de flujo de caja.</p>
              <CheckList accent="#38bdf8" items={['Balance General y Estado de Resultados','Conciliación bancaria con extractos','Flujo de caja proyectado y real','Ajuste cambiario e inflacionario','Centros de costo y consolidación','Declaración IVA e ISLR directa']} />
            </div>
          </Reveal>
          <Reveal dir="right" delay={180} className="lp-feat-r">
            <div style={{ background:'rgba(3,10,12,.85)',border:'1px solid rgba(56,189,248,.14)',borderRadius:24,padding:'1.6rem',backdropFilter:'blur(20px)',boxShadow:'0 48px 96px rgba(0,0,0,.45)' }}>
              <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:'1.25rem',paddingBottom:'1rem',borderBottom:'1px solid rgba(56,189,248,.08)' }}>
                {['#ff5f57','#febc2e','#28c840'].map(c=><div key={c} style={{ width:10,height:10,borderRadius:'50%',background:c }} />)}
                <span style={{ marginLeft:8,fontSize:12,fontWeight:800,color:'rgba(255,255,255,.35)',letterSpacing:'.05em',fontFamily:"'Space Mono',monospace" }}>Balance General</span>
              </div>
              {[['Activos Circulantes','$2,840,500','#00ffb4','↑12.4%'],['Pasivos a CP','$580,200','#f59e0b','↓3.1%'],['Patrimonio Neto','$2,260,300','#38bdf8','↑8.7%']].map(([k,v,c,t])=>(
                <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'.7rem .9rem',marginBottom:'.5rem',background:'rgba(255,255,255,.022)',borderRadius:12,border:'1px solid rgba(255,255,255,.04)' }}>
                  <span style={{ color:'rgba(255,255,255,.5)',fontSize:'.82rem',fontWeight:600 }}>{k}</span>
                  <div style={{ display:'flex',alignItems:'center',gap:'.75rem' }}>
                    <span style={{ fontSize:'.9rem',fontWeight:900,color:c }}>{v}</span>
                    <span style={{ fontSize:10,fontWeight:800,color:c,background:`${c}12`,padding:'2px 8px',borderRadius:20 }}>{t}</span>
                  </div>
                </div>
              ))}
              <div style={{ marginTop:'1rem',display:'flex',alignItems:'center',gap:'.5rem',padding:'.75rem',background:'rgba(56,189,248,.04)',borderRadius:12,border:'1px solid rgba(56,189,248,.12)' }}>
                <TrendingUp size={14} color="#38bdf8" />
                <span style={{ color:'rgba(56,189,248,.75)',fontSize:'.8rem',fontWeight:700 }}>Utilidad neta: $340,800 — Margen 12.0%</span>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'.4rem',marginTop:'.75rem' }}>
                {['Diario ✓','Mayor ✓','SENIAT ✓'].map(t=>(
                  <div key={t} style={{ padding:'.45rem',textAlign:'center',fontSize:10,fontWeight:800,color:'rgba(56,189,248,.7)',background:'rgba(56,189,248,.05)',border:'1px solid rgba(56,189,248,.12)',borderRadius:9,letterSpacing:'.06em',fontFamily:"'Space Mono',monospace" }}>{t}</div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════ PLANES Y PRECIOS ═══════════════════════ */}
      {publicPlans.length > 0 && (
        <section id="planes" style={{ padding:'clamp(5rem,10vw,10rem) clamp(1.5rem,5vw,4rem)',borderTop:'1px solid rgba(255,255,255,.04)',position:'relative',overflow:'hidden' }}>
          <div style={{ position:'absolute',top:'30%',left:'50%',transform:'translateX(-50%)',width:'70vw',height:'50vh',background:'radial-gradient(ellipse,rgba(0,255,180,.06) 0%,transparent 70%)',filter:'blur(80px)',pointerEvents:'none' }} />
          <div style={{ maxWidth:1280,margin:'0 auto',position:'relative',zIndex:2 }}>
            <Reveal>
              <div style={{ textAlign:'center',marginBottom:'4.5rem' }}>
                <Label icon={Landmark} text="Planes y Precios" color="#00ffb4" bg="rgba(0,255,180,.07)" border="rgba(0,255,180,.2)" />
                <h2 style={{ fontSize:'clamp(2.2rem,4.5vw,3.8rem)',fontWeight:900,letterSpacing:'-.03em',margin:'0 0 1rem' }}>
                  <WordReveal text="Elige el plan" />
                  <WordReveal text="que potencia tu empresa." delay={100} isGradient={true} />
                </h2>
                <p style={{ color:'rgba(255,255,255,.4)',fontSize:'1.05rem',maxWidth:560,margin:'0 auto',lineHeight:1.7 }}>
                  Sin contratos permanentes. Sin letra pequeña. Crece con KODA a tu propio ritmo.
                </p>
              </div>
            </Reveal>
            <div style={{ display:'grid',gridTemplateColumns:`repeat(${Math.min(publicPlans.length,3)},1fr)`,gap:'1.75rem',alignItems:'start' }}>
              {publicPlans.map((plan,i) => (
                <PlanCard key={plan.id} plan={plan} i={i} total={publicPlans.length} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════ COMPLIANCE MARQUEE (UNIQUE) ═══════════════════════ */}
      <div id="cumplimiento">
        <ComplianceMarquee />
      </div>

      {/* ═══════════════════════ CINEMATIC CTA ═══════════════════════ */}
      <CinematicCTA mouse={mouse} />

      {/* ═══════════════════════ FOOTER ═══════════════════════ */}
      <footer style={{ borderTop:'1px solid rgba(255,255,255,.05)',padding:'2rem clamp(1.5rem,4rem,4rem)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'1rem',background:'rgba(0,0,0,.55)' }}>
        <div style={{ display:'flex',alignItems:'center',gap:'.75rem' }}>
          <div style={{ width:30,height:30,borderRadius:'50%',overflow:'hidden',border:'1px solid rgba(0,255,180,.28)',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(2,6,8,.9)' }}>
            <img src="/LogoGlass.webp" alt="Koda" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
          </div>
          <div>
            <span style={{ fontWeight:900,fontSize:'.9rem',color:'rgba(255,255,255,.72)',letterSpacing:'.06em' }}>KODA</span>
            <span style={{ display:'block',fontSize:'9px',color:'rgba(0,255,180,.4)',letterSpacing:'.12em',textTransform:'uppercase',fontFamily:"'Space Mono',monospace" }}>IMAGINA · PROGRAMA · EVOLUCIONA</span>
          </div>
        </div>
        <p style={{ color:'rgba(255,255,255,.16)',fontSize:11,letterSpacing:'.05em',margin:0,fontFamily:"'Space Mono',monospace" }}>
          © {new Date().getFullYear()} Koda ERP. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
}
