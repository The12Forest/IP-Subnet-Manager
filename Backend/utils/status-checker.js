const net = require('net');
const ping = require('ping');
const db = require('../db');
const config = require('../config');

const checkHostStatus = (host) => {
    return new Promise((resolve) => {
        const updateDb = (status) => {
            const sql = 'UPDATE hosts SET last_status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?';
            db.run(sql, [status, host.id], (err) => {
                if (err) console.error(`Failed to update status for host ${host.id}:`, err);
                resolve({ ...host, last_status: status });
            });
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
                // Ignore "connection refused" as a normal offline state
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
