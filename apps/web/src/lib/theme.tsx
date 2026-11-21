import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "crm.theme";

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* storage unavailable: fall through to system preference */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const userChose = useRef(false);

  useEffect(() => {
    // Persist only an explicit toggle; until then keep following the OS preference.
    if (!userChose.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
  }, [theme]);

  function toggle() {
    userChose.current = true;
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

/** Applies the stored theme to <html> only when `enabled`. App enables it for the
 *  authenticated /app routes only, so public pages (login, unsubscribe, public inquiry)
 *  always render in the light theme they were designed for. */
export function useApplyTheme(enabled: boolean) {
  const { theme } = useTheme();
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", enabled && theme === "dark");
  }, [enabled, theme]);
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
