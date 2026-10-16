const cfg=window.KIVU_CONFIG||window.DUKA_CONFIG||{};
if(!cfg.SUPABASE_URL || !/^https?:\/\//.test(cfg.SUPABASE_URL)) alert('Check js/config.js: SUPABASE_URL must start with https://');
const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);

let session=null,profile=null,shop=null;
let products=[],sales=[],expenses=[],credits=[],stockPurchases=[],customers=[],employees=[],shifts=[],audits=[],staffInvites=[];
let suppliers=[],supplierPurchases=[],supplierPayments=[];
let shopFeatureFlags={};
let approvalRequests=[],stockAdjustments=[];
let currentShift=null;
let saleCart=[];
let isDukaAdmin=false,platformOverview=null,platformShops=[];

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('en-RW',{maximumFractionDigits:0}).format(Math.round(Number(n)||0))+' RWF';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const day=d=>new Date(d).toISOString().slice(0,10);
const fmt=d=>new Date(d).toLocaleString('en-RW',{dateStyle:'medium',timeStyle:'short'});
const roleLabel=r=>({owner:'Owner',manager:'Manager',cashier:'Cashier',stock_clerk:'Stock Clerk',waiter:'Waiter',kitchen:'Kitchen / Bar Prep'})[r]||r;
const can=(...roles)=>roles.includes(profile?.role);
const normalizeRwPhone=v=>{let p=String(v||'').replace(/[^0-9+]/g,'');if(p.startsWith('07'))p='+250'+p.slice(1);else if(p.startsWith('250'))p='+'+p;return p;};
let loginMode='owner', signupMode='owner';
const staffAuthEmail=phone=>`staff.${normalizeRwPhone(phone).replace(/\D/g,'')}@auth.duka.local`;

/* KIVU SOLUTIONS COMMERCIAL PLANS V4.5
   Database keys stay basic/business/control/pro for backward compatibility. */
const PLAN_CONFIG={
  basic:{label:'Kivu Lite',price:2000,features:['dashboard','sales','inventory','reports','expenses','customers','credit','receipts','expiry']},
  one_time:{label:'Kivu One-Time',price:50000,oneTime:true,features:['dashboard','sales','inventory','reports','customers','receipts','expiry']},
  business:{label:'Kivu Business',price:5000,features:['dashboard','sales','inventory','reports','expenses','customers','credit','receipts','expiry','suppliers','employees','shifts','staff_access','hospitality']},
  control:{label:'Kivu Control',price:10000,features:['dashboard','sales','inventory','reports','expenses','customers','credit','receipts','expiry','suppliers','employees','shifts','staff_access','hospitality','audit','controls']},
  pro:{label:'Kivu Pro',price:20000,features:['dashboard','sales','inventory','reports','expenses','customers','credit','receipts','expiry','suppliers','employees','shifts','staff_access','hospitality','audit','controls','ebm','advanced_analytics','multi_branch','priority_support','api_integrations']}
};
const currentPlan=()=>PLAN_CONFIG[shop?.plan]||PLAN_CONFIG.basic;
const basePlanHasFeature=feature=>planFeatures().includes(feature);
const hasFeature=feature=>{
  if(Object.prototype.hasOwnProperty.call(shopFeatureFlags,feature)) return !!shopFeatureFlags[feature] && basePlanHasFeature(feature);
  return basePlanHasFeature(feature);
};
const planLabel=()=>currentPlan().label;

/* SUBSCRIPTION LIFECYCLE V3.4 */
const SUBSCRIPTION_GRACE_DAYS=3;
const toDate=v=>v?new Date(v):null;
const isFuture=v=>{const d=toDate(v);return d&&!Number.isNaN(d.getTime())&&d>new Date();};
function effectiveSubscriptionStatus(){
  const raw=(shop?.subscription_status||'active').toLowerCase();
  if(raw==='trial') return isFuture(shop?.trial_ends_at)?'trial':'expired';
  if(raw==='cancelled') return 'cancelled';
  if(raw==='suspended') return 'suspended';
  if(raw==='expired') return 'expired';
  if(raw==='grace') return isFuture(shop?.grace_ends_at)?'grace':'expired';
  if(raw==='active'){
    if(!shop?.current_period_end) return 'active';
    if(isFuture(shop.current_period_end)) return 'active';
    if(isFuture(shop.grace_ends_at)) return 'grace';
    return 'expired';
  }
  return raw;
}
const subscriptionAllowsAccess=()=>shop?.plan==='one_time' ? !shop?.platform_suspended : ['trial','active','grace'].includes(effectiveSubscriptionStatus());
const planFeatures=()=>subscriptionAllowsAccess()?currentPlan().features:PLAN_CONFIG.basic.features;
const FEATURE_PLAN={hospitality:'Kivu Business',suppliers:'Kivu Business',employees:'Kivu Business',shifts:'Kivu Business',staff_access:'Kivu Business',audit:'Kivu Control',controls:'Kivu Control',ebm:'Kivu Pro',advanced_analytics:'Kivu Pro',multi_branch:'Kivu Pro',priority_support:'Kivu Pro',api_integrations:'Kivu Pro'};
const PAGE_FEATURE={hospitality:'hospitality',suppliers:'suppliers',employees:'employees',shifts:'shifts',controls:'controls'};
let pendingUpgradePlan='Kivu Business';
function showUpgrade(feature,customMessage){
  pendingUpgradePlan=FEATURE_PLAN[feature]||'a higher';
  const title=$('#upgradeTitle'),message=$('#upgradeMessage'),button=$('#upgradeGoBtn');
  if(title) title.textContent=`Upgrade to ${pendingUpgradePlan}`;
  if(message) message.textContent=customMessage||`This feature is not included in your ${planLabel()} plan. Upgrade to ${pendingUpgradePlan} to use it.`;
  if(button) button.textContent=`View ${pendingUpgradePlan} plan`;
  const dialog=$('#upgradeModal');
  if(dialog?.showModal) dialog.showModal(); else alert(message?.textContent||customMessage||'Upgrade your plan to use this feature.');
}
const requireFeature=(feature,message)=>{
  if(hasFeature(feature)) return true;
  showUpgrade(feature,message);
  return false;
};

$('#todayDate').textContent=new Date().toLocaleDateString('en-RW',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

/* AUTH */
$('#loginTab').onclick=()=>toggleAuth('login');
$('#signupTab').onclick=()=>toggleAuth('signup');
function toggleAuth(mode){
  $('#loginForm').classList.toggle('hidden',mode!=='login');
  $('#signupForm').classList.toggle('hidden',mode!=='signup');
  $('#loginTab').classList.toggle('active',mode==='login');
  $('#signupTab').classList.toggle('active',mode==='signup');
  $('#authMsg').textContent='';
}
function setLoginMode(mode){
  loginMode=mode;
  $('#ownerLoginFields').classList.toggle('hidden',mode!=='owner');
  $('#staffLoginFields').classList.toggle('hidden',mode!=='staff');
  $('#ownerLoginMode').classList.toggle('active',mode==='owner');
  $('#staffLoginMode').classList.toggle('active',mode==='staff');
}
function setSignupMode(mode){
  signupMode=mode;
  $('#ownerSignupFields').classList.toggle('hidden',mode!=='owner');
  $('#staffSignupFields').classList.toggle('hidden',mode!=='staff');
  $('#ownerSignupMode').classList.toggle('active',mode==='owner');
  $('#staffSignupMode').classList.toggle('active',mode==='staff');
}
$('#ownerLoginMode').onclick=()=>setLoginMode('owner');
$('#staffLoginMode').onclick=()=>setLoginMode('staff');
$('#ownerSignupMode').onclick=()=>setSignupMode('owner');
$('#staffSignupMode').onclick=()=>setSignupMode('staff');

$('#loginForm').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  $('#authMsg').textContent='Signing in...';
  let result;
  if(loginMode==='staff'){
    const phone=normalizeRwPhone(f.get('phone')),pin=String(f.get('pin')||'');
    if(!/^\+2507\d{8}$/.test(phone)){ $('#authMsg').textContent='Enter a valid Rwanda phone number, for example 0788 123 456.'; return; }
    if(!/^\d{6}$/.test(pin)){ $('#authMsg').textContent='Staff PIN must be exactly 6 digits.'; return; }
    result=await sb.auth.signInWithPassword({email:staffAuthEmail(phone),password:pin});
  }else{
    result=await sb.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});
  }
  $('#authMsg').textContent=result.error?result.error.message:'';
};

$('#signupForm').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  $('#authMsg').textContent='Creating account...';
  if(signupMode==='staff'){
    const fullName=(f.get('staffFullName')||'').trim(),inviteCode=(f.get('inviteCode')||'').trim().toUpperCase();
    const phone=normalizeRwPhone(f.get('staffPhone')),pin=String(f.get('staffPin')||'');
    if(!fullName||!inviteCode){$('#authMsg').textContent='Full name and invite code are required.';return;}
    if(!/^\+2507\d{8}$/.test(phone)){ $('#authMsg').textContent='Enter a valid Rwanda phone number, for example 0788 123 456.'; return; }
    if(!/^\d{6}$/.test(pin)){ $('#authMsg').textContent='Choose exactly 6 digits for your PIN.'; return; }
    const internalEmail=staffAuthEmail(phone);
    const {data,error}=await sb.auth.signUp({email:internalEmail,password:pin,options:{data:{full_name:fullName,staff_invite_code:inviteCode,staff_phone:phone,login_method:'phone_pin_no_sms'}}});
    if(error){
      const msg=String(error.message||'');
      $('#authMsg').textContent=msg.toLowerCase().includes('already')
        ? 'This phone number already has a staff account. Use Staff / Phone to log in, or ask the owner to reset the account.'
        : msg;
      return;
    }
    if(data.session){$('#authMsg').textContent='Staff account created. Signing in…';return;}
    $('#authMsg').textContent='Staff account was created but automatic sign-in is blocked by Supabase email confirmation. In Supabase Auth settings, turn off Confirm email for this no-SMS staff login setup, then create a fresh test staff account.';
    return;
  }
  const fullName=(f.get('ownerFullName')||'').trim(),shopName=(f.get('shopName')||'').trim();
  if(!fullName||!shopName){$('#authMsg').textContent='Your name and business name are required.';return;}
  const {error}=await sb.auth.signUp({email:f.get('ownerEmail'),password:f.get('ownerPassword'),options:{data:{full_name:fullName,shop_name:shopName}}});
  $('#authMsg').textContent=error?error.message:'Account created. Confirm your email if required, then login.';
};

$('#forgotPasswordBtn')?.addEventListener('click',async()=>{
  if(loginMode!=='owner'){ $('#authMsg').textContent='Staff PINs are reset by the business owner or manager.'; return; }
  const email=($('#loginForm input[name="email"]')?.value||'').trim();
  if(!email){$('#authMsg').textContent='Enter your owner email first, then press Forgot password.';return;}
  const redirectTo=window.location.href.split('#')[0];
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
  $('#authMsg').textContent=error?error.message:'Password reset link sent. Check your email.';
});

sb.auth.onAuthStateChange(async(event,s)=>{
  if(event==='PASSWORD_RECOVERY'){
    const password=prompt('Enter a new Kivu Solutions password (at least 6 characters):');
    if(password&&password.length>=6){const {error}=await sb.auth.updateUser({password});alert(error?error.message:'Password changed successfully. You can continue using Kivu Solutions.');}
  }
});

$('#logoutBtn').onclick=async()=>{await sb.auth.signOut();};
$('#topLogoutBtn').onclick=async()=>{await sb.auth.signOut();};
sb.auth.onAuthStateChange(async(_event,s)=>{session=s;if(s)await enter();else showAuth()});
(async()=>{const {data}=await sb.auth.getSession();session=data.session;if(session)await enter();else showAuth()})();

function showAuth(){
  $('#authScreen').classList.remove('hidden');
  $('#appShell').classList.add('hidden');
}

async function enter(){
  $('#authScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  try{
    await ensureProfileAndShop();
    const subStatus=effectiveSubscriptionStatus();
    if(!subscriptionAllowsAccess()&&profile.role!=='owner') throw new Error(`This business subscription is ${subStatus}. Ask the owner to renew Kivu Solutions access.`);
    if(profile.role!=='owner'&&!hasFeature('staff_access')) throw new Error('This business is on Kivu Lite. Staff access is available from Kivu Business. Ask the owner to upgrade.');
    if(profile.role!=='owner'){
      const {data:emp,error:empErr}=await sb.from('employees').select('active').eq('shop_id',profile.shop_id).eq('user_id',session.user.id).maybeSingle();
      if(empErr) throw empErr;
      if(!emp||emp.active===false) throw new Error('This staff account has been disabled. Ask the owner or manager to reactivate it.');
    }
    const adminCheck=await sb.rpc('is_duka_admin');
    isDukaAdmin=!adminCheck.error&&adminCheck.data===true;
    await load();
    if(isDukaAdmin){
      const [o,s]=await Promise.all([sb.rpc('duka_admin_overview'),sb.rpc('duka_admin_shops')]);
      platformOverview=o.data||null; platformShops=s.data||[];
    }
    applyPermissions();
    render();
  }catch(err){
    console.error(err);
    alert(err.message||'Could not load Kivu Solutions.');
    await sb.auth.signOut();
  }
}

async function ensureProfileAndShop(){
  let {data:p,error:pe}=await sb.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
  if(pe) throw pe;
  if(!p){
    const meta=session.user.user_metadata||{};
    const invite=(meta.staff_invite_code||'').trim();
    if(invite){
      const {error}=await sb.rpc('claim_staff_invite',{p_code:invite,p_full_name:meta.full_name||''});
      if(error) throw error;
    }else{
      const {error}=await sb.rpc('create_owner_shop',{p_shop_name:meta.shop_name||'',p_full_name:meta.full_name||''});
      if(error) throw error;
    }
    const res=await sb.from('profiles').select('*').eq('id',session.user.id).single();
    if(res.error) throw res.error;
    p=res.data;
  }
  profile=p;
  const {data:s,error}=await sb.from('shops').select('*').eq('id',profile.shop_id).single();
  if(error) throw error;
  shop=s;
}

/* NAVIGATION + PERMISSIONS */
const rolePages={
  owner:['dashboard','sales','hospitality','inventory','suppliers','expenses','customers','employees','shifts','controls','reports','subscription','settings','dukaadmin'],
  manager:['dashboard','sales','hospitality','inventory','suppliers','expenses','customers','employees','shifts','controls','reports'],
  cashier:['dashboard','sales','hospitality','customers','shifts'],
  stock_clerk:['dashboard','inventory'],
  waiter:['dashboard','hospitality'],
  kitchen:['hospitality']
};
function applyPermissions(){
  const roleAllowed=rolePages[profile.role]||['dashboard'];
  const allowed=roleAllowed;

  // Plan-locked pages remain visible. Role-restricted pages remain hidden for security.
  $$('.nav').forEach(b=>{
    const page=b.dataset.page;
    const roleCanSee=allowed.includes(page);
    b.classList.toggle('hidden',!roleCanSee);
    const feature=PAGE_FEATURE[page];
    const locked=roleCanSee&&feature&&!hasFeature(feature);
    const simplePlan=['basic','one_time'].includes(shop?.plan);
    if(simplePlan&&locked){ b.classList.add('hidden'); return; }
    b.classList.toggle('plan-locked',!!locked);
    let badge=b.querySelector('.nav-lock');
    if(locked){
      if(!badge){badge=document.createElement('span');badge.className='nav-lock';b.appendChild(badge);}
      badge.textContent=`🔒 ${FEATURE_PLAN[feature]}`;
      b.title=`Upgrade to ${FEATURE_PLAN[feature]} to use ${page}`;
    }else if(badge){badge.remove();b.removeAttribute('title');}
  });
  $$('.owner-only').forEach(x=>x.classList.toggle('hidden',profile.role!=='owner'));
  $$('.owner-manager-only').forEach(x=>x.classList.toggle('hidden',!can('owner','manager')));
  $('#roleBadge').textContent=roleLabel(profile.role);
  $('#dukaAdminNav')?.classList.toggle('hidden',!isDukaAdmin);

  $('#quickSaleBtn').classList.toggle('hidden',!can('owner','manager','cashier'));
  $$('[data-open="saleModal"]').forEach(x=>{x.classList.toggle('hidden',!can('owner','manager','cashier'));if(!x.dataset.cartHook){x.dataset.cartHook='1';x.addEventListener('click',()=>resetSaleCart());}});
  $$('[data-open="expenseModal"]').forEach(x=>x.classList.toggle('hidden',!can('owner','manager')));
  $$('[data-open="stockModal"]').forEach(x=>x.classList.toggle('hidden',!can('owner','manager','stock_clerk')));
  $$('[data-open="productModal"]').forEach(x=>x.classList.toggle('hidden',!can('owner','manager')));
  $$('[data-open="creditModal"]').forEach(x=>x.classList.toggle('hidden',!can('owner','manager','cashier')));
  $$('[data-open="customerModal"]').forEach(x=>x.classList.toggle('hidden',!can('owner','manager','cashier')));
  const creditOption=$('#saleForm select[name="payment"] option[value="Credit"]');
  if(creditOption){creditOption.disabled=!hasFeature('credit');creditOption.hidden=!hasFeature('credit');}
  const saleCustomerSelect=$('#saleForm select[name="customerId"]');
  saleCustomerSelect?.closest('label')?.classList.toggle('hidden',!hasFeature('customers'));
  if(!hasFeature('credit')) $('#saleCustomerWrap')?.classList.add('hidden');

  const hideFinancial=!can('owner','manager');
  $('#profitToday')?.closest('article')?.classList.toggle('hidden',hideFinancial);
  $('#expensesToday')?.closest('article')?.classList.toggle('hidden',hideFinancial);
  $('#stockValue')?.closest('article')?.classList.toggle('hidden',hideFinancial);

  if(profile.role==='stock_clerk'||!hasFeature('shifts')) $('#shiftStatusCard')?.classList.add('hidden');
  else $('#shiftStatusCard')?.classList.remove('hidden');

  const current=$('.page.active')?.id?.replace('page-','')||'dashboard';
  if(!allowed.includes(current)) showPage(allowed[0]||'dashboard');
}

