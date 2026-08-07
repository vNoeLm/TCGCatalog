import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getCatalogVisibility } from '../lib/api';

interface NavigationProps {
  currentPath: string;
}

export function Navigation({ currentPath }: NavigationProps) {
  const [showCatalog, setShowCatalog] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getCatalogVisibility(),
      supabase.auth.getSession(),
    ]).then(([isPublic, { data }]) => {
      const isAdmin = !!data.session;
      setShowCatalog(isPublic || isAdmin);
      setLoading(false);
    });
  }, []);

  const isActive = (path: string) => {
    if (path === '/' && currentPath === '/') return true;
    if (path !== '/' && currentPath.startsWith(path)) return true;
    return false;
  };

  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const active = isActive(href);
    return (
      <a
        href={href}
        style={{
          fontSize: 13,
          fontWeight: 600,
          padding: '6px 14px',
          borderRadius: 8,
          textDecoration: 'none',
          transition: 'all 0.15s',
          background: active ? 'var(--accent-muted)' : 'transparent',
          color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
          border: active ? '1px solid var(--accent-border)' : '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = 'var(--bg-surface-2)';
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.borderColor = 'transparent';
          }
        }}
      >
        {label}
      </a>
    );
  };

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <NavLink href="/" label="Catalog" />

      {loading ? (
        <div style={{ width: 90, height: 32, borderRadius: 8, background: 'var(--bg-surface-2)', opacity: 0.5 }} />
      ) : showCatalog ? (
        <NavLink href="/marketplace" label="Marketplace" />
      ) : null}

      <NavLink href="/admin" label="Admin" />
    </nav>
  );
}
