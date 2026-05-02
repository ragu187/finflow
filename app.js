const api = {
  token: localStorage.getItem('hl_token') || '',
  async call(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(opts.headers || {}),
      },
    });
    return res.json();
  },
};

const categories = ['Essentials', 'Groceries', 'Rent', 'Insurance', 'Utilities', 'Transport', 'Health', 'Education', 'Entertainment', 'Savings', 'Other'];
let model = { user: null, families: [], members: [], transactions: [], recurring: [] };

const root = document.querySelector('#dashboardScreen');

init();
async function init() {
  wireAuth();
  if (api.token) {
    const me = await api.call('/api/me');
    if (!me.error) {
      model = me;
      document.querySelector('#authGate').classList.add('hidden');
      document.querySelector('#app').classList.remove('hidden');
      render();
    }
  }
}

function wireAuth() {
  document.querySelector('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = await api.call('/api/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd.entries())) });
    if (r.token) return afterAuth(r.token);
    alert(r.error || 'Login failed');
  });
  document.querySelector('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = await api.call('/api/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd.entries())) });
    if (r.token) return afterAuth(r.token);
    alert(r.error || 'Register failed');
  });
}

async function afterAuth(token) {
  api.token = token;
  localStorage.setItem('hl_token', token);
  model = await api.call('/api/me');
  document.querySelector('#authGate').classList.add('hidden');
  document.querySelector('#app').classList.remove('hidden');
  render();
}

function render() {
  document.querySelector('#monthBadge').textContent = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const activeFamily = model.families[0]?.id || null;
  const month = (n) => { const d = new Date(); d.setMonth(d.getMonth()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const total = (m) => model.transactions.filter(t => t.date.startsWith(m)).reduce((s,t)=>s+Number(t.amount),0);
  const cm=total(month(0)), pm=total(month(-1)), p2=total(month(-2));

  root.innerHTML = `<div class="metrics">
      <article class="card metric"><div class="label">Current Month</div><div class="value">${money(cm)}</div></article>
      <article class="card metric"><div class="label">Previous Month</div><div class="value">${money(pm)}</div></article>
      <article class="card metric"><div class="label">Two Months Ago</div><div class="value">${money(p2)}</div></article>
    </div>
    <article class="card"><h3>Add Expense</h3>
      <form id="txForm" class="form-grid">
        <label>Amount<input type="number" step="0.01" name="amount" required /></label>
        <label>Date<input type="date" name="date" required value="${new Date().toISOString().slice(0,10)}"/></label>
        <label>Category<select name="category">${categories.map(c=>`<option>${c}</option>`).join('')}</select></label>
        <label class="full">Note<input name="note"/></label>
        <button class="full">Save</button>
      </form>
    </article>
    <article class="card"><h3>Invite Family Member</h3>
      <form id="inviteForm" class="form-grid"><label class="full">Email<input name="email" type="email" required/></label><button class="full">Invite to Family</button></form>
    </article>
    <article class="card"><h3>Transactions</h3>${txTable()}</article>
    <article class="card"><h3>Add Recurring</h3>
      <form id="recForm" class="form-grid">
        <label>Name<input name="name" required/></label><label>Amount<input type="number" step="0.01" name="amount" required/></label>
        <label>Category<select name="category">${categories.map(c=>`<option>${c}</option>`).join('')}</select></label>
        <label>Frequency<select name="frequency"><option>daily</option><option>weekly</option><option selected>monthly</option><option>yearly</option></select></label>
        <label>Start date<input name="start_date" type="date" value="${new Date().toISOString().slice(0,10)}"/></label>
        <button class="full">Save recurring</button>
      </form></article>`;

  document.querySelector('#txForm').addEventListener('submit', async (e)=>{
    e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries()); data.amount=Number(data.amount); data.family_id=activeFamily;
    await api.call('/api/transactions',{method:'POST', body:JSON.stringify(data)}); model=await api.call('/api/me'); render();
  });
  document.querySelector('#inviteForm').addEventListener('submit', async (e)=>{e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries()); await api.call('/api/family/invite',{method:'POST', body:JSON.stringify(data)}); alert('Invited (if user exists).'); model=await api.call('/api/me'); render();});
  document.querySelector('#recForm').addEventListener('submit', async (e)=>{e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries()); data.amount=Number(data.amount); data.family_id=activeFamily; await api.call('/api/recurring',{method:'POST', body:JSON.stringify(data)}); model=await api.call('/api/me'); render();});
}

function txTable(){
  const rows=model.transactions.slice(0,25).map(t=>`<tr><td>${t.date}</td><td>${t.category}</td><td>${t.note||'-'}</td><td>${money(t.amount)}</td></tr>`).join('');
  return `<table class="table"><thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No transactions</td></tr>'}</tbody></table>`
}
function money(v){ return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(v||0)); }
