import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './server/routes';
import { repository } from './server/repository';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  // Restricted CORS for configured origins (never wildcard on sensitive endpoints)
  const allowedOrigins = new Set(
    [
      process.env.FRONTEND_URL,
      process.env.APP_URL,
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ].filter(Boolean) as string[]
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.has(origin) || origin.endsWith('.run.app') || origin.endsWith('.vercel.app'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).send();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '2mb' }));

  // Initialize database/repository and seed sample dataset
  await repository.init();

  // Mount versioned REST API
  app.use('/api/v1', createApiRouter());

  // Lightweight Swagger UI page powered by /api/v1/openapi.json
  app.get('/docs', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Opptra Discount Engine API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({ url: '/api/v1/openapi.json', dom_id: '#swagger-ui' });
  </script>
</body>
</html>`);
  });

  // Centralized API error handler
  app.use('/api/v1', (err: Error & { statusCode?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.statusCode || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    const message =
      status >= 500
        ? err.message || 'Internal server error.'
        : err.message;
    res.status(status).json({ detail: message });
  });

  const frontendRoot = path.resolve(process.cwd(), 'frontend');

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(frontendRoot, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  } else {
    const vite = await createViteServer({
      configFile: path.resolve(process.cwd(), 'vite.config.ts'),
      root: frontendRoot,
      server: { middlewareMode: true },
      appType: 'spa',
      esbuild: { jsx: 'automatic' },
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Opptra Discount Engine server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
