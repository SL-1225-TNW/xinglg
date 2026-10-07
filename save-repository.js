(function (root) {
  'use strict';
  var SLOT = '00000000-0000-4000-8000-000000000001';
  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function hash(payload) {
    var text = JSON.stringify(payload), n = 2166136261;
    for (var i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
    return (n >>> 0).toString(16); // change fingerprint, not a security primitive
  }
  function LocalSaveRepository(storage) { this.storage = storage; this.userId = null; this.slotId = SLOT; }
  LocalSaveRepository.prototype.key = function (userId) {
    return 'moss-farm-v2:' + (userId || 'guest') + (userId ? ':' + this.slotId : '');
  };
  LocalSaveRepository.prototype.setIdentity = function (id) {
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('无效的账号 ID');
    this.userId = id || null;
  };
  LocalSaveRepository.prototype.read = function () {
    var raw = this.storage.getItem(this.key(this.userId));
    if (!raw) return null;
    try {
      var record = JSON.parse(raw);
      if (record.format !== 1 || !record.payload || record.userId !== this.userId || record.slotId !== this.slotId) throw new Error('invalid record');
      return record;
    } catch (e) { this.backupRaw(raw, 'corrupt'); throw new Error('本地缓存损坏，已保留原始数据'); }
  };
  LocalSaveRepository.prototype.backupRaw = function (raw, reason) {
    var key = this.key(this.userId) + ':backup:' + Date.now() + ':' + uuid();
    this.storage.setItem(key, JSON.stringify({ reason: reason, raw: raw, savedAt: Date.now() }));
    return key;
  };
  LocalSaveRepository.prototype.backup = function (payload, reason) { return this.backupRaw(JSON.stringify(payload), reason); };
  LocalSaveRepository.prototype.write = function (payload, options) {
    options = options || {};
    var previous = this.read();
    if (previous && previous.payload.version > payload.version) throw new Error('请升级游戏后读取此存档');
    var digest = hash(payload);
    var record = { format: 1, userId: this.userId, slotId: this.slotId, payload: payload,
      revision: options.revision !== undefined ? options.revision : (previous ? previous.revision : 0),
      sequence: (previous ? previous.sequence : 0) + 1, hash: digest,
      pending: options.pending !== undefined ? options.pending : !!this.userId, savedAt: payload.savedAt };
    this.storage.setItem(this.key(this.userId), JSON.stringify(record));
    return record;
  };
  LocalSaveRepository.prototype.ack = function (sequence, revision) {
    var record = this.read();
    if (!record) return;
    record.revision = revision;
    if (record.sequence === sequence) record.pending = false;
    this.storage.setItem(this.key(this.userId), JSON.stringify(record));
    return record;
  };
  LocalSaveRepository.prototype.migrateLegacy = function (validate, migrateV1) {
    if (this.userId || this.storage.getItem(this.key(null))) return;
    var raw = this.storage.getItem('moss-farm-v2');
    if (raw) {
      var data;
      try { data = JSON.parse(raw); } catch (e) { this.backupRaw(raw, 'legacy-corrupt'); return; }
      if (validate(data) || data.version > 2) {
        this.backupRaw(raw, 'legacy-migration'); this.write(data, { pending: false }); return;
      }
      this.backupRaw(raw, 'legacy-corrupt');
    }
    var old = this.storage.getItem('moss-farm-v1');
    if (old) {
      var v1;
      try { v1 = JSON.parse(old); } catch (e) { this.backupRaw(old, 'v1-corrupt'); return; }
      if (v1 && (Number.isInteger(v1.day) || v1.plots)) {
        this.backupRaw(old, 'v1-migration');
        var migrated = migrateV1(v1); migrated.savedAt = v1.savedAt || Date.now();
        this.write(migrated, { pending: false });
      }
    }
  };
  root.MossSaves = { LocalSaveRepository: LocalSaveRepository, SLOT: SLOT, uuid: uuid, hash: hash };
  if (typeof module !== 'undefined') module.exports = root.MossSaves;
}(typeof window !== 'undefined' ? window : globalThis));