$$('.nav').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
$('#menuBtn').onclick=()=>$('.sidebar').classList.toggle('open');
$('#quickSaleBtn').onclick=()=>{if(!ensureSubscriptionAccess())return;resetSaleCart();$('#saleModal').showModal();};
function ensureSubscriptionAccess(){
  if(subscriptionAllowsAccess()) return true;
  const status=effectiveSubscriptionStatus();
  alert(`Your Kivu Solutions subscription is ${status}. Please open Subscription and renew a plan to continue using business features.`);
  showPage('subscription',true);
  return false;
}
function showPage(name,bypassSubscription=false){
  if(name==='dukaadmin'&&!isDukaAdmin)return;
  if(!(rolePages[profile.role]||[]).includes(name)) return;
  if(!bypassSubscription&&!subscriptionAllowsAccess()&&!['dashboard','subscription','settings','dukaadmin'].includes(name)){ensureSubscriptionAccess();return;}
  const feature=PAGE_FEATURE[name];
  if(feature&&!hasFeature(feature)){showUpgrade(feature);return;}
  $$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  $$('.page').forEach(p=>p.classList.remove('active'));
  $(`#page-${name}`).classList.add('active');
  $('#pageTitle').textContent=name==='dashboard'?'Overview':name[0].toUpperCase()+name.slice(1);
  $('.sidebar').classList.remove('open');
  if(name==='reports')renderReports();
  if(name==='dukaadmin')renderDukaAdmin();
}

const MODAL_FEATURE={creditModal:'credit',customerModal:'customers',staffInviteModal:'employees',openShiftModal:'shifts',closeShiftModal:'shifts'};
$$('[data-open]').forEach(b=>b.addEventListener('click',()=>{
  if(!ensureSubscriptionAccess())return;
  const feature=MODAL_FEATURE[b.dataset.open];
  if(feature&&!requireFeature(feature))return;
  if(b.dataset.open==='purchaseModal'&&!$('#purchaseItems')?.children.length)addPurchaseItemRow();
  document.getElementById(b.dataset.open)?.showModal();
}));
$('#upgradeGoBtn')?.addEventListener('click',()=>{ $('#upgradeModal')?.close(); showPage('subscription',true); });
$$('.cancel-btn').forEach(b=>b.onclick=()=>{const d=b.closest('dialog');d?.querySelector('form')?.reset();d?.close();$('#saleCustomerWrap')?.classList.add('hidden')});
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close()}));

/* DATA */
async function safeQuery(promise){const r=await promise;if(r.error)throw r.error;return r.data||[]}
async function load(){
  const id=shop.id;
  if(!subscriptionAllowsAccess()){
    products=[];sales=[];expenses=[];stockPurchases=[];customers=[];credits=[];employees=[];shifts=[];audits=[];staffInvites=[];suppliers=[];supplierPurchases=[];supplierPayments=[];approvalRequests=[];stockAdjustments=[];currentShift=null;
    return;
  }

  // Core data used by every paid plan. Premium datasets are fetched only when entitled.
  const flagsResult=await sb.from('shop_feature_flags').select('feature_key,enabled').eq('shop_id',id);
  shopFeatureFlags={};
  if(!flagsResult.error) (flagsResult.data||[]).forEach(f=>shopFeatureFlags[f.feature_key]=!!f.enabled);

  [products,sales,expenses,stockPurchases]=await Promise.all([
    safeQuery(sb.from('products').select('*').eq('shop_id',id).order('name')),
    safeQuery(sb.from('sales').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(1000)),
    can('owner','manager') ? safeQuery(sb.from('expenses').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(1000)) : Promise.resolve([]),
    safeQuery(sb.from('stock_purchases').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(1000))
  ]);

  customers=[]; credits=[]; employees=[]; shifts=[]; audits=[]; staffInvites=[]; suppliers=[]; supplierPurchases=[]; supplierPayments=[]; approvalRequests=[]; stockAdjustments=[]; currentShift=null;

  if(hasFeature('suppliers')&&can('owner','manager')){
    [suppliers,supplierPurchases,supplierPayments]=await Promise.all([
      safeQuery(sb.from('suppliers').select('*').eq('shop_id',id).order('name')),
      safeQuery(sb.from('supplier_purchases').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(1000)),
      safeQuery(sb.from('supplier_payments').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(1000))
    ]);
  }

  if(hasFeature('customers')){
    [customers,credits]=await Promise.all([
      safeQuery(sb.from('customers').select('*').eq('shop_id',id).order('name')),
      safeQuery(sb.from('credits').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(1000))
    ]);
  }

  if(hasFeature('employees')){
    employees=await safeQuery(sb.from('employees').select('*').eq('shop_id',id).order('name'));
    if(profile.role==='owner') staffInvites=await safeQuery(sb.from('staff_invites').select('*').eq('shop_id',id).order('created_at',{ascending:false}));
  }

  if(hasFeature('shifts')){
    shifts=await safeQuery(sb.from('shifts').select('*').eq('shop_id',id).order('opened_at',{ascending:false}));
    currentShift=shifts.find(x=>x.status==='open'&&x.user_id===session.user.id)||null;
  }

  if(hasFeature('audit')&&can('owner','manager')){
    audits=await safeQuery(sb.from('audit_logs').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(200));
  }
  if(hasFeature('controls')&&can('owner','manager')){
    [approvalRequests,stockAdjustments]=await Promise.all([
      safeQuery(sb.from('approval_requests').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(200)),
      safeQuery(sb.from('stock_adjustments').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(200))
    ]);
  } else if(hasFeature('hospitality')&&can('owner','manager')){
    approvalRequests=await safeQuery(sb.from('approval_requests').select('*').eq('shop_id',id).eq('request_type','hospitality_complimentary').order('created_at',{ascending:false}).limit(100));
  }
}

async function refresh(){await load();render()}
async function audit(action,entity,details={}){
  const {error}=await sb.from('audit_logs').insert({shop_id:shop.id,user_id:session.user.id,user_name:profile.full_name||session.user.email,action,entity,details});
  if(error)console.warn('Audit log:',error.message);
}

function fill(){
  $$('select[name="productId"]').forEach(s=>s.innerHTML=products.length?products.map(p=>`<option value="${p.id}">${esc(p.name)} — ${p.qty} in stock</option>`).join(''):'<option value="">No products</option>');
  $$('select[name="customerId"]').forEach(s=>s.innerHTML=`<option value="">${s.closest('#saleForm')?'Walk-in customer':'Select customer'}</option>`+customers.filter(c=>c.active!==false).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join(''));
  $$('select[name="supplierId"]').forEach(sel=>{const current=sel.value;sel.innerHTML='<option value="">Choose supplier</option>'+suppliers.filter(x=>x.active!==false).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')+'<option value="__new__">＋ Add new supplier here</option>';if(current==='__new__'||(current&&suppliers.some(x=>x.id===current)))sel.value=current;});
  $$('select[name="preferredSupplierId"]').forEach(sel=>{const current=sel.value;sel.innerHTML='<option value="">None</option>'+suppliers.filter(x=>x.active!==false).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');if(current&&suppliers.some(x=>x.id===current))sel.value=current;});
  refreshPurchaseItemOptions();
  refreshSaleUnitOptions();
}
const customerName=id=>customers.find(c=>c.id===id)?.name||'';
function baseUnitLabel(p){return (p?.base_unit||'Piece').trim()||'Piece';}
function bulkUnitLabel(p){return (p?.bulk_unit||'Carton').trim()||'Carton';}
function unitsPerBulk(p){const n=Number(p?.units_per_bulk||1);return n>0?n:1;}
function stockDisplay(p){
  const qty=Number(p?.qty||0),u=baseUnitLabel(p),ratio=unitsPerBulk(p),bulk=bulkUnitLabel(p);
  if(ratio>1) return `${qty} ${esc(u)}${qty===1?'':'s'} <small>(${(qty/ratio).toFixed(2)} ${esc(bulk)})</small>`;
  return `${qty} ${esc(u)}${qty===1?'':'s'}`;
}
function refreshSaleUnitOptions(){
  const form=$('#saleForm'); if(!form)return; const p=products.find(x=>x.id===form.elements.productId.value); if(!p)return;
  const sel=form.elements.saleUnit, ratio=unitsPerBulk(p);
  sel.innerHTML=`<option value="base">${esc(baseUnitLabel(p))}</option>`+(ratio>1?`<option value="bulk">${esc(bulkUnitLabel(p))} (${ratio} ${esc(baseUnitLabel(p))})</option>`:'');
}


$('#stockAdjustBtn')?.addEventListener('click',()=>{
  if(!ensureSubscriptionAccess())return;
  if(!requireFeature('controls','Controlled stock adjustments are included in Kivu Control.'))return;
  if(!can('owner','manager','stock_clerk'))return alert('You do not have permission to adjust stock.');
  $('#stockAdjustModal')?.showModal();
});

window.openVoidSale=id=>{
  if(!requireFeature('controls','Voided-sale controls are included in Kivu Control.'))return;
  const s=sales.find(x=>x.id===id);
  if(!s||s.status==='voided')return;
  const f=$('#voidSaleForm');f.elements.saleId.value=id;
  $('#voidSaleSummary').innerHTML=`<b>${esc(s.receipt_no||'Sale')}</b><br>${esc(s.product_name)} · ${money(s.total)} · ${esc(s.employee_name||'User')}`;
  $('#voidSaleModal').showModal();
};

window.reviewApproval=async(id,decision)=>{
  if(!can('owner','manager'))return;
  const {error}=await sb.rpc('review_control_request',{p_request_id:id,p_decision:decision});
  if(error)return alert(error.message);
  await refresh();
};

$('#voidSaleForm').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target);
  const {data,error}=await sb.rpc('request_or_void_sale',{p_sale_id:f.get('saleId'),p_reason:(f.get('reason')||'').trim()});
  if(error)return alert(error.message);
  alert(data==='voided'?'Sale voided and stock restored.':'Void request sent for approval.');
  e.target.reset();$('#voidSaleModal').close();await refresh();
};

$('#stockAdjustForm').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target);
  const {data,error}=await sb.rpc('request_or_adjust_stock',{p_product_id:f.get('productId'),p_qty_delta:+f.get('qtyDelta'),p_reason:(f.get('reasonType')||'Other')+': '+(f.get('note')||'').trim()});
  if(error)return alert(error.message);
  alert(data==='applied'?'Stock adjusted and logged.':'Stock adjustment sent for approval.');
  e.target.reset();$('#stockAdjustModal').close();await refresh();
};

/* PRODUCTS + STOCK */
$('#productForm').onsubmit=async e=>{
  e.preventDefault();
  if(!can('owner','manager'))return alert('You do not have permission to create products.');
  const f=new FormData(e.target),p={shop_id:shop.id,name:(f.get('name')||'').trim(),qty:+f.get('qty'),cost:+f.get('cost'),price:+f.get('price'),low_stock:+f.get('low'),preferred_supplier_id:f.get('preferredSupplierId')||null,base_unit:(f.get('baseUnit')||'Piece').trim(),bulk_unit:(f.get('bulkUnit')||'Carton').trim(),units_per_bulk:+f.get('unitsPerBulk')||1,expiry_date:f.get('expiryDate')||null,expiry_reminder_days:+f.get('expiryReminderDays')||14,barcode:(f.get('barcode')||'').trim()||null};
  const {error}=await sb.from('products').insert(p);if(error)return alert(error.message);
  await audit('created product','product',{name:p.name});e.target.reset();$('#productModal').close();await refresh();
};

$('#stockForm').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target),productId=f.get('productId');
  const {error}=await sb.rpc('receive_stock',{p_product_id:productId,p_qty:+f.get('qty'),p_total_cost:+f.get('totalCost')});
  if(error)return alert(error.message);
  e.target.reset();$('#stockModal').close();await refresh();
};

window.openEditProduct=function(id){
  if(!can('owner','manager'))return alert('Only an owner or manager can edit products.');
  const p=products.find(x=>x.id===id);if(!p)return alert('Product not found.');
  const form=$('#editProductForm');
  form.elements.productId.value=p.id;
  form.elements.name.value=p.name||'';
  if(form.elements.barcode) form.elements.barcode.value=p.barcode||'';
  form.elements.price.value=Number(p.price||0);
  form.elements.low.value=Number(p.low_stock||0);
  form.elements.cost.value=Number(p.cost||0);
  form.elements.qtyDisplay.value=Number(p.qty||0);
  form.elements.baseUnit.value=baseUnitLabel(p);
  form.elements.bulkUnit.value=bulkUnitLabel(p);
  form.elements.unitsPerBulk.value=unitsPerBulk(p);
  const supplierSelect=form.elements.preferredSupplierId;
  supplierSelect.innerHTML='<option value="">None</option>'+suppliers.filter(x=>x.active!==false).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  supplierSelect.value=p.preferred_supplier_id||'';
  if(form.elements.expiryDate) form.elements.expiryDate.value=p.expiry_date||'';
  if(form.elements.expiryReminderDays) form.elements.expiryReminderDays.value=p.expiry_reminder_days||14;
  $('#editProductModal').showModal();
};

$('#editProductForm').onsubmit=async e=>{
  e.preventDefault();
  if(!can('owner','manager'))return alert('Only an owner or manager can edit products.');
  if(!ensureSubscriptionAccess())return;
  const f=new FormData(e.target);
  const {error}=await sb.rpc('update_product_details_v44',{
    p_product_id:f.get('productId'),p_name:(f.get('name')||'').trim(),p_price:+f.get('price'),p_low_stock:+f.get('low'),
    p_preferred_supplier_id:f.get('preferredSupplierId')||null,p_cost:+f.get('cost'),
    p_base_unit:(f.get('baseUnit')||'Piece').trim(),p_bulk_unit:(f.get('bulkUnit')||'Carton').trim(),p_units_per_bulk:+f.get('unitsPerBulk')||1,
    p_expiry_date:f.get('expiryDate')||null,p_expiry_reminder_days:+f.get('expiryReminderDays')||14
  });
  if(error)return alert(error.message);
  const barcodeResult=await sb.rpc('update_product_barcode',{p_product_id:f.get('productId'),p_barcode:(f.get('barcode')||'').trim()||null});
  if(barcodeResult.error)return alert(barcodeResult.error.message);
  $('#editProductModal').close();
  await refresh();
};

/* SUPPLIERS + PURCHASES + SUPPLIER DEBTS V3.6 */
function supplierName(id){return suppliers.find(x=>x.id===id)?.name||'Supplier';}
function supplierBalance(id){return supplierPurchases.filter(x=>x.supplier_id===id).reduce((a,x)=>a+Number(x.balance_due||0),0);}
function addPurchaseItemRow(){
  const wrap=$('#purchaseItems');if(!wrap)return;
  const row=document.createElement('div');row.className='purchase-item-row form-grid';
  row.innerHTML=`<label>Product<div class="barcode-select-row"><select name="purchaseProductId" required></select><button type="button" class="btn secondary barcode-scan-btn scan-purchase-product">📷 Scan</button></div></label><label>Qty bought<input name="purchaseQty" type="number" min="0.001" step="0.001" value="1" required></label><label>Buy as<select name="purchaseUnitMode"><option value="base">Base unit</option><option value="bulk">Bulk unit</option></select></label><label>Cost per selected unit<input name="purchaseUnitCost" type="number" min="0" step="0.01" required></label><label>Expiry date <small>(optional)</small><input name="purchaseExpiryDate" type="date"></label><label>Line total<div class="inline-total"><strong class="purchase-line-total">0 RWF</strong><button type="button" class="btn ghost remove-purchase-item">Remove</button></div></label>`;
  wrap.appendChild(row);
  row.querySelector('.remove-purchase-item').onclick=()=>{if(wrap.children.length>1)row.remove();updatePurchaseTotal();};
  row.querySelector('.scan-purchase-product')?.addEventListener('click',async()=>{const code=await window.KivuCameraScanner?.open('Scan product to receive');if(!code)return;const p=findProductByBarcode(code);if(!p)return alert('No product matches that barcode. Register the barcode in Inventory first.');const sel=row.querySelector('[name="purchaseProductId"]');sel.value=p.id;sel.dispatchEvent(new Event('change',{bubbles:true}));row.querySelector('[name="purchaseQty"]')?.focus();});
  row.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',updatePurchaseTotal));
  row.querySelector('[name="purchaseProductId"]').addEventListener('change',()=>{refreshPurchaseItemOptions();updatePurchaseTotal();});
  refreshPurchaseItemOptions();updatePurchaseTotal();
}
function refreshPurchaseItemOptions(){
  $$('#purchaseItems select[name="purchaseProductId"]').forEach(sel=>{const current=sel.value;sel.innerHTML=products.length?products.map(p=>`<option value="${p.id}">${esc(p.name)} — ${p.qty} ${esc(baseUnitLabel(p))} in stock</option>`).join(''):'<option value="">Add products first</option>';if(current&&products.some(p=>p.id===current))sel.value=current;const row=sel.closest('.purchase-item-row'),mode=row?.querySelector('[name="purchaseUnitMode"]');if(mode){const pr=products.find(p=>p.id===sel.value);const r=unitsPerBulk(pr);mode.innerHTML=`<option value="base">${esc(baseUnitLabel(pr))}</option>`+(r>1?`<option value="bulk">${esc(bulkUnitLabel(pr))} (${r} ${esc(baseUnitLabel(pr))})</option>`:'');}});
}
function purchaseItemsFromForm(){return $$('#purchaseItems .purchase-item-row').map(row=>({product_id:row.querySelector('[name="purchaseProductId"]').value,entered_qty:+row.querySelector('[name="purchaseQty"]').value,unit_mode:row.querySelector('[name="purchaseUnitMode"]').value,entered_unit_cost:+row.querySelector('[name="purchaseUnitCost"]').value,expiry_date:row.querySelector('[name="purchaseExpiryDate"]')?.value||null}));}

