import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import { Home } from './components/Home';
import { Feed } from './components/Feed';
import { Post } from './components/Post';
import { parseSubstackInput } from './lib/utils';

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
    <div className="min-h-screen bg-paper font-sans text-ink selection:bg-accent/20">
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<RouteResolver />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

