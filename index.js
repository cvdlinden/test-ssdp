import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ESM environment workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const app = express();
const server = createServer(app);

// Serve static frontend assets from the public directory
app.use(express.static(join(__dirname, 'public')));

// Middleware to parse incoming JSON payloads (useful for Column 4 SOAP executions)
app.use(express.json());

/**
 * Health check and API status endpoint
 */
app.get('/api/status', (req, res) => {
  res.json({ status: 'online', protocol: 'SSDP/UPnP' });
});

// Start the HTTP Server
server.listen(PORT, () => {
  console.log(`\x1b[32m[Server]\x1b[0m Dashboard is live at http://localhost:${PORT}`);
  
  // TODO: Initialize UDP SSDP Socket here
  // startSsdpSocket();
});

/**
 * Gracefully shuts down the application by releasing network resources
 */
const shutdown = () => {
  console.log('\n\x1b[33m[Server]\x1b[0m Shutting down application...');
  
  server.close(() => {
    console.log('\x1b[32m[Server]\x1b[0m HTTP server closed successfully.');
    
    // TODO: Close UDP Socket here to prevent port binding hanging
    // closeSsdpSocket();
    
    process.exit(0);
  });
};

// Catch process termination signals for clean exit
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
