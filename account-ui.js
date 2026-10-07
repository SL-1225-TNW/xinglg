(function (root) {
  'use strict';
  function AccountUI(auth, handlers) {
    this.auth = auth; this.handlers = handlers; this.session = null; this.busy = false;
    this.dialog = document.createElement('dialog'); this.dialog.className = 'account-dialog';
    this.dialog.setAttribute('aria-label', '账号与云存档');
    document.getElementById('app').appendChild(this.dialog);
    var self = this;
    document.getElementById('btnAccount').onclick = function () { self.open(); };
    document.getElementById('bootAccount').onclick = function () { self.open(); };
    this.dialog.addEventListener('close', function () { if (handlers.resume) handlers.resume(); });
  }
  AccountUI.prototype.update = function (session) {
    this.session = session;
    document.getElementById('btnAccount').textContent = session ? '账号' : '登录';
    document.getElementById('bootAccount').textContent = session ? '账号与云存档' : '登录 / 注册';
    document.getElementById('accountLabel').textContent = session ? session.user.email : '游客 · 本机存档';
  };
  AccountUI.prototype.button = function (parent, label, action) {
    var button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.textContent = label;
    button.onclick = action; parent.appendChild(button); return button;
  };
  AccountUI.prototype.open = function () {
    var self = this, dialog = this.dialog;
    dialog.replaceChildren();
    if (this.handlers.pause) this.handlers.pause();
    var title = document.createElement('h2'); title.textContent = '账号与云存档'; dialog.appendChild(title);
    var status = document.createElement('p'); status.setAttribute('role','status'); dialog.appendChild(status);
    function run(action) {
      if (self.busy) return;
      self.busy = true; dialog.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      Promise.resolve().then(action).catch(function (e) { status.textContent = e.message; }).finally(function () {
        self.busy = false; dialog.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
      });
    }
    if (!this.auth.client) {
      status.textContent = '云存档尚未开放。游客进度仍会保存在本机，可以随时导出备份。';
    } else if (this.session) {
      status.textContent = '当前账号：' + this.session.user.email;
      this.button(dialog, '立即同步', function () { run(async function () { await self.handlers.sync(); status.textContent = self.handlers.status(); }); });
      this.button(dialog, '处理存档冲突', function () { dialog.close(); self.handlers.conflict(); });
      this.button(dialog, '查看历史备份', function () { run(async function () {
        var rows = await self.handlers.backups();
        var list = document.createElement('div');
        rows.forEach(function (row) {
          self.button(list, '导出版本 ' + row.revision + ' · ' + new Date(row.updated_at).toLocaleString(), function () { self.handlers.export(row.payload); });
        });
        if (!rows.length) status.textContent = '还没有历史版本。';
        dialog.appendChild(list);
      }); });
      this.button(dialog, '退出登录 / 切换账号', function () { run(async function () { await self.handlers.logout(); dialog.close(); }); });
    } else {
      status.textContent = '邮箱验证码登录；首次使用会自动注册。登录后可在其他设备继续。';
      var form = document.createElement('form'); form.onsubmit = function (e) { e.preventDefault(); };
      function input(label, type, autocomplete) {
        var wrapper = document.createElement('label'); wrapper.textContent = label;
        var control = document.createElement('input'); control.type = type; control.autocomplete = autocomplete;
        control.required = true; wrapper.appendChild(control); form.appendChild(wrapper); return control;
      }
      var email = input('邮箱', 'email', 'email'); email.id = 'accountEmail';
      var code = input('验证码', 'text', 'one-time-code'); code.id = 'accountCode'; code.inputMode = 'numeric'; code.maxLength = 10;
      var send = this.button(form, '发送验证码', function () {
        if (!email.reportValidity()) return;
        run(async function () { await self.auth.sendCode(email.value.trim()); status.textContent = '验证码已发送，请检查收件箱和垃圾邮件。60 秒后可重发。';
          send.dataset.sentAt = String(Date.now()); });
      });
      send.addEventListener('click', function (e) {
        if (Date.now() - Number(send.dataset.sentAt || 0) < 60000) { e.stopImmediatePropagation(); status.textContent = '请稍候再发送验证码。'; }
      }, true);
      this.button(form, '验证并登录', function () {
        if (!email.reportValidity() || !code.reportValidity()) return;
        run(async function () { var session = await self.auth.verify(email.value.trim(), code.value.trim());
          await self.handlers.login(session); dialog.close(); });
      });
      dialog.appendChild(form);
    }
    this.button(dialog, '返回游戏', function () { dialog.close(); });
    if (!dialog.open) dialog.showModal();
  };
  root.MossAccountUI = AccountUI;
}(window));
