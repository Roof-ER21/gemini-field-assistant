/**
 * Roof Service - Client-side service for "The Roof" team feed feature
 * Handles posts, likes, comments, and @mentions for team-wide communication
 */

import { authService } from './authService';

// ============================================================================
// TYPES
// ============================================================================

export interface RoofPost {
  id: string;
  author_id: string;
  author_name: string;
  author_email: string;
  content: string;
  post_type: 'text' | 'shared_chat' | 'shared_email' | 'announcement';
  shared_content: SharedContent | null;
  like_count: number;
  comment_count: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  user_liked: boolean;
}

export interface SharedContent {
  type: 'susan_chat' | 'susan_email';
  original_query?: string;
  ai_response?: string;
  session_id?: string;
  email_subject?: string;
  email_body?: string;
  email_metadata?: Record<string, unknown>;
}

export interface PostComment {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  author_email: string;
  content: string;
  parent_comment_id: string | null;
  like_count: number;
  created_at: string;
  updated_at: string;
  user_liked: boolean;
}

export interface RoofMention {
  id: string;
  post_id: string | null;
  comment_id: string | null;
  is_read: boolean;
  created_at: string;
  post_content: string | null;
  comment_content: string | null;
  mentioner_name: string;
  mentioner_email: string;
}

export interface PostsResponse {
  posts: RoofPost[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class RoofService {
  private static instance: RoofService;

  private constructor() {}

  static getInstance(): RoofService {
    if (!RoofService.instance) {
      RoofService.instance = new RoofService();
    }
    return RoofService.instance;
  }

  private getHeaders(): HeadersInit {
    const user = authService.getCurrentUser();
    return {
      'Content-Type': 'application/json',
      'x-user-email': user?.email || ''
    };
  }

  private getApiUrl(): string {
    return import.meta.env.VITE_API_URL || '';
  }

  // ============================================================================
  // POSTS
  // ============================================================================

  /**
   * Get posts feed (paginated)
   */
  async getPosts(limit = 20, offset = 0): Promise<PostsResponse> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/posts?limit=${limit}&offset=${offset}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) throw new Error('Failed to fetch posts');

      const data = await response.json();
      return {
        posts: data.posts || [],
        pagination: data.pagination || { limit, offset, total: 0, hasMore: false }
      };
    } catch (error) {
      console.error('[Roof] Error fetching posts:', error);
      return { posts: [], pagination: { limit, offset, total: 0, hasMore: false } };
    }
  }

  /**
   * Create a new post
   */
  async createPost(
    content: string,
    postType: 'text' | 'shared_chat' | 'shared_email' | 'announcement' = 'text',
    sharedContent?: SharedContent
  ): Promise<RoofPost | null> {
    try {
      const response = await fetch(`${this.getApiUrl()}/api/roof/posts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          content,
          post_type: postType,
          shared_content: sharedContent
        })
      });

      if (!response.ok) throw new Error('Failed to create post');

      const data = await response.json();
      return data.post || null;
    } catch (error) {
      console.error('[Roof] Error creating post:', error);
      return null;
    }
  }

  /**
   * Get a single post by ID
   */
  async getPost(postId: string): Promise<RoofPost | null> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/posts/${postId}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) throw new Error('Failed to fetch post');

      const data = await response.json();
      return data.post || null;
    } catch (error) {
      console.error('[Roof] Error fetching post:', error);
      return null;
    }
  }

  /**
   * Delete a post (only author can delete)
   */
  async deletePost(postId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/posts/${postId}`,
        {
          method: 'DELETE',
          headers: this.getHeaders()
        }
      );

      return response.ok;
    } catch (error) {
      console.error('[Roof] Error deleting post:', error);
      return false;
    }
  }

  // ============================================================================
  // LIKES
  // ============================================================================

  /**
   * Like a post
   */
  async likePost(postId: string): Promise<number | null> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/posts/${postId}/like`,
        {
          method: 'POST',
          headers: this.getHeaders()
        }
      );

      if (!response.ok) throw new Error('Failed to like post');

      const data = await response.json();
      return data.like_count ?? null;
    } catch (error) {
      console.error('[Roof] Error liking post:', error);
      return null;
    }
  }

  /**
   * Unlike a post
   */
  async unlikePost(postId: string): Promise<number | null> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/posts/${postId}/like`,
        {
          method: 'DELETE',
          headers: this.getHeaders()
        }
      );

      if (!response.ok) throw new Error('Failed to unlike post');

      const data = await response.json();
      return data.like_count ?? null;
    } catch (error) {
      console.error('[Roof] Error unliking post:', error);
      return null;
    }
  }

  // ============================================================================
  // COMMENTS
  // ============================================================================

  /**
   * Get comments for a post
   */
  async getComments(postId: string): Promise<PostComment[]> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/posts/${postId}/comments`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) throw new Error('Failed to fetch comments');

      const data = await response.json();
      return data.comments || [];
    } catch (error) {
      console.error('[Roof] Error fetching comments:', error);
      return [];
    }
  }

  /**
   * Add a comment to a post
   */
  async addComment(
    postId: string,
    content: string,
    parentCommentId?: string
  ): Promise<PostComment | null> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/posts/${postId}/comments`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            content,
            parent_comment_id: parentCommentId
          })
        }
      );

      if (!response.ok) throw new Error('Failed to add comment');

      const data = await response.json();
      return data.comment || null;
    } catch (error) {
      console.error('[Roof] Error adding comment:', error);
      return null;
    }
  }

  /**
   * Delete a comment (only author can delete)
   */
  async deleteComment(commentId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/comments/${commentId}`,
        {
          method: 'DELETE',
          headers: this.getHeaders()
        }
      );

      return response.ok;
    } catch (error) {
      console.error('[Roof] Error deleting comment:', error);
      return false;
    }
  }

  /**
   * Like a comment
   */
  async likeComment(commentId: string): Promise<number | null> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/comments/${commentId}/like`,
        {
          method: 'POST',
          headers: this.getHeaders()
        }
      );

      if (!response.ok) throw new Error('Failed to like comment');

      const data = await response.json();
      return data.like_count ?? null;
    } catch (error) {
      console.error('[Roof] Error liking comment:', error);
      return null;
    }
  }

  /**
   * Unlike a comment
   */
  async unlikeComment(commentId: string): Promise<number | null> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/comments/${commentId}/like`,
        {
          method: 'DELETE',
          headers: this.getHeaders()
        }
      );

      if (!response.ok) throw new Error('Failed to unlike comment');

      const data = await response.json();
      return data.like_count ?? null;
    } catch (error) {
      console.error('[Roof] Error unliking comment:', error);
      return null;
    }
  }

  // ============================================================================
  // MENTIONS
  // ============================================================================

  /**
   * Get unread mentions for current user
   */
  async getUnreadMentions(): Promise<RoofMention[]> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/mentions`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) throw new Error('Failed to fetch mentions');

      const data = await response.json();
      return data.mentions || [];
    } catch (error) {
      console.error('[Roof] Error fetching mentions:', error);
      return [];
    }
  }

  /**
   * Mark mentions as read
   */
  async markMentionsRead(mentionIds?: string[]): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/roof/mentions/mark-read`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ mention_ids: mentionIds })
        }
      );

      return response.ok;
    } catch (error) {
      console.error('[Roof] Error marking mentions as read:', error);
      return false;
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Extract username from email (for @mention matching)
   */
  getUsernameFromEmail(email: string): string {
    return email.split('@')[0].toLowerCase();
  }

  /**
   * Get initials from name for avatar
   */
  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  /**
   * Format relative time (e.g., "2h ago")
   */
  formatRelativeTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
}

// Export singleton instance
export const roofService = RoofService.getInstance();
export default roofService;
