import { ThemeMode } from '../types';

export interface ThemeConfig {
  id: ThemeMode;
  name: string;
  tagline: string;
  badge: string;
  bgRoot: string;
  bgSidebar: string;
  bgSurface: string;
  bgSurfaceHighlight: string;
  borderSubtle: string;
  borderActive: string;
  primaryGradient: string;
  primarySolid: string;
  textAccent: string;
  glowEffect: string;
  previewColors: string[];
}

export const THEMES: Record<ThemeMode, ThemeConfig> = {
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian Stealth',
    tagline: 'Deep OLED true-black with electric cyan encryption telemetry',
    badge: 'OLED Zero',
    bgRoot: '#050608',
    bgSidebar: '#090a10',
    bgSurface: '#0e111a',
    bgSurfaceHighlight: '#161b2a',
    borderSubtle: '#181e2e',
    borderActive: '#2a3550',
    primaryGradient: 'from-cyan-500 via-indigo-500 to-blue-600',
    primarySolid: '#4f46e5',
    textAccent: 'text-cyan-400',
    glowEffect: 'shadow-[0_0_15px_rgba(6,182,212,0.25)]',
    previewColors: ['#050608', '#06b6d4', '#6366f1'],
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    tagline: 'Electric violet & neon fuchsia with high-contrast night aesthetics',
    badge: 'Neon Glow',
    bgRoot: '#080511',
    bgSidebar: '#0f0a1f',
    bgSurface: '#16102c',
    bgSurfaceHighlight: '#221942',
    borderSubtle: '#2a1f4f',
    borderActive: '#4c2e8a',
    primaryGradient: 'from-fuchsia-500 via-pink-500 to-purple-600',
    primarySolid: '#a855f7',
    textAccent: 'text-fuchsia-400',
    glowEffect: 'shadow-[0_0_15px_rgba(236,72,153,0.3)]',
    previewColors: ['#080511', '#ec4899', '#a855f7'],
  },
  nordic: {
    id: 'nordic',
    name: 'Nordic Glacier',
    tagline: 'Arctic blue frosted glass with deep polar midnight contrast',
    badge: 'Arctic Frost',
    bgRoot: '#060a12',
    bgSidebar: '#0b121e',
    bgSurface: '#101a2c',
    bgSurfaceHighlight: '#182740',
    borderSubtle: '#1b2d49',
    borderActive: '#26426a',
    primaryGradient: 'from-sky-400 via-cyan-500 to-teal-600',
    primarySolid: '#0284c7',
    textAccent: 'text-sky-300',
    glowEffect: 'shadow-[0_0_15px_rgba(56,189,248,0.25)]',
    previewColors: ['#060a12', '#38bdf8', '#0284c7'],
  },
  matrix: {
    id: 'matrix',
    name: 'Zero-Knowledge Matrix',
    tagline: 'Phosphor emerald terminal with cryptographic math precision',
    badge: 'Terminal ZK',
    bgRoot: '#040906',
    bgSidebar: '#08130d',
    bgSurface: '#0d1d14',
    bgSurfaceHighlight: '#142c1e',
    borderSubtle: '#173624',
    borderActive: '#225035',
    primaryGradient: 'from-emerald-400 via-teal-500 to-green-600',
    primarySolid: '#059669',
    textAccent: 'text-emerald-400',
    glowEffect: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]',
    previewColors: ['#040906', '#10b981', '#059669'],
  },
  solar: {
    id: 'solar',
    name: 'Solar Eclipse',
    tagline: 'Radiant gold & amber flare on deep brushed titanium canvas',
    badge: 'Solar Flare',
    bgRoot: '#090807',
    bgSidebar: '#12100d',
    bgSurface: '#1a1713',
    bgSurfaceHighlight: '#26221c',
    borderSubtle: '#2e2922',
    borderActive: '#473f34',
    primaryGradient: 'from-amber-400 via-orange-500 to-rose-600',
    primarySolid: '#d97706',
    textAccent: 'text-amber-400',
    glowEffect: 'shadow-[0_0_15px_rgba(245,158,11,0.25)]',
    previewColors: ['#090807', '#f59e0b', '#d97706'],
  },
};