function updatePurchaseTotal(){
  let total=0;$$('#purchaseItems .purchase-item-row').forEach(row=>{const qty=+row.querySelector('[name="purchaseQty"]').value||0,cost=+row.querySelector('[name="purchaseUnitCost"]').value||0,line=qty*cost;total+=line;const el=row.querySelector('.purchase-line-total');if(el)el.textContent=money(line);});
  if($('#purchaseTotalPreview'))$('#purchaseTotalPreview').textContent=money(total);return total;
}
$('#addPurchaseItemBtn')?.addEventListener('click',addPurchaseItemRow);
function toggleInlineSupplier(){
  const sel=$('#purchaseForm select[name="supplierId"]'),box=$('#inlineSupplierFields');
  if(box) box.classList.toggle('hidden',sel?.value!=='__new__');
}
$('#purchaseForm select[name="supplierId"]')?.addEventListener('change',toggleInlineSupplier);

$('#supplierForm').onsubmit=async e=>{
  e.preventDefault();if(!can('owner','manager'))return alert('Only an owner or manager can manage suppliers.');if(!ensureSubscriptionAccess())return;
  const f=new FormData(e.target);
  const {error}=await sb.from('suppliers').insert({shop_id:shop.id,name:(f.get('name')||'').trim(),phone:(f.get('phone')||'').trim()||null,address:(f.get('address')||'').trim()||null,notes:(f.get('notes')||'').trim()||null});
  if(error)return alert(error.message);await audit('created supplier','supplier',{name:f.get('name')});e.target.reset();$('#supplierModal').close();await refresh();
};
$('#purchaseForm').onsubmit=async e=>{
  e.preventDefault();if(!can('owner','manager'))return alert('Only an owner or manager can record supplier purchases.');if(!ensureSubscriptionAccess())return;
  const f=new FormData(e.target),items=purchaseItemsFromForm(),total=updatePurchaseTotal(),paid=+f.get('amountPaid')||0;
  if(!items.length||items.some(x=>!x.product_id||x.entered_qty<=0||x.entered_unit_cost<0))return alert('Check every purchase item.');if(total<=0)return alert('Purchase total must be greater than zero.');if(paid<0||paid>total)return alert('Amount paid cannot be greater than the purchase total.');
  let supplierId=f.get('supplierId');
  if(supplierId==='__new__'){
    const name=(f.get('newSupplierName')||'').trim();if(!name)return alert('Enter the new supplier name.');
    const ins=await sb.from('suppliers').insert({shop_id:shop.id,name,phone:(f.get('newSupplierPhone')||'').trim()||null,address:(f.get('newSupplierAddress')||'').trim()||null}).select('id').single();
    if(ins.error)return alert(ins.error.message);supplierId=ins.data.id;
  }
  if(!supplierId)return alert('Choose a supplier or add a new supplier.');
  const {data,error}=await sb.rpc('record_supplier_purchase_v44',{p_supplier_id:supplierId,p_items:items,p_amount_paid:paid,p_payment_method:f.get('paymentMethod'),p_invoice_no:(f.get('invoiceNo')||'').trim()||null,p_due_date:f.get('dueDate')||null,p_note:(f.get('note')||'').trim()||null});
  if(error)return alert(error.message);e.target.reset();$('#inlineSupplierFields')?.classList.add('hidden');$('#purchaseItems').innerHTML='';addPurchaseItemRow();$('#purchaseModal').close();await refresh();alert(`Purchase saved. Inventory increased automatically${data?.new_stock_total!==undefined?` by ${data.new_stock_total} base unit(s)`:''}.`);
};
window.openSupplierPayment=id=>{
  const supplier=suppliers.find(x=>x.id===id),balance=supplierBalance(id);if(!supplier||balance<=0)return;const form=$('#supplierPaymentForm');form.reset();form.elements.supplierId.value=id;form.elements.amount.max=String(balance);$('#supplierPaymentSummary').innerHTML=`<b>${esc(supplier.name)}</b><br>Outstanding debt: <b>${money(balance)}</b>`;$('#supplierPaymentModal').showModal();
};
$('#supplierPaymentForm').onsubmit=async e=>{
  e.preventDefault();if(!can('owner','manager'))return;const f=new FormData(e.target),amount=+f.get('amount');
  const {error}=await sb.rpc('record_supplier_payment',{p_supplier_id:f.get('supplierId'),p_amount:amount,p_payment_method:f.get('paymentMethod'),p_note:(f.get('note')||'').trim()||null});
  if(error)return alert(error.message);e.target.reset();$('#supplierPaymentModal').close();await refresh();
};

/* CUSTOMERS + CREDIT */
$('#customerForm').onsubmit=async e=>{
  e.preventDefault();
  if(!requireFeature('customers','Customers are included in Kivu Lite.'))return;
  const f=new FormData(e.target);
  const {error}=await sb.from('customers').insert({shop_id:shop.id,name:f.get('name'),phone:f.get('phone')||null,email:f.get('email')||null});
  if(error)return alert(error.message);
  await audit('created customer','customer',{name:f.get('name')});e.target.reset();$('#customerModal').close();await refresh();
};

