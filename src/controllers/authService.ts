import bcrypt from 'bcryptjs';
import { TokenService, TokenPayload } from './tokenServices.js';
import { DatabaseService } from '../config/database.js';

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
}

export interface LoginResponse {
  success: boolean;
  user?: User;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

export class AuthService {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  async register(email: string, password: string, firstName: string, lastName: string): Promise<LoginResponse> {
    try {
      // Check if user already exists
      const [existingUsers] = await this.db.mysqlConnection.execute(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if ((existingUsers as any[]).length > 0) {
        return { success: false, error: 'User already exists' };
      }

      // Hash password
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const [result] = await this.db.mysqlConnection.execute(
        `INSERT INTO users (email, password_hash, first_name, last_name) 
         VALUES (?, ?, ?, ?)`,
        [email, passwordHash, firstName, lastName]
      );

      const userId = (result as any).insertId;

      // Generate tokens
      const tokenPayload: TokenPayload = {
        userId,
        email,
        role: 'user'
      };

      const accessToken = TokenService.generateAccessToken(tokenPayload);
      const refreshToken = TokenService.generateRefreshToken(tokenPayload);

      // Store refresh token in database
      await this.db.mysqlConnection.execute(
        'UPDATE users SET refresh_token = ?, last_login = NOW() WHERE id = ?',
        [refreshToken, userId]
      );

      // Get user data
      const [users] = await this.db.mysqlConnection.execute(
        'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = ?',
        [userId]
      );

      const user = (users as any[])[0];

      return {
        success: true,
        user,
        accessToken,
        refreshToken
      };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Registration failed' };
    }
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      // Find user
      const [users] = await this.db.mysqlConnection.execute(
        `SELECT id, email, password_hash, first_name, last_name, role, is_active 
         FROM users WHERE email = ? AND is_active = TRUE`,
        [email]
      );

      const userArray = users as any[];
      if (userArray.length === 0) {
        return { success: false, error: 'Invalid credentials' };
      }

      const user = userArray[0];

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Generate tokens
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role
      };

      const accessToken = TokenService.generateAccessToken(tokenPayload);
      const refreshToken = TokenService.generateRefreshToken(tokenPayload);

      // Update refresh token and last login
      await this.db.mysqlConnection.execute(
        'UPDATE users SET refresh_token = ?, last_login = NOW() WHERE id = ?',
        [refreshToken, user.id]
      );

      // Remove password hash from user object
      const { password_hash, ...userWithoutPassword } = user;

      return {
        success: true,
        user: userWithoutPassword,
        accessToken,
        refreshToken
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  }

  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    try {
      // Verify refresh token
      const payload = TokenService.verifyRefreshToken(refreshToken);

      // Check if token exists in database
      const [users] = await this.db.mysqlConnection.execute(
        'SELECT id, email, role, refresh_token FROM users WHERE id = ? AND refresh_token = ?',
        [payload.userId, refreshToken]
      );

      const userArray = users as any[];
      if (userArray.length === 0) {
        return { success: false, error: 'Invalid refresh token' };
      }

      const user = userArray[0];

      // Generate new tokens
      const newTokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role
      };

      const newAccessToken = TokenService.generateAccessToken(newTokenPayload);
      const newRefreshToken = TokenService.generateRefreshToken(newTokenPayload);

      // Update refresh token in database
      await this.db.mysqlConnection.execute(
        'UPDATE users SET refresh_token = ? WHERE id = ?',
        [newRefreshToken, user.id]
      );

      return {
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      return { success: false, error: 'Token refresh failed' };
    }
  }

  async logout(userId: number): Promise<boolean> {
    try {
      await this.db.mysqlConnection.execute(
        'UPDATE users SET refresh_token = NULL WHERE id = ?',
        [userId]
      );
      return true;
    } catch (error) {
      console.error('Logout error:', error);
      return false;
    }
  }

  async validateUser(userId: number): Promise<User | null> {
    try {
      const [users] = await this.db.mysqlConnection.execute(
        'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = ? AND is_active = TRUE',
        [userId]
      );

      const userArray = users as any[];
      return userArray.length > 0 ? userArray[0] : null;
    } catch (error) {
      console.error('User validation error:', error);
      return null;
    }
  }
}