const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 21098;

// Import your Express app
const { app } = require('./index');

// Create HTTP server
const server = createServer(app);

// Start server
server.listen(port, hostname, (err) => {
  if (err) throw err;
  console.log(`> Ready on http://${hostname}:${port}`);
});