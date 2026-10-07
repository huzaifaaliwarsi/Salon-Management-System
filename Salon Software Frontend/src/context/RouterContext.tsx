import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface RouterContextType {
  currentRoute: string;
  navigate: (path: string) => void;
  pathname: string;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

// Helper to extract path from hash or pathname
function getInitialRoute(): string {
  if (typeof window === 'undefined') return '/';
  if (window.location.hash) {
    const raw = window.location.hash.replace(/^#/, '');
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
  const path = window.location.pathname;
  return path === '' ? '/' : path;
}

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRoute, setCurrentRoute] = useState<string>(getInitialRoute);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentRoute(getInitialRoute());
    };

    const handlePopState = () => {
      setCurrentRoute(getInitialRoute());
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate = useCallback((path: string) => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    window.location.hash = cleanPath;
    setCurrentRoute(cleanPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const pathname = currentRoute.split('?')[0].split('#')[0];

  return (
    <RouterContext.Provider value={{ currentRoute, navigate, pathname }}>
      {children}
    </RouterContext.Provider>
  );
};

export function useRouter(): RouterContextType {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
}
