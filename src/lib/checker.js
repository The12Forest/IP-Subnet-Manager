'use strict';

const net       = require('net');
const ping      = require('ping');
const db        = require('../db/schema');
const config    = require('../config');
const { broadcast } = require('./sseHub');

function tcpCheck(ip, port, timeout) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket
      .connect(port, ip, () => finish('online'))
      .on('error',   () => finish('offline'))
      .on('timeout', () => finish('offline'));
  });
}

const updateStatus = db.prepare(
  "UPDATE hosts SET last_status = ?, last_seen = ? WHERE id = ?"
);
const getHost = db.prepare('SELECT * FROM hosts WHERE id = ?');

async function checkHost(host) {
  if (!host.check_enabled) return host.last_status || 'unknown';

  let newStatus;

  if (host.check_port) {
    newStatus = await tcpCheck(host.ip, host.check_port, config.CHECK_TIMEOUT);
  } else {
    try {
      const result = await ping.promise.probe(host.ip, {
        timeout: Math.ceil(config.CHECK_TIMEOUT / 1000),
      });
      newStatus = result.alive ? 'online' : 'offline';
    } catch {
      // ICMP blocked (no CAP_NET_RAW, Docker without NET_RAW cap, etc.)
      newStatus = 'unknown';
    }
  }

  if (newStatus !== host.last_status) {
    const lastSeen = newStatus === 'online' ? new Date().toISOString() : host.last_seen;
    updateStatus.run(newStatus, lastSeen, host.id);
    broadcast('status_update', { hostId: host.id, ip: host.ip, status: newStatus });
  }

  return newStatus;
}

const checkEnabledHosts  = db.prepare('SELECT * FROM hosts WHERE check_enabled = 1');
const getCheckEnabledSetting = db.prepare("SELECT value FROM settings WHERE key='check_enabled'");

async function startCheckerCycle() {
  // Respect the DB setting so UI toggles take effect without restart
  const row = getCheckEnabledSetting.get();
  if (row && row.value === 'false') return;

  const hosts = checkEnabledHosts.all();
  for (const host of hosts) {
    try {
      await checkHost(host);
    } catch (err) {
      console.error(`[checker] Error checking ${host.ip}:`, err.message);
    }
  }
}

function startChecker() {
  if (!config.CHECK_ENABLED) {
    console.log('[checker] Background checks disabled (CHECK_ENABLED=false)');
    return;
  }

  const intervalMs = config.CHECK_INTERVAL * 1000;
  console.log(`[checker] Starting background checks every ${config.CHECK_INTERVAL}s`);

  // Run once at startup after a short delay
  setTimeout(() => startCheckerCycle().catch(console.error), 5000);

  setInterval(() => startCheckerCycle().catch(console.error), intervalMs);
}

module.exports = { checkHost, startChecker, startCheckerCycle };
