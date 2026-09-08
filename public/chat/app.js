(() => {
  const history = [];
  const messages = document.querySelector('#messages');
  const form = document.querySelector('#form');
  const input = document.querySelector('#input');
  const send = document.querySelector('#send');
  const clear = document.querySelector('#clear');
  const provider = document.querySelector('#provider');
  const model = document.querySelector('#model');

  const time = () => new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date());

  function add(role, content) {
    document.querySelector('#empty')?.remove();
    const row = document.createElement('div');
    row.className = `message ${role}`;
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? 'คุณ' : '✦';
    const body = document.createElement('div');
    body.className = 'message-body';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = content;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = time();
    body.append(bubble, meta);
    row.append(avatar, body);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function setLoading(loading) {
    send.disabled = loading;
    input.disabled = loading;
    provider.disabled = loading;
    model.disabled = loading;
    if (!loading) return;
    const row = document.createElement('div');
    row.id = 'typing';
    row.className = 'message assistant';
    row.innerHTML = '<div class="avatar">✦</div><div class="typing" aria-label="กำลังคิด"><i></i><i></i><i></i></div>';
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeLoading() {
    document.querySelector('#typing')?.remove();
  }

  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || send.disabled) return;
    input.value = '';
    resizeInput();
    add('user', message);
    setLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, history, provider: provider.value, model: model.value.trim() || undefined })
      });
      const data = await response.json();
      const reply = data.reply || data.error || 'ไม่พบคำตอบจาก server';
      removeLoading();
      add('assistant', reply);
      history.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
    } catch {
      removeLoading();
      add('assistant', 'เชื่อมต่อ server ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setLoading(false);
      input.focus();
    }
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener('input', resizeInput);
  clear.addEventListener('click', () => {
    history.length = 0;
    messages.innerHTML = '<div id="empty" class="empty"><div><div class="empty-icon">✦</div><h2>เริ่มต้นบทสนทนา</h2><p>พิมพ์ข้อความด้านล่างเพื่อเริ่มคุยกับผู้ช่วย AI</p></div></div>';
    input.focus();
  });
  add('assistant', 'สวัสดีครับ 👋 มีอะไรให้ช่วยวันนี้ไหมครับ');
})();