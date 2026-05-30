const net = require('net');
const ping = require('ping');
const db = require('../db');
const config = require('../config');

const { sendEvent } = require('./sse');

const checkHostStatus = (host) => {
    return new Promise((resolve) => {
        const oldStatus = host.last_status;

        const updateDb = (newStatus) => {
            // Only update and emit event if status has changed
            if (oldStatus !== newStatus) {
                const sql = 'UPDATE hosts SET last_status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?';
                db.run(sql, [newStatus, host.id], (err) => {
                    if (err) console.error(`Failed to update status for host ${host.id}:`, err);
                    
                    console.log(`Host ${host.ip} status changed: ${oldStatus} -> ${newStatus}`);
                    sendEvent({ type: 'status_update', payload: { hostId: host.id, status: newStatus } });
                    resolve({ ...host, last_status: newStatus });
                });
            } else {
                // Even if status is the same, resolve the promise
                resolve({ ...host, last_status: oldStatus });
            }
        };
        
        if (!host.check_enabled) {
            return updateDb('unknown');
        }

        if (host.check_port) {
            const socket = new net.Socket();
            socket.setTimeout(config.checkTimeout);
            socket.on('connect', () => {
                socket.destroy();
                updateDb('online');
            });
            socket.on('timeout', () => {
                socket.destroy();
                updateDb('offline');
            });
            socket.on('error', (err) => {
                if (err.code !== 'ECONNREFUSED') {
                    console.error(`Socket error for ${host.ip}:${host.check_port}:`, err.message);
                }
                socket.destroy();
                updateDb('offline');
            });
            socket.connect(host.check_port, host.ip);
        } else {
            ping.sys.probe(host.ip, (isAlive) => {
                updateDb(isAlive ? 'online' : 'offline');
            }, { timeout: config.checkTimeout / 1000 });
        }
    });
};

module.exports = { checkHostStatus };
