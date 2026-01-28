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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-color)',
          background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(185, 28, 28, 0.05) 100%)'
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

        <p
          style={{
            margin: '8px 0 0',
            fontSize: '13px',
            color: 'var(--text-secondary)'
          }}
        >
          Share wins, tips, and Susan AI insights with your team
        </p>
      </div>

      {/* Posts feed */}
      <div
        ref={feedRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px'
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
        ) : posts.length === 0 ? (
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
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onLikeChange={handleLikeChange}
                onDelete={handleDelete}
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

            {!hasMore && posts.length > 0 && (
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
