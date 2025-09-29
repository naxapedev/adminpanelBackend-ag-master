import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../controllers/tokenServices.js';
import { AuthService } from '../controllers/authService.js';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Access token required' 
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token format' 
      });
    }

    // Verify access token
    const payload = TokenService.verifyAccessToken(token);
    
    // Validate user exists and is active
    const authService = new AuthService();
    const user = await authService.validateUser(payload.userId);

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found or inactive' 
      });
    }

    // Attach user to request
    req.user = {
      ...payload,
      ...user
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error instanceof Error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false, 
          error: 'Token expired' 
        });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid token' 
        });
      }
    }

    return res.status(401).json({ 
      success: false, 
      error: 'Authentication failed' 
    });
  }
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        email: string;
        role: string;
        first_name: string;
        last_name: string;
        is_active: boolean;
      };
    }
  }
}