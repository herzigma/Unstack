import React from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Home } from './components/Home';
import { Feed } from './components/Feed';
import { Post } from './components/Post';
import { parseSubstackInput } from './lib/utils';
import { getQueryStrippedPath, getSharedSubstackInput } from './lib/url';
import { FileText, Github } from 'lucide-react';

function QueryStringCleaner({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const cleanPath = getQueryStrippedPath(location);

  React.useEffect(() => {
    if (cleanPath) {
      navigate(cleanPath, { replace: true });
    }
  }, [cleanPath, navigate]);

  if (cleanPath) {
    return null;
  }

  return <>{children}</>;
}

function ShareTarget() {
  const location = useLocation();
  const navigate = useNavigate();
  const sharedInput = getSharedSubstackInput(location.search);
  const parsed = sharedInput ? parseSubstackInput(sharedInput) : null;

  React.useEffect(() => {
    if (!parsed) {
      return;
    }

    const target = parsed.slug ? `/${parsed.domain}/p/${parsed.slug}` : `/${parsed.domain}`;
    navigate(target, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [navigate, parsed]);

  if (parsed) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center">
        <span className="text-ink-light font-mono text-sm uppercase tracking-widest">Opening Shared Link</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
        <FileText size={24} />
      </div>
      <h2 className="text-2xl font-serif text-ink mb-2">Shared Link Not Recognized</h2>
      <p className="text-ink-light max-w-md mb-8">Unstack can open shared Substack publication and post links.</p>
      <button
        onClick={() => navigate('/', { replace: true })}
        className="border border-ink/20 px-6 py-3 rounded hover:bg-ink hover:text-white transition-all text-sm font-medium uppercase tracking-widest"
      >
        Search Instead
      </button>
    </div>
  );
}

function RouteResolver() {
  const { "*": path } = useParams();
  const navigate = useNavigate();

  const handleNavigate = (domain: string, slug: string | null) => {
    if (!domain) {
      navigate('/');
    } else if (slug) {
      navigate(`/${domain}/p/${slug}`);
    } else {
      navigate(`/${domain}`);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePostClick = (domain: string, slug: string) => {
    navigate(`/${domain}/p/${slug}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToFeed = (domain: string) => {
    navigate(`/${domain}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!path) {
    return <Home onNavigate={handleNavigate} />;
  }

  if (path === 'share-target') {
    return <ShareTarget />;
  }

  const parsed = parseSubstackInput(path);

  if (!parsed || !parsed.domain) {
    return <Home onNavigate={handleNavigate} />;
  }

  if (parsed.slug) {
    return (
      <Post 
        domain={parsed.domain} 
        slug={parsed.slug} 
        onBack={() => handleBackToFeed(parsed.domain)} 
      />
    );
  }

  return (
    <Feed 
      domain={parsed.domain} 
      onNavigate={handleNavigate} 
      onPostClick={(slug) => handlePostClick(parsed.domain, slug)} 
    />
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-paper font-sans text-ink selection:bg-accent/20 flex flex-col">
      <div className="flex-grow">
        <BrowserRouter>
          <QueryStringCleaner>
            <Routes>
              <Route path="/*" element={<RouteResolver />} />
            </Routes>
          </QueryStringCleaner>
        </BrowserRouter>
      </div>
      <footer className="py-8 text-center text-ink-light text-sm bg-paper">
        <div className="flex items-center justify-center gap-2">
          <span>Unstack is open source.</span>
          <a
            href="https://github.com/herzigma/Unstack"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-ink transition-colors font-medium decoration-ink/20 hover:decoration-ink underline underline-offset-4"
          >
            <Github size={14} />
            View on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

