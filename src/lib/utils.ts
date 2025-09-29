import { Request } from "express";
import LogController from "../controllers/log.controller.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

// helper to extract IP
export const getSystemIp = (req: Request): string => {
  return (
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    ""
  );
}


export const handleError = async (
  operation: string,
  module: string,
  error: any,
  userId?: number,
  ip?: string,
  additionalData?: any
) => {
  console.error(`Error ${operation} ${module}:`, error);
  await LogController.logError(module, operation, error, userId, ip, additionalData);
};



dayjs.extend(utc);
dayjs.extend(timezone);

export function toUtcTime(timeString: string): string {
  return dayjs.utc(`1970-01-01 ${timeString}`, "YYYY-MM-DD HH:mm").format("HH:mm:ss");
}
