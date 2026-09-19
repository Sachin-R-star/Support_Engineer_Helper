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

// Serve production static frontend if dist folder exists
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));
app.get('{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

export default app;

