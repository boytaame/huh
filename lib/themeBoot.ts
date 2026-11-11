/**
 * Runs in `<head>` before the first paint, so a dark page never flashes white.
 * Kept dependency-free, outside any `"use client"` module (a server layout imports
 * it), and wrapped in try/catch for blocked storage.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("huh.theme");if(p!=="light"&&p!=="dark")p="system";var d=p==="dark"||(p==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
