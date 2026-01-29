/**
 * RoofFeed - Main feed component for "The Roof" team communication feature
 * Shows posts from team members with infinite scroll
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Home,
  Plus,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { roofService, RoofPost } from '../services/roofService';
import PostCard from './PostCard';
import PostComposer from './PostComposer';
import CommentSection from './CommentSection';

interface RoofFeedProps {
  onClose?: () => void;
}

const RoofFeed: React.FC<RoofFeedProps> = ({ onClose }) => {
  const [posts, setPosts] = useState<RoofPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [showComposer, setShowComposer] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pinned' | 'shared' | 'announcements'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'likes' | 'comments'>('newest');
  const feedRef = useRef<HTMLDivElement>(null);

  const LIMIT = 20;

  // Fetch posts
  const fetchPosts = useCallback(async (isRefresh = false, loadMore = false) => {
    if (loadMore) {
      setLoadingMore(true);
    } else if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const currentOffset = loadMore ? offset : 0;
      const response = await roofService.getPosts(LIMIT, currentOffset);

      if (loadMore) {
        setPosts(prev => [...prev, ...response.posts]);
      } else {
        setPosts(response.posts);
      }

      setHasMore(response.pagination.hasMore);
      setOffset(currentOffset + response.posts.length);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [offset]);

  // Initial fetch
  useEffect(() => {
    fetchPosts();
  }, []);

  // Handle scroll for infinite loading
  const handleScroll = useCallback(() => {
    if (!feedRef.current || loadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      fetchPosts(false, true);
    }
  }, [loadingMore, hasMore, fetchPosts]);

  // Handle refresh
  const handleRefresh = () => {
    setOffset(0);
    fetchPosts(true);
  };

  // Handle new post created
  const handlePostCreated = (newPost: RoofPost) => {
    setPosts(prev => [newPost, ...prev]);
    setShowComposer(false);
  };

  // Handle like change
  const handleLikeChange = (postId: string, newCount: number, userLiked: boolean) => {
    setPosts(prev =>
      prev.map(p =>
        p.id === postId
          ? { ...p, like_count: newCount, user_liked: userLiked }
          : p
      )
    );
  };

  // Handle post delete
  const handleDelete = (postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handlePinChange = (postId: string, isPinned: boolean) => {
    setPosts(prev =>
      prev.map(p => (p.id === postId ? { ...p, is_pinned: isPinned } : p))
    );
  };

  // Handle comment count update
  const handleCommentAdded = (postId: string) => {
    setPosts(prev =>
      prev.map(p =>
        p.id === postId
          ? { ...p, comment_count: p.comment_count + 1 }
          : p
      )
    );
  };

  const visiblePosts = React.useMemo(() => {
    let next = [...posts];
    if (filter === 'pinned') {
      next = next.filter(p => p.is_pinned);
    } else if (filter === 'shared') {
      next = next.filter(p => p.post_type === 'shared_chat' || p.post_type === 'shared_email');
    } else if (filter === 'announcements') {
      next = next.filter(p => p.post_type === 'announcement');
    }

    if (sortBy === 'likes') {
      next.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
    } else if (sortBy === 'comments') {
      next.sort((a, b) => (b.comment_count || 0) - (a.comment_count || 0));
    } else {
      next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return next;
  }, [posts, filter, sortBy]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'transparent'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--glass-border)',
          background: 'rgba(12, 12, 12, 0.65)',
          backdropFilter: 'blur(12px) saturate(120%)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Home style={{ width: '22px', height: '22px', color: 'var(--roof-red)' }} />
            <h2
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary)'
              }}
            >
              The Roof
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px',
                cursor: refreshing ? 'default' : 'pointer',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                opacity: refreshing ? 0.5 : 1
              }}
              title="Refresh"
            >
              <RefreshCw
                style={{
                  width: '18px',
                  height: '18px',
                  animation: refreshing ? 'spin 1s linear infinite' : 'none'
                }}
              />
            </button>

            {/* New post button */}
            <button
              onClick={() => setShowComposer(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                background: 'linear-gradient(135deg, var(--roof-red) 0%, var(--roof-red-dark) 100%)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Plus style={{ width: '16px', height: '16px' }} />
              Post
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: 'var(--text-secondary)',
              flex: '1 1 220px'
            }}
          >
            Share wins, tips, and Susan AI insights with your team
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'pinned', label: 'Pinned' },
              { id: 'shared', label: 'Shared' },
              { id: 'announcements', label: 'Announcements' }
            ].map(option => (
              <button
                key={option.id}
                onClick={() => setFilter(option.id as typeof filter)}
                style={{
                  padding: '0.35rem 0.7rem',
                  borderRadius: '999px',
                  border: filter === option.id ? '1px solid rgba(220,38,38,0.7)' : '1px solid rgba(255,255,255,0.12)',
                  background: filter === option.id ? 'rgba(220,38,38,0.18)' : 'rgba(12,12,12,0.35)',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={{
              padding: '0.35rem 0.6rem',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(12,12,12,0.35)',
              color: 'var(--text-primary)',
              fontSize: '0.75rem'
            }}
          >
            <option value="newest">Newest</option>
            <option value="likes">Most liked</option>
            <option value="comments">Most commented</option>
          </select>
        </div>
      </div>

      {/* Posts feed */}
      <div
        ref={feedRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px',
          background: 'rgba(8, 8, 8, 0.25)',
          backdropFilter: 'blur(8px) saturate(120%)'
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '40px'
            }}
          >
            <Loader2
              style={{
                width: '32px',
                height: '32px',
                color: 'var(--roof-red)',
                animation: 'spin 1s linear infinite'
              }}
            />
          </div>
        ) : visiblePosts.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              color: 'var(--text-secondary)'
            }}
          >
            <Home
              style={{
                width: '48px',
                height: '48px',
                opacity: 0.3,
                marginBottom: '16px'
              }}
            />
            <p style={{ margin: 0, fontSize: '16px' }}>No posts yet</p>
            <p style={{ margin: '8px 0 0', fontSize: '14px' }}>
              Be the first to share something with the team!
            </p>
          </div>
        ) : (
          <>
            {visiblePosts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onLikeChange={handleLikeChange}
                onDelete={handleDelete}
                onPinChange={handlePinChange}
                onOpenComments={setSelectedPostId}
              />
            ))}

            {loadingMore && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '20px'
                }}
              >
                <Loader2
                  style={{
                    width: '24px',
                    height: '24px',
                    color: 'var(--roof-red)',
                    animation: 'spin 1s linear infinite'
                  }}
                />
              </div>
            )}

            {!hasMore && visiblePosts.length > 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '20px',
                  color: 'var(--text-secondary)',
                  fontSize: '14px'
                }}
              >
                You've reached the end
              </div>
            )}
          </>
        )}
      </div>

      {/* Post Composer Modal */}
      {showComposer && (
        <PostComposer
          onClose={() => setShowComposer(false)}
          onPostCreated={handlePostCreated}
        />
      )}

      {/* Comments Modal */}
      {selectedPostId && (
        <CommentSection
          postId={selectedPostId}
          onClose={() => setSelectedPostId(null)}
          onCommentAdded={() => handleCommentAdded(selectedPostId)}
        />
      )}

      {/* Spin animation */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default RoofFeed;
