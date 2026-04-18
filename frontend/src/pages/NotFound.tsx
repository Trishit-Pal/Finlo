import React, { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';

export const NotFound: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0d12' }}>
      <div className="text-center animate-slide-up">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{
            background: 'rgba(244,63,94,0.1)',
            border: '1px solid rgba(244,63,94,0.2)',
          }}
        >
          <AlertTriangle size={28} style={{ color: '#fb7185' }} />
        </div>
        <h1 className="text-6xl font-extrabold mb-2" style={{
          background: 'linear-gradient(135deg, #818cf8, #c4b5fd)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          404
        </h1>
        <p className="text-lg text-foreground font-medium mb-2">Page not found</p>
        <p className="text-sm text-muted mb-8 max-w-sm mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/" className="btn-primary inline-flex items-center gap-2">
          <Home size={16} /> Return to Home
        </Link>
      </div>
    </div>
  );
};
