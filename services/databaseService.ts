/**
 * Database Service
 * Handles PostgreSQL connection and queries
 * Falls back to localStorage if database is unavailable
 */

import { getApiBaseUrl } from './config';

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

export interface ChatSession {
  session_id: string;
  user_id: string;
  title: string;
  preview: string;
  message_count: number;
  first_message_at: Date;
  last_message_at: Date;
  state?: string;
  messages?: ChatMessage[];
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
  private getAuthEmail(): string | null {
    try {
      // Primary: auth user from app
      const authUserStr = localStorage.getItem('s21_auth_user');
      if (authUserStr) {
        const u = JSON.parse(authUserStr);
        if (u?.email) return (u.email as string).toLowerCase();
      }
      // Fallback: current_user used by this service
      const cur = localStorage.getItem('current_user');
      if (cur) {
        const u = JSON.parse(cur);
        if (u?.email) return (u.email as string).toLowerCase();
      }
    } catch {}
    return null;
  }

  private constructor() {
    // Use centralized config for API URL
    this.apiBaseUrl = getApiBaseUrl();

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
    try {
      console.log(`[DB] Checking connection to: ${this.apiBaseUrl}/health`);
      const response = await fetch(`${this.apiBaseUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        this.useLocalStorage = false;
        console.log('[DB] ✅ Connected to backend API - Database mode enabled');
        console.log('[DB] Health check:', data);
        console.log('[DB] 💾 Chat messages will be saved to PostgreSQL database');
        console.log('[DB] 👀 Admin can now view all conversations');
        return;
      } else {
        console.warn('[DB] Health check failed with status:', response.status);
      }
    } catch (error) {
      console.warn('[DB] Connection error:', (error as Error).message);
    }
    console.log('[DB] ⚠️  Using localStorage only (backend not available)');
    console.log('[DB] 🔒 Conversations will be private to this browser');
    this.useLocalStorage = true;
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
        created_at: user.created_at || new Date(),
        last_login_at: user.last_login_at || new Date()
      };
      localStorage.setItem('current_user', JSON.stringify(currentUser));
      return;
    }

    // TODO: Implement API call
    // await fetch(`${this.apiBaseUrl}/users/me`, {
    //   method: 'PUT',
    //   body: JSON.stringify(user)
    // });
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<boolean> {
    if (this.useLocalStorage) {
      const userStr = localStorage.getItem('current_user');
      if (!userStr) return false;

      const user = JSON.parse(userStr);
      if (user.id !== userId) return false;

      const updatedUser = {
        ...user,
        ...updates,
        id: user.id, // Don't allow ID change
        email: user.email, // Don't allow email change
        created_at: user.created_at // Don't allow created_at change
      };

      localStorage.setItem('current_user', JSON.stringify(updatedUser));
      return true;
    }

    // TODO: Implement API call
    return false;
  }

  async getUserPreferences(userId: string): Promise<any> {
    if (this.useLocalStorage) {
      const prefsStr = localStorage.getItem(`user_preferences_${userId}`);
      return prefsStr ? JSON.parse(prefsStr) : {
        preferred_state: null,
        preferred_ai_provider: 'Gemini',
        theme: 'dark',
        notifications_enabled: true,
        preferences: {}
      };
    }

    // TODO: Implement API call
    return null;
  }

  async updateUserPreferences(userId: string, preferences: any): Promise<boolean> {
    if (this.useLocalStorage) {
      localStorage.setItem(`user_preferences_${userId}`, JSON.stringify(preferences));
      return true;
    }

    // TODO: Implement API call
    return false;
  }

  // ============================================================================
  // CHAT HISTORY METHODS
  // ============================================================================

  async saveChatMessage(message: Partial<ChatMessage>): Promise<void> {
    if (this.useLocalStorage) {
      // Keep using the existing localStorage system
      console.log('[DB] 📝 Using localStorage - message not sent to backend');
      return;
    }

    try {
      const email = this.getAuthEmail();
      console.log('[DB] 💾 Saving chat message to database:', {
        message_id: message.message_id,
        sender: message.sender,
        content_preview: message.content?.substring(0, 50) + '...',
        session_id: message.session_id,
        state: message.state,
        provider: message.provider,
        user_email: email,
        api_url: `${this.apiBaseUrl}/chat/messages`
      });

      const response = await fetch(`${this.apiBaseUrl}/chat/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(email ? { 'x-user-email': email } : {}),
        },
        body: JSON.stringify({
          message_id: message.message_id,
          sender: message.sender,
          content: message.content,
          state: message.state,
          provider: message.provider,
          sources: message.sources,
          session_id: message.session_id,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[DB] ✅ Message saved successfully:', result);
      } else {
        const errorText = await response.text();
        console.error('[DB] ❌ Failed to save message - HTTP', response.status, ':', errorText);
      }
    } catch (e) {
      console.error('[DB] ❌ Failed to save chat message - Exception:', (e as Error).message);
      console.error('[DB] Stack trace:', (e as Error).stack);
    }
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

    try {
      const email = this.getAuthEmail();
      const params = new URLSearchParams();
      if (sessionId) params.set('session_id', sessionId);
      if (limit) params.set('limit', String(limit));
      const res = await fetch(`${this.apiBaseUrl}/chat/messages?${params.toString()}`, {
        headers: {
          ...(email ? { 'x-user-email': email } : {}),
        },
      });
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  // ============================================================================
  // CHAT SESSION METHODS
  // ============================================================================

  async saveChatSession(sessionId: string, messages: any[]): Promise<void> {
    if (this.useLocalStorage) {
      const sessionsStr = localStorage.getItem('chat_sessions') || '{}';
      const sessions = JSON.parse(sessionsStr);

      const userMessages = messages.filter(m => !m.text?.includes('Hey there!') && !m.text?.includes('Welcome back'));

      if (userMessages.length === 0) {
        return; // Don't save empty sessions
      }

      const firstUserMsg = userMessages.find(m => m.sender === 'user');
      const lastMsg = userMessages[userMessages.length - 1];

      sessions[sessionId] = {
        session_id: sessionId,
        user_id: 'demo-user',
        title: firstUserMsg?.text.slice(0, 50) || 'New Chat',
        preview: firstUserMsg?.text.slice(0, 100) || '',
        message_count: userMessages.length,
        first_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        state: userMessages.find(m => m.state)?.state || null,
        messages: userMessages
      };

      localStorage.setItem('chat_sessions', JSON.stringify(sessions));
      return;
    }

    // TODO: Implement API call
  }

  async getChatSessions(limit: number = 20): Promise<ChatSession[]> {
    if (this.useLocalStorage) {
      const sessionsStr = localStorage.getItem('chat_sessions') || '{}';
      const sessionsObj = JSON.parse(sessionsStr);

      const sessions = Object.values(sessionsObj) as ChatSession[];

      // Sort by last message date, most recent first
      sessions.sort((a, b) =>
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );

      return sessions.slice(0, limit);
    }

    // TODO: Implement API endpoint for sessions if needed
    return [];
  }

  async getChatSession(sessionId: string): Promise<ChatSession | null> {
    if (this.useLocalStorage) {
      const sessionsStr = localStorage.getItem('chat_sessions') || '{}';
      const sessions = JSON.parse(sessionsStr);
      return sessions[sessionId] || null;
    }

    // TODO: Implement API endpoint for a single session if needed
    return null;
  }

  async deleteChatSession(sessionId: string): Promise<void> {
    if (this.useLocalStorage) {
      const sessionsStr = localStorage.getItem('chat_sessions') || '{}';
      const sessions = JSON.parse(sessionsStr);
      delete sessions[sessionId];
      localStorage.setItem('chat_sessions', JSON.stringify(sessions));
      return;
    }

    // TODO: Implement API endpoint for deletion if needed
  }

  async exportChatSession(sessionId: string, format: 'json' | 'txt' = 'json'): Promise<string> {
    const session = await this.getChatSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (format === 'json') {
      return JSON.stringify(session, null, 2);
    }

    // Plain text format
    let text = `Chat Session: ${session.title}\n`;
    text += `Date: ${new Date(session.first_message_at).toLocaleString()}\n`;
    text += `Messages: ${session.message_count}\n`;
    text += `\n${'='.repeat(80)}\n\n`;

    session.messages?.forEach(msg => {
      const sender = msg.sender === 'user' ? 'YOU' : 'S21';
      const time = new Date(msg.created_at).toLocaleTimeString();
      text += `[${time}] ${sender}:\n${msg.content}\n\n`;
    });

    return text;
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

    try {
      const email = this.getAuthEmail();
      await fetch(`${this.apiBaseUrl}/documents/track-view`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(email ? { 'x-user-email': email } : {}),
        },
        body: JSON.stringify({ documentPath, documentName, category, timeSpent: 0 }),
      });
    } catch (e) {
      console.warn('[DB] Failed to track document view:', (e as Error).message);
    }
  }

  async getRecentDocuments(limit: number = 20): Promise<any[]> {
    if (this.useLocalStorage) {
      const historyStr = localStorage.getItem('knowledge_history') || '[]';
      const history = JSON.parse(historyStr);
      return history.slice(0, limit);
    }

    try {
      const email = this.getAuthEmail();
      const res = await fetch(`${this.apiBaseUrl}/documents/recent?limit=${limit}`, {
        headers: {
          ...(email ? { 'x-user-email': email } : {}),
        },
      });
      if (res.ok) return await res.json();
    } catch {}
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

    try {
      const email = this.getAuthEmail();
      await fetch(`${this.apiBaseUrl}/documents/favorites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(email ? { 'x-user-email': email } : {}),
        },
        body: JSON.stringify({ documentPath, documentName, category, note }),
      });
    } catch (e) {
      console.warn('[DB] Failed to add favorite:', (e as Error).message);
    }
  }

  async removeFromFavorites(documentPath: string): Promise<void> {
    if (this.useLocalStorage) {
      const favoritesStr = localStorage.getItem('knowledge_favorites') || '[]';
      const favorites = JSON.parse(favoritesStr);
      const filtered = favorites.filter((f: any) => f.documentPath !== documentPath);
      localStorage.setItem('knowledge_favorites', JSON.stringify(filtered));
      return;
    }

    try {
      const email = this.getAuthEmail();
      await fetch(`${this.apiBaseUrl}/documents/favorites/${encodeURIComponent(documentPath)}`, {
        method: 'DELETE',
        headers: {
          ...(email ? { 'x-user-email': email } : {}),
        },
      });
    } catch (e) {
      console.warn('[DB] Failed to remove favorite:', (e as Error).message);
    }
  }

  async getFavorites(): Promise<any[]> {
    if (this.useLocalStorage) {
      const favoritesStr = localStorage.getItem('knowledge_favorites') || '[]';
      return JSON.parse(favoritesStr);
    }

    try {
      const email = this.getAuthEmail();
      const res = await fetch(`${this.apiBaseUrl}/documents/favorites`, {
        headers: {
          ...(email ? { 'x-user-email': email } : {}),
        },
      });
      if (res.ok) return await res.json();
    } catch {}
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
    try {
      const email = this.getAuthEmail();
      await fetch(`${this.apiBaseUrl}/emails/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(email ? { 'x-user-email': email } : {}),
        },
        body: JSON.stringify({
          emailType: emailData.emailType,
          recipient: emailData.recipient,
          subject: emailData.subject,
          body: emailData.body,
          context: emailData.context,
          state: emailData.state,
        }),
      });
    } catch (e) {
      console.warn('[DB] Failed to log email generation:', (e as Error).message);
    }
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
    try {
      const email = this.getAuthEmail();
      const res = await fetch(`${this.apiBaseUrl}/analytics/summary`, {
        headers: {
          ...(email ? { 'x-user-email': email } : {}),
        },
      });
      if (res.ok) return await res.json();
    } catch {}
    return {};
  }

  // ============================================================================
  // LIVE SUSAN SESSION TRACKING
  // ============================================================================

  async startLiveSusanSession(): Promise<string | null> {
    const sessionId = `susan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (this.useLocalStorage) {
      const sessions = JSON.parse(localStorage.getItem('susan_sessions') || '[]');
      sessions.push({
        id: sessionId,
        started_at: new Date().toISOString(),
        message_count: 0,
        double_tap_stops: 0
      });
      localStorage.setItem('susan_sessions', JSON.stringify(sessions));
      return sessionId;
    }

    try {
      const email = this.getAuthEmail();
      const res = await fetch(`${this.apiBaseUrl}/activity/live-susan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(email ? { 'x-user-email': email } : {}),
        },
        body: JSON.stringify({ action: 'start' }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.session_id;
      }
    } catch (e) {
      console.warn('[DB] Failed to start Susan session:', (e as Error).message);
    }
    return null;
  }

  async endLiveSusanSession(sessionId: string, messageCount: number, doubleTapStops: number): Promise<void> {
    if (this.useLocalStorage) {
      const sessions = JSON.parse(localStorage.getItem('susan_sessions') || '[]');
      const session = sessions.find((s: any) => s.id === sessionId);
      if (session) {
        session.ended_at = new Date().toISOString();
        session.message_count = messageCount;
        session.double_tap_stops = doubleTapStops;
        localStorage.setItem('susan_sessions', JSON.stringify(sessions));
      }
      return;
    }

    try {
      const email = this.getAuthEmail();
      await fetch(`${this.apiBaseUrl}/activity/live-susan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(email ? { 'x-user-email': email } : {}),
        },
        body: JSON.stringify({
          action: 'end',
          session_id: sessionId,
          message_count: messageCount,
          double_tap_stops: doubleTapStops
        }),
      });
    } catch (e) {
      console.warn('[DB] Failed to end Susan session:', (e as Error).message);
    }
  }

  // ============================================================================
  // TRANSCRIPTION TRACKING
  // ============================================================================

  async logTranscription(data: {
    audioDuration: number;
    transcriptionText: string;
    wordCount: number;
    provider?: string;
  }): Promise<void> {
    if (this.useLocalStorage) {
      const transcriptions = JSON.parse(localStorage.getItem('transcriptions') || '[]');
      transcriptions.push({
        ...data,
        created_at: new Date().toISOString()
      });
      localStorage.setItem('transcriptions', JSON.stringify(transcriptions));
      return;
    }

    try {
      const email = this.getAuthEmail();
      await fetch(`${this.apiBaseUrl}/activity/transcription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(email ? { 'x-user-email': email } : {}),
        },
        body: JSON.stringify({
          audio_duration_seconds: data.audioDuration,
          transcription_text: data.transcriptionText,
          word_count: data.wordCount,
          provider: data.provider || 'Gemini'
        }),
      });
    } catch (e) {
      console.warn('[DB] Failed to log transcription:', (e as Error).message);
    }
  }

  // ============================================================================
  // DOCUMENT UPLOAD TRACKING
  // ============================================================================

  async logDocumentUpload(data: {
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
    analysisType?: string;
    analysisResult?: string;
  }): Promise<void> {
    if (this.useLocalStorage) {
      const uploads = JSON.parse(localStorage.getItem('document_uploads') || '[]');
      uploads.push({
        ...data,
        created_at: new Date().toISOString()
      });
      localStorage.setItem('document_uploads', JSON.stringify(uploads));
      return;
    }

    try {
      const email = this.getAuthEmail();
      await fetch(`${this.apiBaseUrl}/activity/document-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(email ? { 'x-user-email': email } : {}),
        },
        body: JSON.stringify({
          file_name: data.fileName,
          file_type: data.fileType,
          file_size_bytes: data.fileSizeBytes,
          analysis_type: data.analysisType,
          analysis_result: data.analysisResult,
          analysis_performed: !!data.analysisResult
        }),
      });
    } catch (e) {
      console.warn('[DB] Failed to log document upload:', (e as Error).message);
    }
  }
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance();
