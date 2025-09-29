import { Dayjs } from "dayjs";

declare module "dayjs" {
  interface Dayjs {
    utc(keepLocalTime?: boolean): Dayjs;
    tz(timezone?: string, keepLocalTime?: boolean): Dayjs;
  }
}

declare module "dayjs/plugin/utc";
declare module "dayjs/plugin/timezone";
