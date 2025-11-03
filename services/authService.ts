/**
 * Authentication Service
 * Simple email-based authentication for S21 Field AI
 * Uses magic link style authentication (no passwords for MVP)
 */

import { databaseService, User } from './databaseService';

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

class AuthService {
  private static instance: AuthService;
  private currentUser: AuthUser | null = null;
  private readonly AUTH_KEY = 's21_auth_user';
  private readonly SESSION_KEY = 's21_session_id';

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
      const storedUser = localStorage.getItem(this.AUTH_KEY);
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        // Check if session is still valid (e.g., within 30 days)
        const lastLogin = new Date(parsedUser.last_login_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        if (lastLogin > thirtyDaysAgo) {
          this.currentUser = parsedUser;
        } else {
          // Session expired
          this.logout();
        }
      }
    } catch (error) {
      console.error('Error loading stored user:', error);
      this.logout();
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
  async verifyLoginCode(email: string, code: string, name?: string): Promise<LoginResult> {
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

      // Create session
      const sessionId = crypto.randomUUID();
      localStorage.setItem(this.SESSION_KEY, sessionId);

      // Update database service
      await databaseService.setCurrentUser(user);

      // Clean up verification code
      sessionStorage.removeItem(`verification_code_${email}`);
      sessionStorage.removeItem(`code_timestamp_${email}`);

      console.log('✅ User logged in successfully:', user.email);

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
  async quickLogin(email: string, name?: string): Promise<LoginResult> {
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

      await databaseService.setCurrentUser(user);

      console.log('✅ Quick login successful:', user.email);

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