$('#creditForm').onsubmit=async e=>{
  e.preventDefault();
  if(!requireFeature('credit','Customer credit is included in Kivu Lite.'))return;
  const f=new FormData(e.target),cid=f.get('customerId')||null,name=customerName(cid)||(f.get('customer')||'').trim();
  if(!name)return alert('Select or enter a customer.');
  const {error}=await sb.from('credits').insert({shop_id:shop.id,customer_id:cid,customer:name,amount:+f.get('amount'),due_date:f.get('dueDate')||null,note:f.get('note')||null,paid:false});
  if(error)return alert(error.message);
  await audit('added credit','credit',{customer:name,amount:+f.get('amount')});e.target.reset();$('#creditModal').close();await refresh();
};
window.markPaid=async id=>{
  if(!can('owner','manager'))return alert('Only an owner or manager can mark credit as paid.');
  const c=credits.find(x=>x.id===id);
  const {error}=await sb.from('credits').update({paid:true,paid_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);
  await audit('marked credit paid','credit',{customer:c?.customer});await refresh();
};

/* MULTI-PRODUCT SALES V4.5 */
function saleLinePreview(item){
  const p=products.find(x=>x.id===item.product_id); if(!p)return 0;
  const ratio=item.unit_mode==='bulk'?unitsPerBulk(p):1;
  return Number(p.price||0)*Number(item.entered_qty||0)*ratio;
}
function renderSaleCart(){
  const box=$('#saleCart'),empty=$('#saleCartEmpty'); if(!box)return;
  empty?.classList.toggle('hidden',saleCart.length>0);
  box.innerHTML=saleCart.map((item,i)=>{const p=products.find(x=>x.id===item.product_id);if(!p)return'';const unit=item.unit_mode==='bulk'?(p.bulk_unit||'Bulk'):(p.base_unit||'Piece');return `<div class="sale-cart-row"><div><b>${esc(p.name)}</b><small>${item.entered_qty} ${esc(unit)} × ${money(item.unit_mode==='bulk'?Number(p.price||0)*unitsPerBulk(p):p.price)}</small></div><strong>${money(saleLinePreview(item))}</strong><button type="button" class="btn ghost sale-cart-remove" onclick="removeSaleCartItem(${i})">Remove</button></div>`}).join('');
  const subtotal=saleCart.reduce((a,x)=>a+saleLinePreview(x),0),discount=Math.max(0,Number($('#saleForm input[name="discount"]')?.value||0));
  if($('#saleCartSubtotal'))$('#saleCartSubtotal').textContent=money(subtotal);
  if($('#saleCartTotal'))$('#saleCartTotal').textContent=money(Math.max(0,subtotal-discount));
}
window.removeSaleCartItem=i=>{saleCart.splice(i,1);renderSaleCart();};
function resetSaleCart(){saleCart=[];renderSaleCart();}
$('#saleForm select[name="payment"]').onchange=e=>$('#saleCustomerWrap').classList.toggle('hidden',e.target.value!=='Credit');
$('#saleForm select[name="productId"]')?.addEventListener('change',refreshSaleUnitOptions);
$('#saleForm input[name="discount"]')?.addEventListener('input',renderSaleCart);
$('#addSaleItemBtn')?.addEventListener('click',()=>{
  const f=$('#saleForm'),pid=f.elements.productId.value,qty=Number(f.elements.qty.value),mode=f.elements.saleUnit.value||'base',p=products.find(x=>x.id===pid);
  if(!p)return alert('Select a product.'); if(!qty||qty<=0)return alert('Enter a quantity greater than zero.');
  const ratio=mode==='bulk'?unitsPerBulk(p):1,baseQty=qty*ratio;
  const already=saleCart.filter(x=>x.product_id===pid).reduce((a,x)=>a+Number(x.entered_qty)*(x.unit_mode==='bulk'?unitsPerBulk(p):1),0);
  if(baseQty+already>Number(p.qty||0))return alert(`Not enough stock. Available: ${p.qty} ${p.base_unit||'unit(s)'}.`);
  const same=saleCart.find(x=>x.product_id===pid&&x.unit_mode===mode); if(same)same.entered_qty+=qty; else saleCart.push({product_id:pid,entered_qty:qty,unit_mode:mode});
  f.elements.qty.value='1';renderSaleCart();
});
$('#saleForm').onsubmit=async e=>{
  e.preventDefault(); if(!saleCart.length)return alert('Add at least one product to the cart.');
  const f=new FormData(e.target),cid=f.get('customerId')||null,name=customerName(cid)||(f.get('customerName')||'').trim()||null,payment=f.get('payment'),discount=+f.get('discount')||0;
  if(payment==='Credit'&&!cid&&!name)return alert('Select or enter a customer for a credit sale.');
  const payload={items:saleCart.map(x=>({...x})),payment,discount,customer_id:cid,customer_name:name,client_ref:window.KivuOffline?.newClientRef?.()||crypto.randomUUID()};
  if(!navigator.onLine){
    if(!window.KivuOffline)return alert('Offline queue is not available. Reconnect before recording this sale.');
    await window.KivuOffline.enqueueSale({shop_id:shop.id,user_id:session.user.id,...payload});
    applyOfflineStockDraft(payload.items);
    e.target.reset();resetSaleCart();$('#saleCustomerWrap').classList.add('hidden');$('#saleModal').close();saveOfflineSnapshot();await updateConnectivityUI();
    alert('Sale saved safely on this device. It will sync when internet returns. A final receipt will be issued after server stock validation.');
    return;
  }
  const {data:receiptNo,error}=await sb.rpc('record_sale_cart_v48',{p_items:payload.items,p_payment:payment,p_discount:discount,p_customer_id:cid,p_customer_name:name,p_client_ref:payload.client_ref});
  if(error)return alert(error.message);
  const {data:lines,error:se}=await sb.from('sales').select('*').eq('shop_id',shop.id).eq('receipt_no',receiptNo).order('created_at',{ascending:true});
  if(se)return alert(se.message);
  e.target.reset();resetSaleCart();$('#saleCustomerWrap').classList.add('hidden');$('#saleModal').close();await refresh();showReceiptGroup(lines||[]);
};

/* EXPENSES V3.5.1 — owner/manager only */
$('#expenseForm').onsubmit=async e=>{
  e.preventDefault();
  if(!can('owner','manager'))return alert('Only an owner or manager can record expenses.');
  if(!ensureSubscriptionAccess())return;
  const f=new FormData(e.target);
  const {data:expenseId,error}=await sb.rpc('record_expense',{p_description:(f.get('description')||'').trim(),p_amount:+f.get('amount'),p_category:f.get('category')||'Other'});
  if(error)return alert(error.message);
  e.target.reset();$('#expenseModal').close();await refresh();
};

/* STAFF INVITES */
$('#staffInviteForm').onsubmit=async e=>{
  e.preventDefault();
  if(profile.role!=='owner')return alert('Only the owner can invite staff.');
  if(!requireFeature('employees','Staff accounts are included from Kivu Business.'))return;
  const f=new FormData(e.target);
  const phone=normalizeRwPhone(f.get('phone'));
  if(!/^\+2507\d{8}$/.test(phone))return alert('Enter a valid Rwanda phone number, for example 0788 123 456.');
  const {data:code,error}=await sb.rpc('create_staff_invite',{p_employee_name:f.get('name'),p_phone:phone,p_role:f.get('role')});
  if(error)return alert(error.message);
  e.target.reset();$('#staffInviteModal').close();await refresh();
  alert(`Staff invite created.\n\nInvite code: ${code}\nPhone: ${phone}\n\nThe employee should choose Join as staff, enter this code and phone number, then create a 6-digit PIN. The invite expires in 14 days.`);
};

/* SHIFTS */
$('#openShiftBtn').onclick=()=>{if(!requireFeature('shifts','Shift management is included from Kivu Business.'))return;currentShift?alert('You already have an open shift.'):$('#openShiftModal').showModal()};
$('#openShiftForm').onsubmit=async e=>{
  e.preventDefault();
  if(!can('owner','manager','cashier'))return alert('Your role does not use cash shifts.');
  if(!requireFeature('shifts','Shift management is included from Kivu Business.'))return;
  const f=new FormData(e.target);
  const {error}=await sb.from('shifts').insert({shop_id:shop.id,user_id:session.user.id,employee_name:profile.full_name||roleLabel(profile.role),opening_cash:+f.get('openingCash'),status:'open'});
  if(error)return alert(error.message);
  await audit('opened shift','shift',{opening_cash:+f.get('openingCash')});e.target.reset();$('#openShiftModal').close();await refresh();
};
function calcShift(s){
  const ss=sales.filter(x=>x.shift_id===s.id&&x.status!=='voided'),ee=expenses.filter(x=>x.shift_id===s.id&&x.approval_status!=='rejected');
  const cash=ss.filter(x=>x.payment==='Cash').reduce((a,x)=>a+Number(x.total),0);
  const momo=ss.filter(x=>x.payment==='Mobile Money').reduce((a,x)=>a+Number(x.total),0);
  const bank=ss.filter(x=>x.payment==='Bank').reduce((a,x)=>a+Number(x.total),0);
  const credit=ss.filter(x=>x.payment==='Credit').reduce((a,x)=>a+Number(x.total),0);
  const total=ss.reduce((a,x)=>a+Number(x.total),0),ex=ee.reduce((a,x)=>a+Number(x.amount),0);
  return{cash,momo,bank,credit,total,ex,expected:Number(s.opening_cash)+cash-ex};
}
$('#closeShiftBtn').onclick=()=>{
  if(!currentShift)return;
  const c=calcShift(currentShift);
  $('#closeShiftPreview').innerHTML=`Opening cash: <b>${money(currentShift.opening_cash)}</b><br>Cash sales: <b>${money(c.cash)}</b><br>Mobile Money: <b>${money(c.momo)}</b><br>Bank: <b>${money(c.bank)}</b><br>Credit sales: <b>${money(c.credit)}</b><br>Expenses: <b>${money(c.ex)}</b><br>Total sales: <b>${money(c.total)}</b><br>Expected physical cash: <b>${money(c.expected)}</b>`;
  $('#closeShiftModal').showModal();
};
$('#closeShiftForm').onsubmit=async e=>{
  e.preventDefault();if(!currentShift)return;
  const f=new FormData(e.target),c=calcShift(currentShift),actual=+f.get('actualCash');
  const diff=actual-c.expected,reason=(f.get('varianceReason')||'').trim();
  if(Math.abs(diff)>0.001&&!reason)return alert('Enter a reason for the cash difference before closing the shift.');
  const {error}=await sb.rpc('close_shift_controlled',{p_shift_id:currentShift.id,p_actual_cash:actual,p_variance_reason:reason||null});
  if(error)return alert(error.message);
  e.target.reset();$('#closeShiftModal').close();await refresh();
};

/* RECEIPTS */
window.viewReceipt=id=>{const s=sales.find(x=>x.id===id);if(!s)return;const lines=sales.filter(x=>x.receipt_no&&x.receipt_no===s.receipt_no);showReceiptGroup(lines.length?lines:[s]);};
function showReceipt(s){showReceiptGroup([s]);}
function showReceiptGroup(lines){
  if(!requireFeature('receipts','Digital receipts are included in Kivu Lite.'))return;if(!lines?.length)return;
  const s=lines[0],gross=lines.reduce((a,x)=>a+Number(x.total||0)+Number(x.discount||0),0),discount=lines.reduce((a,x)=>a+Number(x.discount||0),0),total=lines.reduce((a,x)=>a+Number(x.total||0),0);
  const rate=Math.max(0,Number(shop.tax_rate||0)),tax=rate>0?total*rate/(100+rate):0,taxLabel=shop.tax_label||'VAT';
  const items=lines.map(x=>`<div class="receipt-row"><span>${esc(x.product_name)} × ${x.entered_qty?`${x.entered_qty} ${esc(x.sold_unit||'')}`:x.qty}</span><span>${money(Number(x.total||0)+Number(x.discount||0))}</span></div>`).join('');
  $('#receiptContent').innerHTML=`<div class="receipt-center"><h2>${esc(shop.name)}</h2>${esc(shop.phone||'')}${shop.tax_number?`<br>${esc(taxLabel)} No: ${esc(shop.tax_number)}`:''}<br>${esc(shop.receipt_footer||'Thank you for your business')}</div><div class="receipt-line"></div><div>Receipt: <b>${esc(s.receipt_no||'—')}</b></div><div>Date: ${fmt(s.created_at)}</div><div>Cashier: ${esc(s.employee_name||'Owner')}</div><div class="receipt-line"></div>${items}${discount?`<div class="receipt-row"><span>Subtotal</span><span>${money(gross)}</span></div><div class="receipt-row"><span>Discount</span><span>-${money(discount)}</span></div>`:''}<div class="receipt-line"></div><div class="receipt-row"><b>TOTAL</b><b>${money(total)}</b></div>${rate>0?`<div class="receipt-row"><span>${esc(taxLabel)} included (${rate}%)</span><span>${money(tax)}</span></div>`:''}<div class="receipt-row"><span>Payment</span><span>${esc(s.payment)}</span></div><div class="receipt-line"></div><div class="receipt-center">Kivu Solutions digital receipt</div><div class="receipt-center"><small>Powered by Platinum Tech</small></div><div class="receipt-center"><small>This is a Kivu sales receipt, not an RRA EBM fiscal receipt unless a separately approved EBM integration is active.</small></div>`;
  $('#receiptModal').showModal();
}
$('#printReceiptBtn').onclick=()=>window.print();

/* OWNER SETTINGS + PLAN TESTING */
$$('.plan-btn').forEach(b=>b.onclick=async()=>{
  if(profile.role!=='owner')return alert('Only the owner can request a plan change.');
  const plan=b.dataset.plan,selected=PLAN_CONFIG[plan];if(!selected)return;
  if(plan===(shop.plan||'basic')&&subscriptionAllowsAccess())return;
  if(!confirm(`Request ${selected.label}${selected.oneTime?` for ${money(selected.price)} one time`:` at ${money(selected.price)}/month`}? Your current plan stays unchanged until Platinum Tech confirms payment and activation.`))return;
  const {error}=await sb.rpc('request_plan_change',{p_plan:plan});
  if(error)return alert(error.message);
  alert('Plan request sent to Platinum Tech. Your current access remains unchanged until activation is confirmed.');
});

async function setTestSubscriptionStatus(status){
  if(profile.role!=='owner')return;
  const now=new Date(),patch={subscription_status:status};
  if(status==='trial'){const end=new Date(now);end.setDate(end.getDate()+7);Object.assign(patch,{trial_ends_at:end.toISOString(),current_period_start:null,current_period_end:null,grace_ends_at:null,cancelled_at:null});}
  if(status==='active'){const end=new Date(now),grace=new Date(now);end.setDate(end.getDate()+30);grace.setDate(end.getDate()+SUBSCRIPTION_GRACE_DAYS);Object.assign(patch,{current_period_start:now.toISOString(),current_period_end:end.toISOString(),grace_ends_at:grace.toISOString(),cancelled_at:null});}
  if(status==='grace'){const period=new Date(now),grace=new Date(now);period.setDate(period.getDate()-1);grace.setDate(grace.getDate()+SUBSCRIPTION_GRACE_DAYS);Object.assign(patch,{current_period_end:period.toISOString(),grace_ends_at:grace.toISOString(),cancelled_at:null});}
  if(status==='expired'){const past=new Date(now);past.setDate(past.getDate()-1);Object.assign(patch,{current_period_end:past.toISOString(),grace_ends_at:past.toISOString()});}
  if(status==='cancelled')patch.cancelled_at=now.toISOString();
  const {error}=await sb.from('shops').update(patch).eq('id',shop.id);if(error)return alert(error.message);
  Object.assign(shop,patch);await audit('changed subscription status','subscription',{status});await load();render();
}
// Production build: subscription lifecycle test controls are intentionally disabled.

$('#settingsForm').onsubmit=async e=>{
  e.preventDefault();if(profile.role!=='owner')return alert('Only the owner can change business settings.');
  const p={name:$('#settingsBusinessName').value,phone:$('#settingsPhone').value||null,receipt_footer:$('#settingsReceiptFooter').value||null,business_type:$('#settingsBusinessType')?.value||'retail',ebm_enabled:false};
  const {error}=await sb.rpc('update_shop_settings_v486',{p_name:p.name,p_phone:p.phone,p_receipt_footer:p.receipt_footer,p_business_type:p.business_type});if(error)return alert(error.message);
  const tax=await sb.rpc('update_shop_tax_settings',{p_tax_rate:Number($('#settingsTaxRate')?.value||0),p_tax_label:$('#settingsTaxLabel')?.value||'VAT',p_tax_number:$('#settingsTaxNumber')?.value||null});if(tax.error)return alert(tax.error.message);
  Object.assign(shop,p,{tax_rate:Number($('#settingsTaxRate')?.value||0),tax_label:$('#settingsTaxLabel')?.value||'VAT',tax_number:$('#settingsTaxNumber')?.value||null});await audit('updated settings','settings',{business_type:p.business_type,tax_rate:shop.tax_rate});render();alert('Settings saved.');
};
if($('#ebmEnabled')){$('#ebmEnabled').checked=false;$('#ebmEnabled').disabled=true;}
$('#reportPeriod').onchange=renderReports;

/* RENDER */
function render(){
  applyPermissions();
  $('#shopLabel').textContent=shop.name;$('#roleBadge').textContent=roleLabel(profile.role);const sub=effectiveSubscriptionStatus();$('#planChip').textContent=`${planLabel().toUpperCase()} · ${sub.toUpperCase()}`;
  fill();renderDashboard();renderAttention();renderSales();renderInventory();renderSuppliers();renderExpenses();renderCustomers();renderEmployees();renderShifts();renderControls();renderReports();renderPlans();renderSubscriptionStatus();renderSettings();
}
function renderDashboard(){
  const t=day(new Date()),ss=sales.filter(x=>day(x.created_at)===t),ee=expenses.filter(x=>day(x.created_at)===t&&x.approval_status!=='rejected'),sa=ss.reduce((a,x)=>a+Number(x.total),0),ex=ee.reduce((a,x)=>a+Number(x.amount),0),cogs=ss.reduce((a,x)=>a+Number(x.cost),0),cr=credits.filter(x=>!x.paid).reduce((a,x)=>a+Number(x.amount),0),low=products.filter(x=>Number(x.qty)<=Number(x.low_stock));
  $('#salesToday').textContent=money(sa);$('#expensesToday').textContent=money(ex);$('#profitToday').textContent=money(sa-cogs-ex);$('#creditTotal').textContent=money(cr);$('#lowStockCount').textContent=low.length;$('#stockValue').textContent=money(products.reduce((a,x)=>a+Number(x.qty)*Number(x.cost),0));
  $('#shiftStatusCard').textContent=currentShift?`My shift open · ${profile.full_name||roleLabel(profile.role)}`:'No open shift';
  let msg=ss.length?`${ss.length} recorded sale(s) worth ${money(sa)} today.`:'No sales recorded today.';
  const subStatus=effectiveSubscriptionStatus();
  if(!subscriptionAllowsAccess()) msg=`Your subscription is ${subStatus}. Business data is preserved, but operational features are locked until the owner renews a plan.`;
  else if(subStatus==='trial'&&shop.trial_ends_at){const days=Math.max(0,Math.ceil((new Date(shop.trial_ends_at)-new Date())/86400000));msg+=` Free trial ends in ${days} day(s).`;}
  else if(subStatus==='grace'&&shop.grace_ends_at){const days=Math.max(0,Math.ceil((new Date(shop.grace_ends_at)-new Date())/86400000));msg+=` Subscription is in grace period; renew within ${days} day(s).`;}
  else if(subStatus==='active'&&shop.current_period_end){const days=Math.ceil((new Date(shop.current_period_end)-new Date())/86400000);if(days>=0&&days<=3)msg+=` Subscription renews/expires in ${days} day(s).`;}
  if(low.length&&subscriptionAllowsAccess())msg+=` ${low.length} product(s) are low in stock.`;
  if(hasFeature('credit')&&cr&&can('owner','manager','cashier'))msg+=` Outstanding customer credit is ${money(cr)}.`;
  if(can('owner','manager')){const sd=supplierPurchases.reduce((a,x)=>a+Number(x.balance_due||0),0);if(sd>0)msg+=` Supplier debt is ${money(sd)}.`;}
  $('#assistantMessage').textContent=msg;
  const act=[...sales.slice(0,5).map(x=>({n:`Sale · ${x.product_name}`,d:x.created_at,v:x.total})),...expenses.slice(0,5).map(x=>({n:`Expense · ${x.description}`,d:x.created_at,v:-x.amount}))].sort((a,b)=>new Date(b.d)-new Date(a.d)).slice(0,8);
  $('#activityList').innerHTML=act.length?act.map(x=>`<div class="item"><div><b>${esc(x.n)}</b><small>${fmt(x.d)}</small></div><b>${money(x.v)}</b></div>`).join(''):'No activity yet.';
}
function renderSales(){
  $('#salesBody').innerHTML=sales.length?sales.map(s=>{
    const voided=s.status==='voided';
    const action=[];
    if(hasFeature('receipts')) action.push(`<button class="btn secondary" onclick="viewReceipt('${s.id}')">Receipt</button>`);
    if(!voided&&can('owner','manager','cashier')) action.push(`<button class="btn ${can('owner','manager')?'danger':'secondary'}" onclick="openVoidSale('${s.id}')">${can('owner','manager')?'Void':'Request void'}</button>`);
    if(voided) action.push('<span class="badge danger-badge">VOIDED</span>');
    return `<tr class="${voided?'muted-row':''}"><td>${fmt(s.created_at)}</td><td>${esc(s.receipt_no||'—')}</td><td>${esc(s.product_name)}</td><td>${s.entered_qty?`${s.entered_qty} ${esc(s.sold_unit||'')}`:`${s.qty}`}</td><td>${esc(s.payment)}</td><td>${esc(s.customer||'Walk-in')}</td><td><b>${money(s.total)}</b></td><td class="action-cell">${action.join(' ')||'—'}</td></tr>`
  }).join(''):'<tr><td colspan="8">No sales yet.</td></tr>';
  const t=day(new Date()),today=sales.filter(x=>day(x.created_at)===t&&x.status!=='voided');
  const sum=m=>today.filter(x=>x.payment===m).reduce((a,x)=>a+Number(x.total||0),0);
  if($('#salesCashToday'))$('#salesCashToday').textContent=money(sum('Cash'));
  if($('#salesMomoToday'))$('#salesMomoToday').textContent=money(sum('Mobile Money'));
  if($('#salesBankToday'))$('#salesBankToday').textContent=money(sum('Bank'));
  if($('#salesCreditToday'))$('#salesCreditToday').textContent=money(sum('Credit'));
}

function renderInventory(){
  $('#productsBody').innerHTML=products.length?products.map(p=>{const exp=p.expiry_date?new Date(p.expiry_date+'T00:00:00'):null;const days=exp?Math.ceil((exp-new Date())/86400000):null;const expText=!exp?'—':days<0?`Expired ${Math.abs(days)}d ago`:days===0?'Expires today':`${p.expiry_date} (${days}d)`;return `<tr><td><b>${esc(p.name)}</b></td><td>${stockDisplay(p)}</td><td>${can('owner','manager')?money(p.cost)+' / '+esc(baseUnitLabel(p)):'Hidden'}</td><td>${money(p.price)}</td><td>${can('owner','manager')?money(Number(p.price)-Number(p.cost)):'Hidden'}</td><td>${p.preferred_supplier_id?esc(supplierName(p.preferred_supplier_id)):'—'}</td><td>${esc(expText)}</td><td><span class="badge">${Number(p.qty)<=Number(p.low_stock)?'Low stock':'OK'}</span></td><td>${can('owner','manager')?`<button class="btn secondary" onclick="openEditProduct('${p.id}')">Edit</button> <button class="btn secondary" onclick="openStockAdjustFor('${p.id}')">Adjust</button>`:'—'}</td></tr>`}).join(''):'<tr><td colspan="9">No products yet.</td></tr>';
}
window.openStockAdjustFor=id=>{if(!requireFeature('controls','Controlled stock adjustments are included in Kivu Control.'))return;const f=$('#stockAdjustForm');if(f){f.elements.productId.value=id;$('#stockAdjustModal').showModal();}};
function renderSuppliers(){
  if(!can('owner','manager')||!$('#suppliersBody'))return;
  const purchaseTotalBySupplier={},paidBySupplier={};
  supplierPurchases.forEach(x=>purchaseTotalBySupplier[x.supplier_id]=(purchaseTotalBySupplier[x.supplier_id]||0)+Number(x.total_amount||0));
  supplierPayments.forEach(x=>paidBySupplier[x.supplier_id]=(paidBySupplier[x.supplier_id]||0)+Number(x.amount||0));
  const debt=supplierPurchases.reduce((a,x)=>a+Number(x.balance_due||0),0);
  $('#supplierDebtTotal').textContent=money(debt);$('#suppliersOwedCount').textContent=suppliers.filter(x=>supplierBalance(x.id)>0).length;
  const now=new Date(),monthStart=new Date(now.getFullYear(),now.getMonth(),1);$('#supplierPurchasesMonth').textContent=money(supplierPurchases.filter(x=>new Date(x.created_at)>=monthStart).reduce((a,x)=>a+Number(x.total_amount||0),0));
  $('#suppliersBody').innerHTML=suppliers.length?suppliers.map(x=>{const bal=supplierBalance(x.id);return`<tr class="${x.active===false?'muted-row':''}"><td><b>${esc(x.name)}</b>${x.active===false?' <span class="badge">Archived</span>':''}<small>${x.address?`<br>${esc(x.address)}`:''}</small></td><td>${esc(x.phone||'—')}</td><td>${money(purchaseTotalBySupplier[x.id]||0)}</td><td>${money(paidBySupplier[x.id]||0)}</td><td><b>${money(bal)}</b></td><td>${x.active!==false&&bal>0?`<button class="btn secondary" onclick="openSupplierPayment('${x.id}')">Pay debt</button> `:''}<button class="btn secondary" onclick="openEditSupplier('${x.id}')">Edit</button> ${x.active!==false?`<button class="btn danger" onclick="removeSupplier('${x.id}')">Delete</button>`:''}</td></tr>`}).join(''):'<tr><td colspan="6">No suppliers yet.</td></tr>';
  $('#supplierPurchasesBody').innerHTML=supplierPurchases.length?supplierPurchases.map(x=>`<tr><td>${fmt(x.created_at)}</td><td>${esc(supplierName(x.supplier_id))}</td><td>${esc(x.invoice_no||'—')}</td><td>${money(x.total_amount)}</td><td>${money(x.paid_amount)}</td><td><b>${money(x.balance_due)}</b></td><td><span class="badge">${esc(x.status)}</span></td><td>${x.due_date?new Date(x.due_date+'T00:00:00').toLocaleDateString('en-RW'):'—'}</td></tr>`).join(''):'<tr><td colspan="8">No supplier purchases yet.</td></tr>';
  $('#supplierPaymentsBody').innerHTML=supplierPayments.length?supplierPayments.map(x=>`<tr><td>${fmt(x.created_at)}</td><td>${esc(supplierName(x.supplier_id))}</td><td>${esc(x.payment_method||'—')}</td><td>${esc(x.note||'—')}</td><td><b>${money(x.amount)}</b></td></tr>`).join(''):'<tr><td colspan="5">No supplier payments yet.</td></tr>';
}
function renderExpenses(){
  const body=$('#expensesBody');if(!body)return;
  body.innerHTML=expenses.length?expenses.map(x=>`<tr><td>${fmt(x.created_at)}</td><td>${esc(x.category||'Other')}</td><td>${esc(x.description)}</td><td>${esc(x.employee_name||'Owner')}</td><td><b>${money(x.amount)}</b></td></tr>`).join(''):'<tr><td colspan="5">No expenses yet.</td></tr>';
  if($('#expenseApprovalHint')) $('#expenseApprovalHint').textContent='Expenses can be recorded by the owner or a manager only.';
}
function renderCustomers(){
  const debt={};credits.filter(x=>!x.paid).forEach(x=>debt[x.customer_id||x.customer]=(debt[x.customer_id||x.customer]||0)+Number(x.amount));
  $('#customersBody').innerHTML=customers.length?customers.map(c=>`<tr class="${c.active===false?'muted-row':''}"><td><b>${esc(c.name)}</b>${c.active===false?' <span class="badge">Archived</span>':''}</td><td>${esc(c.phone||'—')}</td><td>${esc(c.email||'—')}</td><td>${money(debt[c.id]||0)}</td><td>${can('owner','manager')?`<button class="btn secondary" onclick="openEditCustomer('${c.id}')">Edit</button> ${c.active!==false?`<button class="btn danger" onclick="removeCustomer('${c.id}')">Delete</button>`:''}`:'—'}</td></tr>`).join(''):'<tr><td colspan="5">No customers yet.</td></tr>';
  const open=credits.filter(x=>!x.paid);$('#creditList').innerHTML=open.length?open.map(c=>`<div class="item"><div><b>${esc(c.customer)}</b><small>${esc(c.note||'Customer credit')}${c.due_date?' · due '+esc(c.due_date):''}</small></div><div><b>${money(c.amount)}</b>${can('owner','manager')?` <button class="btn secondary" onclick="markPaid('${c.id}')">Paid</button>`:''}</div></div>`).join(''):'No outstanding credit.';
}

window.openEditCustomer=function(id){
  if(!can('owner','manager'))return;
  const c=customers.find(x=>x.id===id); if(!c)return;
  const f=$('#editCustomerForm'); f.elements.id.value=c.id; f.elements.name.value=c.name||''; f.elements.phone.value=c.phone||''; f.elements.email.value=c.email||''; $('#editCustomerModal').showModal();
};
$('#editCustomerForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); const f=new FormData(e.target);
  const {error}=await sb.rpc('update_customer_details',{p_customer_id:f.get('id'),p_name:(f.get('name')||'').trim(),p_phone:(f.get('phone')||'').trim()||null,p_email:(f.get('email')||'').trim()||null});
  if(error)return alert(error.message); $('#editCustomerModal').close(); await refresh();
});
window.removeCustomer=async function(id){
  const c=customers.find(x=>x.id===id); if(!c||!confirm(`Delete ${c.name}? If it has transaction history Kivu Solutions will archive it instead.`))return;
  const {data,error}=await sb.rpc('remove_customer_safe',{p_customer_id:id}); if(error)return alert(error.message); alert(data==='archived'?'Customer archived because financial history exists.':'Customer deleted.'); await refresh();
};
window.openEditSupplier=function(id){
  if(!can('owner','manager'))return;
  const s=suppliers.find(x=>x.id===id); if(!s)return;
  const f=$('#editSupplierForm'); f.elements.id.value=s.id; f.elements.name.value=s.name||''; f.elements.phone.value=s.phone||''; f.elements.address.value=s.address||''; f.elements.notes.value=s.notes||''; $('#editSupplierModal').showModal();
};
$('#editSupplierForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); const f=new FormData(e.target);
  const {error}=await sb.rpc('update_supplier_details',{p_supplier_id:f.get('id'),p_name:(f.get('name')||'').trim(),p_phone:(f.get('phone')||'').trim()||null,p_address:(f.get('address')||'').trim()||null,p_notes:(f.get('notes')||'').trim()||null});
  if(error)return alert(error.message); $('#editSupplierModal').close(); await refresh();
});
window.removeSupplier=async function(id){
  const s=suppliers.find(x=>x.id===id); if(!s||!confirm(`Delete ${s.name}? If purchase history exists Kivu Solutions will archive it instead.`))return;
  const {data,error}=await sb.rpc('remove_supplier_safe',{p_supplier_id:id}); if(error)return alert(error.message); alert(data==='archived'?'Supplier archived because purchase history exists.':'Supplier deleted.'); await refresh();
};
function renderDukaAdmin(){
  if(!isDukaAdmin)return;
  const o=platformOverview||{};
  $('#adminTotalShops').textContent=o.total_shops||0;
  $('#adminActiveShops').textContent=(o.active_shops||0)+(o.trial_shops||0);
  $('#adminInactiveShops').textContent=(o.expired_shops||0)+(o.suspended_shops||0)+(o.cancelled_shops||0);
  $('#adminMrr').textContent=money(o.estimated_mrr||0);
  const pm=o.plan_mix||{};
  $('#adminPlanMix').innerHTML=Object.keys(pm).length?Object.entries(pm).map(([k,v])=>`<span class="badge">${esc(k)}: ${v}</span>`).join(' '):'No shops yet.';
  $('#adminShopsBody').innerHTML=platformShops.length?platformShops.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.plan)}</td><td><span class="badge">${esc(s.subscription_status||'active')}</span></td><td>${s.current_period_end?fmt(s.current_period_end):'—'}</td><td>${fmt(s.created_at)}</td></tr>`).join(''):'<tr><td colspan="5">No shops yet.</td></tr>';
}

window.setEmployeeActive=async(id,active)=>{
  if(!can('owner','manager'))return alert('Only an owner or manager can change staff access.');
  const emp=employees.find(x=>x.id===id);if(!emp)return;
  if(emp.user_id===session.user.id)return alert('You cannot disable your own account.');
  if(!confirm(`${active?'Reactivate':'Disable'} ${emp.name}?`))return;
  const {error}=await sb.rpc('set_employee_active',{p_employee_id:id,p_active:!!active});
  if(error)return alert(error.message);
  await refresh();
};

$('#changePinBtn')?.addEventListener('click',()=>$('#changePinModal').showModal());
$('#changePinForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=new FormData(e.target),pin=String(f.get('pin')||''),confirmPin=String(f.get('confirmPin')||'');
  if(!/^\d{6}$/.test(pin))return alert('PIN must be exactly 6 digits.');
  if(pin!==confirmPin)return alert('PINs do not match.');
  const {error}=await sb.auth.updateUser({password:pin});
  if(error)return alert(error.message);
  e.target.reset();$('#changePinModal').close();alert('Your PIN has been changed.');
});

function renderAttention(){
  const list=$('#attentionList');if(!list)return;
  const today=day(new Date()), items=[];
  const low=products.filter(x=>Number(x.qty)<=Number(x.low_stock));
  low.slice(0,8).forEach(p=>items.push({label:`Low stock · ${p.name}`,detail:`${stockDisplay(p)} remaining`,page:'inventory'}));
  products.filter(p=>p.expiry_date).forEach(p=>{
    const days=Math.ceil((new Date(p.expiry_date+'T00:00:00')-new Date())/86400000),warn=Number(p.expiry_reminder_days||14);
    if(days<=warn) items.push({label:days<0?`Expired · ${p.name}`:`Expiry warning · ${p.name}`,detail:days<0?`Expired ${Math.abs(days)} day(s) ago`:`Expires in ${days} day(s) · ${p.expiry_date}`,page:'inventory'});
  });
  if(can('owner','manager')){
    const overdueSupplier=supplierPurchases.filter(x=>Number(x.balance_due||0)>0&&x.due_date&&x.due_date<today);
    overdueSupplier.slice(0,8).forEach(x=>items.push({label:`Supplier debt overdue · ${supplierName(x.supplier_id)}`,detail:`${money(x.balance_due)} due ${x.due_date}`,page:'suppliers'}));
    const supplierDebt=supplierPurchases.filter(x=>Number(x.balance_due||0)>0&&!x.due_date);
    if(supplierDebt.length)items.push({label:'Supplier balances outstanding',detail:`${money(supplierDebt.reduce((a,x)=>a+Number(x.balance_due||0),0))} without a due date`,page:'suppliers'});
    const overdueCredit=credits.filter(x=>!x.paid&&x.due_date&&x.due_date<today);
    overdueCredit.slice(0,8).forEach(x=>items.push({label:`Customer credit overdue · ${x.customer}`,detail:`${money(x.amount)} due ${x.due_date}`,page:'customers'}));
    const pending=approvalRequests.filter(x=>x.status==='pending');
    if(pending.length)items.push({label:'Pending control approvals',detail:`${pending.length} request(s) waiting`,page:'controls'});
    const unreviewed=shifts.filter(x=>x.status==='closed'&&x.review_status==='pending');
    if(unreviewed.length)items.push({label:'Cash variances need review',detail:`${unreviewed.length} closed shift(s)`,page:'controls'});
  }
  $('#attentionCount').textContent=items.length;
  list.innerHTML=items.length?items.slice(0,15).map(x=>`<div class="item"><div><b>${esc(x.label)}</b><small>${esc(x.detail)}</small></div><button class="btn secondary" onclick="showPage('${x.page}')">Open</button></div>`).join(''):'<div class="notice mini">Nothing urgent right now.</div>';
}

function renderEmployees(){
  if(!$('#employeesBody')||!hasFeature('employees'))return;
  const t=day(new Date());
  $('#employeesBody').innerHTML=employees.length?employees.map(e=>`<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.role)}</td><td>${esc(e.phone||'—')}</td><td><span class="badge">${e.active?'Active':'Disabled'}</span></td><td>${sales.filter(s=>s.user_id===e.user_id&&day(s.created_at)===t).length}</td><td>${can('owner','manager')?`<button class="btn ${e.active?'danger':'secondary'}" onclick="setEmployeeActive('${e.id}',${!e.active})">${e.active?'Disable':'Reactivate'}</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="6">No staff have joined yet.</td></tr>';
  const auditPanel=$('#auditList')?.closest('.panel');
  auditPanel?.classList.toggle('hidden',!hasFeature('audit'));
  if(hasFeature('audit')) $('#auditList').innerHTML=audits.length?audits.slice(0,20).map(a=>`<div class="item"><div><b>${esc(a.user_name||'User')} · ${esc(a.action)}</b><small>${esc(a.entity)} · ${fmt(a.created_at)}</small></div></div>`).join(''):'No audit activity yet.';
  if($('#staffInvitesList')){
    const pending=staffInvites.filter(i=>!i.used_at&&new Date(i.expires_at)>new Date());
    $('#staffInvitesList').innerHTML=pending.length?pending.map(i=>`<div class="item"><div><b>${esc(i.employee_name)} · ${esc(roleLabel(i.role))}</b><small>Code: <strong>${esc(i.code)}</strong> · expires ${new Date(i.expires_at).toLocaleDateString()}</small></div></div>`).join(''):'No pending staff invites.';
  }
}
function renderShifts(){
  if(profile.role==='stock_clerk'||!hasFeature('shifts'))return;
  if(currentShift){
    const c=calcShift(currentShift);$('#openShiftBtn').classList.add('hidden');$('#closeShiftBtn').classList.remove('hidden');$('#shiftBreakdown').classList.remove('hidden');$('#currentShiftTitle').textContent=`Open — ${profile.full_name||roleLabel(profile.role)}`;$('#currentShiftDetails').textContent=`Opened ${fmt(currentShift.opened_at)}`;$('#shiftOpeningCash').textContent=money(currentShift.opening_cash);$('#shiftExpectedCash').textContent=money(c.expected);$('#shiftDifference').textContent='Pending count';$('#shiftCashSales').textContent=money(c.cash);$('#shiftMomoSales').textContent=money(c.momo);$('#shiftBankSales').textContent=money(c.bank);$('#shiftCreditSales').textContent=money(c.credit);$('#shiftExpenses').textContent=money(c.ex);$('#shiftTotalSales').textContent=money(c.total);
  }else{
    $('#openShiftBtn').classList.remove('hidden');$('#closeShiftBtn').classList.add('hidden');$('#shiftBreakdown').classList.add('hidden');$('#currentShiftTitle').textContent='No open shift';$('#currentShiftDetails').textContent='Open a shift to start cash accountability.';$('#shiftOpeningCash').textContent='0 RWF';$('#shiftExpectedCash').textContent='0 RWF';$('#shiftDifference').textContent='—';
  }
  $('#shiftHistoryBody').innerHTML=shifts.length?shifts.map(s=>{const c=calcShift(s),diff=s.difference==null?null:Number(s.difference);return`<tr><td>${fmt(s.opened_at)}</td><td>${esc(s.employee_name||'User')}</td><td>${money(c.total)}</td><td>${s.status==='closed'?money(s.expected_cash??c.expected):money(c.expected)}</td><td>${s.actual_cash==null?'—':money(s.actual_cash)}</td><td>${diff==null?'—':money(diff)}</td><td><span class="badge">${esc(s.status)}</span></td></tr>`}).join(''):'<tr><td colspan="7">No shifts yet.</td></tr>';
}
function renderControls(){
  if(!$('#approvalsList'))return;
  if(!hasFeature('controls')||!can('owner','manager'))return;
  const pending=approvalRequests.filter(x=>x.status==='pending');
  $('#pendingApprovalCount').textContent=pending.length;
  const t=day(new Date());
  $('#voidedSalesToday').textContent=sales.filter(x=>x.status==='voided'&&day(x.voided_at||x.created_at)===t).length;
  $('#stockAdjustmentsToday').textContent=stockAdjustments.filter(x=>day(x.created_at)===t).length;
  const varTotal=shifts.filter(x=>x.status==='closed'&&day(x.closed_at||x.opened_at)===t).reduce((a,x)=>a+Math.abs(Number(x.difference||0)),0);
  $('#cashVarianceToday').textContent=money(varTotal);
  $('#approvalsList').innerHTML=pending.length?pending.map(x=>`<div class="item control-item"><div><b>${esc(x.request_type.replaceAll('_',' '))}</b><small>${esc(x.requested_by_name||'Staff')} · ${fmt(x.created_at)}<br>${esc(x.reason||'No reason')}</small></div><div><button class="btn primary" onclick="reviewApproval('${x.id}','approved')">Approve</button> <button class="btn danger" onclick="reviewApproval('${x.id}','rejected')">Reject</button></div></div>`).join(''):'No pending approvals.';
  const alerts=[];
  sales.filter(x=>x.status==='voided').slice(0,15).forEach(x=>alerts.push({d:x.voided_at||x.created_at,t:`Voided sale · ${x.receipt_no||x.product_name}`,s:`${money(x.total)} · ${x.void_reason||'No reason'}`}));
  stockAdjustments.slice(0,15).forEach(x=>alerts.push({d:x.created_at,t:`Stock adjustment · ${x.product_name}`,s:`${Number(x.qty_delta)>0?'+':''}${x.qty_delta} · ${x.reason}`}));
  shifts.filter(x=>x.status==='closed'&&Number(x.difference)!==0).slice(0,15).forEach(x=>alerts.push({d:x.closed_at||x.opened_at,t:`Cash variance · ${x.employee_name||'Staff'}`,s:`${money(x.difference)} · ${x.variance_reason||'No reason recorded'}`}));
  alerts.sort((a,b)=>new Date(b.d)-new Date(a.d));
  $('#controlAlertsList').innerHTML=alerts.length?alerts.slice(0,30).map(x=>`<div class="item"><div><b>${esc(x.t)}</b><small>${fmt(x.d)} · ${esc(x.s)}</small></div></div>`).join(''):'No exceptions recorded.';
}

function renderReports(){
  if(!can('owner','manager'))return;
  const days=+$('#reportPeriod').value,cut=new Date();cut.setDate(cut.getDate()-days);const ss=sales.filter(x=>new Date(x.created_at)>=cut),ee=expenses.filter(x=>new Date(x.created_at)>=cut&&x.approval_status!=='rejected'),sa=ss.reduce((a,x)=>a+Number(x.total),0),ex=ee.reduce((a,x)=>a+Number(x.amount),0),cogs=ss.reduce((a,x)=>a+Number(x.cost),0);$('#reportSales').textContent=money(sa);$('#reportExpenses').textContent=money(ex);$('#reportProfit').textContent=money(sa-cogs-ex);$('#reportTransactions').textContent=new Set(ss.map(x=>x.receipt_no||x.id)).size;
}
function renderPlans(){
  $$('.pricing article').forEach(x=>{
    const current=x.dataset.plan===(shop.plan||'basic');
    x.classList.toggle('current',current);
    const btn=x.querySelector('.plan-btn');
    if(btn){
      const live=effectiveSubscriptionStatus()==='active';
      btn.textContent=current&&live?'Current plan':`Request ${PLAN_CONFIG[x.dataset.plan]?.label||'plan'}`;
      btn.disabled=current&&live;
    }
  });
}
function renderSubscriptionStatus(){
  if(!$('#subscriptionStatusBadge'))return;
  const status=effectiveSubscriptionStatus();
  const labels={trial:'Free trial',active:'Active',grace:'Grace period',expired:'Expired',suspended:'Suspended',cancelled:'Cancelled'};
  $('#subscriptionStatusBadge').textContent=labels[status]||status;
  $('#subscriptionStatusBadge').className=`subscription-status ${status}`;
  $('#subscriptionPlanName').textContent=planLabel();
  let end=null,label='';
  if(status==='trial'){end=toDate(shop.trial_ends_at);label='Trial ends';}
  else if(status==='active'){end=toDate(shop.current_period_end);label='Renews / expires';}
  else if(status==='grace'){end=toDate(shop.grace_ends_at);label='Grace ends';}
  else if(status==='cancelled'){end=toDate(shop.cancelled_at);label='Cancelled';}
  $('#subscriptionDateLabel').textContent=label||'Access';
  $('#subscriptionDateValue').textContent=shop?.plan==='one_time'?'No monthly renewal':(end?end.toLocaleDateString():(status==='active'?'No expiry set':'—'));
  const banner=$('#subscriptionBanner');
  if(!banner)return;
  if(status==='trial'){banner.innerHTML=`<b>Free trial:</b> ${planLabel()} features are available until ${end?end.toLocaleDateString():'the trial end date'}. Choose a plan before the trial expires.`;banner.className='subscription-banner trial';}
  else if(status==='grace'){banner.innerHTML=`<b>Payment grace period:</b> Your plan is still working temporarily. Renew before ${end?end.toLocaleDateString():'the grace deadline'} to avoid interruption.`;banner.className='subscription-banner grace';}
  else if(['expired','suspended','cancelled'].includes(status)){banner.innerHTML=`<b>Subscription ${status}:</b> Business data is preserved, but operational features are locked until the owner activates a plan.`;banner.className='subscription-banner blocked';}
  else {banner.innerHTML=shop?.plan==='one_time'?`<b>${planLabel()} is active.</b> This account has the limited one-time package with no monthly renewal.`:`<b>${planLabel()} is active.</b> Your Kivu Solutions subscription is in good standing.`;banner.className='subscription-banner active';}
}

function renderSettings(){if(profile.role!=='owner')return;$('#settingsBusinessName').value=shop.name||'';if($('#settingsBusinessType'))$('#settingsBusinessType').value=shop.business_type||'retail';$('#settingsPhone').value=shop.phone||'';$('#settingsReceiptFooter').value=shop.receipt_footer||'';if($('#settingsTaxRate'))$('#settingsTaxRate').value=Number(shop.tax_rate||0);if($('#settingsTaxLabel'))$('#settingsTaxLabel').value=shop.tax_label||'VAT';if($('#settingsTaxNumber'))$('#settingsTaxNumber').value=shop.tax_number||'';if($('#ebmEnabled')){$('#ebmEnabled').disabled=true;$('#ebmEnabled').checked=false;}$('#ebmNotice')?.classList.add('hidden');$('#ebmPlanNotice')?.classList.remove('hidden')}

/* ============================================================
   DUKA V4.1 — COMPANY OPERATIONS & SUPPORT
   ============================================================ */
const KIVU_APP_VERSION='4.8';
const DUKA_APP_VERSION=KIVU_APP_VERSION; // backwards-compatible database/device field name
let platformAdminProfile=null,selectedSupportShopId=null,selectedSupportData=null,platformAdmins=[],platformAudit=[];
let appStatusCache=null,shopNotifications=[];

function adminRoleLabel(r){return ({super_admin:'Super Admin',national_admin:'National Admin',province_admin:'Province Admin',district_admin:'District Admin',support:'Support Agent',billing:'Billing'})[r]||r||'Admin';}
function supportAccessText(a){if(!a)return 'Platinum Tech Admin';if(a.role==='province_admin')return `${adminRoleLabel(a.role)} · ${a.province||'Unassigned province'}`;if(a.role==='district_admin')return `${adminRoleLabel(a.role)} · ${a.district||'Unassigned district'}`;return adminRoleLabel(a.role);}

async function loadPlatformV41(){
  if(!isDukaAdmin)return;
  const [pr,ov,shops,audit]=await Promise.all([
    sb.rpc('duka_admin_profile'),sb.rpc('duka_admin_overview_v41'),sb.rpc('duka_admin_shops_v41'),sb.rpc('duka_platform_audit',{p_limit:100})
  ]);
  // Generate expiry reminders whenever an admin opens the platform console.
  sb.rpc('generate_subscription_notifications').catch(()=>{});
  if(pr.error)throw pr.error; platformAdminProfile=pr.data||null;
  platformOverview=ov.data||{}; platformShops=shops.data||[]; platformAudit=audit.data||[];
  if(platformAdminProfile?.role==='super_admin'){
    const admins=await sb.rpc('duka_list_admins'); platformAdmins=admins.error?[]:(admins.data||[]);
  }else platformAdmins=[];
}

async function openDukaAdmin(){
  if(!isDukaAdmin)return;
  try{await loadPlatformV41();renderDukaAdmin();showPage('dukaadmin',true);}catch(e){alert(e.message);}
}

$('#modeSwitchBtn')?.addEventListener('click',()=>{
  const onAdmin=$('#page-dukaadmin')?.classList.contains('active');
  if(onAdmin)showPage('dashboard',true);else openDukaAdmin();
});
$('#backToShopBtn')?.addEventListener('click',()=>showPage('dashboard',true));

// Override V4.0 admin renderer with territory/support-aware V4.1 renderer.
function renderDukaAdmin(){
  if(!isDukaAdmin)return;
  $('#modeSwitchBtn')?.classList.remove('hidden');
  const o=platformOverview||{};
  $('#adminTotalShops').textContent=o.total_shops||0;
  $('#adminActiveShops').textContent=o.active_shops||0;
  $('#adminInactiveShops').textContent=o.inactive_shops||0;
  $('#adminNeedsHelp').textContent=o.needs_assistance||0;
  $('#adminMrr').textContent=money(o.estimated_mrr||0);
  $('#adminScopeNotice').innerHTML=`<b>${esc(supportAccessText(platformAdminProfile))}</b> · You can only inspect shops within your assigned scope. Support mode is read-only unless you choose a controlled action.`;
  renderAdminShopRows();renderAdminUsers();renderPlatformAudit();renderPlatformStatus();
}

function renderAdminShopRows(){
  const q=($('#adminShopSearch')?.value||'').trim().toLowerCase();
  const rows=platformShops.filter(s=>!q||[s.name,s.province,s.district,s.plan,s.subscription_status].some(v=>String(v||'').toLowerCase().includes(q)));
  $('#adminShopsBody').innerHTML=rows.length?rows.map(s=>`<tr>
    <td><b>${esc(s.name)}</b>${s.platform_suspended?'<br><span class="badge danger">SUSPENDED</span>':''}</td>
    <td>${esc([s.district,s.province].filter(Boolean).join(', ')||'—')}</td>
    <td>${esc(PLAN_CONFIG[s.plan||'basic']?.label||s.plan||'Kivu Lite')}</td><td>${esc(s.subscription_status||'active')}</td><td>${esc(s.onboarding_status||'setup_incomplete')}</td>
    <td><button class="btn secondary" onclick="openShopSupport('${s.id}')">View shop</button></td></tr>`).join(''):'<tr><td colspan="6">No shops found.</td></tr>';
}
$('#adminShopSearch')?.addEventListener('input',renderAdminShopRows);

window.openShopSupport=async function(id){
  const {data,error}=await sb.rpc('duka_shop_support_view',{p_shop_id:id}); if(error)return alert(error.message);
  selectedSupportShopId=id;selectedSupportData=data;renderShopSupport();$('#shopSupportPanel').classList.remove('hidden');$('#shopSupportPanel').scrollIntoView({behavior:'smooth',block:'start'});
};

function renderShopSupport(){
  const d=selectedSupportData;if(!d)return;const s=d.shop||{};
  $('#supportShopTitle').textContent=s.name||'Shop';
  $('#supportShopMeta').textContent=[s.district,s.province,PLAN_CONFIG[s.plan||'basic']?.label||s.plan,s.subscription_status,s.onboarding_status,s.app_version?'App '+s.app_version:null].filter(Boolean).join(' · ');
  $('#supportSummary').innerHTML=`<article><span>Sales today</span><strong>${money(d.sales_today||0)}</strong></article><article><span>Transactions</span><strong>${d.transactions_today||0}</strong></article><article><span>Low stock</span><strong>${d.low_stock||0}</strong></article><article><span>Supplier debt</span><strong>${money(d.supplier_debt||0)}</strong></article><article><span>Customer credit</span><strong>${money(d.customer_credit||0)}</strong></article><article><span>Expenses 30d</span><strong>${money(d.expenses_30d||0)}</strong></article><article><span>Pending approvals</span><strong>${d.pending_approvals||0}</strong></article>`;
  const staff=d.staff||[], shifts=d.open_shifts||[];
  $('#supportStaffList').innerHTML=(staff.length?staff.map(x=>`<div class="item"><div><b>${esc(x.name)}</b><small>${esc(x.role||'')} · ${esc(x.phone||'No phone')}</small></div><span class="badge">${x.active?'Active':'Disabled'}</span></div>`).join(''):'<div class="notice mini">No staff.</div>')+(shifts.length?`<p><b>Open shifts</b></p>`+shifts.map(x=>`<div class="item"><div><b>${esc(x.employee_name||'Employee')}</b><small>Opened ${fmt(x.opened_at)}</small></div><span>${money(x.opening_cash||0)}</span></div>`).join(''):'');
  $('#supportAuditList').innerHTML=(d.recent_audit||[]).length?(d.recent_audit||[]).map(x=>`<div class="item"><div><b>${esc(x.action)}</b><small>${esc(x.user_name||'System')} · ${fmt(x.created_at)}</small></div></div>`).join(''):'<div class="notice mini">No recent activity.</div>';
  $('#supportNotesList').innerHTML=(d.notes||[]).length?(d.notes||[]).map(x=>`<div class="item"><div><b>${esc(x.note)}</b><small>${esc(x.created_by_name||'Admin')} · ${fmt(x.created_at)}</small></div></div>`).join(''):'<div class="notice mini">No internal notes.</div>';
  $('#supportTicketsList').innerHTML=(d.tickets||[]).length?(d.tickets||[]).map(x=>`<div class="item"><div><b>${esc(x.subject)}</b><small>${esc(x.priority)} · ${esc(x.status)} · ${fmt(x.updated_at)}</small></div><button class="btn secondary" onclick="updateSupportTicket('${x.id}','${x.status}')">Update</button></div>`).join(''):'<div class="notice mini">No tickets.</div>';
  $('#supportPaymentsList').innerHTML=(d.payments||[]).length?(d.payments||[]).map(x=>`<div class="item"><div><b>${money(x.amount)} · ${esc(x.plan)}</b><small>${esc(x.payment_method)} ${x.reference?'· '+esc(x.reference):''} · ${fmt(x.created_at)}</small></div><span class="badge">${esc(x.status)}</span></div>`).join(''):'<div class="notice mini">No subscription payments recorded.</div>';
  $('#supportDevicesList').innerHTML=(d.devices||[]).length?(d.devices||[]).map(x=>`<div class="item"><div><b>${esc(x.device_label||'Device')}</b><small>Last seen ${fmt(x.last_seen)}</small></div><span class="badge">${x.revoked_at?'Revoked':'Active'}</span></div>`).join(''):'<div class="notice mini">No device activity yet.</div>';
  $('#suspendShopBtn').classList.toggle('hidden',!!s.platform_suspended);$('#reactivateShopBtn').classList.toggle('hidden',!s.platform_suspended);
}

$('#supportNoteForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!selectedSupportShopId)return;const note=new FormData(e.target).get('note');const {error}=await sb.rpc('duka_add_shop_note',{p_shop_id:selectedSupportShopId,p_note:note});if(error)return alert(error.message);e.target.reset();await openShopSupport(selectedSupportShopId);});
$('#supportTicketForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!selectedSupportShopId)return;const f=new FormData(e.target);const {error}=await sb.rpc('duka_create_ticket',{p_shop_id:selectedSupportShopId,p_subject:f.get('subject'),p_description:f.get('description')||null,p_priority:f.get('priority')});if(error)return alert(error.message);e.target.reset();await openShopSupport(selectedSupportShopId);});
window.updateSupportTicket=async function(id,current){const status=prompt('Status: open, in_progress, waiting_customer, resolved, closed',current);if(!status)return;const note=prompt('Resolution / update note (optional)','')||null;const {error}=await sb.rpc('duka_update_ticket',{p_ticket_id:id,p_status:status,p_resolution:note});if(error)return alert(error.message);await openShopSupport(selectedSupportShopId);};

async function setShopSuspension(flag){if(!selectedSupportShopId)return;const reason=prompt(flag?'Reason for suspending this shop:':'Reason for reactivating this shop:');if(!reason)return;const {error}=await sb.rpc('duka_set_shop_suspension',{p_shop_id:selectedSupportShopId,p_suspended:flag,p_reason:reason});if(error)return alert(error.message);await loadPlatformV41();await openShopSupport(selectedSupportShopId);renderDukaAdmin();}
$('#suspendShopBtn')?.addEventListener('click',()=>setShopSuspension(true));$('#reactivateShopBtn')?.addEventListener('click',()=>setShopSuspension(false));

$('#confirmPaymentBtn')?.addEventListener('click',()=>{if(!selectedSupportShopId)return;const f=$('#adminPaymentForm');f.elements.shopId.value=selectedSupportShopId;const now=new Date(),end=new Date();end.setDate(end.getDate()+29);f.elements.from.value=day(now);f.elements.to.value=day(end);$('#adminPaymentModal').showModal();});
$('#adminPaymentForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await sb.rpc('duka_confirm_subscription_payment',{p_shop_id:f.get('shopId'),p_amount:+f.get('amount'),p_plan:f.get('plan'),p_payment_method:f.get('method'),p_reference:f.get('reference')||null,p_covered_from:f.get('from'),p_covered_to:f.get('to'),p_note:f.get('note')||null});if(error)return alert(error.message);$('#adminPaymentModal').close();e.target.reset();await loadPlatformV41();await openShopSupport(selectedSupportShopId);renderDukaAdmin();});

$('#onboardingStatusBtn')?.addEventListener('click',async()=>{if(!selectedSupportShopId)return;const status=prompt('Status: registered, setup_incomplete, active, needs_assistance',selectedSupportData?.shop?.onboarding_status||'setup_incomplete');if(!status)return;const reason=prompt('Reason / note:','Support update')||'Support update';const {error}=await sb.rpc('duka_set_onboarding_status',{p_shop_id:selectedSupportShopId,p_status:status,p_reason:reason});if(error)return alert(error.message);await loadPlatformV41();await openShopSupport(selectedSupportShopId);renderDukaAdmin();});

function renderAdminUsers(){
  const panel=$('#adminManagementPanel');if(!panel)return;const superAdmin=platformAdminProfile?.role==='super_admin';panel.classList.toggle('hidden',!superAdmin);if(!superAdmin)return;
  $('#adminUsersList').innerHTML=platformAdmins.length?platformAdmins.map(a=>`<div class="item"><div><b>${esc(a.display_name||a.email)}</b><small>${esc(adminRoleLabel(a.admin_role))}${a.district?' · '+esc(a.district):a.province?' · '+esc(a.province):''}</small></div><span class="badge">${a.active?'Active':'Disabled'}</span></div>`).join(''):'<div class="notice mini">No admins.</div>';
}
$('#addAdminBtn')?.addEventListener('click',()=>$('#adminUserModal').showModal());
$('#adminUserForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await sb.rpc('duka_manage_admin',{p_email:f.get('email'),p_role:f.get('role'),p_province:f.get('province')||null,p_district:f.get('district')||null,p_display_name:f.get('displayName')||null,p_active:f.get('active')==='true'});if(error)return alert(error.message);$('#adminUserModal').close();e.target.reset();await loadPlatformV41();renderDukaAdmin();});

function renderPlatformAudit(){const el=$('#platformAuditList');if(!el)return;el.innerHTML=platformAudit.length?platformAudit.slice(0,50).map(x=>`<div class="item"><div><b>${esc(x.action)}</b><small>${esc(x.admin_name||'Admin')} ${x.shop_name?'· '+esc(x.shop_name):''} · ${fmt(x.created_at)}</small>${x.reason?`<small>${esc(x.reason)}</small>`:''}</div></div>`).join(''):'<div class="notice mini">No platform actions yet.</div>';}
async function renderPlatformStatus(){const el=$('#platformStatusBody');if(!el)return;const {data}=await sb.rpc('duka_app_status');appStatusCache=data||{};el.innerHTML=`<div class="item"><div><b>Current version ${esc(appStatusCache.current_version||'4.3')}</b><small>Minimum ${esc(appStatusCache.minimum_version||'4.0')} · Maintenance ${appStatusCache.maintenance_mode?'ON':'OFF'}</small></div>${platformAdminProfile?.role==='super_admin'?'<button id="editPlatformStatusBtn" class="btn secondary">Edit</button>':''}</div>`;$('#editPlatformStatusBtn')?.addEventListener('click',editPlatformStatus);}
async function editPlatformStatus(){const current=appStatusCache||{};const maintenance=confirm('Turn maintenance mode ON?\nOK = ON, Cancel = OFF');const message=prompt('Maintenance message',current.maintenance_message||'')||'';const cv=prompt('Current app version',current.current_version||'4.3')||'4.1';const mv=prompt('Minimum supported version',current.minimum_version||'4.0')||'4.0';const {error}=await sb.rpc('duka_set_app_status',{p_maintenance:maintenance,p_message:message,p_current_version:cv,p_minimum_version:mv});if(error)return alert(error.message);await loadPlatformV41();renderDukaAdmin();}

// Device/session heartbeat. Revoked devices sign out on the next heartbeat.
function getDeviceKey(){let k=localStorage.getItem('duka_device_key');if(!k){k=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());localStorage.setItem('duka_device_key',k);}return k;}
async function deviceHeartbeat(){if(!session||!shop)return;const label=`${navigator.platform||'Device'} · ${navigator.userAgent.includes('Mobile')?'Mobile':'Browser'}`;const {data,error}=await sb.rpc('register_app_device',{p_device_key:getDeviceKey(),p_device_label:label,p_app_version:DUKA_APP_VERSION});if(!error&&data?.revoked){localStorage.removeItem('duka_device_key');alert('This device session was signed out by the business owner. You can sign in again to start a new authorized session.');await sb.auth.signOut();}}
setInterval(()=>deviceHeartbeat().catch(()=>{}),60000);setTimeout(()=>deviceHeartbeat().catch(()=>{}),2500);

// App version / maintenance check.
async function checkAppStatus(){const {data,error}=await sb.rpc('duka_app_status');if(error)return;appStatusCache=data||{};if(appStatusCache.maintenance_mode&&!isDukaAdmin){alert(appStatusCache.maintenance_message||'Kivu Solutions is temporarily under maintenance. Please try again later.');}}
setTimeout(()=>checkAppStatus().catch(()=>{}),1800);

// Notifications center: stored notices + live business attention items.
async function loadNotifications(){if(!shop)return;const {data}=await sb.from('shop_notifications').select('*').eq('shop_id',shop.id).order('created_at',{ascending:false}).limit(50);shopNotifications=data||[];$('#notificationCount').textContent=shopNotifications.filter(x=>!x.read_at).length;$('#notificationsList').innerHTML=shopNotifications.length?shopNotifications.map(n=>`<div class="item"><div><b>${esc(n.title)}</b><small>${esc(n.message)} · ${fmt(n.created_at)}</small></div></div>`).join(''):'<div class="notice mini">No notifications.</div>';}
$('#notificationsBtn')?.addEventListener('click',async()=>{await loadNotifications();$('#notificationsModal').showModal();});setTimeout(()=>loadNotifications().catch(()=>{}),3000);

// Backup / export controls.
function downloadText(name,text,type='text/plain'){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function rowsToCsv(rows){if(!rows.length)return '';const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';return [keys.map(q).join(','),...rows.map(r=>keys.map(k=>q(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])).join(','))].join('\n');}
$('#exportCsvBtn')?.addEventListener('click',()=>{const blocks=[['products',products],['sales',sales],['customers',customers],['supplier_purchases',supplierPurchases],['supplier_payments',supplierPayments],['expenses',expenses]];blocks.forEach(([n,r])=>downloadText(`kivu-solutions-${n}-${day(new Date())}.csv`,rowsToCsv(r),'text/csv'));});
$('#exportBackupBtn')?.addEventListener('click',()=>downloadText(`kivu-solutions-backup-${day(new Date())}.json`,JSON.stringify({version:DUKA_APP_VERSION,exported_at:new Date().toISOString(),shop,products,sales,customers,credits,suppliers,supplierPurchases,supplierPayments,expenses,employees,shifts},null,2),'application/json'));

// Language shell (major navigation + common controls). Detailed transaction data remains unchanged.
const I18N={en:{dashboard:'Overview',sales:'Sales',hospitality:'Tables & Orders',inventory:'Inventory',suppliers:'Suppliers',expenses:'Expenses',customers:'Customers',employees:'Employees',shifts:'Shifts',controls:'Controls',reports:'Reports',subscription:'Subscription',settings:'Settings',dukaadmin:'Platinum Tech Admin'},rw:{dashboard:'Incamake',sales:'Ibyagurishijwe',hospitality:"Ameza n'Ibicuruzwa",inventory:'Ububiko',suppliers:'Abatanga ibicuruzwa',expenses:'Amafaranga yasohotse',customers:'Abakiriya',employees:'Abakozi',shifts:'Amashifuti',controls:'Igenzura',reports:'Raporo',subscription:'Ifatabuguzi',settings:'Igenamiterere',dukaadmin:'Ubuyobozi bwa Platinum Tech'},fr:{dashboard:'Aperçu',sales:'Ventes',hospitality:'Tables & Commandes',inventory:'Stock',suppliers:'Fournisseurs',expenses:'Dépenses',customers:'Clients',employees:'Employés',shifts:'Services',controls:'Contrôles',reports:'Rapports',subscription:'Abonnement',settings:'Paramètres',dukaadmin:'Admin Platinum Tech'}};
function applyLanguage(lang){lang=['en','rw','fr'].includes(lang)?lang:'en';localStorage.setItem('duka_lang',lang);$('#languageSelect').value=lang;$$('.nav[data-page]').forEach(b=>{const page=b.dataset.page;const lock=b.querySelector('.nav-lock');const txt=I18N[lang][page]||page;b.childNodes[0].nodeValue=txt+(lock?' ':'');});}
$('#languageSelect')?.addEventListener('change',e=>applyLanguage(e.target.value));setTimeout(()=>applyLanguage(shop?.preferred_language||localStorage.getItem('duka_lang')||'en'),2200);

// Enhance settings with location + language without disturbing existing V4.0 settings save.
function renderSettingsV41(){if(profile?.role!=='owner'||!shop)return;$('#settingsProvince').value=shop.province||'';$('#settingsDistrict').value=shop.district||'';$('#settingsSector').value=shop.sector||'';$('#settingsCell').value=shop.cell||'';$('#settingsLanguage').value=shop.preferred_language||'en';}
const oldRenderSettings=renderSettings;
renderSettings=function(){oldRenderSettings();renderSettingsV41();};
$('#settingsForm')?.addEventListener('submit',async()=>{if(profile?.role!=='owner')return;setTimeout(async()=>{const {error}=await sb.rpc('update_shop_profile_v41',{p_name:$('#settingsBusinessName').value,p_province:$('#settingsProvince').value||null,p_district:$('#settingsDistrict').value||null,p_sector:$('#settingsSector').value||null,p_cell:$('#settingsCell').value||null,p_language:$('#settingsLanguage').value});if(!error){Object.assign(shop,{province:$('#settingsProvince').value||null,district:$('#settingsDistrict').value||null,sector:$('#settingsSector').value||null,cell:$('#settingsCell').value||null,preferred_language:$('#settingsLanguage').value});applyLanguage(shop.preferred_language);}},250);});

// Make the mode switch visible whenever the account is a platform admin.
const oldApplyPermissions=applyPermissions;
applyPermissions=function(){oldApplyPermissions();$('#modeSwitchBtn')?.classList.toggle('hidden',!isDukaAdmin);};

// Initial onboarding guidance for new owner shops.
const oldRenderDashboard=renderDashboard;
renderDashboard=function(){oldRenderDashboard();if(profile?.role==='owner'&&shop?.onboarding_status&&shop.onboarding_status!=='active'){const a=$('#assistantMessage');if(a)a.innerHTML+=`<br><br><b>Getting started:</b> Complete business location, add your first product, invite staff if needed, then record your first sale. Current setup status: ${esc(shop.onboarding_status)}.`;}};

// Ensure any Platinum Tech employee role can enter the platform console when granted admin access.
Object.values(rolePages).forEach(a=>{if(!a.includes('dukaadmin'))a.push('dukaadmin');});

async function renderOwnerDevices(){
  const el=$('#ownerDevicesList');if(!el||profile?.role!=='owner'||!shop)return;
  const {data,error}=await sb.from('app_devices').select('*').eq('shop_id',shop.id).order('last_seen',{ascending:false});
  if(error){el.innerHTML='<div class="notice mini">Device list unavailable until the latest SQL migration is installed.</div>';return;}
  const currentKey=getDeviceKey();
  el.innerHTML=(data||[]).length?(data||[]).map(d=>{
    const isCurrent=d.device_key===currentKey;
    let action='';
    if(d.revoked_at){
      action=`<button class="btn secondary" onclick="restoreOwnerDevice('${d.id}')">Re-authorize</button>`;
    }else if(isCurrent){
      action='<span class="badge">This device</span>';
    }else{
      action=`<button class="btn danger" onclick="revokeOwnerDevice('${d.id}')">Force logout</button>`;
    }
    return `<div class="item"><div><b>${esc(d.device_label||'Device')}${isCurrent?' · This device':''}</b><small>Last seen ${fmt(d.last_seen)}</small>${d.revoked_at?'<small>Access revoked</small>':''}</div>${action}</div>`;
  }).join(''):'<div class="notice mini">No devices recorded yet.</div>';
}
window.revokeOwnerDevice=async function(id){
  const {data:rows}=await sb.from('app_devices').select('id,device_key').eq('id',id).limit(1);
  if(rows?.[0]?.device_key===getDeviceKey())return alert('You cannot revoke the device you are currently using. Use another owner device if you need to force this device out later.');
  const reason=prompt('Reason for revoking this device:','Lost device / staff left')||'';if(!reason)return;
  const {error}=await sb.rpc('revoke_app_device',{p_device_id:id,p_reason:reason});if(error)return alert(error.message);await renderOwnerDevices();
};
window.restoreOwnerDevice=async function(id){
  if(!confirm('Re-authorize this device? It will be allowed to use Kivu Solutions again.'))return;
  const {error}=await sb.rpc('restore_app_device',{p_device_id:id});if(error)return alert(error.message);await renderOwnerDevices();
};
const oldRenderSettingsV41=renderSettingsV41;
renderSettingsV41=function(){oldRenderSettingsV41();renderOwnerDevices().catch(()=>{});};

$('#featureFlagBtn')?.addEventListener('click',async()=>{if(!selectedSupportShopId)return;const key=prompt('Feature key to enable/disable (example: new_reports):');if(!key)return;const enabled=confirm('Enable this feature? OK = enable, Cancel = disable');const note=prompt('Reason / note:','Pilot feature')||'';const {error}=await sb.rpc('duka_set_feature_flag',{p_shop_id:selectedSupportShopId,p_key:key,p_enabled:enabled,p_note:note});if(error)return alert(error.message);alert(`Feature ${key} ${enabled?'enabled':'disabled'} for this shop.`);});
$('#generateExpiryAlertsBtn')?.addEventListener('click',async()=>{const {data,error}=await sb.rpc('generate_subscription_notifications');if(error)return alert(error.message);alert(`${data||0} subscription expiry notification(s) generated.`);});

// Enrich notification center with live shop conditions.
const originalLoadNotifications=loadNotifications;
loadNotifications=async function(){
  await originalLoadNotifications();
  if(!shop)return;
  const live=[];
  products.filter(p=>Number(p.qty)<=Number(p.low_stock)).slice(0,8).forEach(p=>live.push({title:`Low stock: ${p.name}`,message:`${stockDisplay(p)} remaining`}));
  const supplierDebt=supplierPurchases.filter(x=>Number(x.balance_due||0)>0);if(supplierDebt.length)live.push({title:'Supplier debt',message:`${money(supplierDebt.reduce((a,x)=>a+Number(x.balance_due||0),0))} outstanding`});
  const credit=credits.filter(x=>!x.paid);if(credit.length)live.push({title:'Customer credit',message:`${money(credit.reduce((a,x)=>a+Number(x.amount||0),0))} outstanding`});
  const pending=approvalRequests.filter(x=>x.status==='pending');if(pending.length)live.push({title:'Approvals waiting',message:`${pending.length} control request(s) need review`});
  const status=effectiveSubscriptionStatus();if(status==='grace'||status==='expired'||status==='trial')live.push({title:`Subscription: ${status}`,message:'Open Subscription to review your Kivu Solutions access dates.'});
  const stored=(shopNotifications||[]).map(n=>`<div class="item"><div><b>${esc(n.title)}</b><small>${esc(n.message)} · ${fmt(n.created_at)}</small></div></div>`).join('');
  const liveHtml=live.map(n=>`<div class="item"><div><b>${esc(n.title)}</b><small>${esc(n.message)}</small></div></div>`).join('');
  $('#notificationsList').innerHTML=(liveHtml+stored)||'<div class="notice mini">No notifications.</div>';
  $('#notificationCount').textContent=live.length+shopNotifications.filter(x=>!x.read_at).length;
};


/* V4.6 market-ready mobile navigation */
$$('.mobile-nav[data-mobile-page]').forEach(b=>b.addEventListener('click',()=>{
  const page=b.dataset.mobilePage;
  showPage(page);
  $$('.mobile-nav').forEach(x=>x.classList.toggle('active',x===b));
}));
$('.mobile-nav[data-mobile-more]')?.addEventListener('click',()=>$('.sidebar')?.classList.add('open'));

// Keep the mobile bottom navigation in sync when desktop/sidebar navigation is used.
const _v46ShowPage=showPage;
showPage=function(name,bypassSubscription=false){
  const result=_v46ShowPage(name,bypassSubscription);
  $$('.mobile-nav[data-mobile-page]').forEach(b=>b.classList.toggle('active',b.dataset.mobilePage===name));
  return result;
};

/* ============================================================
   KIVU SOLUTIONS V4.7 — HOSPITALITY MODE
   Bar / Restaurant / Bar & Restaurant
   ============================================================ */
let hospitalityTables=[],hospitalityTabs=[],hospitalityItems=[],hospitalityPayments=[],hospitalityRecipes=[],hospitalityWastage=[];
const hospitalityEnabled=()=>['bar','restaurant','bar_restaurant'].includes(shop?.business_type)&&hasFeature('hospitality');
const hTableName=id=>hospitalityTables.find(t=>t.id===id)?.name||'';
const hOpenTabs=()=>hospitalityTabs.filter(t=>t.status==='open');
const hTabItems=id=>hospitalityItems.filter(i=>i.tab_id===id);
const hTabTotal=id=>hTabItems(id).reduce((n,i)=>n+(i.complimentary?0:Number(i.qty)*Number(i.unit_price)),0);

const _loadV46=load;
load=async function(){
  await _loadV46();
  hospitalityTables=[];hospitalityTabs=[];hospitalityItems=[];hospitalityPayments=[];hospitalityRecipes=[];hospitalityWastage=[];
  if(!hospitalityEnabled())return;
  const id=shop.id;
  try{
    [hospitalityTables,hospitalityTabs,hospitalityItems,hospitalityPayments,hospitalityRecipes,hospitalityWastage]=await Promise.all([
      safeQuery(sb.from('hospitality_tables').select('*').eq('shop_id',id).order('name')),
      safeQuery(sb.from('hospitality_tabs').select('*').eq('shop_id',id).order('opened_at',{ascending:false}).limit(300)),
      safeQuery(sb.from('hospitality_tab_items').select('*').eq('shop_id',id).order('created_at',{ascending:true}).limit(2000)),
      safeQuery(sb.from('hospitality_payments').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(1000)),
      safeQuery(sb.from('recipe_components').select('*').eq('shop_id',id)),
      can('owner','manager')?safeQuery(sb.from('hospitality_wastage').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(200)):Promise.resolve([])
    ]);
  }catch(e){console.warn('Hospitality tables not ready:',e.message);}
};

const _applyPermissionsV46=applyPermissions;
applyPermissions=function(){
  _applyPermissionsV46();
  const b=$('#hospitalityNav');
  if(b)b.classList.toggle('hidden',!hospitalityEnabled()||!(rolePages[profile.role]||[]).includes('hospitality'));
};

const _renderV46=render;
render=function(){_renderV46();renderHospitality();};

function fillHospitalitySelects(){
  const tf=$('#hospitalityTabForm');
  if(tf){const occupied=new Set(hOpenTabs().map(x=>x.table_id).filter(Boolean));tf.elements.tableId.innerHTML='<option value="">No table / takeaway</option>'+hospitalityTables.filter(t=>t.active!==false&&!occupied.has(t.id)).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');}
  ['hospitalityOrderForm','hospitalityWastageForm'].forEach(id=>{const f=$('#'+id);if(f&&f.elements.productId)f.elements.productId.innerHTML=products.map(p=>`<option value="${p.id}">${esc(p.name)} — ${money(p.price)}</option>`).join('');});
  const rf=$('#hospitalityRecipeForm');if(rf)rf.elements.menuProductId.innerHTML=products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
}

function renderHospitality(){
  if(!$('#page-hospitality'))return;
  $('#hospitalityNav')?.classList.toggle('hidden',!hospitalityEnabled());
  if(!hospitalityEnabled())return;
  fillHospitalitySelects();
  const open=hOpenTabs(),today=day(new Date());
  $('#hospitalityTitle').textContent=shop.business_type==='bar'?'Bar tabs & service':shop.business_type==='restaurant'?'Restaurant tables & service':'Tables, bar tabs & service';
  $('#openTabsCount').textContent=open.length;
  $('#openTabsValue').textContent=money(open.reduce((n,t)=>n+hTabTotal(t.id),0));
  $('#occupiedTablesCount').textContent=new Set(open.map(t=>t.table_id).filter(Boolean)).size;
  $('#closedTabsToday').textContent=hospitalityTabs.filter(t=>t.status==='closed'&&t.closed_at&&day(t.closed_at)===today).length;
  $('#hospitalityTablesGrid').innerHTML=hospitalityTables.length?hospitalityTables.filter(t=>t.active!==false).map(t=>{const tab=open.find(x=>x.table_id===t.id);return `<button class="hospitality-table-card ${tab?'occupied':''}" ${tab?`onclick="openHospitalityOrder('${tab.id}')"`:`onclick="quickOpenHospitalityTable('${t.id}')"`}><b>${esc(t.name)}</b><span>${tab?'OPEN · '+money(hTabTotal(tab.id)):'Available'}</span><small>${t.seats?`${t.seats} seats`:''}</small></button>`}).join(''):'<div class="empty-state">No tables yet. Add tables, or use open bills without a table for bar-counter customers and takeaway.</div>';
  $('#hospitalityTabsList').innerHTML=open.length?open.map(t=>`<div class="item"><div><b>${esc(hTableName(t.table_id)||t.label||t.customer_name||'Open bill')}</b><small>${esc(t.waiter_name||'Staff')} · ${fmt(t.opened_at)} · ${hTabItems(t.id).length} item(s)</small></div><div><b>${money(hTabTotal(t.id))}</b> <button class="btn primary" onclick="openHospitalityOrder('${t.id}')">Open</button></div></div>`).join(''):'No open bills.';
  const tickets=hospitalityItems.filter(i=>i.sent_at&&!i.served_at&&hospitalityTabs.some(t=>t.id===i.tab_id&&t.status==='open'));
  $('#hospitalityTicketsList').innerHTML=tickets.length?tickets.map(i=>{const t=hospitalityTabs.find(x=>x.id===i.tab_id);return `<div class="item ticket"><div><b>${esc(i.product_name)} × ${i.qty}</b><small>${esc(hTableName(t?.table_id)||t?.label||'Tab')} · ${esc(i.note||'No special note')} · ${fmt(i.sent_at)}</small></div><div><button class="btn ghost" onclick="printKitchenTicket('${i.id}')">Print</button> ${can('owner','manager','cashier','kitchen')?`<button class="btn secondary" onclick="markHospitalityServed('${i.id}')">Mark served</button>`:''}</div></div>`}).join(''):'No pending kitchen/bar tickets.';
  const closed=hospitalityTabs.filter(t=>t.status==='closed').slice(0,100);
  $('#hospitalityClosedBody').innerHTML=closed.length?closed.map(t=>`<tr><td>${fmt(t.closed_at)}</td><td>${esc(hTableName(t.table_id)||t.label||t.customer_name||'Bill')}</td><td>${esc(t.waiter_name||'')}</td><td>${money(t.total)}</td><td>${esc(t.receipt_no||'')}</td></tr>`).join(''):'<tr><td colspan="5">No closed hospitality bills yet.</td></tr>';
}

$('#newTableBtn')?.addEventListener('click',()=>$('#hospitalityTableModal')?.showModal());
$('#newTabBtn')?.addEventListener('click',()=>{fillHospitalitySelects();$('#hospitalityTabModal')?.showModal();});
$('#wastageBtn')?.addEventListener('click',()=>{if(!can('owner','manager'))return alert('Owner or manager approval is required.');fillHospitalitySelects();$('#hospitalityWastageModal')?.showModal();});
$('#recipeBtn')?.addEventListener('click',()=>{if(!can('owner','manager'))return alert('Only an owner or manager can configure recipes.');fillHospitalitySelects();loadRecipeRows();$('#hospitalityRecipeModal')?.showModal();});

$('#hospitalityTableForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await sb.rpc('hospitality_save_table',{p_table_id:null,p_name:String(f.get('name')).trim(),p_seats:Number(f.get('seats')||0)||null,p_active:true});if(error)return alert(error.message);e.target.reset();$('#hospitalityTableModal').close();await refresh();});
$('#hospitalityTabForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {data,error}=await sb.rpc('hospitality_open_tab',{p_table_id:f.get('tableId')||null,p_label:f.get('label')||null,p_customer_name:f.get('customerName')||null});if(error)return alert(error.message);e.target.reset();$('#hospitalityTabModal').close();await refresh();openHospitalityOrder(data);});
window.quickOpenHospitalityTable=async id=>{const {data,error}=await sb.rpc('hospitality_open_tab',{p_table_id:id,p_label:null,p_customer_name:null});if(error)return alert(error.message);await refresh();openHospitalityOrder(data);};
window.openHospitalityOrder=id=>{const t=hospitalityTabs.find(x=>x.id===id);if(!t)return;const f=$('#hospitalityOrderForm');f.elements.tabId.value=id;$('#hospitalityOrderHeading').textContent=hTableName(t.table_id)||t.label||t.customer_name||'Open bill';renderHospitalityOrder(id);fillHospitalitySelects();$('#hospitalityOrderModal')?.showModal();};
function renderHospitalityOrder(id){const items=hTabItems(id);$('#hospitalityOrderItems').innerHTML=items.length?items.map(i=>`<div class="hospitality-line"><div><b>${esc(i.product_name)}</b><small>${i.qty} × ${money(i.unit_price)}${i.note?' · '+esc(i.note):''}${i.complimentary?' · COMPLIMENTARY':''}</small></div><div><b>${i.complimentary?'0 RWF':money(i.qty*i.unit_price)}</b><small>${i.served_at?'Served':i.sent_at?'Sent':'Not sent'}</small></div></div>`).join(''):'<div class="notice mini">No items on this bill yet.</div>';$('#hospitalityOrderItems').insertAdjacentHTML('beforeend',`<div class="sale-cart-total grand"><span>Bill total</span><strong>${money(hTabTotal(id))}</strong></div>`);}
$('#addHospitalityItemBtn')?.addEventListener('click',async()=>{const f=$('#hospitalityOrderForm'),id=f.elements.tabId.value,pid=f.elements.productId.value,qty=Number(f.elements.qty.value);const {error}=await sb.rpc('hospitality_add_item',{p_tab_id:id,p_product_id:pid,p_qty:qty,p_note:f.elements.note.value||null,p_complimentary:!!f.elements.complimentary.checked});if(error)return alert(error.message);f.elements.note.value='';f.elements.complimentary.checked=false;await refresh();renderHospitalityOrder(id);});
$('#sendHospitalityOrderBtn')?.addEventListener('click',async()=>{const id=$('#hospitalityOrderForm').elements.tabId.value;const {error}=await sb.rpc('hospitality_send_tab',{p_tab_id:id});if(error)return alert(error.message);await refresh();renderHospitalityOrder(id);});
window.markHospitalityServed=async id=>{const {error}=await sb.rpc('hospitality_mark_served',{p_item_id:id});if(error)return alert(error.message);await refresh();};
window.printKitchenTicket=id=>{const i=hospitalityItems.find(x=>x.id===id),t=i&&hospitalityTabs.find(x=>x.id===i.tab_id);if(!i)return;const w=window.open('','_blank','width=360,height=520');if(!w)return alert('Allow pop-ups to print kitchen/bar tickets.');w.document.write(`<!doctype html><meta charset="utf-8"><title>Order ticket</title><style>body{font:16px/1.35 monospace;padding:14px;width:72mm}h2{margin:0 0 8px;border-bottom:1px dashed #000;padding-bottom:8px}b{font-size:22px}.line{border-top:1px dashed #000;margin:10px 0}</style><h2>${esc(shop.name)} — ORDER</h2><div>${esc(hTableName(t?.table_id)||t?.label||'Counter / Takeaway')}</div><div class="line"></div><b>${esc(i.product_name)} × ${esc(i.qty)}</b><p>${esc(i.note||'No special note')}</p><div class="line"></div><small>${fmt(i.sent_at||i.created_at)} · ${esc(t?.waiter_name||i.created_by_name||'Staff')}</small>`);w.document.close();w.focus();setTimeout(()=>w.print(),150);};

function addHospitalityPaymentRow(method='Cash',amount=''){const box=$('#hospitalityPaymentRows');const d=document.createElement('div');d.className='form-grid hospitality-payment-row';d.innerHTML=`<label>Method<select name="payMethod"><option ${method==='Cash'?'selected':''}>Cash</option><option>Mobile Money</option><option>Bank</option><option>Credit</option><option>Other</option></select></label><label>Amount<input name="payAmount" type="number" min="0.01" step="0.01" value="${amount}" required></label>`;box.appendChild(d);}
$('#addHospitalityPaymentBtn')?.addEventListener('click',()=>addHospitalityPaymentRow('Mobile Money',''));
$('#settleHospitalityBtn')?.addEventListener('click',()=>{const id=$('#hospitalityOrderForm').elements.tabId.value,total=hTabTotal(id);$('#hospitalityPaymentForm').elements.tabId.value=id;$('#hospitalityPaymentSummary').innerHTML=`Amount due: <b>${money(total)}</b><br>Use one payment or add rows to split the amount across Cash / MoMo / Bank.`;$('#hospitalityPaymentRows').innerHTML='';addHospitalityPaymentRow('Cash',total);$('#hospitalityPaymentModal')?.showModal();});
$('#hospitalityPaymentForm')?.addEventListener('submit',async e=>{e.preventDefault();const id=e.target.elements.tabId.value;const rows=[...e.target.querySelectorAll('.hospitality-payment-row')],payments=rows.map(r=>({method:r.querySelector('[name=payMethod]').value,amount:Number(r.querySelector('[name=payAmount]').value)})).filter(x=>x.amount>0);const {data,error}=await sb.rpc('hospitality_close_tab',{p_tab_id:id,p_payments:payments});if(error)return alert(error.message);$('#hospitalityPaymentModal').close();$('#hospitalityOrderModal').close();alert(`Bill closed. Receipt: ${data}`);await refresh();});
$('#hospitalityWastageForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await sb.rpc('hospitality_record_wastage',{p_product_id:f.get('productId'),p_qty:Number(f.get('qty')),p_reason:f.get('reason')});if(error)return alert(error.message);e.target.reset();$('#hospitalityWastageModal').close();await refresh();});

function recipeRow(ingredient='',qty=''){const d=document.createElement('div');d.className='form-grid recipe-row';d.innerHTML=`<label>Ingredient / stock item<select name="ingredientId">${products.map(p=>`<option value="${p.id}" ${p.id===ingredient?'selected':''}>${esc(p.name)} (${esc(baseUnitLabel(p))})</option>`).join('')}</select></label><label>Qty consumed per menu item<input name="ingredientQty" type="number" min="0.001" step="0.001" value="${qty}" required></label>`;return d;}
function loadRecipeRows(){const f=$('#hospitalityRecipeForm');if(!f)return;const pid=f.elements.menuProductId.value,box=$('#hospitalityRecipeRows');box.innerHTML='';const rs=hospitalityRecipes.filter(r=>r.menu_product_id===pid);(rs.length?rs:[{}]).forEach(r=>box.appendChild(recipeRow(r.ingredient_product_id||'',r.qty_per_unit||'')));}
$('#hospitalityRecipeForm select[name="menuProductId"]')?.addEventListener('change',loadRecipeRows);
$('#addRecipeRowBtn')?.addEventListener('click',()=>$('#hospitalityRecipeRows')?.appendChild(recipeRow()));
$('#hospitalityRecipeForm')?.addEventListener('submit',async e=>{e.preventDefault();const pid=e.target.elements.menuProductId.value,rows=[...e.target.querySelectorAll('.recipe-row')];const payload=rows.map(r=>({ingredient_product_id:r.querySelector('[name=ingredientId]').value,qty_per_unit:Number(r.querySelector('[name=ingredientQty]').value)})).filter(x=>x.qty_per_unit>0);const saved=await sb.rpc('hospitality_replace_recipe',{p_menu_product_id:pid,p_components:payload});if(saved.error)return alert(saved.error.message);$('#hospitalityRecipeModal').close();await refresh();alert('Recipe saved. Ingredient stock will be consumed when the bill is settled.');});


/* ============================================================
   KIVU SOLUTIONS V4.8 — LAUNCH EXPERIENCE
   Offline queue, barcode checkout, role-specific hospitality, imports.
   ============================================================ */
let offlineSnapshotMode=false;
function saveOfflineSnapshot(){
  if(!window.KivuOffline||!session?.user?.id||!shop)return;
  window.KivuOffline.saveSnapshot(session.user.id,{profile,shop,shopFeatureFlags,products,sales,expenses,stockPurchases,customers,credits,employees,shifts,suppliers,supplierPurchases,supplierPayments,currentShift,saved_at:new Date().toISOString()});
}
function restoreOfflineSnapshot(){
  const snap=window.KivuOffline?.loadSnapshot?.(session?.user?.id);if(!snap)return false;
  ({profile,shop,shopFeatureFlags={},products=[],sales=[],expenses=[],stockPurchases=[],customers=[],credits=[],employees=[],shifts=[],suppliers=[],supplierPurchases=[],supplierPayments=[],currentShift=null}=snap);
  offlineSnapshotMode=true;return !!profile&&!!shop;
}
function applyOfflineStockDraft(items){
  for(const item of items){const p=products.find(x=>x.id===item.product_id);if(!p)continue;const ratio=item.unit_mode==='bulk'?unitsPerBulk(p):1;p.qty=Math.max(0,Number(p.qty||0)-Number(item.entered_qty||0)*ratio);}
  renderInventory();
}
const _enterV48=enter;
enter=async function(){
  if(!navigator.onLine&&restoreOfflineSnapshot()){
    $('#authScreen').classList.add('hidden');$('#appShell').classList.remove('hidden');isDukaAdmin=false;applyPermissions();render();await updateConnectivityUI();return;
  }
  offlineSnapshotMode=false;await _enterV48();if(session&&shop){saveOfflineSnapshot();await updateConnectivityUI();syncOfflineSales().catch(console.warn);}
};
const _refreshV48=refresh;
refresh=async function(){if(!navigator.onLine){saveOfflineSnapshot();render();return;}await _refreshV48();saveOfflineSnapshot();await updateConnectivityUI();};

async function updateConnectivityUI(){
  const badge=$('#connectivityBadge'),button=$('#offlineQueueBtn'),countEl=$('#offlineQueueCount');
  const pending=window.KivuOffline&&shop?await window.KivuOffline.countSales(shop.id):0;
  if(badge){badge.textContent=navigator.onLine?'Online':'Offline';badge.classList.toggle('online',navigator.onLine);badge.classList.toggle('offline',!navigator.onLine);}
  if(countEl)countEl.textContent=String(pending);if(button)button.classList.toggle('hidden',pending===0);
}
// Only one replay may run in this tab at a time. The SQL RPC also uses the
// stable client_ref to make retries idempotent across tabs/devices.
let offlineSyncInFlight=null;
function syncOfflineSales(){
  if(offlineSyncInFlight)return offlineSyncInFlight;
  offlineSyncInFlight=runOfflineSalesSync().finally(()=>{offlineSyncInFlight=null;});
  return offlineSyncInFlight;
}
async function runOfflineSalesSync(){
  if(!navigator.onLine||!window.KivuOffline||!shop)return;
  const targetShopId=shop.id;
  const rows=await window.KivuOffline.listSales(targetShopId);
  if(!rows.length){await updateConnectivityUI();return;}
  for(const row of rows){
    // Stop replay if the logged-in account/shop changed during a sync.
    if(!shop||shop.id!==targetShopId||!session?.user?.id||session.user.id!==row.user_id)break;
    try{
      await window.KivuOffline.updateSale(row.client_ref,{status:'syncing',last_error:null});
      const {error}=await sb.rpc('record_sale_cart_v48',{
        p_items:row.items,p_payment:row.payment,p_discount:row.discount||0,
        p_customer_id:row.customer_id||null,p_customer_name:row.customer_name||null,
        p_client_ref:row.client_ref
      });
      if(error)throw error;
      await window.KivuOffline.removeSale(row.client_ref);
    }catch(err){
      await window.KivuOffline.updateSale(row.client_ref,{
        status:'needs_attention',last_error:err?.message||String(err)
      });
    }
  }
  await updateConnectivityUI();
  if(navigator.onLine&&shop?.id===targetShopId){await _refreshV48();saveOfflineSnapshot();}
}
window.addEventListener('online',()=>{updateConnectivityUI();syncOfflineSales().catch(console.warn);});
window.addEventListener('offline',()=>updateConnectivityUI());
$('#offlineQueueBtn')?.addEventListener('click',async()=>{const rows=await window.KivuOffline.listSales(shop.id);const errors=rows.filter(x=>x.status==='needs_attention');alert(rows.length?`${rows.length} offline sale(s) waiting. ${errors.length?errors.length+' need attention because server validation failed. Reconnect and retry after correcting stock/customer data.':'They will sync automatically when online.'}`:'No offline sales waiting.');if(navigator.onLine)syncOfflineSales().catch(console.warn);});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Service worker:',e.message)));

function findProductByBarcode(code){const clean=String(code||'').trim();return products.find(x=>String(x.barcode||'').trim()===clean);}
function chooseProductFromBarcode(code,{autoAdd=false,formSelector='#saleForm'}={}){const p=findProductByBarcode(code);if(!p){alert('No product matches that barcode. Register the barcode in Inventory first.');return null;}const f=$(formSelector);if(f?.elements?.productId){f.elements.productId.value=p.id;if(formSelector==='#saleForm')refreshSaleUnitOptions();if(f.elements.qty)f.elements.qty.value='1';}if(autoAdd)$('#addSaleItemBtn')?.click();return p;}
$('#saleBarcodeInput')?.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();const code=e.currentTarget.value.trim();if(!code)return;chooseProductFromBarcode(code,{autoAdd:true});e.currentTarget.value='';});
$('#scanSaleBarcodeBtn')?.addEventListener('click',async()=>{const code=await window.KivuCameraScanner?.open('Scan product for sale');if(!code)return;const p=chooseProductFromBarcode(code,{autoAdd:false});if(p){const qty=$('#saleForm')?.elements?.qty;if(qty){qty.value='1';qty.focus();qty.select?.();}}});
$('#scanProductBarcodeBtn')?.addEventListener('click',async()=>{const code=await window.KivuCameraScanner?.open('Scan barcode for new product');if(code){const input=$('#productBarcodeInput');if(input)input.value=code;}});
$('#scanEditProductBarcodeBtn')?.addEventListener('click',async()=>{const code=await window.KivuCameraScanner?.open('Scan product barcode');if(code){const input=$('#editProductBarcodeInput');if(input)input.value=code;}});
$('#scanStockProductBtn')?.addEventListener('click',async()=>{const code=await window.KivuCameraScanner?.open('Scan product to add stock');if(!code)return;const p=findProductByBarcode(code);if(!p)return alert('No product matches that barcode. Register the barcode in Inventory first.');const f=$('#stockForm');f.elements.productId.value=p.id;f.elements.qty.focus();});

function parseCsv(text){const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'){if(q&&n==='"'){cell+='"';i++;}else q=!q;}else if(c===','&&!q){row.push(cell);cell='';}else if((c==='\n'||c==='\\r')&&!q){if(c==='\\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);row=[];cell='';}else cell+=c;}row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);if(rows.length<2)return[];const h=rows[0].map(x=>x.trim().toLowerCase());return rows.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,(r[i]||'').trim()])));}
$('#importDataBtn')?.addEventListener('click',()=>{if(!can('owner','manager'))return;$('#importDataModal')?.showModal();});
$('#importDataForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!can('owner','manager'))return alert('Only owner or manager can import data.');const f=new FormData(e.target),file=f.get('file'),type=f.get('type');if(!file?.text)return alert('Choose a CSV file.');const rows=parseCsv(await file.text());if(!rows.length)return alert('No data rows found.');if(rows.length>2000)return alert('Import at most 2,000 rows at a time.');let payload;if(type==='products'){payload=rows.map(r=>({shop_id:shop.id,name:r.name,qty:Number(r.qty||0),cost:Number(r.cost||0),price:Number(r.price||0),low_stock:Number(r.low_stock||r.low||0),barcode:r.barcode||null,base_unit:r.base_unit||'Piece',bulk_unit:r.bulk_unit||'Carton',units_per_bulk:Number(r.units_per_bulk||1)})).filter(x=>x.name);}else{payload=rows.map(r=>({shop_id:shop.id,name:r.name,phone:r.phone||null,email:r.email||null})).filter(x=>x.name);}if(!payload.length)return alert('No valid rows found.');const table=type==='products'?'products':'customers';const {error}=await sb.from(table).insert(payload);if(error)return alert(`Import stopped: ${error.message}`);await audit('imported csv',table,{rows:payload.length});e.target.reset();$('#importDataModal').close();await refresh();alert(`${payload.length} ${type} imported.`);});

$('#accountantExportBtn')?.addEventListener('click',()=>{if(!can('owner','manager'))return;const rate=Number(shop.tax_rate||0);const rows=sales.map(x=>{const net=Number(x.total||0),tax=rate>0?net*rate/(100+rate):0;return{date:x.created_at,receipt:x.receipt_no,payment:x.payment,customer:x.customer,product:x.product_name,quantity:x.entered_qty||x.qty,unit:x.sold_unit||'',net_sales:net,discount:Number(x.discount||0),cost:Number(x.cost||0),gross_profit:net-Number(x.cost||0),tax_rate:rate,tax_included:tax,employee:x.employee_name};});downloadText(`kivu-accountant-sales-${day(new Date())}.csv`,rowsToCsv(rows),'text/csv');});

const _renderHospitalityV48=renderHospitality;
renderHospitality=function(){
  _renderHospitalityV48();if(!hospitalityEnabled())return;const role=profile?.role;
  $('#newTableBtn')?.classList.toggle('hidden',!can('owner','manager'));$('#recipeBtn')?.classList.toggle('hidden',!can('owner','manager'));$('#wastageBtn')?.classList.toggle('hidden',!can('owner','manager'));$('#newTabBtn')?.classList.toggle('hidden',!can('owner','manager','cashier','waiter'));
  $('#complimentaryWrap')?.classList.toggle('hidden',!can('owner','manager'));$('#requestComplimentaryBtn')?.classList.toggle('hidden',!can('cashier','waiter'));$('#settleHospitalityBtn')?.classList.toggle('hidden',!can('owner','manager','cashier'));$('#addHospitalityItemBtn')?.classList.toggle('hidden',!can('owner','manager','cashier','waiter'));$('#sendHospitalityOrderBtn')?.classList.toggle('hidden',!can('owner','manager','cashier','waiter'));
  $('#hospitalityManagementHead')?.classList.toggle('hidden',role==='kitchen');$('#hospitalityStats')?.classList.toggle('hidden',['waiter','kitchen'].includes(role));$('#hospitalityFloorSection')?.classList.toggle('hidden',role==='kitchen');$('#hospitalityClosedSection')?.classList.toggle('hidden',['waiter','kitchen'].includes(role));
  const panel=$('#hospitalityApprovalsPanel'),list=$('#hospitalityApprovalsList');if(panel&&list&&can('owner','manager')){const pending=approvalRequests.filter(x=>x.request_type==='hospitality_complimentary'&&x.status==='pending');panel.classList.toggle('hidden',pending.length===0);list.innerHTML=pending.map(x=>`<div class="item"><div><b>Complimentary request</b><small>${esc(x.requested_by_name||'Staff')} · ${esc(x.reason||'No reason')}</small></div><div><button class="btn primary" onclick="reviewApproval('${x.id}','approved')">Approve</button> <button class="btn danger" onclick="reviewApproval('${x.id}','rejected')">Reject</button></div></div>`).join('');}else panel?.classList.add('hidden');
};
$('#requestComplimentaryBtn')?.addEventListener('click',async()=>{if(!can('cashier','waiter'))return;const f=$('#hospitalityOrderForm'),reason=prompt('Reason for complimentary item (required):','');if(!reason?.trim())return;const {error}=await sb.rpc('hospitality_request_complimentary',{p_tab_id:f.elements.tabId.value,p_product_id:f.elements.productId.value,p_qty:Number(f.elements.qty.value),p_note:f.elements.note.value||null,p_reason:reason.trim()});if(error)return alert(error.message);f.elements.note.value='';alert('Complimentary request sent to owner/manager for approval.');await refresh();});

renderSettingsV41=function(){if(profile?.role!=='owner'||!shop)return;$('#settingsProvince').value=shop.province||'';$('#settingsDistrict').value=shop.district||'';$('#settingsSector').value=shop.sector||'';$('#settingsCell').value=shop.cell||'';$('#settingsLanguage').value=shop.preferred_language||'en';if($('#settingsTaxRate'))$('#settingsTaxRate').value=Number(shop.tax_rate||0);if($('#settingsTaxLabel'))$('#settingsTaxLabel').value=shop.tax_label||'VAT';if($('#settingsTaxNumber'))$('#settingsTaxNumber').value=shop.tax_number||'';};
setTimeout(()=>updateConnectivityUI().catch(()=>{}),1000);
