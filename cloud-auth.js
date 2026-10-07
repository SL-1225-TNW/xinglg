(function (root) {
  'use strict';
  function checkedConfig(config) {
    if (!config || !config.url || !config.publishableKey) return null;
    var url = new URL(config.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('云服务地址必须为 HTTPS 根地址');
    var key = config.publishableKey;
    if (!key.startsWith('sb_publishable_')) {
      try {
        var claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (claims.role !== 'anon') throw new Error('key');
      } catch (e) { throw new Error('云配置只允许 publishable / anon 公开密钥'); }
    }
    return { url: url.origin, publishableKey: key };
  }
  function AuthService(config) {
    this.config = checkedConfig(config);
    this.client = this.config ? root.MossSupabase.createClient(this.config.url, this.config.publishableKey, {
      auth: { storageKey: 'moss-auth:' + this.config.url, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch: function (url, options) { return fetch(url, Object.assign({}, options, { signal: AbortSignal.timeout(15000) })); } }
    }) : null;
  }
  AuthService.prototype.restore = async function () {
    if (!this.client) return null;
    var result = await this.client.auth.getSession();
    if (result.error) throw result.error;
    return result.data.session;
  };
  AuthService.prototype.sendCode = async function (email) {
    if (!this.client) throw new Error('尚未配置云服务，游客存档可正常使用');
    var result = await this.client.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } });
    if (result.error) throw result.error;
  };
  AuthService.prototype.verify = async function (email, token) {
    var result = await this.client.auth.verifyOtp({ email: email, token: token, type: 'email' });
    if (result.error) throw result.error;
    return result.data.session;
  };
  AuthService.prototype.logout = async function () {
    if (!this.client) return;
    var result = await this.client.auth.signOut({ scope: 'local' });
    if (result.error) throw result.error;
  };
  function CloudSaveRepository(auth) { this.auth = auth; }
  CloudSaveRepository.prototype.request = async function (userId, path, body) {
    var session = await this.auth.restore();
    if (!session || session.user.id !== userId) throw new Error('账号会话已变化，请重新登录');
    var config = this.auth.config;
    var response = await fetch(config.url + '/rest/v1/' + path, {
      method: body ? 'POST' : 'GET',
      headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000)
    });
    var result = await response.json();
    if (!response.ok) throw new Error(result.message || '云端请求失败（' + response.status + '）');
    return result;
  };
  CloudSaveRepository.prototype.read = async function (id, slot) {
    var rows = await this.request(id, 'game_saves?user_id=eq.' + id + '&slot_id=eq.' + slot + '&select=*');
    return rows[0] || null;
  };
  CloudSaveRepository.prototype.commit = function (record, deviceId) {
    return this.request(record.userId, 'rpc/commit_game_save', {
      p_slot_id: record.slotId, p_expected_revision: record.revision,
      p_schema_version: record.payload.version, p_payload: record.payload,
      p_device_id: deviceId, p_mutation_id: record.mutationId
    });
  };
  CloudSaveRepository.prototype.backups = function (id, slot) {
    return this.request(id, 'save_backups?user_id=eq.' + id + '&slot_id=eq.' + slot + '&select=*&order=revision.desc&limit=10');
  };
  root.MossCloud = { AuthService: AuthService, CloudSaveRepository: CloudSaveRepository, checkedConfig: checkedConfig };
}(window));
