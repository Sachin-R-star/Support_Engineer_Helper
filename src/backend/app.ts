import express from 'express';
import cors from 'cors';
import { DatabaseService } from './database/db';
import triageRoutes from './routes/triageRoutes';
import incidentRoutes from './routes/incidentRoutes';
import taxonomyRoutes from './routes/taxonomyRoutes';
import searchRoutes from './routes/searchRoutes';

import path from 'path';

const app = express();

app.use(cors());
app.use(express.json());

// Initialize Database & Seed Defaults
DatabaseService.seedDefaults();

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', system: 'Enterprise IT Support Triage Assistant', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/triage', triageRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/taxonomy', taxonomyRoutes);
app.use('/api/search', searchRoutes);

// API 404 Catch-All Handler (Ensures /api routes never fall through to HTML)
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: `API endpoint ${req.method} ${req.originalUrl || req.url} not found` });
});

// Global Express JSON Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  }
  next(err);
});

// Serve production static frontend if dist folder exists
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: `API endpoint ${req.path} not found` });
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next(err);
  });
});

export default app;


