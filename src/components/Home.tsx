import React, { useState } from 'react';
import { Search, Loader2, ArrowRight } from 'lucide-react';
import { parseSubstackInput } from '../lib/utils';
import { motion } from 'motion/react';

interface HomeProps {
  onNavigate: (domain: string, slug: string | null) => void;
}

export function Home({ onNavigate }: HomeProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const parsed = parseSubstackInput(input);
    if (!parsed) {
      setError('Please enter a valid Substack URL or handle.');
      return;
    }
    
    onNavigate(parsed.domain, parsed.slug);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-paper">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-xl mx-auto text-center"
      >
        <div className="mb-12">
          <h1 className="text-6xl md:text-7xl font-serif font-bold text-ink tracking-tight mb-4">
            Reader
          </h1>
          <p className="text-lg md:text-xl text-ink-light font-sans max-w-md mx-auto">
            A minimalist, distraction-free interface for reading your favorite newsletters.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-ink-light">
            <Search size={20} />
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="pragmaticengineer, readtangle.substack.com, or URL..."
            className="w-full pl-12 pr-12 py-4 bg-white/50 backdrop-blur-md border border-ink/20 focus:border-ink focus:bg-white rounded-lg shadow-sm font-sans text-lg text-ink placeholder:text-ink/40 outline-none transition-all duration-300"
          />
          <button 
            type="submit" 
            className="absolute inset-y-0 right-2 flex items-center justify-center px-2 text-ink-light hover:text-accent transition-colors"
          >
            <ArrowRight size={24} />
          </button>
        </form>
        
        {error && (
          <motion.p 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="text-red-500 mt-4 text-sm font-medium"
          >
            {error}
          </motion.p>
        )}

        <div className="mt-12 text-sm text-ink-light flex items-center justify-center gap-4 flex-wrap">
          <span className="font-medium text-ink/40 uppercase tracking-widest text-xs">Try reading:</span>
          <button onClick={() => setInput('readtangle.substack.com')} className="hover:text-accent transition">Tangle</button>
          <span className="text-ink/20">•</span>
          <button onClick={() => setInput('platformer.news')} className="hover:text-accent transition">Platformer</button>
          <span className="text-ink/20">•</span>
          <button onClick={() => setInput('pragmaticengineer.substack.com')} className="hover:text-accent transition">Pragmatic Engineer</button>
        </div>
      </motion.div>
    </div>
  );
}
