'use strict';

function isValidIPv4(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every(n => parseInt(n, 10) >= 0 && parseInt(n, 10) <= 255);
}

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function intToIp(n) {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8)  & 0xff,
    n          & 0xff,
  ].join('.');
}

function ipInSubnet(ip, network, cidr) {
  const mask = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

function getSubnetRange(network, cidr) {
  const mask    = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
  const netInt  = ipToInt(network) & mask;
  const total   = Math.pow(2, 32 - cidr);
  const first   = intToIp(netInt + 1);
  const last    = intToIp(netInt + total - 2);
  const broadcast = intToIp(netInt + total - 1);
  return { network: intToIp(netInt), first, last, broadcast, total: total - 2 };
}

function getFreeIPs(network, cidr, usedIPs) {
  const usedSet = new Set(usedIPs);
  const mask    = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
  const netInt  = ipToInt(network) & mask;
  const total   = Math.pow(2, 32 - cidr);
  const free    = [];

  // Skip network address (.0) and broadcast (.last)
  for (let i = 1; i < total - 1; i++) {
    const ip = intToIp(netInt + i);
    if (!usedSet.has(ip)) free.push(ip);
  }
  return free;
}

module.exports = { isValidIPv4, ipToInt, intToIp, ipInSubnet, getSubnetRange, getFreeIPs };
