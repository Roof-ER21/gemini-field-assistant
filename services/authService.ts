/**
 * Authentication Service
 * Simple email-based authentication for S21 Field AI
 * Uses magic link style authentication (no passwords for MVP)
 */

import { databaseService, User } from './databaseService';
import { emailNotificationService } from './emailNotificationService';
import { activityService } from './activityService';
import { API_BASE_URL } from './config';

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
  autoLoginSuccess?: boolean; // True if auto-login token was used
  developmentMode?: boolean; // True if verification code should be displayed on screen
  verificationCode?: string; // The verification code to display (when email not sent)
  emailSent?: boolean; // True if email was actually sent
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

          // Auto-refresh token if it's close to expiring (within 30 days) and rememberMe is true
          const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
          if (authData.rememberMe && (authData.expiresAt - now) < thirtyDaysInMs) {
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
      const expiryDuration = rememberMe ? 365 * 24 * 60 * 60 * 1000 : 0; // 1 year or session
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
   * Send verification code via backend API
   * The backend handles code generation, storage, and returns the code for display
   */
  private async sendVerificationCode(email: string): Promise<{
    success: boolean;
    developmentMode?: boolean;
    message: string;
    verificationCode?: string;
    emailSent?: boolean;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/send-verification-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        return {
          success: true,
          developmentMode: !result.emailSent,  // Show code if email wasn't sent
          message: result.message,
          verificationCode: result.verificationCode,
          emailSent: result.emailSent
        };
      }

      return {
        success: false,
        message: result.error || 'Failed to send verification code'
      };
    } catch (error) {
      console.error('Error sending verification code:', error);
      return {
        success: false,
        message: 'Network error. Please check your connection and try again.'
      };
    }
  }

  /**
   * Login with email (Step 1: Request verification code)
   * Now checks for valid auto-login token first - if found and valid, skips verification
   */
  async requestLoginCode(email: string, name?: string, rememberMe: boolean = false): Promise<LoginResult> {
    try {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return {
          success: false,
          message: 'Please enter a valid email address'
        };
      }

      // Check if user has a valid auto-login token
      const storedToken = localStorage.getItem(this.TOKEN_KEY);
      if (storedToken) {
        try {
          const authData: StoredAuth = JSON.parse(storedToken);
          const now = Date.now();

          // Check if token is valid and for the same email
          if (authData.user.email.toLowerCase() === email.toLowerCase() &&
              authData.rememberMe &&
              now < authData.expiresAt) {

            // Valid token found - perform auto-login
            console.log('✅ Valid auto-login token found, skipping verification code');

            // Update user info
            const user: AuthUser = {
              ...authData.user,
              name: name || authData.user.name, // Update name if provided
              last_login_at: new Date()
            };

            this.currentUser = user;
            localStorage.setItem(this.AUTH_KEY, JSON.stringify(user));

            // Refresh the token with new expiry
            this.refreshToken(user, rememberMe);

            // Update database service
            await databaseService.setCurrentUser(user);

            // Log login activity
            try {
              await activityService.logLogin();
              console.log('✅ Login activity logged');
            } catch (err) {
              console.error('❌ Failed to log login activity:', err);
            }

            // Update last login in database
            try {
              await fetch(`${API_BASE_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  role: user.role,
                  state: user.state
                })
              });
            } catch (err) {
              console.warn('Failed to update user in database:', err);
            }

            return {
              success: true,
              user,
              message: 'Auto-login successful!',
              autoLoginSuccess: true
            };
          } else {
            console.log('🔒 Token expired or email mismatch, proceeding with verification code');
          }
        } catch (err) {
          console.error('Error parsing stored token:', err);
        }
      }

      // No valid token - proceed with normal verification code flow
      console.log('📧 No valid auto-login token, requesting verification code from server');

      // Send verification code via backend API
      const sendResult = await this.sendVerificationCode(email);

      if (sendResult.success) {
        return {
          success: true,
          message: sendResult.emailSent
            ? 'Verification code sent! Check your email.'
            : 'Verification code generated - share it with the user.',
          autoLoginSuccess: false,
          developmentMode: !sendResult.emailSent,  // Show code display when email not sent
          verificationCode: sendResult.verificationCode,
          emailSent: sendResult.emailSent
        };
      } else {
        return {
          success: false,
          message: sendResult.message
        };
      }
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
   * Name is now required (collected in step 1)
   */
  async verifyLoginCode(email: string, code: string, name: string, rememberMe: boolean = false): Promise<LoginResult> {
    try {
      // Verify code via backend API
      const verifyResponse = await fetch(`${API_BASE_URL}/auth/verify-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code }),
      });

      const verifyResult = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyResult.success) {
        return {
          success: false,
          message: verifyResult.error || 'Invalid verification code'
        };
      }

      // Code is valid - create or update user
      const user: AuthUser = {
        id: crypto.randomUUID(),
        email: email.toLowerCase(),
        name: name, // Name is now required from step 1
        role: 'sales_rep',
        state: null,
        created_at: new Date(),
        last_login_at: new Date()
      };

      let isFirstLogin = false;

      // First, try to create or get user from database
      try {
        console.log('📝 Creating/getting user in database...');
        const createResponse = await fetch(`${API_BASE_URL}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            state: user.state
          })
        });

        if (createResponse.ok) {
          const dbUser = await createResponse.json();
          user.id = dbUser.id;
          user.name = dbUser.name || user.name;
          user.role = dbUser.role || 'sales_rep';
          user.state = dbUser.state;
          user.created_at = dbUser.created_at ? new Date(dbUser.created_at) : user.created_at;
          isFirstLogin = dbUser.isNew === true || !dbUser.first_login_at;
          console.log('✅ User created/loaded in database with role:', user.role);
          console.log(`🔑 First login: ${isFirstLogin}`);
        } else {
          console.warn('⚠️  Failed to create user in database, continuing with local auth');
          // Fallback: check if user exists
          const checkResponse = await fetch(`${API_BASE_URL}/users/${email.toLowerCase()}`);
          if (checkResponse.ok) {
            const dbUser = await checkResponse.json();
            user.id = dbUser.id;
            user.name = dbUser.name || user.name;
            user.role = dbUser.role || 'sales_rep';
            user.state = dbUser.state;
            user.created_at = dbUser.created_at ? new Date(dbUser.created_at) : user.created_at;
            isFirstLogin = !dbUser.first_login_at;
          } else {
            // Brand new user not in database
            isFirstLogin = true;
          }
        }
      } catch (error) {
        console.error('❌ Error creating/loading user from database:', error);
        console.warn('Continuing with local authentication only');
        isFirstLogin = true;
      }

      // Ensure configured admin has admin role on login (client-side)
      try {
        const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase();
        if (adminEmail && user.email.toLowerCase() === adminEmail) {
          user.role = 'admin';
          console.log('👑 Applied admin role from VITE_ADMIN_EMAIL');
        }
      } catch {}

      // Fallback: Check if user exists in localStorage
      const existingUser = this.findUserByEmail(email);
      if (existingUser && !user.id) {
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
      const expiryDuration = rememberMe ? 365 * 24 * 60 * 60 * 1000 : 0; // 1 year or session
      const expiresAt = rememberMe ? Date.now() + expiryDuration : 0;

      const authData: StoredAuth = {
        user,
        expiresAt,
        rememberMe
      };

      localStorage.setItem(this.TOKEN_KEY, JSON.stringify(authData));

      // Update database service
      await databaseService.setCurrentUser(user);

      console.log('✅ User logged in successfully:', user.email);
      console.log(`🔐 Remember Me: ${rememberMe ? 'Yes (1 year)' : 'No (session only)'}`);
      if (rememberMe) {
        console.log(`⏰ Token expires: ${new Date(expiresAt)}`);
      }

      // Log login activity (for daily summaries)
      try {
        await activityService.logLogin();
        console.log('✅ Login activity logged');
      } catch (err) {
        console.error('❌ Failed to log login activity:', err);
      }

      // Send email notification to admin ONLY on first login
      if (isFirstLogin) {
        console.log('📧 First login detected - sending admin notification');
        console.log('📧 User details:', {
          name: user.name,
          email: user.email,
          timestamp: user.last_login_at.toISOString()
        });

        try {
          const emailResult = await emailNotificationService.notifyLogin({
            userName: user.name,
            userEmail: user.email,
            timestamp: user.last_login_at.toISOString()
          });

          if (emailResult.success) {
            console.log('✅ First login notification sent successfully');
          } else {
            console.error('❌ First login notification failed:', emailResult.error);
          }
        } catch (err) {
          console.error('❌ Exception sending first login notification:', err);
          console.error('Error details:', {
            message: (err as Error).message,
            stack: (err as Error).stack
          });
          // Don't block login if email fails
        }
      } else {
        console.log('🔕 Not first login - skipping admin email notification');
      }

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

      // Elevate if matches configured admin email (client-side shortcut)
      try {
        const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase();
        if (adminEmail && user.email.toLowerCase() === adminEmail) {
          user.role = 'admin';
        }
      } catch {}

      this.currentUser = user;
      localStorage.setItem(this.AUTH_KEY, JSON.stringify(user));

      const sessionId = crypto.randomUUID();
      localStorage.setItem(this.SESSION_KEY, sessionId);

      // Store authentication token with expiry
      const expiryDuration = rememberMe ? 365 * 24 * 60 * 60 * 1000 : 0; // 1 year or session
      const expiresAt = rememberMe ? Date.now() + expiryDuration : 0;

      const authData: StoredAuth = {
        user,
        expiresAt,
        rememberMe
      };

      localStorage.setItem(this.TOKEN_KEY, JSON.stringify(authData));

      await databaseService.setCurrentUser(user);

      console.log('✅ Quick login successful:', user.email);
      console.log(`🔐 Remember Me: ${rememberMe ? 'Yes (1 year)' : 'No (session only)'}`);

      // Log login activity (for daily summaries)
      activityService.logLogin().catch(err => {
        console.warn('Failed to log login activity:', err);
      });

      // Quick login doesn't send emails (dev mode only)

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
