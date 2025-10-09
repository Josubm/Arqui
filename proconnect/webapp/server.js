import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = createServer(async (req, res) => {
  let filePath = req.url;
  
  // Si es la raíz, servir index.html
  if (filePath === '/') {
    filePath = '/index.html';
  }

  try {
    const fullPath = join(__dirname, 'dist', filePath);
    const fileContent = await readFile(fullPath);
    const ext = '.' + filePath.split('.').pop();
    const contentType = MIME_TYPES[ext] || 'text/plain';
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fileContent);
  } catch (error) {
    // Si hay error, servir index.html (para React Router)
    try {
      const indexHtml = await readFile(join(__dirname, 'dist', 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(indexHtml);
    } catch (error2) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Página no encontrada');
    }
  }
});

server.listen(PORT, () => {
  console.log(`🌐 WebApp ejecutándose en puerto ${PORT}`);
});