import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { DatabaseService } from "../config/database.js";

// Get DB instance
const db = DatabaseService.getInstance().mysqlConnection;

// Extend Express Request type to include `user`
declare global {
  namespace Express {
    interface Request {
      user?: any; // you can define a proper User type instead of `any`
    }
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET as string
    ) as JwtPayload;

    // Check if user still exists and is active
    const [users]: any = await db.execute(
      `SELECT user_id, first_name, last_name, email, role, is_active, is_deleted 
       FROM users WHERE user_id = ? AND is_deleted = 0 AND is_active = 1`,
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists or account is inactive",
      });
    }

    const user = users[0];

    try {
      if (typeof user.role === "string") {
        user.role = JSON.parse(user.role);
      }
    } catch {
      user.role = [user.role];
    }

    req.user = user; // ✅ now recognized
    console.log("from the middleware",user);
    
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }

    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    console.error("Auth middleware error:", err);
    res.status(500).json({
      success: false,
      message: "Authentication error",
    });
  }
};
