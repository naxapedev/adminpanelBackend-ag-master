// models/logModel.ts
import { Schema } from "mongoose";
import { DatabaseService } from "../../config/database.js";

const logSchema = new Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [ 'auth', 'create', 'update', 'delete', 'error']
    },
    module: {
      type: String,
      required: true,
      enum: ['state', 'territories', 'labs', 'delivery', 'clinics', 'users', 'auth', 'routes' ,'route report', 'routesheet' , 'routesheets', 'routes', 'temporary routes', 'routesheetdate', 'routesheetdropoff', 'support' , 'getRouteClinicSchedule', 'driver', 'will_call', 'login', 'logout']
    },
    payload: Object,
    ip: String,
    userId: Number,
    previousData: Object,
    message: String
  },
  { timestamps: true }
);


// action: {
//       type: String,
//       required: true,
//       enum: ['auth', 'create', 'update', 'delete', 'error']
//     },
//     module: {
//       type: String,
//       required: true,
//       enum: ['state', 'territories', 'labs', 'delivery', 'clinics', 'users', 'auth', 'routes', 'driver', 'will_call', 'login', 'logout']
//     },

// Index for better query performance
logSchema.index({ module: 1, action: 1 });
logSchema.index({ userId: 1 });
logSchema.index({ createdAt: -1 });

const db = DatabaseService.getInstance();
export default db.mongooseConnection.model("Log", logSchema);