(function (root) {
  'use strict';
  function SaveCoordinator(local, cloud, hooks) {
    this.local = local; this.cloud = cloud; this.hooks = hooks;
    this.epoch = 0; this.session = null; this.conflict = null; this.blocked = false;
    this.timer = null; this.running = null; this.attempt = 0; this.text = '本地已保存';
    var key = 'moss-save-device';
    this.deviceId = root.MossSaves.uuid();
    try { this.deviceId = local.storage.getItem(key) || this.deviceId; local.storage.setItem(key, this.deviceId); } catch (e) { /* Game still permits in-memory play and export. */ }
  }
  SaveCoordinator.prototype.status = function (text) {
    if (text) { this.text = text; this.hooks.status(text); }
    return this.text;
  };
  SaveCoordinator.prototype.bindingKey = function () { return this.local.key(this.local.userId) + ':binding'; };
  SaveCoordinator.prototype.binding = function () {
    var value = this.local.storage.getItem(this.bindingKey()); return value ? JSON.parse(value) : null;
  };
  SaveCoordinator.prototype.clearBinding = function () { this.local.storage.removeItem(this.bindingKey()); };
  SaveCoordinator.prototype.bind = async function (session, guest) {
    this.epoch++; clearTimeout(this.timer); this.running = null; this.conflict = null; this.blocked = false;
    this.hooks.switchIdentity(session ? session.user.id : null);
    clearTimeout(this.timer);
    this.session = session;
    this.hooks.account(session);
    if (!session) { this.status('本地已保存'); return; }
    if (guest) {
      this.local.backup(guest, 'guest-login');
      this.local.storage.setItem(this.bindingKey(), JSON.stringify(guest));
      if (!this.local.read()) this.local.write(guest, { pending: true, revision: 0 });
    }
    this.hooks.reload();
    await this.sync();
  };
  SaveCoordinator.prototype.saved = function (record) {
    if (!this.session) { this.status('本地已保存'); return; }
    if (this.conflict) { this.status('需要处理冲突 · 本地已保存'); return; }
    if (this.blocked || (record && !record.pending)) return;
    this.status('本地已保存 · 等待同步'); this.schedule(1200);
  };
  SaveCoordinator.prototype.schedule = function (delay) {
    clearTimeout(this.timer);
    var self = this;
    this.timer = setTimeout(function () { self.sync(); }, delay);
  };
  SaveCoordinator.prototype.validate = function (remote) {
    if (!remote) return;
    if (remote.user_id !== this.local.userId || remote.slot_id !== this.local.slotId ||
      !Number.isSafeInteger(remote.revision) || remote.revision < 1 ||
      !remote.payload || remote.schema_version !== remote.payload.version) throw new Error('云存档响应无效，已保留本地进度');
    if (remote.schema_version > this.hooks.version) { this.blocked = true; throw new Error('云存档来自更新版本，请升级游戏；当前本地进度已保留'); }
    if (!this.hooks.validate(remote.payload)) { this.blocked = true; throw new Error('云存档校验失败，已停止云端写入'); }
  };
  SaveCoordinator.prototype.raiseConflict = function (remote) {
    this.conflict = { remote: remote };
    this.status('需要处理冲突 · 本地已保存');
    this.hooks.conflict(this.local.read(), remote, this.binding());
  };
  SaveCoordinator.prototype.adopt = function (remote) {
    this.validate(remote);
    var previous = this.local.read();
    if (previous) this.local.backup(previous.payload, 'before-cloud-load');
    this.local.write(remote.payload, { pending: false, revision: remote.revision });
    this.clearBinding(); this.conflict = null;
    this.hooks.apply(remote.payload); this.status('云端已同步');
  };
  SaveCoordinator.prototype.sync = function () {
    if (!this.session || this.conflict || this.blocked) return Promise.resolve();
    if (this.running) return this.running;
    var self = this, epoch = this.epoch;
    this.running = this.reconcile(epoch).catch(function (e) {
      if (epoch !== self.epoch) return;
      self.status('本地已保存 · ' + e.message);
      if (!self.blocked) self.schedule(Math.min(60000, 2000 * Math.pow(2, self.attempt++)));
    }).finally(function () { if (epoch === self.epoch) self.running = null; });
    return this.running;
  };
  SaveCoordinator.prototype.reconcile = async function (epoch) {
    var local = this.local.read(), userId = this.local.userId;
    if (local && local.payload.version > this.hooks.version) { this.blocked = true; throw new Error('本机存档来自更新版本，请升级游戏'); }
    this.status('正在同步');
    var remote = await this.cloud.read(userId, this.local.slotId);
    if (epoch !== this.epoch) return;
    this.validate(remote);
    this.hooks.flush();
    local = this.local.read();
    var candidate = this.binding();
    if (candidate && remote) { this.raiseConflict(remote); return; }
    if (remote && local && remote.last_mutation_id === local.mutationId) {
      this.local.ack(local.sequence, remote.revision); this.clearBinding(); this.status('云端已同步'); return;
    }
    if (local && local.pending) {
      if ((remote ? remote.revision : 0) !== local.revision) { this.raiseConflict(remote); return; }
      // The snapshot is immutable; newer local sequences remain pending when this upload returns.
      var result = await this.cloud.commit(local, this.deviceId);
      if (epoch !== this.epoch) return;
      this.validate(result.save);
      if (result.status === 'conflict') { this.raiseConflict(result.save); return; }
      if (result.status !== 'ok' || !result.save) throw new Error('云端保存响应无效');
      var acknowledged = this.local.ack(local.sequence, result.save.revision);
      this.clearBinding(); this.attempt = 0;
      this.status(acknowledged.pending ? '本地已保存 · 等待同步' : '云端已同步');
      if (acknowledged.pending) this.schedule(100);
    } else if (remote && (!local || local.revision < remote.revision)) {
      this.adopt(remote);
    } else if (remote && local && local.revision > remote.revision) {
      this.raiseConflict(remote);
    } else if (!remote && local && local.revision > 0) {
      this.raiseConflict(null);
    } else {
      if (!remote) this.clearBinding();
      this.status(remote ? '云端已同步' : '本地已保存 · 新进度将自动上传');
    }
  };
  SaveCoordinator.prototype.resolve = async function (choice) {
    if (!this.conflict || !this.session) return;
    var epoch = this.epoch;
    this.hooks.flush();
    var local = this.local.read();
    var remote = await this.cloud.read(this.local.userId, this.local.slotId);
    if (epoch !== this.epoch) return;
    this.validate(remote);
    this.local.backup(local.payload, 'conflict-local');
    if (remote) this.local.backup(remote.payload, 'conflict-cloud');
    // Never overwrite a cloud revision that changed while the choice was displayed.
    if ((remote ? remote.revision : 0) !== (this.conflict.remote ? this.conflict.remote.revision : 0)) {
      this.raiseConflict(remote); return;
    }
    if (choice === 'cloud') {
      if (!remote) throw new Error('云端没有存档，请选择本机进度');
      this.adopt(remote); return;
    }
    var payload = choice === 'guest' ? this.binding() : local.payload;
    if (!payload || !this.hooks.validate(payload)) throw new Error('本机进度校验失败');
    this.local.write(payload, { pending: true, revision: remote ? remote.revision : 0 });
    this.clearBinding(); this.conflict = null;
    if (choice === 'guest') this.hooks.apply(payload);
    await this.sync();
  };
  root.MossSaves.SaveCoordinator = SaveCoordinator;
}(typeof window !== 'undefined' ? window : globalThis));
