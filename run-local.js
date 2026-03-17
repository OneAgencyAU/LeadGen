'use strict';

// Patch global fetch to use HTTPS_PROXY (undici ignores proxy env vars by default)
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  const { ProxyAgent, setGlobalDispatcher } = require('undici');
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const { runDailyPipeline } = require('./src/run');
runDailyPipeline().catch((err) => {
  console.error('Fatal error in pipeline:', err);
  process.exit(1);
});
