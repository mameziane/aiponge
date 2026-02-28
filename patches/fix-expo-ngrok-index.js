const { NgrokClient, NgrokClientError } = require('./src/client');
const uuid = require('uuid');
const { getProcess, getActiveProcess, killProcess, setAuthtoken, getVersion } = require('./src/process');
const { defaults, validate, isRetriable } = require('./src/utils');

let processUrl = null;
let ngrokClient = null;

const TUNNEL_API_FIELDS = new Set([
  'addr',
  'proto',
  'name',
  'inspect',
  'auth',
  'host_header',
  'bind_tls',
  'subdomain',
  'hostname',
  'crt',
  'key',
  'client_cas',
  'remote_addr',
  'metadata',
  'schemes',
]);

function sanitizeTunnelOpts(opts) {
  const tunnelOpts = {};
  for (const [key, value] of Object.entries(opts)) {
    if (TUNNEL_API_FIELDS.has(key)) {
      tunnelOpts[key] = value;
    }
  }
  if (tunnelOpts.addr && typeof tunnelOpts.addr === 'number') {
    tunnelOpts.addr = String(tunnelOpts.addr);
  }
  return tunnelOpts;
}

async function connect(opts) {
  opts = defaults(opts);
  validate(opts);
  if (opts.authtoken) {
    await setAuthtoken(opts);
  }

  processUrl = await getProcess(opts);
  ngrokClient = new NgrokClient(processUrl);
  return connectRetry(opts);
}

async function connectRetry(opts, retryCount = 0) {
  opts.name = String(opts.name || uuid.v4());
  const tunnelOpts = sanitizeTunnelOpts(opts);
  try {
    const response = await ngrokClient.startTunnel(tunnelOpts);
    return response.public_url;
  } catch (err) {
    const errDetails = err.body && err.body.details && err.body.details.err;
    if (err.body && err.body.error_code === 102 && errDetails && /already exists/.test(errDetails)) {
      process.stderr.write(
        "[ngrok] Tunnel '" + tunnelOpts.name + "' already exists (phantom from 503 race). Deleting and recreating...\n"
      );
      try {
        await ngrokClient.stopTunnel(tunnelOpts.name);
      } catch (e) {}
      await new Promise(r => setTimeout(r, 500));
      opts.name = uuid.v4();
      return connectRetry(opts, retryCount + 1);
    }
    if (!isRetriable(err) || retryCount >= 100) {
      throw err;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    return connectRetry(opts, ++retryCount);
  }
}

async function disconnect(publicUrl) {
  if (!ngrokClient) return;
  const tunnels = (await ngrokClient.listTunnels()).tunnels;
  if (!publicUrl) {
    const disconnectAll = tunnels.map(tunnel => disconnect(tunnel.public_url));
    return Promise.all(disconnectAll);
  }
  const tunnelDetails = tunnels.find(tunnel => tunnel.public_url === publicUrl);
  if (!tunnelDetails) {
    throw new Error(`there is no tunnel with url: ${publicUrl}`);
  }
  return ngrokClient.stopTunnel(tunnelDetails.name);
}

async function kill() {
  if (!ngrokClient) return;
  await killProcess();
  ngrokClient = null;
  tunnels = {};
}

function getUrl() {
  return processUrl;
}

function getApi() {
  return ngrokClient;
}

module.exports = {
  connect,
  disconnect,
  authtoken: setAuthtoken,
  kill,
  getUrl,
  getApi,
  getVersion,
  getActiveProcess,
  NgrokClientError,
};
