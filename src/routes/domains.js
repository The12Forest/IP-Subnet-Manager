'use strict';

const express     = require('express');
const db          = require('../db/schema');
const audit       = require('../lib/audit');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/admin');

const router = express.Router();

// ── Statements ────────────────────────────────────────────────────────────────
const listDomains = db.prepare(`
  SELECT d.id, d.name, d.description, d.display_subnet_id, d.created_at, d.updated_at,
         s.name  AS display_subnet_name,
         s.color AS display_subnet_color,
         COUNT(dr.id) AS record_count
  FROM domains d
  LEFT JOIN subnets s        ON s.id  = d.display_subnet_id
  LEFT JOIN domain_records dr ON dr.domain_id = d.id
  GROUP BY d.id
  ORDER BY s.display_order ASC, s.name ASC, d.name ASC
`);
const getDomain    = db.prepare('SELECT * FROM domains WHERE id = ?');
const insertDomain = db.prepare(`
  INSERT INTO domains (name, description, display_subnet_id, created_at, updated_at)
  VALUES (?, ?, ?, datetime('now'), datetime('now'))
`);
const updateDomain = db.prepare(`
  UPDATE domains SET name=?, description=?, display_subnet_id=?, updated_at=datetime('now') WHERE id=?
`);
const deleteDomain = db.prepare('DELETE FROM domains WHERE id = ?');

const getRecords    = db.prepare(`
  SELECT dr.id, dr.name, dr.record_type, dr.host_id, dr.value, dr.priority, dr.notes, dr.created_at,
         h.ip AS host_ip, h.name AS host_name, h.last_status
  FROM domain_records dr
  LEFT JOIN hosts h ON h.id = dr.host_id
  WHERE dr.domain_id = ?
  ORDER BY dr.record_type ASC, dr.name ASC
`);
const getRecord    = db.prepare('SELECT * FROM domain_records WHERE id = ?');
const insertRecord = db.prepare(`
  INSERT INTO domain_records (domain_id, name, record_type, host_id, value, priority, notes, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);
const updateRecord = db.prepare(`
  UPDATE domain_records SET name=?, record_type=?, host_id=?, value=?, priority=?, notes=? WHERE id=?
`);
const deleteRecord = db.prepare('DELETE FROM domain_records WHERE id = ?');

// ── Domain routes ─────────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => res.json(listDomains.all()));

router.post('/', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const { name, description, display_subnet_id } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Domain name is required' });
  try {
    const r = insertDomain.run(name.trim(), description || null, display_subnet_id || null);
    const d = getDomain.get(r.lastInsertRowid);
    audit(req.user, 'create', 'domain', d.id, { after: { name: d.name } });
    res.status(201).json(d);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Domain already exists' });
    throw err;
  }
});

router.get('/:id', requireAuth, (req, res) => {
  const d = getDomain.get(parseInt(req.params.id, 10));
  if (!d) return res.status(404).json({ error: 'Domain not found' });
  res.json({ ...d, records: getRecords.all(d.id) });
});

router.put('/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d  = getDomain.get(id);
  if (!d) return res.status(404).json({ error: 'Domain not found' });
  const { name, description, display_subnet_id } = req.body || {};
  try {
    updateDomain.run(name ? name.trim() : d.name, description !== undefined ? description : d.description, display_subnet_id !== undefined ? (display_subnet_id || null) : d.display_subnet_id, id);
    audit(req.user, 'update', 'domain', id, { after: { name: name || d.name } });
    res.json(getDomain.get(id));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Domain already exists' });
    throw err;
  }
});

router.delete('/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d  = getDomain.get(id);
  if (!d) return res.status(404).json({ error: 'Domain not found' });
  deleteDomain.run(id);
  audit(req.user, 'delete', 'domain', id, { before: { name: d.name } });
  res.json({ ok: true });
});

// ── Record routes ─────────────────────────────────────────────────────────────

router.post('/:id/records', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const domainId = parseInt(req.params.id, 10);
  if (!getDomain.get(domainId)) return res.status(404).json({ error: 'Domain not found' });
  const { name = '@', record_type = 'A', host_id, value, priority, notes } = req.body || {};
  const r = insertRecord.run(domainId, name.trim() || '@', record_type, host_id || null, value || null, priority || null, notes || null);
  const record = getRecord.get(r.lastInsertRowid);
  audit(req.user, 'create', 'domain_record', record.id, { domain: domainId, name, record_type });
  res.status(201).json(record);
});

router.put('/:id/records/:recordId', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const recordId = parseInt(req.params.recordId, 10);
  const rec = getRecord.get(recordId);
  if (!rec || rec.domain_id !== parseInt(req.params.id, 10)) return res.status(404).json({ error: 'Record not found' });
  const { name, record_type, host_id, value, priority, notes } = req.body || {};
  updateRecord.run(
    name        !== undefined ? (name.trim() || '@')   : rec.name,
    record_type || rec.record_type,
    host_id     !== undefined ? (host_id || null)      : rec.host_id,
    value       !== undefined ? (value || null)        : rec.value,
    priority    !== undefined ? (priority || null)     : rec.priority,
    notes       !== undefined ? (notes || null)        : rec.notes,
    recordId
  );
  res.json(getRecord.get(recordId));
});

router.delete('/:id/records/:recordId', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const recordId = parseInt(req.params.recordId, 10);
  const rec = getRecord.get(recordId);
  if (!rec || rec.domain_id !== parseInt(req.params.id, 10)) return res.status(404).json({ error: 'Record not found' });
  deleteRecord.run(recordId);
  res.json({ ok: true });
});

module.exports = router;
