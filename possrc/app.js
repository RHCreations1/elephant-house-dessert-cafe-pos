(() => {
  const cfg = window.EHPOS_FIREBASE_CONFIG;
  if (!cfg) { document.body.innerHTML = '<p style="padding:24px">Firebase configuration missing.</p>'; return; }
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  const auth = firebase.auth(), db = firebase.firestore(), fn = firebase.app().functions('asia-south1');
  const $ = s => document.querySelector(s);
  const money = n => 'Rs. ' + Number(n || 0).toFixed(2);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const menus = [
    {id:'kithul-kottu',name:'Kithul Hakuru Mix Ice Cream Kottu',price:200,panel:1,category:'Ice Cream Kottu'},
    {id:'kartha-kottu',name:'Kartha Kolomban Ice Cream Kottu',price:200,panel:1,category:'Ice Cream Kottu'},
    {id:'pineapple-kottu',name:'Pineapple with Chilli Ice Cream Kottu',price:200,panel:1,category:'Ice Cream Kottu'},
    {id:'peni-kottu',name:'Peni Kurumba Ice Cream Kottu',price:200,panel:1,category:'Ice Cream Kottu'},
    {id:'passion-kottu',name:'Passionfruit Ice Cream Kottu',price:200,panel:1,category:'Ice Cream Kottu'},
    {id:'kithul-cup',name:'Kithul Hakuru Mix',price:200,panel:2,category:'Dessert Café Cups'},
    {id:'pineapple-cup',name:'Pineapple with Chilli',price:200,panel:2,category:'Dessert Café Cups'},
    {id:'kartha-cup',name:'Kartha Kolomban',price:200,panel:2,category:'Dessert Café Cups'},
    {id:'peni-cup',name:'Peni Kurumba',price:200,panel:2,category:'Dessert Café Cups'},
    {id:'passion-cup',name:'Passionfruit',price:200,panel:2,category:'Dessert Café Cups'},
    {id:'vanilla-cone',name:'Vanilla Ice Cream',price:150,panel:2,category:'Ice Cream Cones'},
    {id:'chocolate-cone',name:'Chocolate Ice Cream',price:150,panel:2,category:'Ice Cream Cones'},
    {id:'fruitnut-cone',name:'Fruit & Nut Ice Cream',price:150,panel:2,category:'Ice Cream Cones'},
    {id:'strawberry-cone',name:'Strawberry Ice Cream',price:150,panel:2,category:'Ice Cream Cones'}
  ];
  let role = 'cashier', panel = Number(new URLSearchParams(location.search).get('cashier')) === 2 ? 2 : 1;
  const routeRole = new URLSearchParams(location.search).get('role');
  let cart = [], activeTab = 'pos', salesCache = [], stockCache = [], configCache = {};
  const nav = [
    ['pos','New Bill'],['bills','Bills'],['dashboard','Dashboard'],['stock','Stock Balance'],['menu','Menu Settings']
  ];
  function shell() {
    document.body.innerHTML = `
      <header class="top"><div class="brand"><div class="logo">EH</div><div><b>Elephant House</b><small>DESSERT CAFÉ · POINT OF SALE</small></div></div><div class="user"><span id="roleLabel">Connecting…</span><button id="logout" class="ghost">Sign out</button></div></header>
      <div class="layout"><aside class="side"><div class="side-title">WORKSPACE</div><div id="nav"></div><div class="side-foot">Live Firebase database<br><span class="online">● Connected session</span></div></aside><main id="view" class="view"></main></div>
      <div id="toast" class="toast"></div>`;
    $('#logout').onclick = async () => { await auth.signOut(); location.href = location.pathname; };
  }
  function setNav() {
    $('#nav').innerHTML = nav.filter(([id]) => id !== 'menu' || role === 'admin').map(([id,label]) => `<button class="navbtn ${activeTab===id?'active':''}" data-tab="${id}">${label}</button>`).join('') +
      (role !== 'cashier' ? '<button class="navbtn" data-tab="admin">Admin Tools</button>' : '');
    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { activeTab=b.dataset.tab; render(); });
  }
  function toast(s) { const t=$('#toast'); t.textContent=s; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600); }
  async function ensureCashier() { if (!auth.currentUser) await auth.signInAnonymously(); }
  async function loginPrivileged(r) {
    const pin = prompt('Enter ' + r + ' PIN');
    if (!pin) return false;
    try { const res = await fn.httpsCallable('loginWithRolePin')({role:r,pin}); await auth.signOut(); await auth.signInWithCustomToken(res.data.token); role=r; return true; }
    catch(e) { alert(e.message || 'Login failed'); return false; }
  }
  async function boot() {
    if (routeRole === 'admin' || routeRole === 'supervisor') {
      if (!await loginPrivileged(routeRole)) { location.href = location.pathname; return; }
    } else {
      await ensureCashier();
      role='cashier';
    }
    if (role === 'cashier' && ![1,2].includes(panel)) panel=1;
    shell(); $('#roleLabel').textContent = role === 'cashier' ? 'CASHIER ' + panel : role.toUpperCase();
    if (role !== 'cashier') $('#logout').textContent='Sign out';
    listenData(); render();
  }
  function listenData() {
    db.collection('config').doc('menu').onSnapshot(s => { configCache=s.exists?s.data():{}; render(); }, e=>toast(e.message));
    const q = role === 'cashier' ? db.collection('sales').where('cashierUid','==',auth.currentUser.uid) : db.collection('sales').orderBy('createdAt','desc').limit(500);
    q.onSnapshot(s => { salesCache=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); if(activeTab==='bills'||activeTab==='dashboard') render(); }, e=>toast(e.message));
    if (role !== 'cashier') db.collection('stock').onSnapshot(s=>{stockCache=s.docs.map(d=>({id:d.id,...d.data()})); if(activeTab==='stock')render();},e=>toast(e.message));
  }
  function itemEnabled(it) { return configCache[it.id]?.active !== false; }
  function productList() { return menus.filter(x => (role !== 'cashier' || x.panel===panel) && itemEnabled(x)); }
  function render() {
    if (!$('#view')) return; setNav();
    const v=$('#view');
    if(activeTab==='pos') v.innerHTML=posHtml();
    else if(activeTab==='bills') v.innerHTML=billsHtml();
    else if(activeTab==='dashboard') v.innerHTML=dashHtml();
    else if(activeTab==='stock') v.innerHTML=stockHtml();
    else if(activeTab==='menu' && role==='admin') v.innerHTML=menuHtml();
    else if(activeTab==='admin' && role!=='cashier') v.innerHTML=adminHtml();
    else { activeTab='pos'; v.innerHTML=posHtml(); }
    bind();
  }
  function posHtml() {
    const items=productList();
    return `<div class="pagehead"><div><div class="eyebrow">POINT OF SALE</div><h1>New order</h1><p>Choose items and add them to the current bill.</p></div><span class="tag">${role==='cashier'?'Cashier '+panel:role}</span></div>
    <div class="posgrid"><section class="products"><div class="sectionhead"><h2>${panel===1?'Ice Cream Kottu':'Dessert Café Menu'}</h2><span>${items.length} items</span></div><div class="productgrid">${items.map(it=>`<button class="product" data-add="${it.id}"><span class="product-icon">🍨</span><b>${esc(it.name)}</b><strong>${money(it.price)}</strong><small>＋ Add to bill</small></button>`).join('')||'<p>No active items.</p>'}</div></section>
    <section class="cart"><div class="sectionhead"><h2>Current bill</h2><button id="clearCart" class="textbtn">Clear</button></div><div class="cartitems">${cart.length?cart.map((c,i)=>`<div class="cartrow"><div><b>${esc(c.name)}</b><small>${money(c.price)} each</small></div><div class="qty"><button data-dec="${i}">−</button><b>${c.qty}</b><button data-inc="${i}">＋</button></div><strong>${money(c.price*c.qty)}</strong></div>`).join(''):'<div class="empty">Your bill is empty.<br>Add items to get started.</div>'}</div><div class="total"><span>Total</span><b>${money(cart.reduce((s,c)=>s+c.price*c.qty,0))}</b></div><button id="saveBill" class="primary full" ${cart.length?'':'disabled'}>Complete sale</button></section></div>`;
  }
  function billsHtml() { return `<div class="pagehead"><div><div class="eyebrow">TRANSACTIONS</div><h1>Sales & bills</h1><p>${role==='cashier'?'Your sales history':'All cashier transactions'}</p></div><button id="export" class="secondary">Export Excel</button></div><div class="panel"><div class="tablewrap"><table><thead><tr><th>Bill</th><th>Date & time</th><th>Cashier</th><th>Items</th><th>Total</th><th></th></tr></thead><tbody>${salesCache.map(s=>`<tr><td><b>${esc(s.no||s.id.slice(0,8))}</b></td><td>${dateText(s.createdAt)}</td><td>${esc(s.cashierName||'Cashier '+(s.panel||''))}</td><td>${(s.items||[]).map(x=>esc(x.name)+' × '+x.qty).join('<br>')}</td><td><b>${money(s.total)}</b></td><td>${role!=='cashier'?'<button class="smallbtn" data-edit="'+s.id+'">Edit</button> <button class="smallbtn danger" data-delete="'+s.id+'">Delete</button>':''}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No bills yet.</td></tr>'}</tbody></table></div></div>`; }
  function dashHtml() { const total=salesCache.reduce((s,x)=>s+Number(x.total||0),0), count=salesCache.length, today=new Date().toDateString(), todaySales=salesCache.filter(x=>x.createdAt?.toDate?.().toDateString()===today); return `<div class="pagehead"><div><div class="eyebrow">OVERVIEW</div><h1>Live dashboard</h1><p>Sales summary from both cashier panels.</p></div><button id="export" class="secondary">Export Excel</button></div><div class="stats"><div class="stat"><small>Total sales</small><b>${money(total)}</b></div><div class="stat"><small>Number of bills</small><b>${count}</b></div><div class="stat"><small>Today's sales</small><b>${money(todaySales.reduce((s,x)=>s+Number(x.total||0),0))}</b></div><div class="stat"><small>Today's bills</small><b>${todaySales.length}</b></div></div><div class="panel"><h2>Recent sales</h2>${salesCache.slice(0,8).map(s=>`<div class="recent"><span>${esc(s.no||s.id.slice(0,8))} · ${esc(s.cashierName||'Cashier')}</span><b>${money(s.total)}</b></div>`).join('')||'<p class="empty">Sales will appear here in real time.</p>'}</div>`; }
  function stockHtml() { return `<div class="pagehead"><div><div class="eyebrow">INVENTORY</div><h1>Stock balance</h1><p>Enter stock received manually. Sales do not deduct stock.</p></div></div><div class="panel"><div class="inlineform"><input id="stockName" placeholder="Item / tub name"><input id="stockQty" type="number" min="0" placeholder="Quantity received"><button id="addStock" class="primary">Save stock</button></div><div class="tablewrap"><table><thead><tr><th>Item</th><th>Opening / received</th><th>Remaining balance</th><th>Updated</th></tr></thead><tbody>${stockCache.map(s=>`<tr><td>${esc(s.name)}</td><td>${Number(s.received||0)}</td><td><b>${Number(s.balance??s.received??0)}</b></td><td>${dateText(s.updatedAt)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">No stock records.</td></tr>'}</tbody></table></div></div>`; }
  function menuHtml() { return `<div class="pagehead"><div><div class="eyebrow">ADMINISTRATION</div><h1>Menu settings</h1><p>Enable or disable products. Prices are based on the supplied menu.</p></div></div><div class="panel">${menus.map(m=>`<div class="menurow"><div><b>${esc(m.name)}</b><small>${m.category} · ${money(m.price)}</small></div><label class="switch"><input type="checkbox" data-active="${m.id}" ${itemEnabled(m)?'checked':''}><span></span></label></div>`).join('')}</div>`; }
  function adminHtml() { return `<div class="pagehead"><div><div class="eyebrow">CONTROL CENTRE</div><h1>Admin tools</h1><p>Supervisor can manage bills and stock. Admin controls menu and data maintenance.</p></div></div><div class="stats"><div class="stat"><small>Signed-in role</small><b>${role}</b></div><div class="stat"><small>Records loaded</small><b>${salesCache.length}</b></div></div>${role==='admin'?'<div class="panel warning"><h2>Clear sales & stock database</h2><p>A backup is created before records are cleared. This action cannot be undone from the POS.</p><button id="clearDb" class="dangerbtn">Backup and clear data</button></div>':''}`; }
  function dateText(t) { try { return t?.toDate ? t.toDate().toLocaleString() : (t?new Date(t).toLocaleString():'—'); } catch { return '—'; } }
  function bind() {
    document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{const it=menus.find(x=>x.id===b.dataset.add);const found=cart.find(x=>x.id===it.id);if(found)found.qty++;else cart.push({...it,qty:1});render();});
    document.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>{cart[+b.dataset.inc].qty++;render();});
    document.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>{const i=+b.dataset.dec;cart[i].qty--;if(!cart[i].qty)cart.splice(i,1);render();});
    $('#clearCart')?.addEventListener('click',()=>{cart=[];render();});
    $('#saveBill')?.addEventListener('click',saveBill);
    $('#export')?.addEventListener('click',exportExcel);
    $('#addStock')?.addEventListener('click',saveStock);
    document.querySelectorAll('[data-active]').forEach(b=>b.onchange=async()=>{await db.collection('config').doc('menu').set({[b.dataset.active]:{active:b.checked}},{merge:true});});
    document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteBill(b.dataset.delete));
    document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editBill(b.dataset.edit));
    $('#clearDb')?.addEventListener('click',clearDb);
  }
  async function saveBill() {
    if(!cart.length)return;
    const total=cart.reduce((s,c)=>s+c.price*c.qty,0), no='EH-'+Date.now().toString().slice(-8);
    try { await db.collection('sales').add({no,items:cart.map(({id,name,price,qty,category})=>({id,name,price,qty,category})),total,panel:role==='cashier'?panel:0,cashierName:role==='cashier'?'Cashier '+panel:role,cashierUid:auth.currentUser.uid,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdAtLocal:new Date().toISOString()}); cart=[];render();toast('Bill saved successfully'); }
    catch(e){toast('Could not save bill: '+e.message);}
  }
  async function saveStock() { const name=$('#stockName').value.trim(), qty=Number($('#stockQty').value);if(!name||!Number.isFinite(qty)||qty<0)return toast('Enter a valid item and quantity');try{const ref=db.collection('stock').doc(name.toLowerCase().replace(/[^a-z0-9]+/g,'-'));await ref.set({name,received:qty,balance:qty,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:auth.currentUser.uid},{merge:true});toast('Stock updated');render();}catch(e){toast(e.message);} }
  async function deleteBill(id) { if(!confirm('Delete this bill? An audit record will be saved.'))return;const s=salesCache.find(x=>x.id===id);try{await fn.httpsCallable('deleteBill')({billId:id,billNo:s?.no||''});toast('Bill deleted');}catch(e){toast(e.message);} }
  async function editBill(id) { const s=salesCache.find(x=>x.id===id);if(!s)return;const val=prompt('Enter corrected total (Rs.)',String(s.total));if(val===null)return;const n=Number(val);if(!Number.isFinite(n)||n<0)return toast('Invalid total');try{await db.collection('sales').doc(id).update({total:n,editedAt:firebase.firestore.FieldValue.serverTimestamp(),editedBy:auth.currentUser.uid});toast('Bill updated');}catch(e){toast(e.message);} }
  function exportExcel() { if(!window.XLSX)return toast('Excel library unavailable');const rows=salesCache.map(s=>({Bill:s.no||s.id,Date:dateText(s.createdAt),Cashier:s.cashierName||'',Panel:s.panel||'',Items:(s.items||[]).map(x=>x.name+' x '+x.qty).join(', '),Total:s.total||0}));const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Sales');XLSX.writeFile(wb,'Elephant-House-Sales.xlsx'); }
  async function clearDb(){if(!confirm('Create backup and clear ALL sales and stock?'))return;const phrase=prompt('Type CLEAR SALES + STOCK to confirm');if(phrase!=='CLEAR SALES + STOCK')return toast('Confirmation did not match');try{const r=await fn.httpsCallable('adminClearSalesAndStock')({confirmation:phrase});toast('Backup created. Cleared '+r.data.salesDeleted+' sales and '+r.data.stockDeleted+' stock records.');}catch(e){toast(e.message);} }
  boot().catch(e=>{document.body.innerHTML='<p style="padding:24px">Startup error: '+esc(e.message)+'</p>';});
})();