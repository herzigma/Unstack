import React, { useEffect, useState } from 'react';
import { SubstackPostDetail } from '../types';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, Share, FileText, Lock, PlayCircle } from 'lucide-react';
import { motion } from 'motion/react';
import parse, { HTMLReactParserOptions, Element } from 'html-react-parser';
import DOMPurify from 'dompurify';

interface PostProps {
  domain: string;
  slug: string;
  onBack: () => void;
}

export function Post({ domain, slug, onBack }: PostProps) {
  const [post, setPost] = useState<SubstackPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Progress bar
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    async function fetchPost() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/post?domain=${encodeURIComponent(domain)}&slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          throw new Error('Failed to load post.');
        }
        const data = await res.json();
        setPost(data);
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching the post.');
      } finally {
        setLoading(false);
      }
    }
    fetchPost();
  }, [domain, slug]);

  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollTop;
      const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scroll = `${(totalScroll / windowHeight) * 100}`;
      setScrollProgress(Number(scroll));
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const getCleanHtml = (html: string) => {
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ['iframe', 'video', 'audio'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'data-attrs', 'data-component-name', 'data-url']
    });
  };

  const handleShare = () => {
    if (post && navigator.share) {
      navigator.share({
        title: post.title,
        text: post.subtitle,
        url: post.canonical_url,
      }).catch(() => {});
    } else if (post) {
      navigator.clipboard.writeText(post.canonical_url);
    }
  };

  const parseOptions: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element && domNode.attribs) {
        const className = domNode.attribs.class || '';
        const name = domNode.name;
        
        const isEmbed = 
          name === 'iframe' || 
          name === 'video' || 
          name === 'audio' ||
          className.includes('native-video-embed') ||
          className.includes('youtube') ||
          className.includes('twitter-embed') ||
          className.includes('custom-embed');

        if (isEmbed) {
          return (
            <div className="my-8 max-w-full rounded bg-ink/5 border border-ink/10 p-8 flex flex-col items-center justify-center text-center">
                <PlayCircle className="text-ink/30 mb-4" size={32} />
                <p className="text-ink-light font-medium mb-2">Embedded Content</p>
                <a href={post?.canonical_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-accent hover:text-ink transition-colors underline underline-offset-4">
                  View original article to see this content
                </a>
            </div>
          );
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-ink/30 mb-4" size={32} />
        <span className="text-ink-light font-mono text-sm uppercase tracking-widest">Loading Post</span>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
          <FileText size={24} />
        </div>
        <h2 className="text-2xl font-serif text-ink mb-2">Article Not Found</h2>
        <p className="text-ink-light max-w-md mb-8">{error || "The requested article could not be loaded."}</p>
        <button 
          onClick={onBack}
          className="flex items-center gap-2 border border-ink/20 px-6 py-3 rounded hover:bg-ink hover:text-white transition-all text-sm font-medium uppercase tracking-widest"
        >
          <ArrowLeft size={16} /> Return to Feed
        </button>
      </div>
    );
  }

  // Determine if this is a truncated view of a paid post
  const isPaywalledPreview = post.audience === 'only_paid' && post.body_html && post.body_html.length > 0;

  return (
    <div className="min-h-screen bg-paper pb-32">
      <div 
        className="fixed top-0 left-0 h-1 bg-accent z-50 transition-all duration-150 ease-out" 
        style={{ width: `${scrollProgress}%` }}
      />
      
      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md border-b border-ink/10">
        <div className="max-w-screen-xl mx-auto px-6 h-16 flex items-center justify-between">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-ink-light hover:text-ink transition-colors font-medium text-sm"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="text-xs font-mono text-ink/40 tracking-widest uppercase truncate max-w-[50%]">
            {domain}
          </div>
          <button
            onClick={handleShare}
            className="w-10 h-10 rounded-full flex items-center justify-center text-ink-light hover:bg-ink/5 transition-colors"
            title="Share or Copy Link"
          >
            <Share size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 pt-16 md:pt-24">
        <motion.header 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-14 text-center"
        >
          <div className="flex items-center justify-center gap-4 text-xs font-mono text-ink-light mb-6 uppercase tracking-wider">
             <time dateTime={post.post_date}>
               {format(new Date(post.post_date), "MMMM d, yyyy")}
             </time>
             {post.audience === 'only_paid' && (
               <span className="flex items-center gap-1 px-2 py-0.5 bg-accent/10 outline outline-1 outline-accent/20 text-accent rounded-sm">
                 <Lock size={12} /> Paid Post
               </span>
             )}
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-ink leading-[1.1] mb-6">
            {post.title}
          </h1>
          
          {post.subtitle && (
            <p className="text-xl md:text-2xl font-serif italic text-ink-light leading-relaxed mb-8">
              {post.subtitle}
            </p>
          )}

          <div className="flex items-center justify-center gap-3">
             {post.publishedBylines?.map(author => (
               <div key={author.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-ink/10 shadow-sm">
                 {author.photo_url && (
                    <img src={author.photo_url} alt={author.name} className="w-6 h-6 rounded-full" />
                 )}
                 <span className="text-sm font-medium text-ink">{author.name}</span>
               </div>
             ))}
          </div>
        </motion.header>

        {post.cover_image && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="w-full mb-16 rounded-lg overflow-hidden bg-white shadow-sm border border-ink/5"
          >
            <img 
              src={post.cover_image} 
              alt="Cover Image" 
              className="w-full h-auto object-cover" 
            />
          </motion.div>
        )}

        <motion.article 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="reader-content"
        >
          {post.body_html ? (
             <div className="prose prose-lg max-w-none pb-10">
                 {parse(getCleanHtml(post.body_html), parseOptions)}
                 
                 {isPaywalledPreview && (
                   <div className="mt-12 py-10 px-8 text-center bg-white border border-dashed border-ink/20 rounded-lg shadow-sm">
                      <Lock className="mx-auto text-ink/20 mb-4" size={32} />
                      <h3 className="text-xl font-serif font-bold text-ink mb-2">Premium Content</h3>
                      <p className="text-ink-light leading-relaxed mb-6">
                        This appears to be a paid post. The content shown above is the full preview available. To read the rest of this essay, view the original article on Substack.
                      </p>
                      <div>
                        <a 
                           href={post.canonical_url} 
                           target="_blank" 
                           rel="noopener noreferrer" 
                           className="inline-flex items-center gap-2 bg-ink text-white px-6 py-3 rounded hover:bg-accent transition-colors text-sm font-bold uppercase tracking-widest"
                        >
                          Read Full Article
                        </a>
                      </div>
                   </div>
                 )}
             </div>
          ) : (
            <div className="py-12 text-center bg-white border border-dashed border-ink/20 rounded-lg">
                <Lock className="mx-auto text-ink/20 mb-4" size={32} />
                <p className="text-ink-light font-medium mb-6">This content is entirely paywalled or unavailable.</p>
                <div className="flex justify-center">
                  <a 
                     href={post.canonical_url} 
                     target="_blank" 
                     rel="noopener noreferrer" 
                     className="inline-flex items-center gap-2 bg-ink text-white px-6 py-3 rounded hover:bg-accent transition-colors text-sm font-bold uppercase tracking-widest"
                  >
                    Read original on Substack
                  </a>
                </div>
            </div>
          )}
        </motion.article>
        
        <div className="mt-10 pt-10 border-t border-ink/10 flex justify-center text-center">
            <div>
               <p className="text-3xl font-serif font-bold text-ink mb-3">Fin.</p>
               <a href={post.canonical_url} target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-ink-light hover:text-accent transition-colors flex items-center gap-1 justify-center">
                  View original article &#8599;
               </a>
            </div>
        </div>
      </main>
    </div>
  );
}

