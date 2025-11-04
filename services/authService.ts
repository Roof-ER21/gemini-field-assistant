/**
 * Authentication Service
 * Simple email-based authentication for S21 Field AI
 * Uses magic link style authentication (no passwords for MVP)
 */

import { databaseService, User } from './databaseService';
import { emailNotificationService } from './emailNotificationService';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'sales_rep' | 'manager' | 'admin';
  state: 'VA' | 'MD' | 'PA' | null;
  created_at: Date;
  last_login_at: Date;
}

export interface LoginResult {
  success: boolean;
  user?: AuthUser;
  message: string;
  verificationCode?: string; // For MVP, we'll show this in console
}

interface StoredAuth {
  user: AuthUser;
  expiresAt: number;
  rememberMe: boolean;
}

class AuthService {
  private static instance: AuthService;
  private currentUser: AuthUser | null = null;
  private readonly AUTH_KEY = 's21_auth_user';
  private readonly SESSION_KEY = 's21_session_id';
  private readonly TOKEN_KEY = 's21_auth_token';

  private constructor() {
    // Load user from localStorage on initialization
    this.loadStoredUser();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Load user from localStorage
   */
  private loadStoredUser(): void {
    try {
      const storedToken = localStorage.getItem(this.TOKEN_KEY);
      if (storedToken) {
        const authData: StoredAuth = JSON.parse(storedToken);
        const now = Date.now();

        // Check if token has expired
        if (now < authData.expiresAt) {
          this.currentUser = authData.user;
          console.log('✅ Auto-login successful. Token expires:', new Date(authData.expiresAt));

          // Auto-refresh token if it's close to expiring (within 7 days) and rememberMe is true
          const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
          if (authData.rememberMe && (authData.expiresAt - now) < sevenDaysInMs) {
            this.refreshToken(authData.user, authData.rememberMe);
          }
        } else {
          // Token expired
          console.log('🔒 Token expired, logging out');
          this.logout();
        }
      }
    } catch (error) {
      console.error('Error loading stored user:', error);
      this.logout();
    }
  }

  /**
   * Refresh authentication token
   */
  private refreshToken(user: AuthUser, rememberMe: boolean): void {
    try {
      const expiryDuration = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 0; // 30 days or session
      const expiresAt = rememberMe ? Date.now() + expiryDuration : 0;

      const authData: StoredAuth = {
        user: {
          ...user,
          last_login_at: new Date()
        },
        expiresAt,
        rememberMe
      };

      localStorage.setItem(this.TOKEN_KEY, JSON.stringify(authData));
      console.log('🔄 Token refreshed. New expiry:', rememberMe ? new Date(expiresAt) : 'Session only');
    } catch (error) {
      console.error('Error refreshing token:', error);
    }
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  /**
   * Generate a simple 6-digit verification code
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Send verification code (MVP: just log to console)
   * In production, this would send an email via SendGrid or similar
   */
  private async sendVerificationCode(email: string, code: string): Promise<void> {
    console.log('='.repeat(60));
    console.log('📧 VERIFICATION CODE FOR MVP TESTING');
    console.log('='.repeat(60));
    console.log(`Email: ${email}`);
    console.log(`Verification Code: ${code}`);
    console.log('='.repeat(60));
    console.log('In production, this would be sent via email service.');
    console.log('='.repeat(60));

    // Store code in sessionStorage for verification (expires on browser close)
    sessionStorage.setItem(`verification_code_${email}`, code);
    sessionStorage.setItem(`code_timestamp_${email}`, Date.now().toString());
  }

  /**
   * Login with email (Step 1: Request verification code)
   */
  async requestLoginCode(email: string): Promise<LoginResult> {
    try {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return {
          success: false,
          message: 'Please enter a valid email address'
        };
      }

      // Generate and send verification code
      const code = this.generateVerificationCode();
      await this.sendVerificationCode(email, code);

      return {
        success: true,
        message: 'Verification code sent! Check the browser console for MVP testing.',
        verificationCode: code // For MVP, return it directly
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: 'An error occurred. Please try again.'
      };
    }
  }

  /**
   * Verify code and complete login (Step 2: Verify code)
   */
  async verifyLoginCode(email: string, code: string, name?: string, rememberMe: boolean = false): Promise<LoginResult> {
    try {
      // Get stored code
      const storedCode = sessionStorage.getItem(`verification_code_${email}`);
      const timestamp = sessionStorage.getItem(`code_timestamp_${email}`);

      if (!storedCode || !timestamp) {
        return {
          success: false,
          message: 'Verification code expired. Please request a new one.'
        };
      }

      // Check if code is expired (10 minutes)
      const codeAge = Date.now() - parseInt(timestamp);
      const TEN_MINUTES = 10 * 60 * 1000;
      if (codeAge > TEN_MINUTES) {
        sessionStorage.removeItem(`verification_code_${email}`);
        sessionStorage.removeItem(`code_timestamp_${email}`);
        return {
          success: false,
          message: 'Verification code expired. Please request a new one.'
        };
      }

      // Verify code
      if (code !== storedCode) {
        return {
          success: false,
          message: 'Invalid verification code. Please try again.'
        };
      }

      // Code is valid - create or update user
      const user: AuthUser = {
        id: crypto.randomUUID(),
        email: email.toLowerCase(),
        name: name || email.split('@')[0], // Use email prefix as default name
        role: 'sales_rep',
        state: null,
        created_at: new Date(),
        last_login_at: new Date()
      };

      // Check if user exists in localStorage
      const existingUser = this.findUserByEmail(email);
      if (existingUser) {
        user.id = existingUser.id;
        user.name = existingUser.name;
        user.role = existingUser.role;
        user.state = existingUser.state;
        user.created_at = existingUser.created_at;
      }

      // Save user to localStorage
      this.currentUser = user;
      localStorage.setItem(this.AUTH_KEY, JSON.stringify(user));

      // Create session with token expiry
      const sessionId = crypto.randomUUID();
      localStorage.setItem(this.SESSION_KEY, sessionId);

      // Store authentication token with expiry
      const expiryDuration = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 0; // 30 days or session
      const expiresAt = rememberMe ? Date.now() + expiryDuration : 0;

      const authData: StoredAuth = {
        user,
        expiresAt,
        rememberMe
      };

      localStorage.setItem(this.TOKEN_KEY, JSON.stringify(authData));

      // Update database service
      await databaseService.setCurrentUser(user);

      // Clean up verification code
      sessionStorage.removeItem(`verification_code_${email}`);
      sessionStorage.removeItem(`code_timestamp_${email}`);

      console.log('✅ User logged in successfully:', user.email);
      console.log(`🔐 Remember Me: ${rememberMe ? 'Yes (30 days)' : 'No (session only)'}`);
      if (rememberMe) {
        console.log(`⏰ Token expires: ${new Date(expiresAt)}`);
      }

      // Send email notification to admin
      emailNotificationService.notifyLogin({
        userName: user.name,
        userEmail: user.email,
        timestamp: user.last_login_at.toISOString()
      }).catch(err => {
        console.warn('Failed to send login notification email:', err);
        // Don't block login if email fails
      });

      return {
        success: true,
        user,
        message: 'Login successful!'
      };
    } catch (error) {
      console.error('Verification error:', error);
      return {
        success: false,
        message: 'An error occurred during verification. Please try again.'
      };
    }
  }

  /**
   * Quick login for development (bypass code verification)
   */
  async quickLogin(email: string, name?: string, rememberMe: boolean = false): Promise<LoginResult> {
    try {
      const user: AuthUser = {
        id: crypto.randomUUID(),
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        role: 'sales_rep',
        state: null,
        created_at: new Date(),
        last_login_at: new Date()
      };

      // Check if user exists
      const existingUser = this.findUserByEmail(email);
      if (existingUser) {
        user.id = existingUser.id;
        user.name = existingUser.name;
        user.role = existingUser.role;
        user.state = existingUser.state;
        user.created_at = existingUser.created_at;
      }

      this.currentUser = user;
      localStorage.setItem(this.AUTH_KEY, JSON.stringify(user));

      const sessionId = crypto.randomUUID();
      localStorage.setItem(this.SESSION_KEY, sessionId);

      // Store authentication token with expiry
      const expiryDuration = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 0; // 30 days or session
      const expiresAt = rememberMe ? Date.now() + expiryDuration : 0;

      const authData: StoredAuth = {
        user,
        expiresAt,
        rememberMe
      };

      localStorage.setItem(this.TOKEN_KEY, JSON.stringify(authData));

      await databaseService.setCurrentUser(user);

      console.log('✅ Quick login successful:', user.email);
      console.log(`🔐 Remember Me: ${rememberMe ? 'Yes (30 days)' : 'No (session only)'}`);

      // Send email notification to admin
      emailNotificationService.notifyLogin({
        userName: user.name,
        userEmail: user.email,
        timestamp: user.last_login_at.toISOString()
      }).catch(err => {
        console.warn('Failed to send login notification email:', err);
        // Don't block login if email fails
      });

      return {
        success: true,
        user,
        message: 'Login successful!'
      };
    } catch (error) {
      console.error('Quick login error:', error);
      return {
        success: false,
        message: 'Login failed. Please try again.'
      };
    }
  }

  /**
   * Find user by email in localStorage
   */
  private findUserByEmail(email: string): AuthUser | null {
    try {
      // For MVP, we're using simple localStorage
      // In production, this would query the database
      const allUsers = this.getAllStoredUsers();
      return allUsers.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all stored users (for MVP)
   */
  private getAllStoredUsers(): AuthUser[] {
    try {
      const usersStr = localStorage.getItem('s21_all_users');
      return usersStr ? JSON.parse(usersStr) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Update current user profile
   */
  async updateUserProfile(updates: Partial<AuthUser>): Promise<boolean> {
    try {
      if (!this.currentUser) {
        return false;
      }

      // Update current user
      this.currentUser = {
        ...this.currentUser,
        ...updates,
        id: this.currentUser.id, // Don't allow ID change
        email: this.currentUser.email, // Don't allow email change
        created_at: this.currentUser.created_at // Don't allow created_at change
      };

      // Save to localStorage
      localStorage.setItem(this.AUTH_KEY, JSON.stringify(this.currentUser));

      // Update in database service
      await databaseService.setCurrentUser(this.currentUser);

      // Update in all users list
      const allUsers = this.getAllStoredUsers();
      const userIndex = allUsers.findIndex(u => u.id === this.currentUser!.id);
      if (userIndex >= 0) {
        allUsers[userIndex] = this.currentUser;
      } else {
        allUsers.push(this.currentUser);
      }
      localStorage.setItem('s21_all_users', JSON.stringify(allUsers));

      console.log('✅ User profile updated:', this.currentUser.email);
      return true;
    } catch (error) {
      console.error('Profile update error:', error);
      return false;
    }
  }

  /**
   * Logout current user
   */
  logout(): void {
    this.currentUser = null;
    localStorage.removeItem(this.AUTH_KEY);
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.TOKEN_KEY);

    // Clear session codes
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith('verification_code_') || key.startsWith('code_timestamp_')) {
        sessionStorage.removeItem(key);
      }
    });

    console.log('✅ User logged out');
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return localStorage.getItem(this.SESSION_KEY);
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();
