// Start server then run test
const path = require('path');
process.chdir(path.join(process.env.USERPROFILE, '.openclaw/workspace/hermesx402'));

// Start server
require('./server/index.js');

// Wait for server to be ready, then run test
setTimeout(() => {
  require('./test-x402.js');
}, 1500);
