// src/app.js
// Express application — middleware stack + route mounting.
// No listen() here; that belongs in server.js (testability).

import express        from 'express';
import helmet         from 'helmet';
import cors           from 'cors';
import morgan         from 'morgan';
import cookieParser   from 'cookie-parser';
import { env }        from './config/env.js';
import apiRouter      from './routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      env.corsOrigin,
  credentials: true, // Required for the httpOnly refresh cookie
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Logging ───────────────────────────────────────────────────────────────────
if (env.nodeEnv !== 'test') app.use(morgan(env.isDev ? 'dev' : 'combined'));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/v1', apiRouter);

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
