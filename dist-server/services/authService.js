/**
 * Authentication Service
 * Simple email-based authentication for S21 Field AI
 * Uses magic link style authentication (no passwords for MVP)
 */
import { databaseService } from './databaseService';
import { emailNotificationService } from './emailNotificationService';
import { activityService } from './activityService';
class AuthService {
    static instance;
    currentUser = null;
    AUTH_KEY = 's21_auth_user';
    SESSION_KEY = 's21_session_id';
    TOKEN_KEY = 's21_auth_token';
    constructor() {
        // Load user from localStorage on initialization
        this.loadStoredUser();
    }
    static getInstance() {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }
    /**
     * Load user from localStorage
     */
    loadStoredUser() {
        try {
            const storedToken = localStorage.getItem(this.TOKEN_KEY);
            if (storedToken) {
                const authData = JSON.parse(storedToken);
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
                }
                else {
                    // Token expired
                    console.log('🔒 Token expired, logging out');
                    this.logout();
                }
            }
        }
        catch (error) {
            console.error('Error loading stored user:', error);
            this.logout();
        }
    }
    /**
     * Refresh authentication token
     */
    refreshToken(user, rememberMe) {
        try {
            const expiryDuration = rememberMe ? 365 * 24 * 60 * 60 * 1000 : 0; // 1 year or session
            const expiresAt = rememberMe ? Date.now() + expiryDuration : 0;
            const authData = {
                user: {
                    ...user,
                    last_login_at: new Date()
                },
                expiresAt,
                rememberMe
            };
            localStorage.setItem(this.TOKEN_KEY, JSON.stringify(authData));
            console.log('🔄 Token refreshed. New expiry:', rememberMe ? new Date(expiresAt) : 'Session only');
        }
        catch (error) {
            console.error('Error refreshing token:', error);
        }
    }
    /**
     * Get current authenticated user
     */
    getCurrentUser() {
        return this.currentUser;
    }
    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.currentUser !== null;
    }
    /**
     * Generate a simple 6-digit verification code
     */
    generateVerificationCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    /**
     * Send verification code (MVP: just log to console)
     * TODO: Integrate with email service to send verification code via email
     * - Use emailNotificationService or similar email provider
     * - Consider using SendGrid, AWS SES, or Resend for email delivery
     * - Add rate limiting to prevent abuse (max 3 codes per 15 minutes)
     * - Add email template with branded styling
     */
    async sendVerificationCode(email, code) {
        console.log('='.repeat(60));
        console.log('📧 VERIFICATION CODE FOR MVP TESTING');
        console.log('='.repeat(60));
        console.log(`Email: ${email}`);
        console.log(`Verification Code: ${code}`);
        console.log('='.repeat(60));
        console.log('TODO: In production, implement actual email sending via email service.');
        console.log('='.repeat(60));
        // Store code in sessionStorage for verification (expires on browser close)
        sessionStorage.setItem(`verification_code_${email}`, code);
        sessionStorage.setItem(`code_timestamp_${email}`, Date.now().toString());
    }
    /**
     * Login with email (Step 1: Request verification code)
     */
    async requestLoginCode(email) {
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
        }
        catch (error) {
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
    async verifyLoginCode(email, code, name, rememberMe = false) {
        try {
            // Get stored code
            const storedCode = sessionStorage.getItem(`verification_code_${email}`);
            const timestamp = sessionStorage.getItem(`code_timestamp_${email}`);
            if (!storedCode || !timestamp) {
                return {
                    success: false,
                    message: 'No verification code found. Please request a new code.'
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
                    message: 'Verification code expired (10 min limit). Please request a new one.'
                };
            }
            // Verify code
            if (code !== storedCode) {
                return {
                    success: false,
                    message: 'Invalid verification code. Please check and try again.'
                };
            }
            // Code is valid - create or update user
            const user = {
                id: crypto.randomUUID(),
                email: email.toLowerCase(),
                name: name || email.split('@')[0], // Use email prefix as default name
                role: 'sales_rep',
                state: null,
                created_at: new Date(),
                last_login_at: new Date()
            };
            let isFirstLogin = false;
            // First, try to create or get user from database
            try {
                console.log('📝 Creating/getting user in database...');
                const createResponse = await fetch(`${window.location.origin}/api/users`, {
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
                }
                else {
                    console.warn('⚠️  Failed to create user in database, continuing with local auth');
                    // Fallback: check if user exists
                    const checkResponse = await fetch(`${window.location.origin}/api/users/${email.toLowerCase()}`);
                    if (checkResponse.ok) {
                        const dbUser = await checkResponse.json();
                        user.id = dbUser.id;
                        user.name = dbUser.name || user.name;
                        user.role = dbUser.role || 'sales_rep';
                        user.state = dbUser.state;
                        user.created_at = dbUser.created_at ? new Date(dbUser.created_at) : user.created_at;
                        isFirstLogin = !dbUser.first_login_at;
                    }
                    else {
                        // Brand new user not in database
                        isFirstLogin = true;
                    }
                }
            }
            catch (error) {
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
            }
            catch { }
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
            const authData = {
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
            console.log(`🔐 Remember Me: ${rememberMe ? 'Yes (1 year)' : 'No (session only)'}`);
            if (rememberMe) {
                console.log(`⏰ Token expires: ${new Date(expiresAt)}`);
            }
            // Log login activity (for daily summaries)
            try {
                await activityService.logLogin();
                console.log('✅ Login activity logged');
            }
            catch (err) {
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
                    }
                    else {
                        console.error('❌ First login notification failed:', emailResult.error);
                    }
                }
                catch (err) {
                    console.error('❌ Exception sending first login notification:', err);
                    console.error('Error details:', {
                        message: err.message,
                        stack: err.stack
                    });
                    // Don't block login if email fails
                }
            }
            else {
                console.log('🔕 Not first login - skipping admin email notification');
            }
            return {
                success: true,
                user,
                message: 'Login successful!'
            };
        }
        catch (error) {
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
    async quickLogin(email, name, rememberMe = false) {
        try {
            const user = {
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
            }
            catch { }
            this.currentUser = user;
            localStorage.setItem(this.AUTH_KEY, JSON.stringify(user));
            const sessionId = crypto.randomUUID();
            localStorage.setItem(this.SESSION_KEY, sessionId);
            // Store authentication token with expiry
            const expiryDuration = rememberMe ? 365 * 24 * 60 * 60 * 1000 : 0; // 1 year or session
            const expiresAt = rememberMe ? Date.now() + expiryDuration : 0;
            const authData = {
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
        }
        catch (error) {
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
    findUserByEmail(email) {
        try {
            // For MVP, we're using simple localStorage
            // In production, this would query the database
            const allUsers = this.getAllStoredUsers();
            return allUsers.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Get all stored users (for MVP)
     */
    getAllStoredUsers() {
        try {
            const usersStr = localStorage.getItem('s21_all_users');
            return usersStr ? JSON.parse(usersStr) : [];
        }
        catch (error) {
            return [];
        }
    }
    /**
     * Update current user profile
     */
    async updateUserProfile(updates) {
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
            const userIndex = allUsers.findIndex(u => u.id === this.currentUser.id);
            if (userIndex >= 0) {
                allUsers[userIndex] = this.currentUser;
            }
            else {
                allUsers.push(this.currentUser);
            }
            localStorage.setItem('s21_all_users', JSON.stringify(allUsers));
            console.log('✅ User profile updated:', this.currentUser.email);
            return true;
        }
        catch (error) {
            console.error('Profile update error:', error);
            return false;
        }
    }
    /**
     * Logout current user
     */
    logout() {
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
    getSessionId() {
        return localStorage.getItem(this.SESSION_KEY);
    }
}
// Export singleton instance
export const authService = AuthService.getInstance();
