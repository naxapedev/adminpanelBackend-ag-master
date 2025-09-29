import jwt, { SignOptions } from "jsonwebtoken";
import dotenv from "dotenv";
import ms, { StringValue } from "ms"; // npm install ms

dotenv.config();

export interface TokenPayload {
  userId: number;
  email: string;
  role: string;
}

export class TokenService {
  private static readonly ACCESS_TOKEN_SECRET: string = process.env
    .JWT_ACCESS_SECRET as string;
  private static readonly REFRESH_TOKEN_SECRET: string = process.env
    .JWT_REFRESH_SECRET as string;

  // Helper: validate expiresIn string using ms()
  private static validateExpiry(
    value: string | undefined,
    fallback: string
  ): string {
    if (!value) return fallback;
    try {
      if (ms(value as StringValue)) {
        return value;
      } else {
        console.warn(
          `⚠️ Invalid JWT expiry value "${value}", falling back to ${fallback}`
        );
        return fallback;
      }
    } catch {
      console.warn(
        `⚠️ Invalid JWT expiry value "${value}", falling back to ${fallback}`
      );
      return fallback;
    }
  }

  private static readonly ACCESS_TOKEN_EXPIRE: string | number =
    this.validateExpiry(process.env.JWT_ACCESS_EXPIRE, "15m");

  private static readonly REFRESH_TOKEN_EXPIRE: string | number =
    this.validateExpiry(process.env.JWT_REFRESH_EXPIRE, "7d");

  static generateAccessToken(payload: TokenPayload): string {
    const options: SignOptions = { expiresIn: this.ACCESS_TOKEN_EXPIRE as any };
    return jwt.sign(payload, this.ACCESS_TOKEN_SECRET, options);
  }

  static generateRefreshToken(payload: TokenPayload): string {
    const options: SignOptions = {
      expiresIn: this.REFRESH_TOKEN_EXPIRE as any,
    };
    return jwt.sign(payload, this.REFRESH_TOKEN_SECRET, options);
  }

  static verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, this.ACCESS_TOKEN_SECRET) as TokenPayload;
  }

  static verifyRefreshToken(token: string): TokenPayload {
    return jwt.verify(token, this.REFRESH_TOKEN_SECRET) as TokenPayload;
  }

  static decodeToken(token: string): TokenPayload | null {
    return jwt.decode(token) as TokenPayload | null;
  }
}
