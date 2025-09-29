// DatabaseService.ts
import mongoose from "mongoose";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

export class DatabaseService {
  private static instance: DatabaseService;
  public mongooseConnection: mongoose.Connection;
  public mysqlConnection: mysql.Pool;

  private constructor() {
    // MongoDB Connection
    this.mongooseConnection = mongoose.createConnection(process.env.MONGODB_URI!, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    // MySQL Connection Pool
    this.mysqlConnection = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || "3306"),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: "utf8mb4",
    });
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async connect(): Promise<void> {
    try {
      // MongoDB
      await this.mongooseConnection.asPromise();
      console.log("✅ MongoDB connected successfully");

      // MySQL
      const connection = await this.mysqlConnection.getConnection();
      console.log("✅ MySQL connected successfully");
      connection.release();
    } catch (error) {
      console.error("❌ Database connection failed:", error);
      process.exit(1);
    }
  }

  public async disconnect(): Promise<void> {
    await this.mongooseConnection.close();
    await this.mysqlConnection.end();
    console.log("📴 Databases disconnected");
  }
}
