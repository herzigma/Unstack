import React, { useEffect, useState } from 'react';
import { SubstackPostItem } from '../types';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, Globe } from 'lucide-react';
import { formatDocumentTitle } from '../lib/title';
import { motion } from 'motion/react';

interface FeedProps {
  domain: string;
  onNavigate: (domain: string, slug: string | null) => void;
  onPostClick: (slug: string) => void;
}

export function Feed({ domain, onNavigate, onPostClick }: FeedProps) {
  const [posts, setPosts] = useState<SubstackPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = formatDocumentTitle(domain);
  }, [domain]);

  useEffect(() => {
    async function fetchFeed() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/feed?domain=${encodeURIComponent(domain)}`);
        if (!res.ok) {
          throw new Error('Failed to load newsletter feed.');
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
          throw new Error('Invalid feed format received.');
        }
        setPosts(data);
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching the feed.');
      } finally {
        setLoading(false);
      }
    }
    fetchFeed();
  }, [domain]);

  return (
    <div className="min-h-screen bg-paper pb-20">
      <header className="sticky top-0 z-10 bg-paper/80 backdrop-blur-md border-b border-ink/10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button 
            onClick={() => onNavigate('', null)}
            className="flex items-center gap-2 text-ink-light hover:text-ink transition-colors font-medium text-sm"
          >
            <ArrowLeft size={16} />
            <span>Search</span>
          </button>
          <div className="flex items-center gap-2 text-ink">
             <Globe size={16} className="text-ink/40" />
             <span className="font-mono text-sm">{domain}</span>
          </div>
          <div className="w-[72px]" /> {/* Spacer for balance */}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 mt-12">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-ink mb-4">
            Recent Publications
          </h1>
          <p className="text-lg text-ink-light">
            Viewing the latest posts from <span className="font-medium text-ink">{domain}</span>
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-ink/30" size={32} />
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            <p className="font-medium">Error loading feed</p>
            <p className="text-sm mt-1 mb-4 opacity-90">{error}</p>
            <button 
              onClick={() => onNavigate('', null)}
              className="text-sm border border-red-300 px-4 py-2 rounded bg-white hover:bg-red-50 transition-colors bg-opacity-70"
            >
              Try another feed
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="py-20 text-center text-ink-light">
            <p>No recent posts found for this newsletter.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {posts.map((post, i) => (
              <motion.article 
                key={post.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="group cursor-pointer border-b border-ink/5 pb-12 last:border-0"
                onClick={() => onPostClick(post.slug)}
              >
                <div className="flex flex-col md:flex-row gap-6">
                  {post.cover_image && (
                    <div className="w-full md:w-1/3 aspect-video md:aspect-[4/3] flex-shrink-0 overflow-hidden rounded-md bg-ink/5">
                      <img 
                        src={post.cover_image} 
                        alt={post.title} 
                        className="w-full h-full object-cover grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  )}
                  
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-center gap-3 text-xs font-mono text-ink-light mb-3">
                      <time dateTime={post.post_date}>
                        {format(new Date(post.post_date), "MMM d, yyyy")}
                      </time>
                      {post.audience === 'only_paid' && (
                        <span className="px-2 py-0.5 bg-accent/10 outline outline-1 outline-accent/20 text-accent rounded-sm uppercase text-[10px] tracking-wider">
                          Paid
                        </span>
                      )}
                    </div>
                    
                    <h2 className="text-2xl font-serif font-bold text-ink mb-2 group-hover:text-accent transition-colors">
                      {post.title}
                    </h2>
                    
                    {post.subtitle && (
                      <p className="text-ink-light line-clamp-2 md:line-clamp-3 mb-4 leading-relaxed">
                        {post.subtitle}
                      </p>
                    )}
                    
                    <div className="mt-auto flex items-center gap-2">
                       {post.publishedBylines?.map(author => (
                         <span key={author.id} className="text-xs font-medium text-ink uppercase tracking-wide">
                            {author.name}
                         </span>
                       ))}
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
