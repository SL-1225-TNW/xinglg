/* Optional manual cloud saves for Moss Farm. No third-party SDK or CDN. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://sgreogmeysnapfqipfmz.supabase.co';
  var SUPABASE_KEY = 'sb_publishable___r54AYp8AWKzpHXd8jIew_PQ-CLaL0';
  var SLOT_ID = '00000000-0000-4000-8000-000000000001';
  var SESSION_KEY = 'moss-cloud-session';
  var ACTIVE_USER_KEY = 'moss-cloud-user-id';
  var DEVICE_KEY = 'moss-cloud-device-id';
  var PROFILE_PREFIX = 'moss-cloud-profile:';
  var busy = false;
  var message = '';

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function deviceId() {
    var id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = uuid(); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  }
  function session() { return readJson(SESSION_KEY); }
  function userId() { var s = session(); return s && s.user && s.user.id; }
  function profile() { var id = userId(); return id ? readJson(PROFILE_PREFIX + id) : null; }
  function accountSaveKey(id) { return 'moss-farm-v2:user:' + id; }

  async function api(path, options, token) {
    options = options || {};
    var headers = Object.assign({
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json'
    }, options.headers || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    var response = await fetch(SUPABASE_URL + path, Object.assign({}, options, { headers: headers }));
    var body = null;
    var raw = await response.text();
    if (raw) { try { body = JSON.parse(raw); } catch (e) { body = raw; } }
    if (!response.ok) {
      var detail = body && (body.msg || body.message || body.error_description || body.error) || response.statusText;
      throw new Error(String(detail || '请求失败') + '（' + response.status + '）');
    }
    return body;
  }
  async function validSession() {
    var s = session();
    if (!s || !s.refresh_token || !s.user || !s.user.id) return null;
    if (s.expires_at && Date.now() < s.expires_at - 60000 && s.access_token) return s;
    var next = await api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!next || !next.access_token) throw new Error('登录状态已过期，请重新登录。');
    writeJson(SESSION_KEY, next);
    return next;
  }
  async function authorized(path, options) {
    var s = await validSession();
    if (!s) throw new Error('请先登录账号。');
    return api(path, options, s.access_token);
  }
  function activateAccount(s, username) {
    var guest = localStorage.getItem('moss-farm-v2');
    var scoped = accountSaveKey(s.user.id);
    if (!localStorage.getItem(scoped) && guest) {
      try { localStorage.setItem(scoped, guest); } catch (e) {}
    }
    localStorage.setItem(ACTIVE_USER_KEY, s.user.id);
    if (username) writeJson(PROFILE_PREFIX + s.user.id, { username: username });
    if (window.__MOSS__ && window.__MOSS__.saveNow) window.__MOSS__.saveNow();
    location.reload();
  }
  async function lookupProfile(s) {
    var rows = await api('/rest/v1/player_profiles?select=username&user_id=eq.' +
      encodeURIComponent(s.user.id) + '&limit=1', { method: 'GET' }, s.access_token);
    return Array.isArray(rows) && rows.length ? rows[0].username : '';
  }
  async function createProfile(s, username) {
    username = username.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      throw new Error('账号名需为 3–20 位字母、数字或下划线。');
    }
    await api('/rest/v1/player_profiles', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: s.user.id, username: username })
    }, s.access_token);
    writeJson(PROFILE_PREFIX + s.user.id, { username: username });
    return username;
  }
  async function finishAuth(s, username) {
    writeJson(SESSION_KEY, s);
    var actual = username || await lookupProfile(s);
    if (!actual) {
      message = '登录成功。请设置一个唯一账号名后继续。';
      open();
      return;
    }
    activateAccount(s, actual);
  }

  function addField(parent, labelText, type, autocomplete, value) {
    var label = document.createElement('label');
    label.className = 'cloud-field';
    label.appendChild(document.createTextNode(labelText));
    var input = document.createElement('input');
    input.type = type;
    input.autocomplete = autocomplete;
    input.value = value || '';
    input.required = true;
    label.appendChild(input);
    parent.appendChild(label);
    return input;
  }
  function addNote(parent, text, className) {
    var p = document.createElement('p');
    p.className = className || 'muted cloud-note';
    p.textContent = text;
    parent.appendChild(p);
    return p;
  }
  function button(parent, label, callback, kind) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (kind || '');
    b.textContent = label;
    b.disabled = busy;
    b.onclick = callback;
    parent.appendChild(b);
    return b;
  }
  function reportError(error) {
    message = error && error.message ? error.message : String(error);
    open();
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    open();
    try { await action(); }
    catch (e) { message = e.message || String(e); }
    finally { busy = false; open(); }
  }
  function open() {
    if (!window.__MOSS__ || !window.__MOSS__.ui) {
      setTimeout(open, 150);
      return;
    }
    window.__MOSS__.openWindow({
      id: 'cloud-account', kind: 'cloud-account', narrow: true, title: '账号与云存档',
      build: function (body) {
        var uid = userId();
        var s = session();
        var p = profile();
        var active = localStorage.getItem(ACTIVE_USER_KEY);
        if (message) addNote(body, message, 'cloud-message');
        if (busy) addNote(body, '正在处理…', 'muted cloud-note');
        if (s && uid) {
          body.appendChild(elText('div', 'cloud-account-name', p && p.username ? '账号名：' + p.username : '账号已登录'));
          addNote(body, s.user.email || '已登录', 'muted cloud-note');
          if (active !== uid) {
            addNote(body, '这个账号尚未连接当前设备的本地存档。连接后会重载游戏；现有游客存档会复制到账号的本地存档（仅当账号本地存档为空时）。', 'muted cloud-note');
            button(body, '连接此设备', function () {
              run(async function () {
                var fresh = await validSession();
                var name = await lookupProfile(fresh);
                activateAccount(fresh, name);
              });
            }, 'primary');
          } else {
            addNote(body, '游戏仍会自动保存在本设备。需要跨设备时，请手动上传或下载。', 'muted cloud-note');
            button(body, '上传本地存档到云端', function () { run(uploadSave); }, 'primary');
            button(body, '从云端下载并覆盖本地存档', function () { run(downloadSave); });
            button(body, '退出账号', function () {
              run(async function () {
                var current = await validSession();
                try { await api('/auth/v1/logout', { method: 'POST' }, current.access_token); } catch (e) {}
                localStorage.removeItem(SESSION_KEY);
                localStorage.removeItem(ACTIVE_USER_KEY);
                location.reload();
              });
            }, 'ghost');
          }
          if (!p || !p.username) {
            var nameInput = addField(body, '设置唯一账号名（3–20 位字母、数字、下划线）', 'text', 'username');
            button(body, '保存账号名', function () {
              run(async function () {
                if (!nameInput.value.trim()) throw new Error('请输入账号名。');
                var fresh = await validSession();
                var name = await createProfile(fresh, nameInput.value);
                writeJson(PROFILE_PREFIX + fresh.user.id, { username: name });
                activateAccount(fresh, name);
              });
            }, 'primary');
          }
        } else {
          addNote(body, '用邮箱和密码注册或登录；账号名需唯一。关闭 Supabase 的邮箱确认后，不需要配置域名或 SMTP。忘记密码时目前需要重新注册。', 'muted cloud-note');
          var signup = document.createElement('div');
          signup.className = 'cloud-form';
          signup.appendChild(elText('div', 'cloud-section-title', '创建账号'));
          var newName = addField(signup, '唯一账号名', 'text', 'username');
          var newEmail = addField(signup, '邮箱', 'email', 'email');
          var newPassword = addField(signup, '密码（至少 6 位）', 'password', 'new-password');
          button(signup, '注册并连接', function () {
            run(async function () {
              if (newPassword.value.length < 6) throw new Error('密码至少需要 6 位。');
              var result = await api('/auth/v1/signup', {
                method: 'POST',
                body: JSON.stringify({ email: newEmail.value.trim(), password: newPassword.value })
              });
              if (!result || !result.access_token || !result.user) {
                throw new Error('注册请求已发送但没有登录会话。请在 Supabase Authentication 设置中关闭 Confirm email 后再注册。');
              }
              writeJson(SESSION_KEY, result);
              var name = await createProfile(result, newName.value);
              activateAccount(result, name);
            });
          }, 'primary');
          body.appendChild(signup);

          var login = document.createElement('div');
          login.className = 'cloud-form';
          login.appendChild(elText('div', 'cloud-section-title', '已有账号登录'));
          var email = addField(login, '邮箱', 'email', 'email');
          var password = addField(login, '密码', 'password', 'current-password');
          button(login, '登录并连接', function () {
            run(async function () {
              var result = await api('/auth/v1/token?grant_type=password', {
                method: 'POST',
                body: JSON.stringify({ email: email.value.trim(), password: password.value })
              });
              if (!result || !result.access_token || !result.user) throw new Error('登录失败，请检查邮箱和密码。');
              writeJson(SESSION_KEY, result);
              var name = await lookupProfile(result);
              if (!name) {
                message = '该账号还没有账号名，请在下方设置。';
                open();
                return;
              }
              activateAccount(result, name);
            });
          }, 'primary');
          body.appendChild(login);
        }
      }
    });
  }
  function elText(tag, className, text) {
    var n = document.createElement(tag);
    n.className = className;
    n.textContent = text;
    return n;
  }
  async function readCloudSave() {
    var rows = await authorized('/rest/v1/game_saves?select=revision,updated_at,payload,schema_version&slot_id=eq.' +
      encodeURIComponent(SLOT_ID) + '&limit=1', { method: 'GET' });
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }
  async function uploadSave() {
    if (!window.__MOSS__ || !window.__MOSS__.serialize) throw new Error('游戏存档尚未准备好，请稍后再试。');
    var s = await validSession();
    var remote = await readCloudSave();
    var day = window.__MOSS__.serialize().totalDay;
    if (!window.confirm(remote
      ? '云端已有第 ' + (remote.payload && remote.payload.totalDay || '?') + ' 天的存档（版本 ' + remote.revision + '）。确定用本设备第 ' + day + ' 天的存档覆盖吗？'
      : '确定把本设备第 ' + day + ' 天的存档上传到云端吗？')) return;
    var result = await api('/rest/v1/rpc/commit_game_save', {
      method: 'POST',
      body: JSON.stringify({
        p_slot_id: SLOT_ID,
        p_expected_revision: remote ? Number(remote.revision) : 0,
        p_schema_version: 2,
        p_payload: window.__MOSS__.serialize(),
        p_device_id: deviceId(),
        p_mutation_id: uuid()
      })
    }, s.access_token);
    var verify = await readCloudSave();
    if (!verify || !verify.payload) throw new Error('上传请求完成，但未能读取云端结果。请重新打开账号窗口检查。');
    message = '上传完成：第 ' + (verify.payload.totalDay || day) + ' 天 · 云端版本 ' + verify.revision + '。';
  }
  async function downloadSave() {
    var remote = await readCloudSave();
    if (!remote) throw new Error('云端还没有存档。先在有进度的设备上上传一次。');
    if (!remote.payload || remote.schema_version !== 2 || remote.payload.version !== 2) {
      throw new Error('云端存档版本不兼容，未覆盖本地进度。');
    }
    var local = window.__MOSS__ && window.__MOSS__.serialize ? window.__MOSS__.serialize() : null;
    var localDay = local && local.totalDay || 1;
    if (!window.confirm('确定用云端第 ' + (remote.payload.totalDay || '?') + ' 天（版本 ' + remote.revision +
      '）覆盖本设备第 ' + localDay + ' 天的本地存档吗？')) return;
    var ok = window.__MOSS__.replaceSave && window.__MOSS__.replaceSave(remote.payload);
    if (!ok) throw new Error('云端存档无法被当前游戏版本读取，未覆盖本地进度。');
    message = '下载完成：第 ' + (remote.payload.totalDay || '?') + ' 天。';
  }

  window.MossCloud = { open: open, upload: uploadSave, download: downloadSave };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
})();
