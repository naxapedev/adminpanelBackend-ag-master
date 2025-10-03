// controllers/logController.ts
import Log from "../models/mongodb/logModel.js";

interface ILogData {
  action: "auth" | "create" | "update" | "delete" | "error";
  module: string;
  userId?: number;
  ip?: string;
  payload?: any;
  previousData?: any;
  message?: string;
  errorDetails?: any;
}

export class LogController {
  /**
   * Create a new log entry
   */
  static async createLog(logData: ILogData) {
    try {
      const log = new Log(logData);
      await log.save();
      return log;
    } catch (error) {
      console.error("Error creating log:", error);
      // Don't throw error to avoid breaking the main operation
      return null;
    }
  }

  /**
   * Log creation operations
   */
  static async logCreation(
    module: string,
    data: any,
    userId?: number,
    ip?: string
  ) {
    return this.createLog({
      action: "create",
      module,
      userId,
      ip,
      payload: data,
      message: `${module} created successfully`,
    });
  }

  /**
   * Log update operations
   */
  static async logUpdate(
    module: string,
    previousData: any,
    updatedData: any,
    userId?: number,
    ip?: string
  ) {
    return this.createLog({
      action: "update",
      module,
      userId,
      ip,
      previousData,
      payload: updatedData,
      message: `${module} updated successfully`,
    });
  }

  /**
   * Log deletion operations
   */
  static async logDeletion(
    module: string,
    deletedData: any,
    userId?: number,
    ip?: string
  ) {
    return this.createLog({
      action: "delete",
      module,
      userId,
      ip,
      previousData: deletedData,
      message: `${module} deleted successfully`,
    });
  }

  /**
   * Log error operations - NEW METHOD
   */
  static async logError(
    module: string,
    action: string,
    error: any,
    userId?: number,
    ip?: string,
    additionalData?: any
  ) {
    return this.createLog({
      action: "error",
      module,
      userId,
      ip,
      payload: additionalData,
      errorDetails: {
        message: error.message,
        stack: error.stack,
        code: error.code
      },
      message: `Error during ${action} operation on ${module}: ${error.message}`,
    });
  }
  
  /**
   * Delete logs older than specified date
   */
  static async deleteOldLogs(olderThan: Date) {
    try {
      const result = await Log.deleteMany({ createdAt: { $lt: olderThan } });
      return result;
    } catch (error) {
      console.error("Error deleting old logs:", error);
      throw error;
    }
  }
}

export default LogController;
