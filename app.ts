import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { DatabaseService } from './src/config/database.js';
import authRoutes from './src/routes/auth.js';
import territoryRouter from "./src/routes/territory.routes.js";
import stateRoutes from "./src/routes/state.routes.js";
import labsRoutes from "./src/routes/lab.routes.js";
import deliveryRoutes from "./src/routes/delivery.routes.js";
import userRoutes from "./src/routes/user.routes.js"
import clinicRoutes from "./src/routes/clinic.routes.js"
import routeRoutes from "./src/routes/routes.routes.js";
import driverRoutes from "./src/routes/driver.routes.js"
import willCallRoutes from "./src/routes/willCall.routes.js"

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Database connection
const databaseService = DatabaseService.getInstance();

// Routes
app.use("/api/users", userRoutes);
app.use('/api/auth', authRoutes);
app.use("/api/territories", territoryRouter);
app.use("/api/state", stateRoutes);
app.use("/api/labs", labsRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/clinics", clinicRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/drivers", driverRoutes)
app.use("/api/willcall", willCallRoutes)

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connections
    await databaseService.mysqlConnection.execute('SELECT 1');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'Connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'Error', 
      error: 'Database connection failed' 
    });
  }
});

// Error handling middleware
app.use((error: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
async function startServer() {
  try {
    await databaseService.connect();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔐 JWT Authentication enabled`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await databaseService.disconnect();
  process.exit(0);
});

startServer();

export default app;