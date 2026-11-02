import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'child_process'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'topaz-bridge',
      configureServer(server) {
        server.middlewares.use('/api/open-topaz', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const args = ['-a', 'Topaz Gigapixel AI'];
              if (data.path && typeof data.path === 'string') {
                args.push(data.path);
              }
              execFile('open', args, (err) => {
                res.setHeader('Content-Type', 'application/json');
                if (err) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: err.message }));
                } else {
                  res.end(JSON.stringify({ ok: true }));
                }
              });
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: e.message }));
            }
          });
        });
      },
    },
  ],
})
