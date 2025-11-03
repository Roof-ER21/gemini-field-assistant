/**
 * Database Service
 * Handles PostgreSQL connection and queries
 * Falls back to localStorage if database is unavailable
 */

// PostgreSQL client for browser (using a REST API wrapper)
// Note: For production, this would typically be a backend API endpoint

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  state: 'VA' | 'MD' | 'PA' | null;
  created_at: Date;
  last_login_at: Date;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  message_id: string;
  sender: 'user' | 'bot';
  content: string;
  state?: string;
  provider?: string;
  sources?: any[];
  created_at: Date;
  session_id: string;
}

export interface DocumentView {
  id: string;
  user_id: string;
  document_path: string;
  document_name: string;
  document_category?: string;
  view_count: number;
  first_viewed_at: Date;
  last_viewed_at: Date;
  total_time_spent: number;
}

export interface DocumentFavorite {
  id: string;
  user_id: string;
  document_path: string;
  document_name: string;
  document_category?: string;
  note?: string;
  created_at: Date;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private apiBaseUrl: string;
  private useLocalStorage: boolean = true; // Start with localStorage, switch to DB when backend is ready

  private constructor() {
    // In production, this would be your backend API URL
    this.apiBaseUrl = import.meta.env.VITE_API_URL || '/api';

    // Check if we can connect to the database
    this.checkDatabaseConnection();
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private async checkDatabaseConnection(): Promise<void> {
    // Try to connect to the database API
    // For now, use localStorage as fallback
    try {
      // const response = await fetch(`${this.apiBaseUrl}/health`);
      // if (response.ok) {
      //   this.useLocalStorage = false;
      //   console.log('✅ Database connection established');
      // }
    } catch (error) {
      console.log('📦 Using localStorage as database fallback');
      this.useLocalStorage = true;
    }
  }

  // ============================================================================
  // USER METHODS
  // ============================================================================

  async getCurrentUser(): Promise<User | null> {
    if (this.useLocalStorage) {
      const userStr = localStorage.getItem('current_user');
      return userStr ? JSON.parse(userStr) : null;
    }

    // TODO: Implement API call
    // const response = await fetch(`${this.apiBaseUrl}/users/me`);
    // return await response.json();
    return null;
  }

  async setCurrentUser(user: Partial<User>): Promise<void> {
    if (this.useLocalStorage) {
      const currentUser = {
        id: user.id || crypto.randomUUID(),
        email: user.email || 'demo@roofer.com',
        name: user.name || 'Demo User',
        role: user.role || 'sales_rep',
        state: user.state || null,
        created_at: new Date(),
        last_login_at: new Date()
      };
      localStorage.setItem('current_user', JSON.stringify(currentUser));
      return;
    }

    // TODO: Implement API call
  }

  // ============================================================================
  // CHAT HISTORY METHODS
  // ============================================================================

  async saveChatMessage(message: Partial<ChatMessage>): Promise<void> {
    if (this.useLocalStorage) {
      // Keep using the existing localStorage system
      return;
    }

    // TODO: Implement API call to save chat message
    // await fetch(`${this.apiBaseUrl}/chat/messages`, {
    //   method: 'POST',
    //   body: JSON.stringify(message)
    // });
  }

  async getChatHistory(sessionId?: string, limit: number = 50): Promise<ChatMessage[]> {
    if (this.useLocalStorage) {
      const historyStr = localStorage.getItem('chatHistory');
      const history = historyStr ? JSON.parse(historyStr) : [];

      if (sessionId) {
        return history.filter((msg: any) => msg.session_id === sessionId).slice(0, limit);
      }

      return history.slice(0, limit);
    }

    // TODO: Implement API call
    return [];
  }

  // ============================================================================
  // DOCUMENT TRACKING METHODS
  // ============================================================================

  async trackDocumentView(documentPath: string, documentName: string, category?: string): Promise<void> {
    if (this.useLocalStorage) {
      // Use existing localStorage-based tracking
      const historyStr = localStorage.getItem('knowledge_history') || '[]';
      const history = JSON.parse(historyStr);

      const existing = history.find((h: any) => h.documentPath === documentPath);

      if (existing) {
        existing.viewedAt = new Date().toISOString();
        existing.viewCount = (existing.viewCount || 1) + 1;
      } else {
        history.unshift({
          documentPath,
          documentName,
          category,
          viewedAt: new Date().toISOString(),
          viewCount: 1
        });
      }

      localStorage.setItem('knowledge_history', JSON.stringify(history.slice(0, 50)));
      return;
    }

    // TODO: Implement API call
    // await fetch(`${this.apiBaseUrl}/documents/track-view`, {
    //   method: 'POST',
    //   body: JSON.stringify({ documentPath, documentName, category })
    // });
  }

  async getRecentDocuments(limit: number = 20): Promise<any[]> {
    if (this.useLocalStorage) {
      const historyStr = localStorage.getItem('knowledge_history') || '[]';
      const history = JSON.parse(historyStr);
      return history.slice(0, limit);
    }

    // TODO: Implement API call
    return [];
  }

  async addToFavorites(documentPath: string, documentName: string, category?: string, note?: string): Promise<void> {
    if (this.useLocalStorage) {
      const favoritesStr = localStorage.getItem('knowledge_favorites') || '[]';
      const favorites = JSON.parse(favoritesStr);

      if (!favorites.find((f: any) => f.documentPath === documentPath)) {
        favorites.push({
          documentPath,
          documentName,
          category,
          note,
          bookmarkedAt: new Date().toISOString()
        });
      }

      localStorage.setItem('knowledge_favorites', JSON.stringify(favorites));
      return;
    }

    // TODO: Implement API call
  }

  async removeFromFavorites(documentPath: string): Promise<void> {
    if (this.useLocalStorage) {
      const favoritesStr = localStorage.getItem('knowledge_favorites') || '[]';
      const favorites = JSON.parse(favoritesStr);
      const filtered = favorites.filter((f: any) => f.documentPath !== documentPath);
      localStorage.setItem('knowledge_favorites', JSON.stringify(filtered));
      return;
    }

    // TODO: Implement API call
  }

  async getFavorites(): Promise<any[]> {
    if (this.useLocalStorage) {
      const favoritesStr = localStorage.getItem('knowledge_favorites') || '[]';
      return JSON.parse(favoritesStr);
    }

    // TODO: Implement API call
    return [];
  }

  // ============================================================================
  // EMAIL TRACKING METHODS
  // ============================================================================

  async logEmailGeneration(emailData: {
    emailType?: string;
    recipient?: string;
    subject?: string;
    body: string;
    context?: string;
    state?: string;
  }): Promise<void> {
    if (this.useLocalStorage) {
      const logsStr = localStorage.getItem('email_generation_log') || '[]';
      const logs = JSON.parse(logsStr);

      logs.push({
        ...emailData,
        created_at: new Date().toISOString()
      });

      // Keep only last 100 emails
      localStorage.setItem('email_generation_log', JSON.stringify(logs.slice(-100)));
      return;
    }

    // TODO: Implement API call
  }

  // ============================================================================
  // ANALYTICS METHODS
  // ============================================================================

  async getAnalyticsSummary(): Promise<any> {
    if (this.useLocalStorage) {
      const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
      const docHistory = JSON.parse(localStorage.getItem('knowledge_history') || '[]');
      const favorites = JSON.parse(localStorage.getItem('knowledge_favorites') || '[]');
      const emails = JSON.parse(localStorage.getItem('email_generation_log') || '[]');

      return {
        total_messages: chatHistory.length,
        unique_documents_viewed: new Set(docHistory.map((d: any) => d.documentPath)).size,
        favorite_documents: favorites.length,
        emails_generated: emails.length,
        last_active: new Date().toISOString()
      };
    }

    // TODO: Implement API call
    return {};
  }
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance();
