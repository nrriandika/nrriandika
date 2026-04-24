/**
 * Vercel Serverless Entry Point
 * Re-exports the Express app from server.js
 */
const app = require('../server');
module.exports = app;
