import { useState, useEffect } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    // Read persisted preference, defaulting to dark
    const saved = localStorage.getItem('theme');
    const prefersDark = saved ? saved === 'dark' : true;
    setDark(prefersDark);
    document.documentElement.classList.toggle('dark', prefersDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        width: 38, height: 38,
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--bg-surface-2)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
        transition: 'background 0.2s, border-color 0.2s, transform 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}
