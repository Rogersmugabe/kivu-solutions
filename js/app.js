const cfg=window.KIVU_CONFIG||window.DUKA_CONFIG||{};
if(!cfg.SUPABASE_URL || !/^https?:\/\//.test(cfg.SUPABASE_URL)) {
  console.error('Check js/config.js: SUPABASE_URL must start with https://');
  window.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.className = 'notice danger';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;text-align:center;padding:12px;font-weight:bold;';
    b.textContent = 'Configuration Error: SUPABASE_URL must start with https:// in js/config.js';
    document.body?.prepend(b);
  });
}
const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);

let session=null,profile=null,shop=null;
let products=[],sales=[],expenses=[],credits=[],stockPurchases=[],customers=[],employees=[],shifts=[],audits=[],staffInvites=[];
let suppliers=[],supplierPurchases=[],supplierPayments=[];
let shopFeatureFlags={};
let approvalRequests=[],stockAdjustments=[];
let currentShift=null;
let saleCart=[];
let saleSearchQuery='', selectedSaleCategory='All';
let selectedInventoryCategory='All', inventorySearchQuery='', selectedInventoryStatus='all';
let selectedSalesCategory='All', salesSearchQuery='';
let customerSearchQuery='';
let supplierSearchQuery='';
let selectedExpensesCategory='All', expensesSearchQuery='';
let lastTenderedInfo=null;
let isDukaAdmin=false,platformOverview=null,platformShops=[];

/* LOCAL PERSISTENT STORAGE HELPERS */
function getHeldCarts(){
  if(!shop?.id) return [];
  try{ return JSON.parse(localStorage.getItem(`kivu_held_carts_${shop.id}`)||'[]'); }catch(_e){ return []; }
}
function saveHeldCarts(list){
  if(!shop?.id) return;
  try{ localStorage.setItem(`kivu_held_carts_${shop.id}`, JSON.stringify(list||[])); }catch(_e){}
  updateHeldCartsBadge();
}
function updateHeldCartsBadge(){
  const badge=$('#parkedCartsBadge'); if(badge) badge.textContent = getHeldCarts().length;
}

function getProductMetaMap(shopId){
  const sid = shopId || shop?.id;
  if(!sid) return {};
  try{ return JSON.parse(localStorage.getItem(`kivu_product_meta_${sid}`)||'{}'); }catch(_e){ return {}; }
}
function saveProductMetaSingle(shopId, productId, patch){
  const sid = shopId || shop?.id;
  if(!sid || !productId) return;
  try{
    const map = getProductMetaMap(sid);
    map[productId] = { ...(map[productId]||{}), ...patch };
    localStorage.setItem(`kivu_product_meta_${sid}`, JSON.stringify(map));
  }catch(_e){}
}

function getCreditRepayments(shopId){
  const sid = shopId || shop?.id;
  if(!sid) return [];
  try{ return JSON.parse(localStorage.getItem(`kivu_credit_repayments_${sid}`)||'[]'); }catch(_e){ return []; }
}
function saveCreditRepayment(repayment){
  if(!shop?.id) return;
  try{
    const list = getCreditRepayments(shop.id);
    list.unshift(repayment);
    localStorage.setItem(`kivu_credit_repayments_${shop.id}`, JSON.stringify(list));
  }catch(_e){}
}
function getShiftDebtCollections(shiftId){
  if(!shiftId || !shop?.id) return 0;
  const list = getCreditRepayments(shop.id);
  return list.filter(x => x.shift_id === shiftId && x.payment_method === 'Cash').reduce((a, x) => a + Number(x.amount||0), 0);
}

function getShiftPettyCashPayouts(shopId){
  const sid = shopId || shop?.id;
  if(!sid) return [];
  try{ return JSON.parse(localStorage.getItem(`kivu_petty_cash_${sid}`)||'[]'); }catch(_e){ return []; }
}
function saveShiftPettyCashPayout(shopId, payout){
  const sid = shopId || shop?.id;
  if(!sid) return;
  try{
    const list = getShiftPettyCashPayouts(sid);
    list.unshift(payout);
    localStorage.setItem(`kivu_petty_cash_${sid}`, JSON.stringify(list));
  }catch(_e){}
}

function getReceiptTendered(receiptNo){
  if(!receiptNo || !shop?.id) return null;
  try{ return JSON.parse(localStorage.getItem(`kivu_receipt_tendered_${shop.id}_${receiptNo}`)||'null'); }catch(_e){ return null; }
}
function saveReceiptTendered(receiptNo, info){
  if(!receiptNo || !shop?.id || !info) return;
  try{ localStorage.setItem(`kivu_receipt_tendered_${shop.id}_${receiptNo}`, JSON.stringify(info)); }catch(_e){}
}

function getSplitPaymentDetails(receiptNo){
  if(!receiptNo || !shop?.id) return null;
  try{ return JSON.parse(localStorage.getItem(`kivu_split_${shop.id}_${receiptNo}`)||'null'); }catch(_e){ return null; }
}
function saveSplitPaymentDetails(receiptNo, split){
  if(!receiptNo || !shop?.id || !split) return;
  try{ localStorage.setItem(`kivu_split_${shop.id}_${receiptNo}`, JSON.stringify(split)); }catch(_e){}
}


const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('en-RW',{maximumFractionDigits:0}).format(Math.round(Number(n)||0))+' RWF';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

/* UNIVERSAL TOAST NOTIFICATION SYSTEM */
function showToast(msg, type='info', title='', duration=3500){
  const container = $('#toastContainer') || document.body;
  const toast = document.createElement('div');
  toast.className = `kivu-toast kivu-toast-${type}`;
  const icons = { success: '✓', error: '✕', warning: '⚠️', info: 'ℹ️' };
  const titles = { success: 'Success', error: 'Notice', warning: 'Attention', info: 'Information' };
  toast.innerHTML = `
    <span class="kivu-toast-icon">${icons[type]||'ℹ️'}</span>
    <div class="kivu-toast-body">
      <div class="kivu-toast-title">${esc(title || titles[type] || '')}</div>
      <p class="kivu-toast-msg">${esc(msg)}</p>
    </div>
    <button type="button" class="kivu-toast-close" aria-label="Dismiss">✕</button>
  `;
  const closeBtn = toast.querySelector('.kivu-toast-close');
  const dismiss = () => {
    toast.classList.add('hiding');
    setTimeout(() => { if(toast.parentNode) toast.parentNode.removeChild(toast); }, 220);
  };
  if(closeBtn) closeBtn.onclick = dismiss;
  container.appendChild(toast);
  if(duration > 0) setTimeout(dismiss, duration);
}
window.showToast = showToast;

function kivuNotify(msg, type='info', title='', duration=3500){
  let t = type;
  if(t === 'info' && msg){
    const s = String(msg).toLowerCase();
    if(s.includes('error') || s.includes('failed') || s.includes('could not') || s.includes('violate')) t = 'error';
    else if(s.includes('saved') || s.includes('success') || s.includes('restored') || s.includes('created') || s.includes('opened') || s.includes('recorded') || s.includes('imported') || s.includes('approved')) t = 'success';
    else if(s.includes('enter') || s.includes('valid') || s.includes('required') || s.includes('permission') || s.includes('cannot') || s.includes('warning') || s.includes('empty') || s.includes('not found') || s.includes('must be')) t = 'warning';
  }
  const dur = t === 'error' ? 6000 : duration;
  showToast(msg, t, title, dur);
  const region = document.getElementById('toastRegion');
  if(region) region.textContent = `${t.toUpperCase()}: ${msg}`;
}
window.kivuNotify = kivuNotify;

let kivuLastActiveElement = null;

function kivuConfirm(msg, { title='Confirm Action', confirmText='Confirm', cancelText='Cancel', danger=false } = {}){
  return new Promise(resolve => {
    kivuLastActiveElement = document.activeElement;
    const dialog = document.getElementById('confirmDialog');
    if(!dialog){
      return resolve(window.confirm(msg));
    }
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    if(titleEl) titleEl.textContent = title;
    if(msgEl) msgEl.textContent = msg;
    if(okBtn){
      okBtn.textContent = confirmText;
      okBtn.className = danger ? 'btn danger' : 'btn primary';
    }
    if(cancelBtn) cancelBtn.textContent = cancelText;

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('close', onClose);
      if(kivuLastActiveElement && typeof kivuLastActiveElement.focus === 'function'){
        try{ kivuLastActiveElement.focus(); }catch(_e){}
      }
    };

    const onClose = () => {
      if(!settled){
        settled = true;
        cleanup();
        resolve(false);
      }
    };

    okBtn.onclick = () => {
      if(!settled){
        settled = true;
        cleanup();
        dialog.close();
        resolve(true);
      }
    };

    cancelBtn.onclick = () => {
      if(!settled){
        settled = true;
        cleanup();
        dialog.close();
        resolve(false);
      }
    };

    dialog.addEventListener('close', onClose, { once: true });
    dialog.showModal();
    if(danger && cancelBtn){
      cancelBtn.focus();
    } else if(okBtn){
      okBtn.focus();
    }
  });
}
window.kivuConfirm = kivuConfirm;

function kivuPrompt(msg, { title='Please enter', defaultValue='', multiline=false, required=false, inputType='text', minLength=0 } = {}){
  return new Promise(resolve => {
    kivuLastActiveElement = document.activeElement;
    const dialog = document.getElementById('promptDialog');
    if(!dialog){
      return resolve(window.prompt(msg, defaultValue));
    }
    const titleEl = document.getElementById('promptTitle');
    const msgEl = document.getElementById('promptMessage');
    const inputEl = document.getElementById('promptInput');
    const textareaEl = document.getElementById('promptTextarea');
    const okBtn = document.getElementById('promptOkBtn');
    const cancelBtn = document.getElementById('promptCancelBtn');
    const form = document.getElementById('promptForm');

    if(titleEl) titleEl.textContent = title;
    if(msgEl) msgEl.textContent = msg;

    const activeInput = multiline ? textareaEl : inputEl;
    if(multiline){
      inputEl?.classList.add('hidden');
      textareaEl?.classList.remove('hidden');
      if(textareaEl) textareaEl.value = defaultValue || '';
    } else {
      textareaEl?.classList.add('hidden');
      inputEl?.classList.remove('hidden');
      if(inputEl){
        inputEl.type = inputType || 'text';
        inputEl.value = defaultValue || '';
      }
    }

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('close', onClose);
      if(kivuLastActiveElement && typeof kivuLastActiveElement.focus === 'function'){
        try{ kivuLastActiveElement.focus(); }catch(_e){}
      }
    };

    const onClose = () => {
      if(!settled){
        settled = true;
        cleanup();
        resolve(null);
      }
    };

    const submitVal = () => {
      const val = activeInput?.value ?? '';
      if(required && !val.trim()){
        kivuNotify('This field is required.', 'warning');
        activeInput?.focus();
        return;
      }
      if(minLength && val.length < minLength){
        kivuNotify(`Must be at least ${minLength} characters.`, 'warning');
        activeInput?.focus();
        return;
      }
      settled = true;
      cleanup();
      dialog.close();
      resolve(val);
    };

    if(form){
      form.onsubmit = (e) => {
        e.preventDefault();
        submitVal();
      };
    }
    if(okBtn) okBtn.onclick = (e) => {
      e.preventDefault();
      submitVal();
    };

    if(cancelBtn) cancelBtn.onclick = () => {
      if(!settled){
        settled = true;
        cleanup();
        dialog.close();
        resolve(null);
      }
    };

    dialog.addEventListener('close', onClose, { once: true });
    dialog.showModal();
    activeInput?.focus();
    activeInput?.select?.();
  });
}
window.kivuPrompt = kivuPrompt;

/* GLOBAL KEYBOARD ACCESSIBILITY & SHORTCUTS (F2, ESC, CTRL+ENTER) */
window.addEventListener('keydown', e => {
  if (e.key === 'F2') {
    e.preventDefault();
    const modal = $('#saleModal');
    if (modal && !modal.open) {
      if (typeof initSaleModal === 'function') initSaleModal();
      modal.showModal();
      initMoneyInputs(modal);
    }
  } else if (e.key === 'Escape') {
    const openDialog = document.querySelector('dialog[open]');
    if (openDialog) {
      openDialog.close();
      const form = openDialog.querySelector('form');
      if (form) form.reset();
      $('#saleCustomerWrap')?.classList.add('hidden');
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if ($('#saleModal')?.open && saleCart.length > 0) {
      e.preventDefault();
      $('#saleForm')?.requestSubmit();
    }
  }
});

/* UNIVERSAL MONEY INPUT FORMATTING (COMMAS) */
function formatMoneyString(val){
  if(val===null||val===undefined)return '';
  const s=String(val).trim();
  if(!s)return '';
  const isNeg=s.startsWith('-');
  const clean=s.replace(/[^0-9.]/g,'');
  if(!clean)return isNeg?'-':'';
  const parts=clean.split('.');
  // Strip leading zeroes if more digits follow (e.g. "0500" -> "500"), but preserve single "0"
  const intPart=parts[0].replace(/^0+(?=\d)/,'');
  const decPart=parts.length>1?'.'+parts.slice(1).join(''):'';
  const formattedInt=intPart?intPart.replace(/\B(?=(\d{3})+(?!\d))/g,','):'0';
  return (isNeg?'-':'')+(intPart?formattedInt:'0')+decPart;
}
window.formatMoneyString=formatMoneyString;

function parseMoney(val){
  if(val===null||val===undefined)return 0;
  if(typeof val==='object'&&val!==null&&'value' in val) val=val.value;
  if(typeof val==='number')return Number.isFinite(val)?val:0;
  const cleaned=String(val).replace(/,/g,'').trim();
  const num=Number(cleaned);
  return Number.isFinite(num)?num:0;
}
window.parseMoney=parseMoney;

function attachMoneyInputFormatter(input){
  if(!input)return;
  if(input.dataset.moneyFormatted){
    if(input.value&&!input.value.includes(',')){
      input.value=formatMoneyString(input.value);
    }
    return;
  }
  input.dataset.moneyFormatted='1';
  if(input.type==='number'){
    input.type='text';
    input.inputMode='decimal';
    input.autocomplete='off';
  }
  if(input.value&&!input.value.includes(',')){
    input.value=formatMoneyString(input.value);
  }

  // Smooth Backspace & Delete handling around comma separators
  input.addEventListener('keydown',e=>{
    const val=input.value;
    const start=input.selectionStart, end=input.selectionEnd;
    if(start===end&&start!=null){
      if(e.key==='Backspace'&&start>0&&val[start-1]===','){
        e.preventDefault();
        // Remove comma and the digit before it
        input.value=val.slice(0,start-2)+val.slice(start);
        input.dispatchEvent(new Event('input',{bubbles:true}));
      } else if(e.key==='Delete'&&start<val.length&&val[start]===','){
        e.preventDefault();
        // Remove comma and the digit after it
        input.value=val.slice(0,start)+val.slice(start+2);
        input.dispatchEvent(new Event('input',{bubbles:true}));
      }
    }
  });

  input.addEventListener('input',()=>{
    const raw=input.value;
    const selStart=input.selectionStart??raw.length;
    const digitsBefore=raw.slice(0,selStart).replace(/[^0-9.]/g,'').length;
    const formatted=formatMoneyString(raw);
    input.value=formatted;
    let newCursor=0, digitsSeen=0;
    while(newCursor<formatted.length&&digitsSeen<digitsBefore){
      if(/[0-9.]/.test(formatted[newCursor])) digitsSeen++;
      newCursor++;
    }
    try{ input.setSelectionRange(newCursor,newCursor); }catch(_e){}
  });
  input.addEventListener('blur',()=>{
    if(input.value) input.value=formatMoneyString(input.value);
  });
}
window.attachMoneyInputFormatter=attachMoneyInputFormatter;

function initMoneyInputs(root=document){
  if(!root)return;
  const selectors=[
    'input.money-input',
    'input[data-money-input]',
    'input[name="cost"]',
    'input[name="price"]',
    'input[name="bulkPrice"]',
    'input[name="totalCost"]',
    'input[name="amount"]',
    'input[name="amountPaid"]',
    'input[name="purchaseUnitCost"]',
    'input[name="openingCash"]',
    'input[name="actualCash"]',
    'input[name="discount"]',
    'input[name="payAmount"]',
    '#amountTenderedInput',
    '#splitCashInput',
    '#splitMomoInput',
    '#splitBankInput'
  ];
  try{
    const list=root.querySelectorAll(selectors.join(','));
    list.forEach(attachMoneyInputFormatter);
  }catch(_e){}
}
window.initMoneyInputs=initMoneyInputs;
const pad2=n=>String(n).padStart(2,'0');
const localDay=d=>{const x=new Date(d);if(isNaN(x.getTime()))return '';return `${x.getFullYear()}-${pad2(x.getMonth()+1)}-${pad2(x.getDate())}`;};
const day=localDay;
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
  if(dialog?.showModal) dialog.showModal(); else kivuNotify(message?.textContent||customMessage||'Upgrade your plan to use this feature.');
}
const requireFeature=(feature,message)=>{
  if(hasFeature(feature)) return true;
  showUpgrade(feature,message);
  return false;
};

if($('#todayDate')) $('#todayDate').textContent=new Date().toLocaleDateString('en-RW',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

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
    const password=await kivuPrompt('Enter a new Kivu Solutions password (at least 6 characters):',{title:'New Password',inputType:'password',required:true,minLength:6});
    if(password&&password.length>=6){const {error}=await sb.auth.updateUser({password});kivuNotify(error?error.message:'Password changed successfully. You can continue using Kivu Solutions.');}
  }
});

function showAppInitLoader(text){const el=$('#appInitLoader');if(!el)return;const t=$('#appInitLoaderText');if(t&&text)t.textContent=text;el.classList.remove('hidden');}
function hideAppInitLoader(){const el=$('#appInitLoader');if(el)el.classList.add('hidden');}
$('#logoutBtn').onclick=async()=>{try{localStorage.removeItem('kivu_offline_snapshot_v1');}catch(_e){}document.documentElement.classList.remove('has-cached-session');await sb.auth.signOut();};
$('#topLogoutBtn').onclick=async()=>{try{localStorage.removeItem('kivu_offline_snapshot_v1');}catch(_e){}document.documentElement.classList.remove('has-cached-session');await sb.auth.signOut();};
sb.auth.onAuthStateChange(async(_event,s)=>{session=s;if(s)await enter();else showAuth()});
(async()=>{const {data}=await sb.auth.getSession();session=data.session;if(session)await enter();else showAuth()})();

function showAuth(){try{localStorage.removeItem('kivu_offline_snapshot_v1');}catch(_e){}document.documentElement.classList.remove('has-cached-session');hideAppInitLoader();
  $('#authScreen').classList.remove('hidden');
  $('#appShell').classList.add('hidden');
}

async function enter(){
  if(profile&&shop){$('#authScreen').classList.add('hidden');$('#appShell').classList.remove('hidden');}

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
    $('#authScreen').classList.add('hidden');
    $('#appShell').classList.remove('hidden');
  }catch(err){
    console.error(err);
    console.error(err); kivuNotify(err.message||'Could not load Kivu Solutions.');
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
  $$('.nav-section').forEach(sec=>{
    const hasVisible=!!sec.querySelector('.nav:not(.hidden)');
    sec.classList.toggle('hidden',!hasVisible);
  });
  $$('.owner-only').forEach(x=>x.classList.toggle('hidden',profile.role!=='owner'));
  $$('.owner-manager-only').forEach(x=>x.classList.toggle('hidden',!can('owner','manager')));
  const rTxt=roleLabel(profile.role);
  if($('#roleBadge')) $('#roleBadge').textContent=rTxt;
  if($('#topRoleBadge')) $('#topRoleBadge').textContent=rTxt;
  $('#dukaAdminNav')?.classList.toggle('hidden',!isDukaAdmin);

  $('#quickSaleBtn').classList.toggle('hidden',!can('owner','manager','cashier'));
  $$('[data-open="saleModal"]').forEach(x=>{x.classList.toggle('hidden',!can('owner','manager','cashier'));if(!x.dataset.cartHook){x.dataset.cartHook='1';x.addEventListener('click',()=>{initSaleModal();});}});
  $$('[data-open="expenseModal"]').forEach(x=>x.classList.toggle('hidden',!can('owner','manager')));
  $$('[data-open="stockModal"]').forEach(x=>x.classList.toggle('hidden',!can('owner','manager','stock_clerk')));
  $$('[data-open="purchaseModal"]').forEach(x=>x.classList.toggle('hidden',!can('owner','manager')));
  $$('[data-open="productModal"]').forEach(x=>x.classList.toggle('hidden',!can('owner','manager')));
  $$('[data-open="creditModal"]').forEach(x=>x.classList.toggle('hidden',!can('owner','manager','cashier')));
  $$('[data-open="customerModal"]').forEach(x=>x.classList.toggle('hidden',!can('owner','manager','cashier')));
  const creditOption=$('#saleForm select[name="payment"] option[value="Credit"]');
  if(creditOption){creditOption.disabled=!hasFeature('credit');creditOption.hidden=!hasFeature('credit');}
  const creditPill=$('#posPaymentPills [data-method="Credit"]');if(creditPill) creditPill.classList.toggle('hidden',!hasFeature('credit'));
  const saleCustomerSelect=$('#saleForm select[name="customerId"]');
  saleCustomerSelect?.closest('label')?.classList.toggle('hidden',!hasFeature('customers'));
  if(!hasFeature('credit')) $('#saleCustomerWrap')?.classList.add('hidden');

  const hideFinancial=!can('owner','manager');
  $('#profitToday')?.closest('.kpi-card, article')?.classList.toggle('hidden',hideFinancial);
  $('#expensesToday')?.closest('.kpi-card, article')?.classList.toggle('hidden',hideFinancial);
  $('#stockValue')?.closest('.kpi-card, article')?.classList.toggle('hidden',hideFinancial);
  $('#dashboardTrendChartCard')?.classList.toggle('hidden',hideFinancial);
  $('#panelPaymentChannels')?.classList.toggle('hidden',hideFinancial);

  if(profile.role==='stock_clerk'||!hasFeature('shifts')) $('#shiftStatusCard')?.classList.add('hidden');
  else $('#shiftStatusCard')?.classList.remove('hidden');

  const current=$('.page.active')?.id?.replace('page-','')||'dashboard';
  if(!allowed.includes(current)) showPage(allowed[0]||'dashboard');
}

function syncPaymentMethodUI(method){
  const f=$('#saleForm'); if(!f) return; if(method==='Credit'&&!hasFeature('credit')){ requireFeature('credit','Customer credit is included in Kivu Lite.'); return; }
  if(f.elements.payment && f.elements.payment.value !== method){
    f.elements.payment.value = method;
  }
  $$('#posPaymentPills .pos-pay-pill').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.method === method);
  }); if(method==='Split'){ const st=saleCart.reduce((a,x)=>a+saleLinePreview(x),0),disc=Math.max(0,parseMoney(f.elements.discount?.value||0)),tot=Math.max(0,st-disc); if($('#splitCashInput')&&!parseMoney($('#splitCashInput').value)&&!parseMoney($('#splitMomoInput')?.value)&&tot>0){ $('#splitCashInput').value=formatMoneyString(Math.round(tot/2)); if($('#splitMomoInput')) $('#splitMomoInput').value=formatMoneyString(tot-Math.round(tot/2)); } }
  updateTenderedCalculator();
}
window.syncPaymentMethodUI=syncPaymentMethodUI;

function initSaleModal(){
  saleSearchQuery='';
  selectedSaleCategory='All';
  const inp=$('#saleProductSearch'); if(inp) inp.value='';
  $('#clearSaleSearchBtn')?.classList.add('hidden');
  renderSaleCategoryPills();
  renderSaleQuickResults();
  renderSaleCart();
  syncPaymentMethodUI('Cash');
  updateTenderedCalculator();
  initMoneyInputs($('#saleModal'));
  setTimeout(()=>$('#saleProductSearch')?.focus(), 80);
  updateHeldCartsBadge();
}

$$('.nav').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
$('#menuBtn').onclick=()=>$('.sidebar').classList.toggle('open');
$('#sidebarBackdrop')?.addEventListener('click',()=>$('.sidebar').classList.remove('open'));
$('#quickSaleBtn').onclick=()=>{if(!ensureSubscriptionAccess())return;initSaleModal();$('#saleModal').showModal();};
function ensureSubscriptionAccess(){
  if(subscriptionAllowsAccess()) return true;
  const status=effectiveSubscriptionStatus();
  kivuNotify(`Your Kivu Solutions subscription is ${status}. Please open Subscription and renew a plan to continue using business features.`);
  showPage('subscription',true);
  return false;
}
const PAGE_TITLES = {
  dashboard: 'Executive Command Center',
  sales: 'Sales & Transactions',
  hospitality: 'Tables, Tabs & Service',
  inventory: 'Products & Stock Inventory',
  customers: 'Customers & "Amadeni" Ledger',
  suppliers: 'Suppliers & Purchases',
  expenses: 'Operating Expenses',
  employees: 'Team & Staff Accounts',
  shifts: 'Cash Reconciliation & Shifts',
  controls: 'Anti-Theft Controls & Exceptions',
  reports: 'Reports & Profit Analytics',
  subscription: 'Plans & Subscription Billing',
  settings: 'Business Settings',
  dukaadmin: 'Platinum Tech Platform Admin'
};
function showPage(name,bypassSubscription=false){
  if(name==='dukaadmin'&&!isDukaAdmin)return;
  if(!(rolePages[profile.role]||[]).includes(name)) return;
  if(!bypassSubscription&&!subscriptionAllowsAccess()&&!['dashboard','subscription','settings','dukaadmin'].includes(name)){ensureSubscriptionAccess();return;}
  const feature=PAGE_FEATURE[name];
  if(feature&&!hasFeature(feature)){showUpgrade(feature);return;}
  $$('.nav').forEach(b=>{const act=b.dataset.page===name;b.classList.toggle('active',act);if(act)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $$('.mobile-nav[data-mobile-page]').forEach(b=>{const act=b.dataset.mobilePage===name;b.classList.toggle('active',act);if(act)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $$('.page').forEach(p=>p.classList.remove('active'));
  $(`#page-${name}`).classList.add('active');
  if($('#pageTitle')) $('#pageTitle').textContent=PAGE_TITLES[name]||(name[0].toUpperCase()+name.slice(1));
  $('.sidebar').classList.remove('open');
  if(name==='dashboard')renderDashboard();
  if(name==='sales')renderSales();
  if(name==='hospitality')renderHospitality();
  if(name==='inventory')renderInventory();
  if(name==='suppliers')renderSuppliers();
  if(name==='customers')renderCustomers();
  if(name==='expenses')renderExpenses();
  if(name==='shifts')renderShifts();
  if(name==='employees')renderEmployees();
  if(name==='controls')renderControls();
  if(name==='reports')renderReports();
  if(name==='subscription')renderPlans();
  if(name==='settings')renderSettings();
  if(name==='dukaadmin')renderDukaAdmin();
}

const MODAL_FEATURE={creditModal:'credit',customerModal:'customers',staffInviteModal:'employees',openShiftModal:'shifts',closeShiftModal:'shifts'};
$$('[data-open]').forEach(b=>b.addEventListener('click',()=>{
  if(!ensureSubscriptionAccess())return;
  const feature=MODAL_FEATURE[b.dataset.open];
  if(feature&&!requireFeature(feature))return;
  if(b.dataset.open==='saleModal') initSaleModal();
  if(b.dataset.open==='purchaseModal'&&!$('#purchaseItems')?.children.length)addPurchaseItemRow();
  const modal=document.getElementById(b.dataset.open); modal?.showModal(); if(modal) initMoneyInputs(modal);
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
    can('owner','manager')
      ? safeQuery(sb.from('expenses').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(1000))
      : safeQuery(sb.from('expenses').select('*').eq('shop_id',id).eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(200)).catch(()=>[]),
    safeQuery(sb.from('stock_purchases').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(1000))
  ]);

  const metaMap=getProductMetaMap(id);
  products.forEach(p=>{
    if(metaMap[p.id]){
      if(metaMap[p.id].category&&!p.category) p.category=metaMap[p.id].category;
      if(metaMap[p.id].bulk_price&&!p.bulk_price) p.bulk_price=metaMap[p.id].bulk_price;
    }
  });
  updateHeldCartsBadge();

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
  try {
    const notifs=await safeQuery(sb.from('shop_notifications').select('*').eq('shop_id',id).order('created_at',{ascending:false}).limit(50));
    shopNotifications=notifs||[];
  } catch(_e) {
    shopNotifications=[];
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
  if(!can('owner','manager','stock_clerk'))return kivuNotify('You do not have permission to adjust stock.');
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
  if(error)return kivuNotify(error.message,'error');
  await refresh();
};

$('#voidSaleForm').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target);
  const {data,error}=await sb.rpc('request_or_void_sale',{p_sale_id:f.get('saleId'),p_reason:(f.get('reason')||'').trim()});
  if(error)return kivuNotify(error.message,'error');
  kivuNotify(data==='voided'?'Sale voided and stock restored.':'Void request sent for approval.');
  e.target.reset();$('#voidSaleModal').close();await refresh();
  window.showToast?.(data==='voided'?'Sale voided & inventory restored.':'Void request queued for approval.', data==='voided'?'warning':'info', 'Void Status');
};

$('#stockAdjustForm').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target);
  const {data,error}=await sb.rpc('request_or_adjust_stock',{p_product_id:f.get('productId'),p_qty_delta:+f.get('qtyDelta'),p_reason:(f.get('reasonType')||'Other')+': '+(f.get('note')||'').trim()});
  if(error)return kivuNotify(error.message,'error');
  kivuNotify(data==='applied'?'Stock adjusted and logged.':'Stock adjustment sent for approval.');
  e.target.reset();$('#stockAdjustModal').close();await refresh();
  window.showToast?.(data==='applied'?'Stock adjustment logged.':'Stock adjustment queued for approval.', data==='applied'?'success':'info', 'Stock Adjustment');
};

/* PRODUCTS + STOCK */
$('#productForm').onsubmit=async e=>{
  e.preventDefault();
  if(!can('owner','manager'))return kivuNotify('You do not have permission to create products.');
  const f=new FormData(e.target);
  const bulkPrice=parseMoney(f.get('bulkPrice'))||null;
  const category=(f.get('category')||'').trim()||null;
  const p={
    shop_id:shop.id,
    name:(f.get('name')||'').trim(),
    qty:+f.get('qty'),
    cost:parseMoney(f.get('cost')),
    price:parseMoney(f.get('price')),
    low_stock:+f.get('low'),
    preferred_supplier_id:f.get('preferredSupplierId')||null,
    base_unit:(f.get('baseUnit')||'Piece').trim(),
    bulk_unit:(f.get('bulkUnit')||'Carton').trim(),
    units_per_bulk:+f.get('unitsPerBulk')||1,
    expiry_date:f.get('expiryDate')||null,
    expiry_reminder_days:+f.get('expiryReminderDays')||14,
    barcode:(f.get('barcode')||'').trim()||null
  };
  let {data,error}=await sb.from('products').insert({ ...p, bulk_price: bulkPrice, category }).select('id');
  if(error && error.message?.includes('column')){
    const retry=await sb.from('products').insert(p).select('id');
    data=retry.data; error=retry.error;
  }
  if(error)return kivuNotify(error.message,'error');
  const newId=data?.[0]?.id;
  if(newId && (bulkPrice || category)){
    saveProductMetaSingle(shop.id, newId, { bulk_price: bulkPrice, category });
  }
  await audit('created product','product',{name:p.name});e.target.reset();$('#productModal').close();await refresh();window.showToast?.('Product catalog updated.', 'success', 'Catalog Updated');
};

$('#stockForm').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target),productId=f.get('productId');
  const {error}=await sb.rpc('receive_stock',{p_product_id:productId,p_qty:+f.get('qty'),p_total_cost:parseMoney(f.get('totalCost'))});
  if(error)return kivuNotify(error.message,'error');
  e.target.reset();$('#stockModal').close();await refresh();window.showToast?.('Stock inventory replenished.', 'success', 'Stock Received');
};

window.openEditProduct=function(id){
  if(!can('owner','manager'))return kivuNotify('Only an owner or manager can edit products.');
  const p=products.find(x=>x.id===id);if(!p)return kivuNotify('Product not found.');
  const form=$('#editProductForm');
  form.elements.productId.value=p.id;
  form.elements.name.value=p.name||'';
  if(form.elements.category) form.elements.category.value=p.category||'';
  if(form.elements.bulkPrice) form.elements.bulkPrice.value=p.bulk_price?formatMoneyString(p.bulk_price):'';
  if(form.elements.barcode) form.elements.barcode.value=p.barcode||'';
  form.elements.price.value=formatMoneyString(p.price||0);
  form.elements.low.value=Number(p.low_stock||0);
  form.elements.cost.value=formatMoneyString(p.cost||0);
  form.elements.qtyDisplay.value=Number(p.qty||0);
  form.elements.baseUnit.value=baseUnitLabel(p);
  form.elements.bulkUnit.value=bulkUnitLabel(p);
  form.elements.unitsPerBulk.value=unitsPerBulk(p);
  const supplierSelect=form.elements.preferredSupplierId;
  supplierSelect.innerHTML='<option value="">None</option>'+suppliers.filter(x=>x.active!==false).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  supplierSelect.value=p.preferred_supplier_id||'';
  if(form.elements.expiryDate) form.elements.expiryDate.value=p.expiry_date||'';
  if(form.elements.expiryReminderDays) form.elements.expiryReminderDays.value=p.expiry_reminder_days||14;
  initMoneyInputs(form);
  $('#editProductModal').showModal();
};

$('#editProductForm').onsubmit=async e=>{
  e.preventDefault();
  if(!can('owner','manager'))return kivuNotify('Only an owner or manager can edit products.');
  if(!ensureSubscriptionAccess())return;
  const f=new FormData(e.target);
  const bulkPrice=parseMoney(f.get('bulkPrice'))||null;
  const category=(f.get('category')||'').trim()||null;
  const prodId=f.get('productId');
  saveProductMetaSingle(shop.id, prodId, { bulk_price: bulkPrice, category });
  try { await sb.from('products').update({ bulk_price: bulkPrice, category }).eq('id', prodId); } catch(_e){}

  const {error}=await sb.rpc('update_product_details_v44',{
    p_product_id:prodId,p_name:(f.get('name')||'').trim(),p_price:parseMoney(f.get('price')),p_low_stock:+f.get('low'),
    p_preferred_supplier_id:f.get('preferredSupplierId')||null,p_cost:parseMoney(f.get('cost')),
    p_base_unit:(f.get('baseUnit')||'Piece').trim(),p_bulk_unit:(f.get('bulkUnit')||'Carton').trim(),p_units_per_bulk:+f.get('unitsPerBulk')||1,
    p_expiry_date:f.get('expiryDate')||null,p_expiry_reminder_days:+f.get('expiryReminderDays')||14
  });
  if(error)return kivuNotify(error.message,'error');
  const barcodeResult=await sb.rpc('update_product_barcode',{p_product_id:prodId,p_barcode:(f.get('barcode')||'').trim()||null});
  if(barcodeResult.error)return kivuNotify(barcodeResult.error.message);
  $('#editProductModal').close();
  await refresh();
};

/* SUPPLIERS + PURCHASES + SUPPLIER DEBTS V3.6 */
function supplierName(id){return suppliers.find(x=>x.id===id)?.name||'Supplier';}
function supplierBalance(id){return supplierPurchases.filter(x=>x.supplier_id===id).reduce((a,x)=>a+Number(x.balance_due||0),0);}
function addPurchaseItemRow(){
  const wrap=$('#purchaseItems');if(!wrap)return;
  const row=document.createElement('div');row.className='purchase-item-row form-grid';
  row.innerHTML=`<label>Product<div class="barcode-select-row"><select name="purchaseProductId" required></select><button type="button" class="btn secondary barcode-scan-btn scan-purchase-product">📷 Scan</button></div></label><label>Qty bought<input name="purchaseQty" type="number" min="0.001" step="0.001" value="1" required></label><label>Buy as<select name="purchaseUnitMode"><option value="base">Base unit</option><option value="bulk">Bulk unit</option></select></label><label>Cost per selected unit<input name="purchaseUnitCost" type="text" inputmode="decimal" class="money-input" placeholder="0" required></label><label>Expiry date <small>(optional)</small><input name="purchaseExpiryDate" type="date"></label><label>Line total<div class="inline-total"><strong class="purchase-line-total">0 RWF</strong><button type="button" class="btn ghost remove-purchase-item">Remove</button></div></label>`;
  wrap.appendChild(row);
  row.querySelector('.remove-purchase-item').onclick=()=>{if(wrap.children.length>1)row.remove();updatePurchaseTotal();};
  row.querySelector('.scan-purchase-product')?.addEventListener('click',async()=>{const code=await window.KivuCameraScanner?.open('Scan product to receive');if(!code)return;const p=findProductByBarcode(code);if(!p)return kivuNotify('No product matches that barcode. Register the barcode in Inventory first.');const sel=row.querySelector('[name="purchaseProductId"]');sel.value=p.id;sel.dispatchEvent(new Event('change',{bubbles:true}));row.querySelector('[name="purchaseQty"]')?.focus();});
  row.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',updatePurchaseTotal));
  row.querySelector('[name="purchaseProductId"]').addEventListener('change',()=>{refreshPurchaseItemOptions();updatePurchaseTotal();});
  refreshPurchaseItemOptions();updatePurchaseTotal();initMoneyInputs(row);
}
function refreshPurchaseItemOptions(){
  $$('#purchaseItems select[name="purchaseProductId"]').forEach(sel=>{const current=sel.value;sel.innerHTML=products.length?products.map(p=>`<option value="${p.id}">${esc(p.name)} — ${p.qty} ${esc(baseUnitLabel(p))} in stock</option>`).join(''):'<option value="">Add products first</option>';if(current&&products.some(p=>p.id===current))sel.value=current;const row=sel.closest('.purchase-item-row'),mode=row?.querySelector('[name="purchaseUnitMode"]');if(mode){const pr=products.find(p=>p.id===sel.value);const r=unitsPerBulk(pr);mode.innerHTML=`<option value="base">${esc(baseUnitLabel(pr))}</option>`+(r>1?`<option value="bulk">${esc(bulkUnitLabel(pr))} (${r} ${esc(baseUnitLabel(pr))})</option>`:'');}});
}
function purchaseItemsFromForm(){return $$('#purchaseItems .purchase-item-row').map(row=>({product_id:row.querySelector('[name="purchaseProductId"]').value,entered_qty:+row.querySelector('[name="purchaseQty"]').value,unit_mode:row.querySelector('[name="purchaseUnitMode"]').value,entered_unit_cost:parseMoney(row.querySelector('[name="purchaseUnitCost"]').value),expiry_date:row.querySelector('[name="purchaseExpiryDate"]')?.value||null}));}

function updatePurchaseTotal(){
  let total=0;$$('#purchaseItems .purchase-item-row').forEach(row=>{const qty=+row.querySelector('[name="purchaseQty"]').value||0,cost=parseMoney(row.querySelector('[name="purchaseUnitCost"]').value),line=qty*cost;total+=line;const el=row.querySelector('.purchase-line-total');if(el)el.textContent=money(line);});
  if($('#purchaseTotalPreview'))$('#purchaseTotalPreview').textContent=money(total);return total;
}
$('#addPurchaseItemBtn')?.addEventListener('click',addPurchaseItemRow);
function toggleInlineSupplier(){
  const sel=$('#purchaseForm select[name="supplierId"]'),box=$('#inlineSupplierFields');
  if(box) box.classList.toggle('hidden',sel?.value!=='__new__');
}
$('#purchaseForm select[name="supplierId"]')?.addEventListener('change',toggleInlineSupplier);

$('#supplierForm').onsubmit=async e=>{
  e.preventDefault();if(!can('owner','manager'))return kivuNotify('Only an owner or manager can manage suppliers.');if(!ensureSubscriptionAccess())return;
  const f=new FormData(e.target);
  const {error}=await sb.from('suppliers').insert({shop_id:shop.id,name:(f.get('name')||'').trim(),phone:(f.get('phone')||'').trim()||null,address:(f.get('address')||'').trim()||null,notes:(f.get('notes')||'').trim()||null});
  if(error)return kivuNotify(error.message,'error');await audit('created supplier','supplier',{name:f.get('name')});e.target.reset();$('#supplierModal').close();await refresh();window.showToast?.('Supplier record saved.', 'success', 'Supplier Added');
};
$('#purchaseForm').onsubmit=async e=>{
  e.preventDefault();if(!can('owner','manager'))return kivuNotify('Only an owner or manager can record supplier purchases.');if(!ensureSubscriptionAccess())return;
  const f=new FormData(e.target),items=purchaseItemsFromForm(),total=updatePurchaseTotal(),paid=parseMoney(f.get('amountPaid'));
  if(!items.length||items.some(x=>!x.product_id||x.entered_qty<=0||x.entered_unit_cost<0))return kivuNotify('Check every purchase item.');if(total<=0)return kivuNotify('Purchase total must be greater than zero.');if(paid<0||paid>total)return kivuNotify('Amount paid cannot be greater than the purchase total.');
  let supplierId=f.get('supplierId');
  if(supplierId==='__new__'){
    const name=(f.get('newSupplierName')||'').trim();if(!name)return kivuNotify('Enter the new supplier name.');
    const ins=await sb.from('suppliers').insert({shop_id:shop.id,name,phone:(f.get('newSupplierPhone')||'').trim()||null,address:(f.get('newSupplierAddress')||'').trim()||null}).select('id').single();
    if(ins.error)return kivuNotify(ins.error.message);supplierId=ins.data.id;
  }
  if(!supplierId)return kivuNotify('Choose a supplier or add a new supplier.');
  const {data,error}=await sb.rpc('record_supplier_purchase_v44',{p_supplier_id:supplierId,p_items:items,p_amount_paid:paid,p_payment_method:f.get('paymentMethod'),p_invoice_no:(f.get('invoiceNo')||'').trim()||null,p_due_date:f.get('dueDate')||null,p_note:(f.get('note')||'').trim()||null});
  if(error)return kivuNotify(error.message,'error');e.target.reset();$('#inlineSupplierFields')?.classList.add('hidden');$('#purchaseItems').innerHTML='';addPurchaseItemRow();$('#purchaseModal').close();await refresh();kivuNotify(`Purchase saved. Inventory increased automatically${data?.new_stock_total!==undefined?` by ${data.new_stock_total} base unit(s)`:''}.`);window.showToast?.('Supplier purchase recorded & stock updated.', 'success', 'Stock Received');
};
window.openSupplierPayment=id=>{
  const supplier=suppliers.find(x=>x.id===id),balance=supplierBalance(id);if(!supplier||balance<=0)return;const form=$('#supplierPaymentForm');form.reset();form.elements.supplierId.value=id;form.elements.amount.value=formatMoneyString(balance);form.elements.amount.max=String(balance);initMoneyInputs(form);$('#supplierPaymentSummary').innerHTML=`<b>${esc(supplier.name)}</b><br>Outstanding debt: <b>${money(balance)}</b>`;$('#supplierPaymentModal').showModal();
};
$('#supplierPaymentForm').onsubmit=async e=>{
  e.preventDefault();if(!can('owner','manager'))return;const f=new FormData(e.target),amount=parseMoney(f.get('amount'));
  const {error}=await sb.rpc('record_supplier_payment',{p_supplier_id:f.get('supplierId'),p_amount:amount,p_payment_method:f.get('paymentMethod'),p_note:(f.get('note')||'').trim()||null});
  if(error)return kivuNotify(error.message,'error');e.target.reset();$('#supplierPaymentModal').close();await refresh();window.showToast?.('Supplier debt payment recorded.', 'success', 'Payment Saved');
};

/* CUSTOMERS + CREDIT */
$('#customerForm').onsubmit=async e=>{
  e.preventDefault();
  if(!requireFeature('customers','Customers are included in Kivu Lite.'))return;
  const f=new FormData(e.target);
  const {error}=await sb.from('customers').insert({shop_id:shop.id,name:f.get('name'),phone:f.get('phone')||null,email:f.get('email')||null});
  if(error)return kivuNotify(error.message,'error');
  await audit('created customer','customer',{name:f.get('name')});e.target.reset();$('#customerModal').close();await refresh();window.showToast?.('Customer added to directory.', 'success', 'Customer Saved');
};

$('#creditForm').onsubmit=async e=>{
  e.preventDefault();
  if(!requireFeature('credit','Customer credit is included in Kivu Lite.'))return;
  const f=new FormData(e.target),cid=f.get('customerId')||null,name=customerName(cid)||(f.get('customer')||'').trim();
  if(!name)return kivuNotify('Select or enter a customer.');
  const creditAmt=parseMoney(f.get('amount')); const {error}=await sb.from('credits').insert({shop_id:shop.id,customer_id:cid,customer:name,amount:creditAmt,due_date:f.get('dueDate')||null,note:f.get('note')||null,paid:false});
  if(error)return kivuNotify(error.message,'error');
  await audit('added credit','credit',{customer:name,amount:creditAmt});e.target.reset();$('#creditModal').close();await refresh();window.showToast?.('Customer debt recorded.', 'info', 'Credit Recorded');
};
/* CUSTOMER AMADENI & CREDIT REPAYMENTS */
window.markPaid=id=>{
  openRepayCredit(id);
};

window.openRepayCredit=function(creditId){
  const cr=credits.find(x=>x.id===creditId);
  if(!cr)return kivuNotify('Credit record not found.');
  const f=$('#creditRepaymentForm');
  f.elements.creditId.value=cr.id;
  f.elements.customerId.value=cr.customer_id||'';
  f.elements.amount.value=formatMoneyString(cr.amount); initMoneyInputs(f);
  f.elements.amount.max=cr.amount;
  $('#creditRepaySummary').innerHTML=`Customer: <b>${esc(cr.customer)}</b><br>Outstanding Balance: <b>${money(cr.amount)}</b>${cr.note?`<br><small>${esc(cr.note)}</small>`:''}`;
  $('#creditRepaymentModal').showModal();
};

window.openCustomerDebtRepay=function(customerId){
  const c=customers.find(x=>x.id===customerId);
  const openCrs=credits.filter(x=>!x.paid&&(x.customer_id===customerId||(c&&x.customer&&x.customer.toLowerCase()===c.name.toLowerCase())));
  if(!openCrs.length)return kivuNotify(c?`${c.name} has no open debt.`:'No open debt found.');
  const totalDebt=openCrs.reduce((a,x)=>a+Number(x.amount||0),0);
  const f=$('#creditRepaymentForm');
  f.elements.creditId.value=openCrs.length===1?openCrs[0].id:'__all__';
  f.elements.customerId.value=customerId||'';
  f.elements.amount.value=formatMoneyString(totalDebt); initMoneyInputs(f);
  f.elements.amount.max=totalDebt;
  $('#creditRepaySummary').innerHTML=`Customer: <b>${esc(c?c.name:openCrs[0].customer)}</b><br>Outstanding Balance: <b>${money(totalDebt)}</b>${openCrs.length>1?`<br><small>Paying across ${openCrs.length} credit purchase(s)</small>`:''}`;
  $('#creditRepaymentModal').showModal();
};

$('#creditRepaymentForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=new FormData(e.target),creditId=f.get('creditId'),customerId=f.get('customerId');
  const repayAmount=parseMoney(f.get('amount'));
  if(!repayAmount||repayAmount<=0)return kivuNotify('Enter a valid repayment amount.');
  const method=f.get('paymentMethod')||'Cash';
  const note=(f.get('note')||'').trim();
  const now=new Date().toISOString();

  let openCrs=[];
  if(creditId==='__all__'){
    const c=customers.find(x=>x.id===customerId);
    openCrs=credits.filter(x=>!x.paid&&(x.customer_id===customerId||(c&&x.customer&&x.customer.toLowerCase()===c.name.toLowerCase()))).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  } else {
    const cr=credits.find(x=>x.id===creditId);
    if(!cr)return kivuNotify('Credit record not found.');
    openCrs=[cr];
  }
  const totalDebt=openCrs.reduce((a,x)=>a+Number(x.amount||0),0);
  if(repayAmount>totalDebt)return kivuNotify(`Repayment cannot exceed outstanding balance of ${money(totalDebt)}.`);

  let remainingRepay=repayAmount;
  for(const cr of openCrs){
    if(remainingRepay<=0)break;
    const curBal=Number(cr.amount||0);
    const thisRepay=Math.min(curBal,remainingRepay);
    remainingRepay-=thisRepay;
    const isFull=thisRepay>=curBal;
    const patch=isFull?{paid:true,paid_at:now}:{amount:curBal-thisRepay,note:(cr.note?cr.note+' | ':'')+`Repaid ${money(thisRepay)} via ${method} on ${day(now)}`};
    const {error}=await sb.from('credits').update(patch).eq('id',cr.id);
    if(error)return kivuNotify(error.message,'error');

    saveCreditRepayment({
      id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),
      credit_id:cr.id,customer_id:cr.customer_id||customerId,customer_name:cr.customer,
      amount:thisRepay,payment_method:method,shift_id:currentShift?.id||null,
      user_id:session?.user?.id||null,created_at:now,note:note||(isFull?'Full settlement':'Partial repayment')
    });
    await audit(isFull?'settled customer credit':'partial credit repayment','credit',{customer:cr.customer,amount:thisRepay,method,remaining:isFull?0:curBal-thisRepay});
  }

  e.target.reset();$('#creditRepaymentModal').close();await refresh();
  kivuNotify(`Repayment of ${money(repayAmount)} recorded successfully.${method==='Cash'&&currentShift?' Cash drawer balance updated.':''}`);
});

/* CUSTOMER AMADENI LEDGER & WHATSAPP REMINDERS */
function renderCustomerLedgerModal(c){
  $('#ledgerCustomerName').textContent=c.name;
  $('#ledgerCustomerPhone').textContent=c.phone?`Phone: ${c.phone}`:'No phone recorded';
  const entries=[];
  const custCredits=credits.filter(x=>x.customer_id===c.id||(x.customer&&x.customer.toLowerCase()===c.name.toLowerCase()));
  const repayments=getCreditRepayments(shop.id).filter(r=>r.customer_id===c.id||(r.customer_name&&r.customer_name.toLowerCase()===c.name.toLowerCase()));

  custCredits.forEach(cr=>{
    const crRepaid=repayments.filter(r=>r.credit_id===cr.id).reduce((a,r)=>a+Number(r.amount||0),0);
    const originalDebit=cr.paid?Math.max(Number(cr.amount||0),crRepaid):(Number(cr.amount||0)+crRepaid);
    entries.push({date:cr.created_at,type:'Credit Purchase',note:cr.note||'Credit sale',debit:originalDebit,credit:0});
  });
  repayments.forEach(r=>{
    entries.push({date:r.created_at,type:`Repayment (${r.payment_method})`,note:r.note||`Paid via ${r.payment_method}`,debit:0,credit:Number(r.amount||0)});
  });
  entries.sort((a,b)=>new Date(a.date)-new Date(b.date));
  let running=0;
  const rows=entries.map(e=>{
    running+=e.debit-e.credit;
    return `<tr><td>${fmt(e.date)}</td><td><span class="badge ${e.debit>0?'warn':'badge-success'}">${esc(e.type)}</span></td><td>${esc(e.note)}</td><td>${e.debit>0?money(e.debit):'—'}</td><td>${e.credit>0?`<b class="text-success">-${money(e.credit)}</b>`:'—'}</td><td><b>${money(running)}</b></td></tr>`;
  });
  const openBalance=custCredits.filter(x=>!x.paid).reduce((a,x)=>a+Number(x.amount||0),0);
  $('#ledgerCustomerBalance').textContent=money(openBalance);
  $('#ledgerTableBody').innerHTML=rows.length?rows.join(''):'<tr><td colspan="6">No ledger transactions found.</td></tr>';
  const waBtn=$('#whatsappReminderBtn'); if(waBtn) waBtn.onclick=()=>sendWhatsappDebtReminderForCustomer(c,openBalance);
  const prBtn=$('#printLedgerBtn'); if(prBtn) prBtn.onclick=()=>window.print();
  $('#customerLedgerModal').showModal();
}
window.openCustomerLedger=id=>{const c=customers.find(x=>x.id===id); if(c)renderCustomerLedgerModal(c);};
window.openCustomerLedgerByName=name=>{const c=customers.find(x=>x.name.toLowerCase()===String(name).toLowerCase())||{id:null,name,phone:''}; renderCustomerLedgerModal(c);};

async function sendWhatsappDebtReminderForCustomer(customer,balance){
  if(!balance||balance<=0)return kivuNotify(`${customer.name} has no outstanding debt.`);
  let phone=customer.phone?normalizeRwPhone(customer.phone).replace(/\D/g,''):'';
  if(!phone){
    const promptPhone=await kivuPrompt(`Enter WhatsApp phone number for ${customer.name}:`,{title:'WhatsApp Number',defaultValue:'0788...'});
    if(!promptPhone)return;
    phone=normalizeRwPhone(promptPhone).replace(/\D/g,'');
    if(customer.id&&phone){
      sb.from('customers').update({phone:'+'+phone}).eq('id',customer.id).then(()=>{customer.phone='+'+phone;}).catch(()=>{});
    }
  }
  const msg=`Muraho ${customer.name},\nTubibukije ko mufite umwenda wa ${money(balance)} muri ${shop.name}.\nMurakoze cyane!\n\nDear ${customer.name},\nThis is a polite reminder of your outstanding balance of ${money(balance)} at ${shop.name}.\nThank you!`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,'_blank');
}
window.sendWhatsappDebtReminder=async id=>{const c=customers.find(x=>x.id===id); if(!c)return; const debt=credits.filter(x=>!x.paid&&(x.customer_id===c.id||(x.customer&&x.customer.toLowerCase()===c.name.toLowerCase()))).reduce((a,x)=>a+Number(x.amount||0),0); sendWhatsappDebtReminderForCustomer(c,debt);};
window.sendWhatsappDebtReminderByName=name=>{const clean=String(name||'').trim(); const c=customers.find(x=>x.name.toLowerCase()===clean.toLowerCase())||{id:null,name:clean,phone:''}; const debt=credits.filter(x=>!x.paid&&((c.id&&x.customer_id===c.id)||(x.customer&&x.customer.toLowerCase()===clean.toLowerCase()))).reduce((a,x)=>a+Number(x.amount||0),0); sendWhatsappDebtReminderForCustomer(c,debt);};
window.sendWhatsappReminderForCredit=id=>{const cr=credits.find(x=>x.id===id); if(!cr)return; const c=customers.find(x=>x.id===cr.customer_id||(x.name&&x.name.toLowerCase()===cr.customer.toLowerCase()))||{name:cr.customer,phone:''}; sendWhatsappDebtReminderForCustomer(c,Number(cr.amount||0));};

/* WHOLESALE DIFFERENTIAL PRICING & MULTI-PRODUCT SALES */
function getBulkSellingPrice(p){
  const b=Number(p.bulk_price);
  if(b>0) return b;
  return Number(p.price||0)*unitsPerBulk(p);
}
function saleLinePreview(item){
  const p=products.find(x=>x.id===item.product_id); if(!p)return 0;
  if(item.unit_mode==='bulk') return getBulkSellingPrice(p)*Number(item.entered_qty||0);
  return Number(p.price||0)*Number(item.entered_qty||0);
}
function renderSaleCart(){
  const box=$('#saleCart'),empty=$('#saleCartEmpty'); if(!box)return;
  empty?.classList.toggle('hidden',saleCart.length>0);
  box.innerHTML=saleCart.map((item,i)=>{
    const p=products.find(x=>x.id===item.product_id);if(!p)return'';
    const isBulk=item.unit_mode==='bulk';
    const unit=isBulk?(p.bulk_unit||'Bulk'):(p.base_unit||'Piece');
    const unitPrice=isBulk?getBulkSellingPrice(p):Number(p.price||0); const hasBulk=unitsPerBulk(p)>1;
    return `<div class="sale-cart-row">
      <div class="cart-item-info">
        <div class="cart-item-title-row"><b>${esc(p.name)}</b>${hasBulk?`<button type="button" class="btn-unit-chip" onclick="toggleCartItemUnit(${i})" title="Switch between piece and bulk unit">${esc(unit)} ⇄</button>`:`<span class="unit-static-badge">${esc(unit)}</span>`}</div>
        <small>${item.entered_qty} ${esc(unit)} × ${money(unitPrice)}${isBulk&&Number(p.bulk_price)>0?' (bulk rate)':''}</small>
      </div>
      <div class="cart-qty-ctrl">
        <button type="button" class="cart-qty-btn" onclick="updateSaleCartQty(${i},-1)" title="Decrease quantity">−</button>
        <input type="number" min="0.001" step="any" class="cart-qty-input" value="${item.entered_qty}" onchange="setSaleCartQty(${i},this.value)" aria-label="Quantity for ${esc(p.name)}">
        <button type="button" class="cart-qty-btn" onclick="updateSaleCartQty(${i},1)" title="Increase quantity">+</button>
      </div>
      <strong class="cart-line-total">${money(saleLinePreview(item))}</strong>
      <button type="button" class="btn ghost sale-cart-remove" onclick="removeSaleCartItem(${i})">✕</button>
    </div>`;
  }).join('');
  const subtotal=saleCart.reduce((a,x)=>a+saleLinePreview(x),0),discount=Math.max(0,parseMoney($('#saleForm input[name="discount"]')?.value||0));
  if($('#saleCartSubtotal'))$('#saleCartSubtotal').textContent=money(subtotal);
  if($('#saleCartTotal'))$('#saleCartTotal').textContent=money(Math.max(0,subtotal-discount));
  updateTenderedCalculator();
}
window.updateSaleCartQty=function(i,delta){
  const item=saleCart[i]; if(!item)return;
  const p=products.find(x=>x.id===item.product_id); if(!p)return;
  const newQty=Number(item.entered_qty)+delta;
  if(newQty<=0){
    saleCart.splice(i,1);
    renderSaleCart(); renderSaleQuickResults();
    return;
  }
  const ratio=item.unit_mode==='bulk'?unitsPerBulk(p):1;
  const otherLinesBase=saleCart.filter((x,idx)=>idx!==i&&x.product_id===item.product_id).reduce((a,x)=>a+Number(x.entered_qty)*(x.unit_mode==='bulk'?unitsPerBulk(p):1),0);
  if((newQty*ratio)+otherLinesBase > Number(p.qty||0)){
    return kivuNotify(`Not enough stock. Maximum available: ${p.qty} ${baseUnitLabel(p)}.`);
  }
  item.entered_qty=newQty;
  renderSaleCart(); renderSaleQuickResults();
};
window.removeSaleCartItem=i=>{saleCart.splice(i,1);renderSaleCart();renderSaleQuickResults();};
window.setSaleCartQty=function(i,val){
  const item=saleCart[i]; if(!item)return;
  const p=products.find(x=>x.id===item.product_id); if(!p)return;
  const newQty=Number(val);
  if(!newQty||newQty<=0){
    saleCart.splice(i,1);
    renderSaleCart(); renderSaleQuickResults();
    return;
  }
  const ratio=item.unit_mode==='bulk'?unitsPerBulk(p):1;
  const otherLinesBase=saleCart.filter((x,idx)=>idx!==i&&x.product_id===item.product_id).reduce((a,x)=>a+Number(x.entered_qty)*(x.unit_mode==='bulk'?unitsPerBulk(p):1),0);
  if((newQty*ratio)+otherLinesBase > Number(p.qty||0)){
    kivuNotify(`Not enough stock. Maximum available: ${p.qty} ${baseUnitLabel(p)}.`);
    renderSaleCart();
    return;
  }
  item.entered_qty=newQty;
  renderSaleCart(); renderSaleQuickResults();
};
function resetSaleCart(){
  saleCart=[];
  const f=$('#saleForm');
  if(f){
    if(f.elements.discount) f.elements.discount.value='0';
    if($('#splitCashInput')) $('#splitCashInput').value='0';
    if($('#splitMomoInput')) $('#splitMomoInput').value='0';
    if($('#splitBankInput')) $('#splitBankInput').value='0';
    if($('#amountTenderedInput')) $('#amountTenderedInput').value='';
  }
  lastTenderedInfo=null;
  renderSaleCart();
  renderSaleQuickResults();
}
window.toggleCartItemUnit=function(i){
  const item=saleCart[i]; if(!item)return;
  const p=products.find(x=>x.id===item.product_id); if(!p)return;
  if(unitsPerBulk(p)<=1)return;
  const ratio=unitsPerBulk(p);
  const isCurrentlyBulk=item.unit_mode==='bulk';
  const newMode=isCurrentlyBulk?'base':'bulk';
  const newQty=isCurrentlyBulk ? Math.round(Number(item.entered_qty)*ratio) : (Number(item.entered_qty)>=ratio ? Math.floor(Number(item.entered_qty)/ratio) : 1);
  const newRatio=newMode==='bulk'?ratio:1;
  const otherLinesBase=saleCart.filter((x,idx)=>idx!==i&&x.product_id===item.product_id).reduce((a,x)=>a+Number(x.entered_qty)*(x.unit_mode==='bulk'?ratio:1),0);
  if((newQty*newRatio)+otherLinesBase>Number(p.qty||0)){
    return kivuNotify(`Not enough stock. Available: ${p.qty} ${baseUnitLabel(p)}.`);
  }
  item.entered_qty=newQty;
  item.unit_mode=newMode;
  renderSaleCart();
  renderSaleQuickResults();
};

/* COUNTER POS LIVE SEARCH & CATEGORY QUICK PILLS */
function renderSaleCategoryPills(){
  const box=$('#saleCategoryPills'); if(!box)return;
  const cats=['All',...new Set(products.map(p=>p.category).filter(Boolean))];
  box.innerHTML=cats.map(c=>{
    const active=c===selectedSaleCategory;
    return `<button type="button" class="pill-btn ${active?'active':''}" onclick="selectSaleCategory('${esc(c)}')">${esc(c)}</button>`;
  }).join('');
}
window.selectSaleCategory=function(cat){
  selectedSaleCategory=cat;
  renderSaleCategoryPills();
  renderSaleQuickResults();
};

function renderSaleQuickResults(){
  const resBox=$('#saleQuickResults'); if(!resBox)return;
  const q=saleSearchQuery.toLowerCase().trim();
  // POS catalog is always visible for 1-tap ordering
  resBox.classList.remove('hidden');
  /* catalog always ready */
  let filtered=products;
  if(selectedSaleCategory!=='All') filtered=filtered.filter(p=>p.category===selectedSaleCategory);
  if(q) filtered=filtered.filter(p=>(p.name&&p.name.toLowerCase().includes(q))||(p.barcode&&p.barcode.toLowerCase().includes(q)));
  if(!filtered.length){
    resBox.classList.remove('hidden'); resBox.innerHTML='<div class="notice mini">No matching products found.</div>'; return;
  }
  resBox.classList.remove('hidden');
  const maxItems=q?36:48; resBox.innerHTML=filtered.slice(0,maxItems).map(p=>{
    const stockQty=Number(p.qty||0),stockOk=stockQty>0,isLow=stockQty<=Number(p.low_stock||0); const inCartQty=saleCart.filter(x=>x.product_id===p.id).reduce((a,x)=>a+Number(x.entered_qty||0),0);
    return `<div class="pos-quick-card ${stockOk?'':'out-of-stock'} ${inCartQty>0?'in-cart':''}" onclick="quickAddProductToCart('${p.id}')">${inCartQty>0?`<span class="pos-cart-badge" title="${inCartQty} in cart">✓ ${inCartQty}</span>`:''}<div class="pos-card-main"><b class="pos-card-name">${esc(p.name)}</b><div class="pos-card-price">${money(p.price)}</div></div><div class="pos-card-foot"><span class="pos-stock-tag ${!stockOk?'stock-out':(isLow?'stock-low':'stock-ok')}">${stockOk?`${stockQty} ${esc(baseUnitLabel(p))}`:'Out of stock'}</span></div></div>`;
  }).join('');
}

window.quickAddProductToCart=function(productId){
  const p=products.find(x=>x.id===productId); if(!p)return;
  if(Number(p.qty)<=0)return kivuNotify(`${p.name} is out of stock.`);
  const alreadyBase=saleCart.filter(x=>x.product_id===productId).reduce((a,x)=>a+Number(x.entered_qty)*(x.unit_mode==='bulk'?unitsPerBulk(p):1),0);
  if(alreadyBase+1>Number(p.qty))return kivuNotify(`Not enough stock. Available: ${p.qty} ${baseUnitLabel(p)}.`);
  const existing=saleCart.find(x=>x.product_id===productId&&x.unit_mode==='base');
  if(existing) existing.entered_qty+=1;
  else saleCart.push({product_id:productId,entered_qty:1,unit_mode:'base'});
  const f=$('#saleForm');
  if(f?.elements?.productId){
    f.elements.productId.value=productId;
    refreshSaleUnitOptions();
  }
  renderSaleCart(); renderSaleQuickResults();
  window.showToast?.(`${p.name} added to cart.`, 'info', 'Cart Updated', 1200);
};

$('#saleProductSearch')?.addEventListener('input',e=>{
  saleSearchQuery=e.target.value;
  $('#clearSaleSearchBtn')?.classList.toggle('hidden',!saleSearchQuery);
  renderSaleQuickResults();
});
$('#saleProductSearch')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    e.preventDefault();
    const q=(saleSearchQuery||'').trim(); if(!q)return;
    const match=products.find(p=>p.barcode&&String(p.barcode).trim().toLowerCase()===q.toLowerCase())||
      (products.filter(p=>(p.name&&p.name.toLowerCase().includes(q.toLowerCase()))||(p.barcode&&String(p.barcode).toLowerCase().includes(q.toLowerCase()))).length===1
        ? products.find(p=>(p.name&&p.name.toLowerCase().includes(q.toLowerCase()))||(p.barcode&&String(p.barcode).toLowerCase().includes(q.toLowerCase())))
        : null);
    if(match){
      quickAddProductToCart(match.id);
      $('#saleProductSearch').value=''; saleSearchQuery='';
      $('#clearSaleSearchBtn')?.classList.add('hidden');
      renderSaleQuickResults();
    }
  }
});
$('#clearSaleSearchBtn')?.addEventListener('click',()=>{
  $('#saleProductSearch').value=''; saleSearchQuery='';
  $('#clearSaleSearchBtn').classList.add('hidden');
  renderSaleQuickResults();
});

/* AMOUNT TENDERED & CHANGE DUE CALCULATOR + RETAIL SPLIT PAYMENTS */
function updateTenderedCalculator(){
  const f=$('#saleForm'); if(!f)return;
  const payMethod=f.elements.payment.value;
  $('#splitPaymentSection')?.classList.toggle('hidden',payMethod!=='Split');
  $('#saleCustomerWrap')?.classList.toggle('hidden',payMethod!=='Credit');

  const subtotal=saleCart.reduce((a,x)=>a+saleLinePreview(x),0);
  const discount=Math.max(0,parseMoney(f.elements.discount?.value||0));
  const total=Math.max(0,subtotal-discount);

  let cashTarget=total;
  if(payMethod==='Split'){
    const sc=Math.max(0,parseMoney($('#splitCashInput')?.value||0));
    const sm=Math.max(0,parseMoney($('#splitMomoInput')?.value||0));
    const sbk=Math.max(0,parseMoney($('#splitBankInput')?.value||0));
    const allocated=sc+sm+sbk, remaining=total-allocated;
    if($('#splitAllocatedDisplay')) $('#splitAllocatedDisplay').textContent=money(allocated);
    if($('#splitRemainingDisplay')) $('#splitRemainingDisplay').textContent=money(remaining);
    $('#splitRemainingWrap')?.classList.toggle('text-danger',remaining!==0);
    cashTarget=sc;
  }

  const hasCash=payMethod==='Cash'||(payMethod==='Split'&&parseMoney($('#splitCashInput')?.value||0)>0);
  $('#tenderedSection')?.classList.toggle('hidden',!hasCash);

  const tendered=parseMoney($('#amountTenderedInput')?.value||0);
  const changeDisplay=$('#changeDueDisplay');
  if(!changeDisplay)return;
  if(tendered>0){
    const change=tendered-cashTarget;
    if(change>=0){
      changeDisplay.textContent=money(change);
      changeDisplay.className='text-success change-amount';
      lastTenderedInfo={tendered,change};
    } else {
      changeDisplay.textContent=`Short ${money(Math.abs(change))}`;
      changeDisplay.className='text-warning change-amount';
      lastTenderedInfo=null;
    }
  } else {
    changeDisplay.textContent='0 RWF';
    changeDisplay.className='change-amount';
    lastTenderedInfo=null;
  }
}

$$('.cash-quick-btn').forEach(btn=>{
  btn.onclick=()=>{
    const f=$('#saleForm'); if(!f)return;
    const subtotal=saleCart.reduce((a,x)=>a+saleLinePreview(x),0);
    const discount=Math.max(0,parseMoney(f.elements.discount?.value||0));
    const total=Math.max(0,subtotal-discount);
    const target=f.elements.payment.value==='Split'?Math.max(0,parseMoney($('#splitCashInput')?.value||0)):total;
    const amt=btn.dataset.amt;
    const inp=$('#amountTenderedInput'); if(!inp)return;
    if(amt==='exact') inp.value=formatMoneyString(target);
    else { const delta=Number(amt); inp.value=formatMoneyString(target>0?Math.max(target,Math.ceil(target/delta)*delta):delta); }
    updateTenderedCalculator();
  };
});
$('#amountTenderedInput')?.addEventListener('input',updateTenderedCalculator);
$('#splitCashInput')?.addEventListener('input',updateTenderedCalculator);
$('#splitMomoInput')?.addEventListener('input',updateTenderedCalculator);
$('#splitBankInput')?.addEventListener('input',updateTenderedCalculator);

$('#saleForm select[name="payment"]').onchange=()=>{
  const f=$('#saleForm'); syncPaymentMethodUI(f.elements.payment.value);
  if(f.elements.payment.value==='Split'){
    const subtotal=saleCart.reduce((a,x)=>a+saleLinePreview(x),0);
    const discount=Math.max(0,parseMoney(f.elements.discount?.value||0));
    const total=Math.max(0,subtotal-discount);
    if($('#splitCashInput')&&!parseMoney($('#splitCashInput').value)&&!parseMoney($('#splitMomoInput')?.value)) {
      $('#splitCashInput').value=formatMoneyString(Math.round(total/2));
      if($('#splitMomoInput')) $('#splitMomoInput').value=formatMoneyString(total-Math.round(total/2));
    }
  }
  updateTenderedCalculator();
}; $$('#posPaymentPills .pos-pay-pill').forEach(btn=>{ btn.onclick=()=>syncPaymentMethodUI(btn.dataset.method); });
$('#saleForm select[name="productId"]')?.addEventListener('change',refreshSaleUnitOptions);
$('#saleForm input[name="discount"]')?.addEventListener('input',renderSaleCart);

$('#addSaleItemBtn')?.addEventListener('click',()=>{
  const f=$('#saleForm'),pid=f.elements.productId.value,qty=Number(f.elements.qty.value),mode=f.elements.saleUnit.value||'base',p=products.find(x=>x.id===pid);
  if(!p)return kivuNotify('Select a product.'); if(!qty||qty<=0)return kivuNotify('Enter a quantity greater than zero.');
  const ratio=mode==='bulk'?unitsPerBulk(p):1,baseQty=qty*ratio;
  const already=saleCart.filter(x=>x.product_id===pid).reduce((a,x)=>a+Number(x.entered_qty)*(x.unit_mode==='bulk'?unitsPerBulk(p):1),0);
  if(baseQty+already>Number(p.qty||0))return kivuNotify(`Not enough stock. Available: ${p.qty} ${p.base_unit||'unit(s)'}.`);
  const same=saleCart.find(x=>x.product_id===pid&&x.unit_mode===mode); if(same)same.entered_qty+=qty; else saleCart.push({product_id:pid,entered_qty:qty,unit_mode:mode});
  f.elements.qty.value='1';renderSaleCart();
});

/* PARK / HOLD CART */
$('#parkCartBtn')?.addEventListener('click',async()=>{
  if(!saleCart.length)return showToast('Cart is empty. Add products before holding.','warning');
  const notePrompt=await kivuPrompt('Enter a note or customer name for this held cart (e.g. "Customer getting cash"):',{title:'Hold Cart',defaultValue:'Customer waiting'});
  if(notePrompt===null) return;
  const note=notePrompt.trim()||'Held cart';
  const f=$('#saleForm');
  const discount=Number(f?.elements?.discount?.value||0),cid=f?.elements?.customerId?.value||'',customerName=f?.elements?.customerName?.value||'';
  const subtotal=saleCart.reduce((a,x)=>a+saleLinePreview(x),0);
  const held={
    id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),
    items:JSON.parse(JSON.stringify(saleCart)),discount,customerId:cid,customerName,
    note,total:Math.max(0,subtotal-discount),savedAt:new Date().toISOString()
  };
  const list=getHeldCarts(); list.unshift(held); saveHeldCarts(list);
  resetSaleCart(); if(f) f.reset();
  initSaleModal();
  kivuNotify('Cart held safely. You can now serve the next customer.');
  window.showToast?.('Cart held safely. Ready for next transaction.', 'info', 'Cart Parked');
});
$('#viewParkedCartsBtn')?.addEventListener('click',()=>{renderParkedCartsModal();$('#parkedCartsModal').showModal();});

function renderParkedCartsModal(){
  const list=getHeldCarts(),box=$('#parkedCartsList'); if(!box)return;
  box.innerHTML=list.length?list.map(c=>`
    <div class="parked-cart-item"><div><b>${esc(c.note)}</b><small>${fmt(c.savedAt)} · ${c.items.length} item(s)</small><strong>${money(c.total)}</strong></div><div class="parked-cart-actions"><button type="button" class="btn primary" onclick="resumeParkedCart('${c.id}')">Resume</button><button type="button" class="btn danger" onclick="discardParkedCart('${c.id}')">Discard</button></div></div>
  `).join(''):'<div class="notice mini">No held carts currently.</div>';
}
window.resumeParkedCart=async function(id){
  const list=getHeldCarts(),c=list.find(x=>x.id===id); if(!c)return kivuNotify('Held cart not found.');
  if(saleCart.length>0&&!(await kivuConfirm('Active cart has items. Replace active cart with held cart?',{danger:true})))return;
  const validItems=c.items.filter(it=>products.some(p=>p.id===it.product_id));
  if(!validItems.length) return kivuNotify('Cannot resume cart: products in this held cart no longer exist in inventory.');
  saleCart=JSON.parse(JSON.stringify(validItems));
  const f=$('#saleForm');
  if(f){
    if(f.elements.discount) f.elements.discount.value=c.discount||0;
    if(f.elements.customerId) f.elements.customerId.value=c.customerId||'';
    if(f.elements.customerName) f.elements.customerName.value=c.customerName||'';
    if(c.customerId) $('#saleCustomerWrap')?.classList.remove('hidden');
  }
  saveHeldCarts(list.filter(x=>x.id!==id));
  $('#parkedCartsModal')?.close();
  if(!$('#saleModal')?.open) $('#saleModal')?.showModal();
  renderSaleCart();
  updateTenderedCalculator();
  window.showToast?.('Held cart restored to counter checkout.', 'info', 'Cart Resumed');
};
window.discardParkedCart=async function(id){
  if(!(await kivuConfirm('Discard this held cart?',{danger:true})))return;
  const list=getHeldCarts(); saveHeldCarts(list.filter(x=>x.id!==id)); renderParkedCartsModal();
};

let isSubmittingSale=false;
/* SALE SUBMISSION */
$('#saleForm').onsubmit=async e=>{
  e.preventDefault();
  if(isSubmittingSale) return;
  if(!saleCart.length)return kivuNotify('Add at least one product to the cart.');
  const f=new FormData(e.target),cid=f.get('customerId')||null,name=customerName(cid)||(f.get('customerName')||'').trim()||null,rawPayment=f.get('payment'),discount=parseMoney(f.get('discount'));
  if(rawPayment==='Credit'&&!cid&&!name)return kivuNotify('Select or enter a customer for a credit sale.');

  const subtotal=saleCart.reduce((a,x)=>a+saleLinePreview(x),0);
  const total=Math.max(0,subtotal-discount);
  let paymentStr=rawPayment, splitDetails=null;

  if(rawPayment==='Split'){
    const sc=Math.max(0,parseMoney($('#splitCashInput')?.value||0));
    const sm=Math.max(0,parseMoney($('#splitMomoInput')?.value||0));
    const sbk=Math.max(0,parseMoney($('#splitBankInput')?.value||0));
    if(Math.round(sc+sm+sbk)!==Math.round(total)){
      return kivuNotify(`Split payment amounts (${money(sc+sm+sbk)}) do not match total to pay (${money(total)}). Please adjust.`);
    }
    splitDetails={cash:sc,momo:sm,bank:sbk};
    paymentStr=`Split (Cash ${sc}, MoMo ${sm}${sbk?`, Bank ${sbk}`:''})`;
  }

  const tendered=parseMoney($('#amountTenderedInput')?.value||0);
  const cashTarget=rawPayment==='Split'?(splitDetails?.cash||0):(rawPayment==='Cash'?total:0);
  if(cashTarget>0&&tendered>0&&tendered<cashTarget){
    if(!(await kivuConfirm(`Tendered cash (${money(tendered)}) is less than cash due (${money(cashTarget)}). Continue anyway?`,{confirmText:'Continue',danger:false})))return;
  }
  let currentSaleTendered=null;
  if(tendered>0&&cashTarget>0){
    currentSaleTendered={tendered,change:Math.max(0,tendered-cashTarget)};
  }

  // Safety Stock Pre-Check: verify live availability before sending RPC
  for(const it of saleCart){
    const prod=products.find(p=>p.id===it.product_id);
    if(prod){
      const isB=it.unit_mode==='bulk';
      const requestedUnits=Number(it.entered_qty||0)*(isB?unitsPerBulk(prod):1);
      const avail=Number(prod.qty||0);
      if(requestedUnits>avail){
        return kivuNotify(`Insufficient stock for "${prod.name}". Available: ${avail} ${baseUnitLabel(prod)}, requested: ${requestedUnits}.`,'warning');
      }
    }
  }

  const submitBtn=$('#completeSaleBtn');
  const origBtnText=submitBtn?submitBtn.textContent:'Complete sale';
  try {
    isSubmittingSale=true;
    if(submitBtn){ submitBtn.disabled=true; submitBtn.textContent='Processing sale...'; }

    const clientRef=window.KivuOffline?.newClientRef?.()||crypto.randomUUID();
    const payloadItems=saleCart.map(x=>{
      const p=products.find(pr=>pr.id===x.product_id);
      const isB=x.unit_mode==='bulk';
      return {
        ...x,
        unit_price: isB?getBulkSellingPrice(p):Number(p?.price||0),
        line_total: saleLinePreview(x)
      };
    });
    const payload={items:payloadItems,payment:paymentStr,discount,customer_id:cid,customer_name:name,client_ref:clientRef};

    if(!navigator.onLine){
      if(!window.KivuOffline)return kivuNotify('Offline queue is not available. Reconnect before recording this sale.');
      await window.KivuOffline.enqueueSale({shop_id:shop.id,user_id:session.user.id,...payload});
      applyOfflineStockDraft(payload.items);
      if(splitDetails) saveSplitPaymentDetails(clientRef, splitDetails);
      if(currentSaleTendered) saveReceiptTendered(clientRef, currentSaleTendered);
      e.target.reset();resetSaleCart();$('#saleCustomerWrap').classList.add('hidden');$('#saleModal').close();saveOfflineSnapshot();await updateConnectivityUI();
      kivuNotify('Sale saved safely on this device. It will sync when internet returns.');
      return;
    }

    let {data:receiptNo,error}=await sb.rpc('record_sale_cart_v48',{p_items:payload.items,p_payment:paymentStr,p_discount:discount,p_customer_id:cid,p_customer_name:name,p_client_ref:payload.client_ref});
    if(error&&rawPayment==='Split'&&(error.message?.includes('violates check constraint')||error.message?.includes('payment'))){
      const fallback=(splitDetails.cash>=splitDetails.momo)?'Cash':'Mobile Money';
      const retry=await sb.rpc('record_sale_cart_v48',{p_items:payload.items,p_payment:fallback,p_discount:discount,p_customer_id:cid,p_customer_name:name,p_client_ref:payload.client_ref});
      if(!retry.error){receiptNo=retry.data; error=null;}
    }
    if(error)return kivuNotify(error.message,'error');

    if(splitDetails) saveSplitPaymentDetails(receiptNo, splitDetails);
    if(currentSaleTendered) saveReceiptTendered(receiptNo, currentSaleTendered);

    const {data:lines,error:se}=await sb.from('sales').select('*').eq('shop_id',shop.id).eq('receipt_no',receiptNo).order('created_at',{ascending:true});
    if(se)return kivuNotify(se.message);
    e.target.reset();resetSaleCart();$('#saleCustomerWrap').classList.add('hidden');$('#saleModal').close();await refresh();showReceiptGroup(lines||[], currentSaleTendered);window.showToast?.('Sale recorded successfully. Receipt issued.', 'success', 'Transaction Complete');
  } finally {
    isSubmittingSale=false;
    if(submitBtn){ submitBtn.disabled=false; submitBtn.textContent=origBtnText; }
  }
};

/* EXPENSES & PETTY CASH */
$('#expenseForm').onsubmit=async e=>{
  e.preventDefault();
  if(!can('owner','manager'))return kivuNotify('Only an owner or manager can record expenses.');
  if(!ensureSubscriptionAccess())return;
  const f=new FormData(e.target);
  const {data:expenseId,error}=await sb.rpc('record_expense',{p_description:(f.get('description')||'').trim(),p_amount:parseMoney(f.get('amount')),p_category:f.get('category')||'Other'});
  if(error)return kivuNotify(error.message,'error');
  e.target.reset();$('#expenseModal').close();await refresh();window.showToast?.('Operating expense recorded.', 'success', 'Expense Logged');
};

$('#pettyCashBtn')?.addEventListener('click',()=>{
  if(!currentShift)return kivuNotify('You must have an open shift to log a petty cash drawer payout.');
  $('#pettyCashModal').showModal();
});
$('#pettyCashForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!currentShift)return kivuNotify('No open shift found.');
  const f=new FormData(e.target),amt=parseMoney(f.get('amount'));
  if(!amt||amt<=0)return kivuNotify('Enter a valid amount.');
  if(amt>5000)return kivuNotify('Petty cash payouts from the drawer must be under 5,000 RWF. Larger expenses require owner/manager recording.');
  const reason=(f.get('description')||'').trim(),cat=f.get('category')||'Supplies',paidTo=(f.get('paidTo')||'').trim();
  const desc=`Petty cash payout: ${reason}${paidTo?` (Paid to: ${paidTo})`:''}`;

  const payoutRecord={
    id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),
    shift_id:currentShift.id,amount:amt,category:cat,description:desc,reason,paid_to:paidTo,
    user_id:session?.user?.id,user_name:profile.full_name||roleLabel(profile.role),created_at:new Date().toISOString()
  };
  saveShiftPettyCashPayout(shop.id, payoutRecord);

  try {
    await sb.rpc('record_expense',{p_description:desc,p_amount:amt,p_category:cat});
  } catch(_e){}

  await audit('logged petty cash payout','shift',{shift_id:currentShift.id,amount:amt,reason});
  e.target.reset();$('#pettyCashModal').close();await refresh();
  kivuNotify(`Petty cash payout of ${money(amt)} recorded and deducted from cash drawer.`);
  window.showToast?.('Petty cash drawer payout recorded.', 'warning', 'Petty Cash Payout');
});

/* STAFF INVITES */
$('#staffInviteForm').onsubmit=async e=>{
  e.preventDefault();
  if(profile.role!=='owner')return kivuNotify('Only the owner can invite staff.');
  if(!requireFeature('employees','Staff accounts are included from Kivu Business.'))return;
  const f=new FormData(e.target);
  const phone=normalizeRwPhone(f.get('phone'));
  if(!/^\+2507\d{8}$/.test(phone))return kivuNotify('Enter a valid Rwanda phone number, for example 0788 123 456.');
  const {data:code,error}=await sb.rpc('create_staff_invite',{p_employee_name:f.get('name'),p_phone:phone,p_role:f.get('role')});
  if(error)return kivuNotify(error.message,'error');
  e.target.reset();$('#staffInviteModal').close();await refresh();
  kivuNotify(`Staff invite created.\n\nInvite code: ${code}\nPhone: ${phone}\n\nThe employee should choose Join as staff, enter this code and phone number, then create a 6-digit PIN. The invite expires in 14 days.`);
  window.showToast?.('Staff invite code generated.', 'success', 'Invite Created');
};

/* SHIFTS & RECONCILIATION */
$('#openShiftBtn').onclick=()=>{if(!requireFeature('shifts','Shift management is included from Kivu Business.'))return;currentShift?kivuNotify('You already have an open shift.'):$('#openShiftModal').showModal()};
$('#openShiftForm').onsubmit=async e=>{
  e.preventDefault();
  if(!can('owner','manager','cashier'))return kivuNotify('Your role does not use cash shifts.');
  if(!requireFeature('shifts','Shift management is included from Kivu Business.'))return;
  const f=new FormData(e.target);
  const openingAmt=parseMoney(f.get('openingCash')); const {error}=await sb.from('shifts').insert({shop_id:shop.id,user_id:session.user.id,employee_name:profile.full_name||roleLabel(profile.role),opening_cash:openingAmt,status:'open'});
  if(error)return kivuNotify(error.message,'error');
  await audit('opened shift','shift',{opening_cash:openingAmt});e.target.reset();$('#openShiftModal').close();await refresh();window.showToast?.('Register shift opened. Opening float recorded.', 'success', 'Shift Opened');
};

function getSalePaymentBreakdown(s){
  const pay=String(s.payment||'Cash');
  let isSplit=pay.toLowerCase().includes('split');
  let savedSplit=null;
  if(s.receipt_no){
    savedSplit=getSplitPaymentDetails(s.receipt_no);
    if(savedSplit) isSplit=true;
  }

  if(!isSplit){
    if(pay==='Cash') return {cash:Number(s.total)||0,momo:0,bank:0,credit:0};
    if(pay==='Mobile Money'||pay==='MoMo') return {cash:0,momo:Number(s.total)||0,bank:0,credit:0};
    if(pay==='Bank') return {cash:0,momo:0,bank:Number(s.total)||0,credit:0};
    if(pay==='Credit') return {cash:0,momo:0,bank:0,credit:Number(s.total)||0};
    return {cash:Number(s.total)||0,momo:0,bank:0,credit:0};
  }

  let totalCash=0,totalMomo=0,totalBank=0;
  if(savedSplit){
    totalCash=Number(savedSplit.cash||0);
    totalMomo=Number(savedSplit.momo||0);
    totalBank=Number(savedSplit.bank||0);
  } else {
    const mc=pay.match(/Cash\s*([0-9.,]+)/i);
    const mm=pay.match(/(?:MoMo|Mobile Money)\s*([0-9.,]+)/i);
    const mb=pay.match(/Bank\s*([0-9.,]+)/i);
    if(mc) totalCash=Number(mc[1].replace(/,/g,''))||0;
    if(mm) totalMomo=Number(mm[1].replace(/,/g,''))||0;
    if(mb) totalBank=Number(mb[1].replace(/,/g,''))||0;
    if(totalCash+totalMomo+totalBank===0) totalCash=Number(s.total)||0;
  }

  const sTotal=Number(s.total)||0;
  if(s.receipt_no){
    const group=sales.filter(x=>x.receipt_no===s.receipt_no&&x.status!=='voided');
    if(group.length>1){
      const sumTotal=group.reduce((sum,item)=>sum+Number(item.total||0),0);
      const ratio=sumTotal>0?(sTotal/sumTotal):(1/group.length);
      return {
        cash:Math.round(totalCash*ratio),
        momo:Math.round(totalMomo*ratio),
        bank:Math.round(totalBank*ratio),
        credit:0
      };
    }
  }

  return {cash:totalCash,momo:totalMomo,bank:totalBank,credit:0};
}

function calcShift(s){
  const ss=sales.filter(x=>x.shift_id===s.id&&x.status!=='voided');
  const ee=expenses.filter(x=>x.shift_id===s.id&&x.approval_status!=='rejected');
  let cash=0,momo=0,bank=0,credit=0;
  ss.forEach(x=>{
    const b=getSalePaymentBreakdown(x);
    cash+=b.cash; momo+=b.momo; bank+=b.bank; credit+=b.credit;
  });
  const debtCash=getShiftDebtCollections(s.id);
  const localPetty=getShiftPettyCashPayouts(shop.id).filter(x=>x.shift_id===s.id);
  const localPettyTotal=localPetty.reduce((a,x)=>a+Number(x.amount||0),0);
  const eePettyTotal=ee.filter(x=>x.is_petty_cash||x.category==='Petty Cash'||(x.description&&x.description.toLowerCase().includes('petty cash'))).reduce((a,x)=>a+Number(x.amount||0),0);
  const pettyCash=Math.max(localPettyTotal, eePettyTotal);
  const otherExpenses=Math.max(0, ee.reduce((a,x)=>a+Number(x.amount||0),0) - eePettyTotal);
  const ex=pettyCash + otherExpenses;
  const total=ss.reduce((a,x)=>a+Number(x.total||0),0);
  const expected=Number(s.opening_cash||0)+cash+debtCash-ex;
  return{cash,momo,bank,credit,total,ex,debtCash,pettyCash,otherExpenses,expected};
}

$('#closeShiftBtn').onclick=()=>{
  if(!currentShift)return;
  const c=calcShift(currentShift);
  $('#closeShiftPreview').innerHTML=`Opening float: <b>${money(currentShift.opening_cash)}</b><br>Cash sales: <b>${money(c.cash)}</b><br>Mobile Money: <b>${money(c.momo)}</b><br>Bank: <b>${money(c.bank)}</b><br>Credit sales: <b>${money(c.credit)}</b><br>Cash debt collections: <b>${money(c.debtCash)}</b><br>Petty cash payouts: <b>-${money(c.pettyCash)}</b><br>Other shift expenses: <b>-${money(c.otherExpenses)}</b><br>Total sales: <b>${money(c.total)}</b><br><hr>Expected physical cash in drawer: <b>${money(c.expected)}</b>`;
  $('#closeShiftModal').showModal();
};

$('#closeShiftForm').onsubmit=async e=>{
  e.preventDefault();if(!currentShift)return;
  const f=new FormData(e.target),c=calcShift(currentShift),actual=parseMoney(f.get('actualCash'));
  const diff=actual-c.expected,reason=(f.get('varianceReason')||'').trim();
  if(Math.abs(diff)>0.001&&!reason)return kivuNotify('Enter a reason for the cash difference before closing the shift.');
  const closedId=currentShift.id;
  const {error}=await sb.rpc('close_shift_controlled',{p_shift_id:closedId,p_actual_cash:actual,p_variance_reason:reason||null});
  if(error)return kivuNotify(error.message,'error');
  try{ await sb.from('shifts').update({expected_cash:c.expected, difference:diff, actual_cash:actual}).eq('id',closedId); }catch(_e){}
  e.target.reset();$('#closeShiftModal').close();await refresh();
  openShiftZReport(closedId);
  window.showToast?.('Shift closed. Z-Report generated.', 'success', 'Shift Closed');
};

/* PRINTABLE 80MM SHIFT Z-REPORT */
window.openShiftZReport=function(shiftId){
  const s=shifts.find(x=>x.id===shiftId)||currentShift;
  if(!s)return kivuNotify('Shift not found.');
  const c=calcShift(s);
  const diff=s.actual_cash!=null ? (Number(s.actual_cash) - c.expected) : (s.difference!=null ? Number(s.difference) : null);
  const varianceStatus=diff==null?'PENDING COUNT':diff===0?'BALANCED (0 RWF)':diff>0?`OVERAGE (+${money(diff)})`:`SHORTAGE (${money(diff)})`;
  const varianceClass=diff==null?'':diff===0?'text-success':diff>0?'text-warning':'text-danger';
  const shiftSales=sales.filter(x=>x.shift_id===s.id&&x.status!=='voided');

  $('#zReportContent').innerHTML=`
    <div class="z-report-slip">
      <div class="receipt-center">
        <h2>${esc(shop.name)}</h2>
        <div>${esc(shop.phone||'')}</div>
        <div>${esc(shop.district||shop.province||'')}</div>
        <div class="receipt-line"></div>
        <b>SHIFT Z-REPORT</b>
        <div><small>End of Shift Reconciliation Slip</small></div>
      </div>
      <div class="receipt-line"></div>
      <div class="receipt-row"><span>Shift ID:</span><span><b>${esc(String(s.id||'').slice(0,8))}</b></span></div>
      <div class="receipt-row"><span>Cashier / Staff:</span><span><b>${esc(s.employee_name||'Staff')}</b></span></div>
      <div class="receipt-row"><span>Shift Status:</span><span><b>${esc(String(s.status||'').toUpperCase())}</b></span></div>
      <div class="receipt-row"><span>Opened:</span><span>${fmt(s.opened_at)}</span></div>
      <div class="receipt-row"><span>Closed:</span><span>${s.closed_at?fmt(s.closed_at):'Still open'}</span></div>
      
      <div class="receipt-line"></div>
      <div class="z-section-title"><b>SALES BY PAYMENT METHOD</b></div>
      <div class="receipt-row"><span>Cash Sales:</span><span>${money(c.cash)}</span></div>
      <div class="receipt-row"><span>Mobile Money (MoMo):</span><span>${money(c.momo)}</span></div>
      <div class="receipt-row"><span>Bank / Card:</span><span>${money(c.bank)}</span></div>
      <div class="receipt-row"><span>Credit Sales (Amadeni):</span><span>${money(c.credit)}</span></div>
      <div class="receipt-row"><b>GROSS SALES TOTAL:</b><b>${money(c.total)}</b></div>
      <div class="receipt-row"><small>Transactions count:</small><small>${shiftSales.length}</small></div>

      <div class="receipt-line"></div>
      <div class="z-section-title"><b>CASH DRAWER RECONCILIATION</b></div>
      <div class="receipt-row"><span>(+) Opening Float:</span><span>${money(s.opening_cash)}</span></div>
      <div class="receipt-row"><span>(+) Cash Sales:</span><span>${money(c.cash)}</span></div>
      <div class="receipt-row"><span>(+) Cash Debt Collections:</span><span>${money(c.debtCash)}</span></div>
      <div class="receipt-row"><span>(-) Petty Cash Payouts:</span><span>-${money(c.pettyCash)}</span></div>
      <div class="receipt-row"><span>(-) Other Shift Expenses:</span><span>-${money(Math.max(0,c.ex-c.pettyCash))}</span></div>
      <div class="receipt-line"></div>
      <div class="receipt-row"><b>(=) EXPECTED PHYSICAL CASH:</b><b>${money(c.expected)}</b></div>
      <div class="receipt-row"><b>ACTUAL CASH COUNTED:</b><b>${s.actual_cash!=null?money(s.actual_cash):'Pending close'}</b></div>
      <div class="receipt-row"><b>CASH VARIANCE:</b><b class="${varianceClass}">${varianceStatus}</b></div>
      ${s.variance_reason?`<div class="receipt-row"><small>Variance Reason: ${esc(s.variance_reason)}</small></div>`:''}

      <div class="receipt-line"></div>
      <div class="z-signatures">
        <div class="sig-box"><div class="sig-line"></div><small>Cashier Signature</small></div>
        <div class="sig-box"><div class="sig-line"></div><small>Manager / Owner Signature</small></div>
      </div>
      <div class="receipt-line"></div>
      <div class="receipt-center">
        <small>Printed: ${fmt(new Date())}</small><br>
        <small>Kivu Solutions POS · Platinum Tech</small>
      </div>
    </div>
  `;
  $('#zReportModal').showModal();
};
$('#printCurrentShiftZBtn')?.addEventListener('click',()=>{if(!currentShift)return kivuNotify('No shift open.');openShiftZReport(currentShift.id);});
$('#printZReportBtn')?.addEventListener('click',()=>window.print());

/* RECEIPTS */
window.viewReceipt=id=>{const s=sales.find(x=>x.id===id);if(!s)return;const lines=sales.filter(x=>x.receipt_no&&x.receipt_no===s.receipt_no);showReceiptGroup(lines.length?lines:[s], getReceiptTendered(s.receipt_no));};
function showReceipt(s){showReceiptGroup([s], getReceiptTendered(s?.receipt_no));}
function showReceiptGroup(lines, optTendered){
  if(!requireFeature('receipts','Digital receipts are included in Kivu Lite.'))return;if(!lines?.length)return;
  const s=lines[0],gross=lines.reduce((a,x)=>a+Number(x.total||0)+Number(x.discount||0),0),discount=lines.reduce((a,x)=>a+Number(x.discount||0),0),total=lines.reduce((a,x)=>a+Number(x.total||0),0);
  const rate=Math.max(0,Number(shop.tax_rate||0)),tax=rate>0?Math.round(total*rate/(100+rate)):0,taxLabel=shop.tax_label||'VAT';
  const items=lines.map(x=>`<div class="receipt-row"><span>${esc(x.product_name)} × ${x.entered_qty?`${x.entered_qty} ${esc(x.sold_unit||'')}`:x.qty}</span><span>${money(Number(x.total||0)+Number(x.discount||0))}</span></div>`).join('');

  const savedSplit=(s.receipt_no?getSplitPaymentDetails(s.receipt_no):null)||(s.client_ref?getSplitPaymentDetails(s.client_ref):null);
  const isSplit=String(s.payment||'').toLowerCase().includes('split')||!!savedSplit;
  let paymentHtml=`<div class="receipt-row"><span>Payment</span><span>${isSplit?'Split Payment':esc(s.payment)}</span></div>`;
  const breakdown=getSalePaymentBreakdown(s);
  if(isSplit){
    paymentHtml+=`<div class="receipt-row mini-row"><span>· Cash portion</span><span>${money(breakdown.cash)}</span></div><div class="receipt-row mini-row"><span>· Mobile Money portion</span><span>${money(breakdown.momo)}</span></div>`;
    if(breakdown.bank>0) paymentHtml+=`<div class="receipt-row mini-row"><span>· Bank portion</span><span>${money(breakdown.bank)}</span></div>`;
  }
  const tenderedInfo=optTendered||(s.receipt_no?getReceiptTendered(s.receipt_no):null)||(s.client_ref?getReceiptTendered(s.client_ref):null);
  let changeHtml='';
  if(tenderedInfo&&tenderedInfo.tendered>0){
    changeHtml=`<div class="receipt-row"><span>Amount Tendered</span><span>${money(tenderedInfo.tendered)}</span></div><div class="receipt-row"><b>Change Due</b><b>${money(tenderedInfo.change)}</b></div>`;
  }

  $('#receiptContent').innerHTML=`<div class="receipt-center"><h2>${esc(shop.name)}</h2>${esc(shop.phone||'')}${shop.tax_number?`<br>${esc(taxLabel)} No: ${esc(shop.tax_number)}`:''}<br>${esc(shop.receipt_footer||'Thank you for your business')}</div><div class="receipt-line"></div><div>Receipt: <b>${esc(s.receipt_no||'—')}</b></div><div>Date: ${fmt(s.created_at)}</div><div>Cashier: ${esc(s.employee_name||'Owner')}</div><div class="receipt-line"></div>${items}${discount?`<div class="receipt-row"><span>Subtotal</span><span>${money(gross)}</span></div><div class="receipt-row"><span>Discount</span><span>-${money(discount)}</span></div>`:''}<div class="receipt-line"></div><div class="receipt-row"><b>TOTAL</b><b>${money(total)}</b></div>${rate>0?`<div class="receipt-row"><span>${esc(taxLabel)} included (${rate}%)</span><span>${money(tax)}</span></div>`:''}${paymentHtml}${changeHtml}<div class="receipt-line"></div><div class="receipt-center">Kivu Solutions digital receipt</div><div class="receipt-center"><small>Powered by Platinum Tech</small></div><div class="receipt-center"><small>This is a Kivu sales receipt, not an RRA EBM fiscal receipt unless a separately approved EBM integration is active.</small></div>`;
  $('#receiptModal').showModal();
}
$('#printReceiptBtn').onclick=()=>window.print();


/* OWNER SETTINGS + PLAN TESTING */
$$('.plan-btn').forEach(b=>b.onclick=async()=>{
  if(profile.role!=='owner')return kivuNotify('Only the owner can request a plan change.');
  const plan=b.dataset.plan,selected=PLAN_CONFIG[plan];if(!selected)return;
  if(plan===(shop.plan||'basic')&&subscriptionAllowsAccess())return;
  if(!(await kivuConfirm(`Request ${selected.label}${selected.oneTime?` for ${money(selected.price)} one time`:` at ${money(selected.price)}/month`}? Your current plan stays unchanged until Platinum Tech confirms payment and activation.`,{title:'Request Plan',confirmText:'Request'})))return;
  const {error}=await sb.rpc('request_plan_change',{p_plan:plan});
  if(error)return kivuNotify(error.message,'error');
  kivuNotify('Plan request sent to Platinum Tech. Your current access remains unchanged until activation is confirmed.');
});

async function setTestSubscriptionStatus(status){
  if(profile.role!=='owner')return;
  const now=new Date(),patch={subscription_status:status};
  if(status==='trial'){const end=new Date(now);end.setDate(end.getDate()+7);Object.assign(patch,{trial_ends_at:end.toISOString(),current_period_start:null,current_period_end:null,grace_ends_at:null,cancelled_at:null});}
  if(status==='active'){const end=new Date(now),grace=new Date(now);end.setDate(end.getDate()+30);grace.setDate(end.getDate()+SUBSCRIPTION_GRACE_DAYS);Object.assign(patch,{current_period_start:now.toISOString(),current_period_end:end.toISOString(),grace_ends_at:grace.toISOString(),cancelled_at:null});}
  if(status==='grace'){const period=new Date(now),grace=new Date(now);period.setDate(period.getDate()-1);grace.setDate(grace.getDate()+SUBSCRIPTION_GRACE_DAYS);Object.assign(patch,{current_period_end:period.toISOString(),grace_ends_at:grace.toISOString(),cancelled_at:null});}
  if(status==='expired'){const past=new Date(now);past.setDate(past.getDate()-1);Object.assign(patch,{current_period_end:past.toISOString(),grace_ends_at:past.toISOString()});}
  if(status==='cancelled')patch.cancelled_at=now.toISOString();
  const {error}=await sb.from('shops').update(patch).eq('id',shop.id);if(error)return kivuNotify(error.message,'error');
  Object.assign(shop,patch);await audit('changed subscription status','subscription',{status});await load();render();
}
// Production build: subscription lifecycle test controls are intentionally disabled.

$('#settingsForm').onsubmit=async e=>{
  e.preventDefault();if(profile.role!=='owner')return kivuNotify('Only the owner can change business settings.');
  const p={name:$('#settingsBusinessName').value,phone:$('#settingsPhone').value||null,receipt_footer:$('#settingsReceiptFooter').value||null,business_type:$('#settingsBusinessType')?.value||'retail',ebm_enabled:false};
  const {error}=await sb.rpc('update_shop_settings_v486',{p_name:p.name,p_phone:p.phone,p_receipt_footer:p.receipt_footer,p_business_type:p.business_type});if(error)return kivuNotify(error.message,'error');
  const tax=await sb.rpc('update_shop_tax_settings',{p_tax_rate:Number($('#settingsTaxRate')?.value||0),p_tax_label:$('#settingsTaxLabel')?.value||'VAT',p_tax_number:$('#settingsTaxNumber')?.value||null});if(tax.error)return kivuNotify(tax.error.message);
  Object.assign(shop,p,{tax_rate:Number($('#settingsTaxRate')?.value||0),tax_label:$('#settingsTaxLabel')?.value||'VAT',tax_number:$('#settingsTaxNumber')?.value||null});await audit('updated settings','settings',{business_type:p.business_type,tax_rate:shop.tax_rate});render();kivuNotify('Settings saved.');window.showToast?.('Business settings updated successfully.', 'success', 'Settings Saved');
};
if($('#ebmEnabled')){$('#ebmEnabled').checked=false;$('#ebmEnabled').disabled=true;}
$('#reportPeriod').onchange=renderReports;

/* RENDER */
function render(){
  applyPermissions();
  if($('#shopLabel')) $('#shopLabel').textContent=shop.name;const rTxt=roleLabel(profile.role);if($('#roleBadge'))$('#roleBadge').textContent=rTxt;if($('#topRoleBadge'))$('#topRoleBadge').textContent=rTxt;const sub=effectiveSubscriptionStatus();if($('#planChip')) $('#planChip').textContent=`${planLabel().toUpperCase()} · ${sub.toUpperCase()}`;
  fill();renderDashboard();renderSales();renderInventory();renderSuppliers();renderExpenses();renderCustomers();renderEmployees();renderShifts();renderControls();renderReports();renderPlans();renderSubscriptionStatus();renderSettings();renderNotifications();
}
function renderDashboard(){
  const t=day(new Date()),ss=sales.filter(x=>day(x.created_at)===t&&x.status!=='voided'),ee=expenses.filter(x=>day(x.created_at)===t&&x.approval_status!=='rejected'),sa=ss.reduce((a,x)=>a+Number(x.total||0),0),ex=ee.reduce((a,x)=>a+Number(x.amount||0),0),cogs=ss.reduce((a,x)=>a+Number(x.cost||0),0),cr=credits.filter(x=>!x.paid).reduce((a,x)=>a+Number(x.amount||0),0),low=products.filter(x=>Number(x.qty)<=Number(x.low_stock));
  if($('#salesToday'))$('#salesToday').textContent=money(sa);
  if($('#expensesToday'))$('#expensesToday').textContent=money(ex);
  if($('#profitToday'))$('#profitToday').textContent=money(sa-cogs-ex);
  if($('#creditTotal'))$('#creditTotal').textContent=money(cr);
  if($('#lowStockCount'))$('#lowStockCount').textContent=low.length;
  if($('#stockValue'))$('#stockValue').textContent=money(products.reduce((a,x)=>a+Number(x.qty)*Number(x.cost),0));
  if($('#shiftStatusCard'))$('#shiftStatusCard').textContent=currentShift?`My shift open · ${profile.full_name||roleLabel(profile.role)}`:'No open shift';

  /* Executive Command Center Headers & Business Identity */
  if($('#dashboardShopHeading')) $('#dashboardShopHeading').textContent=`${esc(shop?.name||'Business')} Overview`;
  const typeLabels={retail:'Retail Shop & POS',bar:'Bar Counter & Tabs',restaurant:'Restaurant & Kitchen',bar_restaurant:'Bar & Restaurant Service'};
  if($('#dashboardShopTypePill')) $('#dashboardShopTypePill').textContent=typeLabels[shop?.business_type]||'Commercial Business';

  /* 1. Today's Payment Channels & Performance */
  let todayCash=0,todayMomo=0,todayBank=0,todayCredit=0;
  const cashReceipts=new Set(), momoReceipts=new Set(), bankReceipts=new Set(), creditReceipts=new Set();
  const txSet=new Set();

  ss.forEach(x=>{
    const b=getSalePaymentBreakdown(x);
    todayCash+=b.cash; todayMomo+=b.momo; todayBank+=b.bank; todayCredit+=b.credit;
    const key=x.receipt_no||x.id;
    txSet.add(key);
    if(b.cash>0) cashReceipts.add(key);
    if(b.momo>0) momoReceipts.add(key);
    if(b.bank>0) bankReceipts.add(key);
    if(b.credit>0) creditReceipts.add(key);
  });
  const grossSalesToday=todayCash+todayMomo+todayBank+todayCredit;
  const txCount=txSet.size;
  const avgBasket=txCount>0?(grossSalesToday/txCount):0;

  if($('#overviewTxCount'))$('#overviewTxCount').textContent=txCount;
  if($('#overviewAvgBasket'))$('#overviewAvgBasket').textContent=money(avgBasket);
  if($('#overviewGrossSales'))$('#overviewGrossSales').textContent=money(grossSalesToday);

  /* Contextual Subtitles for KPI Cards */
  const activeDebtorsCount=new Set(credits.filter(x=>!x.paid).map(x=>x.customer_id||x.customer)).size;
  const profitVal=sa-cogs-ex;
  const marginPct=sa>0?Math.round((profitVal/sa)*100):0;
  if($('#kpiSalesSubtext')) $('#kpiSalesSubtext').textContent=txCount>0?`${txCount} sale(s) · avg ${money(avgBasket)}`:'0 transactions recorded today';
  if($('#kpiExpensesSubtext')) $('#kpiExpensesSubtext').textContent=ee.length>0?`${ee.length} expense(s) logged today`:'Zero operating outflows today';
  if($('#kpiProfitSubtext')) $('#kpiProfitSubtext').textContent=sa>0?`Net margin: ${marginPct}% of sales`:'Sales − Cost − Expenses';
  if($('#kpiCreditSubtext')) $('#kpiCreditSubtext').textContent=activeDebtorsCount>0?`${activeDebtorsCount} customer(s) with debt`:'All customer accounts clear';
  if($('#kpiLowStockSubtext')) $('#kpiLowStockSubtext').textContent=low.length>0?`${low.length} item(s) below reorder level`:'All catalog stock healthy';
  if($('#kpiStockValSubtext')) $('#kpiStockValSubtext').textContent=`${products.length} catalog items valued at cost`;

  /* Actionable Operational Attention Ribbon */
  const alertsBox=$('#dashboardAlertsRibbon');
  if(alertsBox){
    const alertItems=[];
    if(products.length===0&&can('owner','manager')){
      alertItems.push(`
        <div class="alert-ribbon-item alert-ribbon-info">
          <div class="alert-ribbon-content">
            <span class="alert-ribbon-icon">✨</span>
            <span><b>Welcome to Kivu Solutions!</b> Set up your catalog or import opening inventory to start fast counter checkout.</span>
          </div>
          <button type="button" class="alert-ribbon-btn" onclick="showPage('inventory');$('#productModal')?.showModal();">+ Add product →</button>
        </div>
      `);
    }
    if(low.length>0){
      alertItems.push(`
        <div class="alert-ribbon-item alert-ribbon-warning">
          <div class="alert-ribbon-content">
            <span class="alert-ribbon-icon">⚠️</span>
            <span><b>${low.length} product(s)</b> are running low or out of stock. Replenish inventory to prevent lost revenue.</span>
          </div>
          <button type="button" class="alert-ribbon-btn" onclick="showPage('inventory');filterInventoryStatus('low')">Review stock →</button>
        </div>
      `);
    }
    if(cr>0){
      alertItems.push(`
        <div class="alert-ribbon-item alert-ribbon-info">
          <div class="alert-ribbon-content">
            <span class="alert-ribbon-icon">📝</span>
            <span><b>${money(cr)}</b> in outstanding customer credit ("Amadeni") across <b>${activeDebtorsCount} debtor(s)</b>.</span>
          </div>
          <button type="button" class="alert-ribbon-btn" onclick="showPage('customers')">Debtors ledger →</button>
        </div>
      `);
    }
    if(!currentShift&&can('cashier','owner','manager')&&hasFeature('shifts')){
      alertItems.push(`
        <div class="alert-ribbon-item alert-ribbon-info">
          <div class="alert-ribbon-content">
            <span class="alert-ribbon-icon">⚖️</span>
            <span><b>No Open Register Shift:</b> Open a shift to track cash drawer balance, log float, and reconcile closing cash.</span>
          </div>
          <button type="button" class="alert-ribbon-btn" onclick="showPage('shifts');$('#openShiftModal')?.showModal();">Open shift →</button>
        </div>
      `);
    }
    if(sales.length>=1000){
      alertItems.unshift(`
        <div class="alert-ribbon-item alert-ribbon-info" style="border-left: 4px solid var(--k-accent, #2563eb);">
          <div class="alert-ribbon-content">
            <span class="alert-ribbon-icon">ℹ️</span>
            <span><b>High Volume Window:</b> Analytics and comparisons are computed over the latest 1,000 sales transactions loaded.</span>
          </div>
        </div>
      `);
    }
    alertsBox.innerHTML=alertItems.join('');
  }

  /* 7-Day Performance Trend Chart & Weekly Velocity */
  const trendBox=$('#trendBarsContainer'), trendAxis=$('#trendDaysAxis');
  if(trendBox&&trendAxis){
    const now=new Date();
    const days7=[];
    for(let i=6;i>=0;i--){
      const d=new Date(now);
      d.setDate(d.getDate()-i);
      const dStr=day(d);
      const daySales=sales.filter(s=>day(s.created_at)===dStr&&s.status!=='voided');
      const dayTotal=daySales.reduce((a,s)=>a+Number(s.total||0),0);
      const dayName=d.toLocaleDateString('en-RW',{weekday:'short'});
      const dateFormatted=d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
      days7.push({dateStr:dStr,dayName,dateFormatted,total:dayTotal,count:daySales.length,isToday:i===0});
    }
    const maxDaySales=Math.max(...days7.map(x=>x.total),1);
    const sum7d=days7.reduce((a,x)=>a+x.total,0);
    const avg7d=Math.round(sum7d/7);

    if($('#trend7dTotal')) $('#trend7dTotal').textContent=money(sum7d);
    if($('#trend7dAvg')) $('#trend7dAvg').textContent=money(avg7d);

    trendBox.innerHTML=days7.map(d=>{
      const heightPct=Math.max(8,Math.round((d.total/maxDaySales)*100));
      return `
        <div class="trend-bar-col ${d.isToday?'is-today':''}" onclick="this.classList.toggle('active')" title="${d.dayName} ${d.dateFormatted}: ${money(d.total)} (${d.count} sales)">
          <div class="trend-bar-tooltip">
            <b>${money(d.total)}</b><br><small>${d.dateFormatted} · ${d.count} sale(s)</small>
          </div>
          <div class="trend-bar-fill" style="height:${heightPct}%"></div>
        </div>
      `;
    }).join('');

    trendAxis.innerHTML=days7.map(d=>`
      <span class="trend-day-label ${d.isToday?'is-today':''}">
        ${d.isToday?'Today':d.dayName}
      </span>
    `).join('');
  }

  const pctCash=(grossSalesToday>0&&todayCash>0)?Math.round((todayCash/grossSalesToday)*100):0;
  const pctMomo=(grossSalesToday>0&&todayMomo>0)?Math.round((todayMomo/grossSalesToday)*100):0;
  const pctBank=(grossSalesToday>0&&todayBank>0)?Math.round((todayBank/grossSalesToday)*100):0;
  const pctCredit=(grossSalesToday>0&&todayCredit>0)?Math.round((todayCredit/grossSalesToday)*100):0;

  if($('#barCash'))$('#barCash').style.width=(grossSalesToday>0&&todayCash>0?((todayCash/grossSalesToday)*100).toFixed(1)+'%':'0%');
  if($('#barMomo'))$('#barMomo').style.width=(grossSalesToday>0&&todayMomo>0?((todayMomo/grossSalesToday)*100).toFixed(1)+'%':'0%');
  if($('#barBank'))$('#barBank').style.width=(grossSalesToday>0&&todayBank>0?((todayBank/grossSalesToday)*100).toFixed(1)+'%':'0%');
  if($('#barCredit'))$('#barCredit').style.width=(grossSalesToday>0&&todayCredit>0?((todayCredit/grossSalesToday)*100).toFixed(1)+'%':'0%');

  const channelsList=$('#paymentChannelsList');
  if(channelsList){
    const channels=[
      {name:'Cash',icon:'💵',amount:todayCash,count:cashReceipts.size,pct:pctCash,colorClass:'cash'},
      {name:'MTN Mobile Money',icon:'📱',amount:todayMomo,count:momoReceipts.size,pct:pctMomo,colorClass:'momo'},
      {name:'Bank Transfer',icon:'🏦',amount:todayBank,count:bankReceipts.size,pct:pctBank,colorClass:'bank'},
      {name:'Customer Credit',icon:'📝',amount:todayCredit,count:creditReceipts.size,pct:pctCredit,colorClass:'credit'}
    ];
    channelsList.innerHTML=channels.map(ch=>`
      <div class="channel-row">
        <div class="channel-left">
          <span class="channel-icon ${ch.colorClass}">${ch.icon}</span>
          <div>
            <strong class="channel-name">${ch.name}</strong>
            <small class="channel-sub">${ch.count} receipt(s) · ${ch.pct}% of sales</small>
          </div>
        </div>
        <div class="channel-right">
          <strong class="channel-amt">${money(ch.amount)}</strong>
        </div>
      </div>
    `).join('');
  }

  /* 2. Live Register & Cash Drawer Status */
  const activeShift=currentShift||shifts.find(x=>x.status==='open')||null;
  const drawerBox=$('#overviewDrawerBox');
  if(drawerBox){
    if(activeShift){
      const c=calcShift(activeShift);
      const cashierName=activeShift.employee_name||'Active Cashier';
      const isMyShift=currentShift&&currentShift.id===activeShift.id;
      drawerBox.innerHTML=`
        <div class="drawer-hero-box">
          <div class="drawer-hero-top">
            <span class="drawer-status-pill live"><span class="pulse-dot"></span> Active Register</span>
            <div class="drawer-duty-meta">
              <span class="drawer-cashier-label">On duty: <b>${esc(cashierName)}</b>${isMyShift?' (You)':''}</span>
              <small class="drawer-opened-at">Opened ${fmt(activeShift.opened_at)}</small>
            </div>
          </div>
          <div class="drawer-hero-amount">
            <span class="drawer-amt-sub">Expected Cash in Drawer</span>
            <strong class="drawer-amt-val">${money(c.expected)}</strong>
          </div>
          <div class="drawer-stats-row">
            <div class="drawer-stat">
              <span>Opening float</span>
              <b>${money(activeShift.opening_cash)}</b>
            </div>
            <div class="drawer-stat">
              <span>Cash collected</span>
              <b class="text-success">+${money(c.cash+c.debtCash)}</b>
            </div>
            <div class="drawer-stat">
              <span>Expenses / Payouts</span>
              <b class="text-danger">-${money(c.ex)}</b>
            </div>
          </div>
        </div>
        <div class="drawer-footer-actions">
          <button type="button" class="btn secondary btn-sm" onclick="showPage('shifts')">
            <span>⚖️</span> Shifts & Reconciliation
          </button>
          <button type="button" class="btn secondary btn-sm" onclick="openDrawerPettyCash()">
            <span>💸</span> Petty Cash Payout
          </button>
          <button type="button" class="btn ghost btn-sm" onclick="openShiftZReport('${activeShift.id}')">
            <span>🖨️</span> Z-Report
          </button>
        </div>
      `;
    }else{
      drawerBox.innerHTML=`
        <div class="drawer-hero-box inactive">
          <div class="drawer-hero-top">
            <span class="drawer-status-pill closed">Shift Closed</span>
            <span class="drawer-cashier-label">No cashier on duty</span>
          </div>
          <div class="drawer-hero-amount">
            <span class="drawer-amt-sub">Register Drawer</span>
            <strong class="drawer-amt-val" style="color:var(--muted)">0 RWF</strong>
          </div>
          <p class="drawer-inactive-hint">Open a cashier shift to track live drawer balance, log cash sales, and record cash drawer payouts.</p>
        </div>
        <div class="drawer-footer-actions">
          <button type="button" class="btn primary btn-sm" onclick="showPage('shifts');$('#openShiftModal')?.showModal();">
            <span>➕</span> Open Shift
          </button>
          <button type="button" class="btn ghost btn-sm" onclick="showPage('shifts')">
            Shift Records →
          </button>
        </div>
      `;
    }
  }

  /* 3. Top Selling Products (Fast Movers) */
  const prodMap={};
  sales.filter(s=>s.status!=='voided').forEach(s=>{
    const key=s.product_id||s.product_name;
    if(!key)return;
    if(!prodMap[key]){
      prodMap[key]={id:s.product_id,name:s.product_name,qty:0,revenue:0};
    }
    prodMap[key].qty+=Number(s.qty||s.entered_qty||1);
    prodMap[key].revenue+=Number(s.total||0);
  });
  const topProducts=Object.values(prodMap)
    .sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue)
    .slice(0,5);

  const fastMoversList=$('#fastMoversList');
  if(fastMoversList){
    if(topProducts.length===0){
      fastMoversList.innerHTML=`
        <div class="overview-empty-state">
          <span class="empty-icon">📈</span>
          <p>No sales recorded yet. Top moving products and velocity rankings will appear here as you sell.</p>
        </div>
      `;
    }else{
      fastMoversList.innerHTML=topProducts.map((item,idx)=>{
        const p=products.find(x=>(item.id&&x.id===item.id)||(x.name&&x.name.toLowerCase()===item.name.toLowerCase()));
        const rank=idx+1;
        const rankClass=rank===1?'rank-gold':rank===2?'rank-silver':rank===3?'rank-bronze':'rank-normal';
        let stockBadge='';
        if(p){
          const curQty=Number(p.qty||0);
          const lowThresh=Number(p.low_stock||0);
          const unit=p.base_unit||'units';
          if(curQty<=0){
            stockBadge=`<span class="stock-pill stock-out">Out of stock (0)</span>`;
          }else if(curQty<=lowThresh){
            stockBadge=`<span class="stock-pill stock-low">Low stock (${curQty} ${esc(unit)})</span>`;
          }else{
            stockBadge=`<span class="stock-pill stock-ok">${curQty} ${esc(unit)} in stock</span>`;
          }
        }else{
          stockBadge=`<span class="stock-pill stock-out">Archived item</span>`;
        }
        return `
          <div class="leaderboard-row">
            <div class="rank-badge ${rankClass}">#${rank}</div>
            <div class="leader-info">
              <div class="leader-name-row">
                <strong class="leader-name">${esc(item.name)}</strong>
                ${stockBadge}
              </div>
              <div class="leader-metrics">
                <span><b>${item.qty}</b> ${p?.base_unit||'sold'}</span>
                <span class="sep">·</span>
                <span class="text-revenue"><b>${money(item.revenue)}</b> gross</span>
                ${p?.category?`<span class="sep">·</span><span class="cat-tag">${esc(p.category)}</span>`:''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  /* 4. Customer Credit / "Amadeni" Watchlist */
  const unpaidCredits=credits.filter(c=>!c.paid);
  const debtorMap={};
  unpaidCredits.forEach(cr=>{
    const custName=(cr.customer||'').trim();
    const cObj=customers.find(c=>(cr.customer_id&&c.id===cr.customer_id)||(c.name&&c.name.toLowerCase()===custName.toLowerCase()));
    const key=cObj?.id||custName||'Unknown';
    if(!debtorMap[key]){
      debtorMap[key]={
        id:cObj?.id||null,
        name:cObj?.name||custName||'Debtor',
        phone:cObj?.phone||'',
        totalDebt:0,
        earliestDue:null,
        count:0
      };
    }
    debtorMap[key].totalDebt+=Number(cr.amount||0);
    debtorMap[key].count+=1;
    if(cr.due_date){
      if(!debtorMap[key].earliestDue||cr.due_date<debtorMap[key].earliestDue){
        debtorMap[key].earliestDue=cr.due_date;
      }
    }
  });
  const topDebtors=Object.values(debtorMap)
    .sort((a,b)=>b.totalDebt-a.totalDebt)
    .slice(0,5);

  const creditWatchlist=$('#creditWatchlist');
  if(creditWatchlist){
    if(topDebtors.length===0){
      creditWatchlist.innerHTML=`
        <div class="overview-empty-state">
          <span class="empty-icon">🤝</span>
          <p>No outstanding customer debts! All credit balances are paid up.</p>
        </div>
      `;
    }else{
      const todayStr=day(new Date());
      creditWatchlist.innerHTML=topDebtors.map(d=>{
        const isOverdue=d.earliestDue&&d.earliestDue<todayStr;
        const safeJsName=String(d.name||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        const ledgerCall=d.id?`openCustomerLedger('${d.id}')`:`openCustomerLedgerByName('${safeJsName}')`;
        const waCall=d.id?`sendWhatsappDebtReminder('${d.id}')`:`sendWhatsappDebtReminderByName('${safeJsName}')`;
        return `
          <div class="debtor-row">
            <div class="debtor-main">
              <div class="debtor-title-row">
                <strong class="debtor-name">${esc(d.name)}</strong>
                ${isOverdue?'<span class="overdue-tag">⚠️ Overdue</span>':''}
              </div>
              <div class="debtor-sub">
                <span>${d.phone?esc(d.phone):'No phone recorded'}</span>
                <span class="sep">·</span>
                <span>${d.count} credit record(s)</span>
                ${d.earliestDue?`<span class="sep">·</span><span>Due ${esc(d.earliestDue)}</span>`:''}
              </div>
            </div>
            <div class="debtor-actions">
              <strong class="debt-amount">${money(d.totalDebt)}</strong>
              <div class="debtor-btns">
                <button type="button" class="btn-wa-reminder" onclick="${waCall}" title="Send WhatsApp debt reminder">
                  💬 WhatsApp
                </button>
                <button type="button" class="btn ghost btn-xs" onclick="${ledgerCall}" title="Open customer ledger">
                  📋 Statement
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  /* 5. Critical Stock & Reorder Alerts */
  const criticalProducts=products.filter(p=>Number(p.qty||0)<=Number(p.low_stock||0))
    .sort((a,b)=>Number(a.qty)-Number(b.qty));
  const stockAlertsList=$('#stockAlertsList');
  if(stockAlertsList){
    if(criticalProducts.length===0){
      stockAlertsList.innerHTML=`
        <div class="overview-empty-state">
          <span class="empty-icon">✅</span>
          <p>Stock levels are healthy! All products have inventory above their low-stock reorder thresholds.</p>
        </div>
      `;
    }else{
      const canRestock=can('owner','manager','stock_clerk');
      stockAlertsList.innerHTML=`
        <div class="table-wrap">
          <table class="stock-alerts-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>Reorder Point</th>
                <th>Status</th>
                <th>Preferred Supplier</th>
                <th style="text-align:right">Action</th>
              </tr>
            </thead>
            <tbody>
              ${criticalProducts.slice(0,8).map(p=>{
                const curQty=Number(p.qty||0);
                const minQty=Number(p.low_stock||0);
                const isOut=curQty<=0;
                const unit=p.base_unit||'units';
                const supName=p.preferred_supplier_id?supplierName(p.preferred_supplier_id):'No preferred supplier';
                const supObj=suppliers.find(s=>s.id===p.preferred_supplier_id);
                return `
                  <tr>
                    <td>
                      <div class="stock-item-name">
                        <b>${esc(p.name)}</b>
                        ${p.barcode?`<small class="barcode-sub">${esc(p.barcode)}</small>`:''}
                      </div>
                    </td>
                    <td>${esc(p.category||'General')}</td>
                    <td><b class="${isOut?'text-danger':'text-warn'}">${curQty} ${esc(unit)}</b></td>
                    <td>${minQty} ${esc(unit)}</td>
                    <td>
                      <span class="badge ${isOut?'danger':'warn'}">
                        ${isOut?'Out of stock':'Low stock'}
                      </span>
                    </td>
                    <td>
                      <span>${esc(supName)}</span>
                      ${supObj?.phone?`<br><small class="text-muted">${esc(supObj.phone)}</small>`:''}
                    </td>
                    <td style="text-align:right">
                      ${canRestock?`
                        <button type="button" class="btn secondary btn-sm" onclick="openQuickAddStock('${p.id}')">
                          ↥ Add stock
                        </button>
                      `:'—'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }
}
window.openDrawerPettyCash=function(){
  const activeShift=currentShift||shifts.find(x=>x.status==='open');
  if(!activeShift) return kivuNotify('An active open shift is required to record a drawer petty cash payout.');
  $('#pettyCashModal')?.showModal();
};
window.openQuickAddStock=function(productId){
  if(!ensureSubscriptionAccess())return;
  if(!can('owner','manager','stock_clerk')) return kivuNotify('You do not have permission to add stock.');
  const modal=$('#stockModal');
  if(!modal)return;
  const sel=modal.querySelector('select[name="productId"]');
  if(sel&&productId)sel.value=productId;
  modal.showModal();
};
let salesCurrentPage = 1;
const SALES_PAGE_SIZE = 25;

function renderSales(){
  const pillsBox=$('#salesCategoryPills');
  if(pillsBox){
    const cats=['All',...new Set(products.map(p=>p.category).filter(Boolean))];
    pillsBox.innerHTML=cats.map(c=>{
      const active=(c==='All'&&(!selectedSalesCategory||selectedSalesCategory==='All'))||selectedSalesCategory===c;
      const count=c==='All'?sales.length:sales.filter(s=>{
        const prod=products.find(p=>p.id===s.product_id||p.name===s.product_name);
        return prod?.category===c;
      }).length;
      return `<button type="button" class="pill-btn ${active?'active':''}" onclick="filterSalesCategory('${esc(c)}')">${esc(c)} <small>(${count})</small></button>`;
    }).join('');
  }

  let list=sales;
  if(selectedSalesCategory&&selectedSalesCategory!=='All'){
    list=list.filter(s=>{
      const prod=products.find(p=>p.id===s.product_id||p.name===s.product_name);
      return prod?.category===selectedSalesCategory;
    });
  }
  if(salesSearchQuery){
    const q=salesSearchQuery.toLowerCase().trim();
    list=list.filter(s=>
      (s.receipt_no&&s.receipt_no.toLowerCase().includes(q))||
      (s.product_name&&s.product_name.toLowerCase().includes(q))||
      (s.customer&&s.customer.toLowerCase().includes(q))||
      (s.payment&&s.payment.toLowerCase().includes(q))||
      (s.employee_name&&s.employee_name.toLowerCase().includes(q))
    );
  }

  // Quick Date Filter Buttons (All Time, Today, Yesterday, Last 7 Days)
  if(window.salesDateFilter && window.salesDateFilter !== 'all'){
    const now = new Date();
    const todayStr = day(now);
    if(window.salesDateFilter === 'today'){
      list = list.filter(s => day(s.created_at) === todayStr);
    } else if(window.salesDateFilter === 'yesterday'){
      const yest = new Date(now); yest.setDate(yest.getDate() - 1);
      const yestStr = day(yest);
      list = list.filter(s => day(s.created_at) === yestStr);
    } else if(window.salesDateFilter === 'week'){
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
      list = list.filter(s => new Date(s.created_at) >= weekAgo);
    }
  }

  // Filter by status (completed vs voided)
  const statusFilter = $('#salesFilterStatus')?.value || 'all';
  if(statusFilter === 'completed'){
    list = list.filter(s => s.status !== 'voided');
  } else if(statusFilter === 'voided'){
    list = list.filter(s => s.status === 'voided');
  }

  // Filter by payment method
  const payFilter = $('#salesFilterPayment')?.value || 'all';
  if(payFilter !== 'all'){
    list = list.filter(s => (s.payment||'').toLowerCase().includes(payFilter.toLowerCase()));
  }

  // Filter by custom date range
  const dateFrom = $('#salesDateFrom')?.value;
  const dateTo = $('#salesDateTo')?.value;
  if(dateFrom){
    list = list.filter(s => day(s.created_at) >= dateFrom);
  }
  if(dateTo){
    list = list.filter(s => day(s.created_at) <= dateTo);
  }

  // Sorting
  const sortOption = $('#salesSortSelect')?.value || 'date-desc';
  list = [...list].sort((a,b) => {
    if(sortOption === 'date-asc') return new Date(a.created_at) - new Date(b.created_at);
    if(sortOption === 'total-desc') return Number(b.total||0) - Number(a.total||0);
    if(sortOption === 'total-asc') return Number(a.total||0) - Number(b.total||0);
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const totalFilteredCount = list.length;
  const totalPages = Math.ceil(totalFilteredCount / SALES_PAGE_SIZE) || 1;
  salesCurrentPage = Math.min(salesCurrentPage, totalPages);
  const startIdx = (salesCurrentPage - 1) * SALES_PAGE_SIZE;
  const pageItems = list.slice(startIdx, startIdx + SALES_PAGE_SIZE);

  if($('#salesCountPill')){
    $('#salesCountPill').textContent = `${totalFilteredCount} sale${totalFilteredCount===1?'':'s'}`;
  }

  // Pager controls
  const pagerEl = $('#salesPager');
  if(pagerEl){
    if(totalFilteredCount <= SALES_PAGE_SIZE){
      pagerEl.innerHTML = `<span style="color:var(--k-text-3,#64748b);">Showing ${totalFilteredCount} transaction${totalFilteredCount===1?'':'s'}</span>`;
    } else {
      const fromNum = startIdx + 1;
      const toNum = Math.min(startIdx + SALES_PAGE_SIZE, totalFilteredCount);
      pagerEl.innerHTML = `
        <span style="color:var(--k-text-3,#64748b);">Showing <b>${fromNum}-${toNum}</b> of <b>${totalFilteredCount}</b></span>
        <div style="display:inline-flex; align-items:center; gap:8px;">
          <button type="button" class="btn ghost btn-sm" onclick="setSalesPage(${salesCurrentPage - 1})" ${salesCurrentPage <= 1 ? 'disabled style="opacity:0.5;pointer-events:none;"' : ''}>← Prev</button>
          <span>Page <b>${salesCurrentPage}</b> of <b>${totalPages}</b></span>
          <button type="button" class="btn ghost btn-sm" onclick="setSalesPage(${salesCurrentPage + 1})" ${salesCurrentPage >= totalPages ? 'disabled style="opacity:0.5;pointer-events:none;"' : ''}>Next →</button>
        </div>
      `;
    }
  }

  if(!pageItems.length){
    $('#salesBody').innerHTML = `<tr><td colspan="8"><div class="empty-table-state"><span class="empty-icon">🔍</span><p>No sales match your search and filter criteria.</p><button type="button" class="btn secondary btn-sm" onclick="clearAllSalesFilters()">Clear all filters</button></div></td></tr>`;
    return;
  }

  $('#salesBody').innerHTML=pageItems.map(s=>{
    const voided=s.status==='voided';
    const action=[];
    if(hasFeature('receipts')) action.push(`<button class="btn secondary btn-sm" onclick="viewReceipt('${s.id}')">🧾 Receipt</button>`);
    if(!voided&&can('owner','manager','cashier')) action.push(`<button class="btn ${can('owner','manager')?'ghost-danger':'secondary'} btn-sm" onclick="openVoidSale('${s.id}')">${can('owner','manager')?'Void':'Request void'}</button>`);
    if(voided) action.push('<span class="badge danger-badge">VOIDED</span>');

    const pLow = (s.payment||'').toLowerCase();
    let payClass = 'pay-cash';
    if(pLow.includes('momo') || pLow.includes('mobile')) payClass = 'pay-momo';
    else if(pLow.includes('bank') || pLow.includes('card')) payClass = 'pay-bank';
    else if(pLow.includes('credit')) payClass = 'pay-credit';
    else if(pLow.includes('+') || pLow.includes('split')) payClass = 'pay-split';

    const d = new Date(s.created_at);
    const dateStr = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

    return `<tr class="${voided?'muted-row':''}">
      <td>
        <div class="cell-date">
          <span>${dateStr}</span>
          <small>${timeStr}</small>
        </div>
      </td>
      <td><span class="receipt-code">${esc(s.receipt_no||'—')}</span></td>
      <td>
        <div class="cell-product">
          <strong class="prod-name">${esc(s.product_name)}</strong>
        </div>
      </td>
      <td><span class="qty-pill">${s.entered_qty?`${s.entered_qty} ${esc(s.sold_unit||'')}`:`${s.qty}`}</span></td>
      <td><span class="pay-chip ${payClass}"><span class="chip-dot"></span>${esc(s.payment||'Cash')}</span></td>
      <td>
        <div class="cell-customer">
          ${s.customer ? `<span class="cust-named">👤 ${esc(s.customer)}</span>` : `<span class="cust-walkin">Walk-in</span>`}
        </div>
      </td>
      <td>
        <div class="cell-amount">
          <strong class="total-amt">${money(s.total)}</strong>
          ${Number(s.discount)>0 ? `<small class="discount-tag">-${money(s.discount)}</small>` : ''}
        </div>
      </td>
      <td class="text-right">
        <div class="cell-actions">
          ${action.join(' ')}
        </div>
      </td>
    </tr>`;
  }).join('');
}

window.clearAllSalesFilters = function(){
  window.salesDateFilter = 'all';
  document.querySelectorAll('.sales-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === 'all');
  });
  if($('#salesSearchInput')) $('#salesSearchInput').value = '';
  salesSearchQuery = '';
  $('#clearSalesSearchBtn')?.classList.add('hidden');
  selectedSalesCategory = 'All';
  if($('#salesFilterStatus')) $('#salesFilterStatus').value = 'all';
  if($('#salesFilterPayment')) $('#salesFilterPayment').value = 'all';
  if($('#salesDateFrom')) $('#salesDateFrom').value = '';
  if($('#salesDateTo')) $('#salesDateTo').value = '';
  if($('#salesSortSelect')) $('#salesSortSelect').value = 'date-desc';
  salesCurrentPage = 1;
  renderSales();
};

window.setSalesPage = function(page){
  salesCurrentPage = Math.max(1, page);
  renderSales();
};

/* SALES ENHANCEMENTS: DATE FILTER & CSV EXPORT */
window.salesDateFilter = 'all';
window.setSalesDateFilter = function(filter){
  window.salesDateFilter = filter;
  document.querySelectorAll('.sales-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  renderSales();
};

window.exportSalesCsv = function(){
  if(!sales || !sales.length) return kivuNotify('No sales data to export.');
  const headers = ['Receipt No', 'Date', 'Time', 'Product', 'Quantity', 'Unit', 'Payment Method', 'Customer', 'Cashier', 'Total (RWF)', 'Status'];
  const rows = sales.map(s => {
    const d = new Date(s.created_at);
    return [
      s.receipt_no || '',
      d.toLocaleDateString('en-GB'),
      d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
      `"${(s.product_name||'').replace(/"/g, '""')}"`,
      s.entered_qty || s.qty || 1,
      s.sold_unit || 'pcs',
      `"${(s.payment||'Cash').replace(/"/g, '""')}"`,
      `"${(s.customer||'Walk-in').replace(/"/g, '""')}"`,
      `"${(s.employee_name||'User').replace(/"/g, '""')}"`,
      s.total || 0,
      s.status || 'completed'
    ].join(',');
  });
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kivu-sales-${day(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
$('#salesSearchInput')?.addEventListener('input',e=>{
  salesSearchQuery=e.target.value;
  $('#clearSalesSearchBtn')?.classList.toggle('hidden',!salesSearchQuery);
  renderSales();
});
$('#clearSalesSearchBtn')?.addEventListener('click',()=>{
  $('#salesSearchInput').value=''; salesSearchQuery='';
  $('#clearSalesSearchBtn').classList.add('hidden');
  renderSales();
});

function renderInventory(){
  // Inventory KPIs
  const totalCatalogVal = products.reduce((a, x) => a + Number(x.qty || 0) * Number(x.cost || 0), 0);
  const lowCount = products.filter(x => Number(x.qty || 0) <= Number(x.low_stock || 0) && Number(x.qty || 0) > 0).length;
  const outCount = products.filter(x => Number(x.qty || 0) <= 0).length;
  if($('#inventoryTotalProducts')) $('#inventoryTotalProducts').textContent = products.length;
  if($('#inventoryTotalValue')) $('#inventoryTotalValue').textContent = money(totalCatalogVal);
  if($('#inventoryLowCount')) $('#inventoryLowCount').textContent = lowCount;
  if($('#inventoryOutCount')) $('#inventoryOutCount').textContent = outCount;

  // Status Filter Pill Strip
  $$('#inventoryStatusFilterStrip button').forEach(b => {
    b.classList.toggle('active', (b.dataset.status || 'all') === selectedInventoryStatus);
  });

  const pillsBox=$('#inventoryCategoryPills');
  const cats=['All',...new Set(products.map(p=>p.category).filter(Boolean))];
  if(pillsBox){
    pillsBox.innerHTML=cats.map(c=>{
      const active=(c==='All'&&(!selectedInventoryCategory||selectedInventoryCategory==='All'))||selectedInventoryCategory===c;
      const count=c==='All'?products.length:products.filter(p=>p.category===c).length;
      return `<button type="button" class="pill-btn ${active?'active':''}" onclick="filterInventoryCategory('${esc(c)}')">${esc(c)} <small>(${count})</small></button>`;
    }).join('');
  }
  const dl=$('#categoryDatalist');
  if(dl){
    dl.innerHTML=[...new Set(products.map(p=>p.category).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join('');
  }

  let list=products;
  if(selectedInventoryStatus === 'instock'){
    list = list.filter(p => Number(p.qty || 0) > Number(p.low_stock || 0));
  } else if(selectedInventoryStatus === 'low'){
    list = list.filter(p => Number(p.qty || 0) <= Number(p.low_stock || 0) && Number(p.qty || 0) > 0);
  } else if(selectedInventoryStatus === 'out'){
    list = list.filter(p => Number(p.qty || 0) <= 0);
  }

  if(selectedInventoryCategory&&selectedInventoryCategory!=='All'){
    list=list.filter(p=>p.category===selectedInventoryCategory);
  }
  if(inventorySearchQuery){
    const q=inventorySearchQuery.toLowerCase().trim();
    list=list.filter(p=>
      (p.name&&p.name.toLowerCase().includes(q))||
      (p.barcode&&p.barcode.toLowerCase().includes(q))||
      (p.category&&p.category.toLowerCase().includes(q))||
      (p.preferred_supplier_id&&supplierName(p.preferred_supplier_id).toLowerCase().includes(q))
    );
  }

  $('#productsBody').innerHTML=list.length?list.map(p=>{
    const exp=p.expiry_date?new Date(p.expiry_date+'T00:00:00'):null;
    const days=exp?Math.ceil((exp-new Date())/86400000):null;
    const expText=!exp?'—':days<0?`Expired ${Math.abs(days)}d ago`:days===0?'Expires today':`${p.expiry_date} (${days}d)`;
    const bulkHtml=Number(p.bulk_price)>0?`<br><small class="text-muted">Bulk: ${money(p.bulk_price)} / ${esc(bulkUnitLabel(p))}</small>`:'';
    const qNum=Number(p.qty||0);
    const isOut=qNum<=0;
    const isLow=!isOut&&qNum<=Number(p.low_stock||0);
    const badgeClass=isOut?'danger-badge':(isLow?'danger-badge':'badge-success');
    const badgeText=isOut?'Out of stock':(isLow?'Low stock':'In stock');
    return `<tr>
      <td><b>${esc(p.name)}</b>${p.barcode?`<br><small class="barcode-tag">${esc(p.barcode)}</small>`:''}</td>
      <td>${p.category?`<span class="category-tag">${esc(p.category)}</span>`:'<span class="text-muted">—</span>'}</td>
      <td>${stockDisplay(p)}</td>
      <td>${can('owner','manager')?money(p.cost)+' / '+esc(baseUnitLabel(p)):'Hidden'}</td>
      <td><b>${money(p.price)}</b> / ${esc(baseUnitLabel(p))}${bulkHtml}</td>
      <td>${can('owner','manager')?money(Number(p.price)-Number(p.cost)):'Hidden'}</td>
      <td>${p.preferred_supplier_id?esc(supplierName(p.preferred_supplier_id)):'—'}</td>
      <td>${esc(expText)}</td>
      <td><span class="badge ${badgeClass}">${badgeText}</span></td>
      <td>${can('owner','manager')?`<button class="btn secondary" onclick="openEditProduct('${p.id}')">Edit</button> <button class="btn secondary" onclick="openStockAdjustFor('${p.id}')">Adjust</button>`:'—'}</td>
    </tr>`;
  }).join(''):`<tr><td colspan="10"><div class="empty-table-state"><span class="empty-icon">📦</span><p>${products.length?'No matching products found for this filter.':'No products in catalog yet.'}</p>${products.length?'':'<button class="btn primary btn-sm" onclick="$(\'#productModal\')?.showModal()">+ Add Product</button>'}</div></td></tr>`;
}

window.filterInventoryStatus=function(status){
  selectedInventoryStatus=status||'all';
  renderInventory();
};
window.filterInventoryCategory=function(cat){
  selectedInventoryCategory=cat;
  renderInventory();
};
$('#inventorySearchInput')?.addEventListener('input',e=>{
  inventorySearchQuery=e.target.value;
  $('#clearInventorySearchBtn')?.classList.toggle('hidden',!inventorySearchQuery);
  renderInventory();
});
$('#clearInventorySearchBtn')?.addEventListener('click',()=>{
  $('#inventorySearchInput').value=''; inventorySearchQuery='';
  $('#clearInventorySearchBtn').classList.add('hidden');
  renderInventory();
});

window.openStockAdjustFor=id=>{if(!requireFeature('controls','Controlled stock adjustments are included in Kivu Control.'))return;const f=$('#stockAdjustForm');if(f){f.elements.productId.value=id;$('#stockAdjustModal').showModal();}};
function renderSuppliers(){
  if(!can('owner','manager')||!$('#suppliersBody'))return;
  const purchaseTotalBySupplier={},paidBySupplier={};
  supplierPurchases.forEach(x=>purchaseTotalBySupplier[x.supplier_id]=(purchaseTotalBySupplier[x.supplier_id]||0)+Number(x.total_amount||0));
  supplierPayments.forEach(x=>paidBySupplier[x.supplier_id]=(paidBySupplier[x.supplier_id]||0)+Number(x.amount||0));
  const debt=supplierPurchases.reduce((a,x)=>a+Number(x.balance_due||0),0);
  if($('#supplierDebtTotal')) $('#supplierDebtTotal').textContent=money(debt);
  if($('#suppliersOwedCount')) $('#suppliersOwedCount').textContent=suppliers.filter(x=>supplierBalance(x.id)>0).length;
  const now=new Date(),monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  if($('#supplierPurchasesMonth')) $('#supplierPurchasesMonth').textContent=money(supplierPurchases.filter(x=>new Date(x.created_at)>=monthStart).reduce((a,x)=>a+Number(x.total_amount||0),0));

  let supList=suppliers;
  let supPurchasesList=supplierPurchases;
  if(supplierSearchQuery){
    const q=supplierSearchQuery.toLowerCase().trim();
    supList=supList.filter(x=>
      (x.name&&x.name.toLowerCase().includes(q))||
      (x.phone&&x.phone.toLowerCase().includes(q))||
      (x.address&&x.address.toLowerCase().includes(q))
    );
    supPurchasesList=supPurchasesList.filter(x=>
      (supplierName(x.supplier_id)&&supplierName(x.supplier_id).toLowerCase().includes(q))||
      (x.invoice_no&&x.invoice_no.toLowerCase().includes(q))||
      (x.status&&x.status.toLowerCase().includes(q))
    );
  }

  $('#suppliersBody').innerHTML=supList.length?supList.map(x=>{
    const bal=supplierBalance(x.id);
    return`<tr class="${x.active===false?'muted-row':''}">
      <td><b>${esc(x.name)}</b>${x.active===false?' <span class="badge">Archived</span>':''}<small>${x.address?`<br>${esc(x.address)}`:''}</small></td>
      <td>${esc(x.phone||'—')}</td>
      <td>${money(purchaseTotalBySupplier[x.id]||0)}</td>
      <td>${money(paidBySupplier[x.id]||0)}</td>
      <td><b>${money(bal)}</b></td>
      <td>${x.active!==false&&bal>0?`<button class="btn secondary" onclick="openSupplierPayment('${x.id}')">Pay debt</button> `:''}<button class="btn secondary" onclick="openEditSupplier('${x.id}')">Edit</button> ${x.active!==false?`<button class="btn danger" onclick="removeSupplier('${x.id}')">Delete</button>`:''}</td>
    </tr>`;
  }).join(''):`<tr><td colspan="6"><div class="empty-table-state"><span class="empty-icon">🏢</span><p>${suppliers.length?'No matching suppliers found.':'No suppliers registered yet.'}</p>${suppliers.length?'':'<button class="btn primary btn-sm" onclick="$(\'#supplierModal\')?.showModal()">+ Add Supplier</button>'}</div></td></tr>`;

  $('#supplierPurchasesBody').innerHTML=supPurchasesList.length?supPurchasesList.map(x=>`<tr>
    <td>${fmt(x.created_at)}</td>
    <td><b>${esc(supplierName(x.supplier_id))}</b></td>
    <td>${esc(x.invoice_no||'—')}</td>
    <td>${money(x.total_amount)}</td>
    <td>${money(x.paid_amount)}</td>
    <td><b>${money(x.balance_due)}</b></td>
    <td><span class="badge">${esc(x.status)}</span></td>
    <td>${x.due_date?new Date(x.due_date+'T00:00:00').toLocaleDateString('en-RW'):'—'}</td>
  </tr>`).join(''):`<tr><td colspan="8"><div class="empty-table-state"><span class="empty-icon">📦</span><p>${supplierPurchases.length?'No matching purchases found.':'No supplier purchases recorded yet.'}</p>${supplierPurchases.length?'':'<button class="btn primary btn-sm" onclick="$(\'#purchaseModal\')?.showModal()">+ Record Purchase</button>'}</div></td></tr>`;

  $('#supplierPaymentsBody').innerHTML=supplierPayments.length?supplierPayments.map(x=>`<tr>
    <td>${fmt(x.created_at)}</td>
    <td><b>${esc(supplierName(x.supplier_id))}</b></td>
    <td>${esc(x.payment_method||'—')}</td>
    <td>${esc(x.note||'—')}</td>
    <td><b>${money(x.amount)}</b></td>
  </tr>`).join(''):`<tr><td colspan="5"><div class="empty-table-state"><span class="empty-icon">💳</span><p>No supplier debt payments recorded yet.</p></div></td></tr>`;
}

$('#supplierSearchInput')?.addEventListener('input',e=>{
  supplierSearchQuery=e.target.value;
  $('#clearSupplierSearchBtn')?.classList.toggle('hidden',!supplierSearchQuery);
  renderSuppliers();
});
$('#clearSupplierSearchBtn')?.addEventListener('click',()=>{
  const inp=$('#supplierSearchInput');
  if(inp) inp.value='';
  supplierSearchQuery='';
  $('#clearSupplierSearchBtn')?.classList.add('hidden');
  renderSuppliers();
});
function renderExpenses(){
  const body=$('#expensesBody');if(!body)return;

  // Expenses KPIs
  const t=day(new Date());
  const eeToday=expenses.filter(x=>day(x.created_at)===t&&x.approval_status!=='rejected');
  const expTodayVal=eeToday.reduce((a,x)=>a+Number(x.amount||0),0);

  const now=new Date();
  const curY=now.getFullYear(), curM=now.getMonth();
  const eeMonth=expenses.filter(x=>{
    const d=new Date(x.created_at);
    return d.getFullYear()===curY&&d.getMonth()===curM&&x.approval_status!=='rejected';
  });
  const expMonthVal=eeMonth.reduce((a,x)=>a+Number(x.amount||0),0);

  const catSums={};
  eeMonth.forEach(x=>{
    const c=x.category||'Other';
    catSums[c]=(catSums[c]||0)+Number(x.amount||0);
  });
  let topCat='—', maxCatVal=0;
  for(const [cName, sum] of Object.entries(catSums)){
    if(sum>maxCatVal){ maxCatVal=sum; topCat=cName; }
  }

  if($('#expKpiToday')) $('#expKpiToday').textContent=money(expTodayVal);
  if($('#expKpiMonth')) $('#expKpiMonth').textContent=money(expMonthVal);
  if($('#expKpiTopCat')) $('#expKpiTopCat').textContent=topCat!=='—'?`${esc(topCat)} (${money(maxCatVal)})`:'None';

  // Category Pills
  const pillsBox=$('#expensesCategoryPills');
  const cats=['All',...new Set(expenses.map(e=>e.category).filter(Boolean))];
  if(pillsBox){
    pillsBox.innerHTML=cats.map(c=>{
      const active=(c==='All'&&(!selectedExpensesCategory||selectedExpensesCategory==='All'))||selectedExpensesCategory===c;
      const count=c==='All'?expenses.length:expenses.filter(e=>e.category===c).length;
      return `<button type="button" class="pill-btn ${active?'active':''}" onclick="filterExpensesCategory('${esc(c)}')">${esc(c)} <small>(${count})</small></button>`;
    }).join('');
  }

  // Filter list
  let list=expenses;
  if(selectedExpensesCategory&&selectedExpensesCategory!=='All'){
    list=list.filter(x=>(x.category||'Other')===selectedExpensesCategory);
  }
  if(expensesSearchQuery){
    const q=expensesSearchQuery.toLowerCase().trim();
    list=list.filter(x=>
      (x.description&&x.description.toLowerCase().includes(q))||
      (x.category&&x.category.toLowerCase().includes(q))||
      (x.employee_name&&x.employee_name.toLowerCase().includes(q))
    );
  }

  body.innerHTML=list.length?list.map(x=>`<tr><td>${fmt(x.created_at)}</td><td>${esc(x.category||'Other')}</td><td>${esc(x.description)}</td><td>${esc(x.employee_name||'Owner')}</td><td><b>${money(x.amount)}</b></td></tr>`).join(''):`<tr><td colspan="5"><div class="empty-table-state"><span class="empty-icon">💸</span><p>${expenses.length?'No matching expenses found for this filter.':'No expenses recorded yet.'}</p>${can('owner','manager')?'<button class="btn primary btn-sm" onclick="$(\'#expenseModal\')?.showModal()">+ Record Expense</button>':''}</div></td></tr>`;
  if($('#expenseApprovalHint')) $('#expenseApprovalHint').textContent='Expenses can be recorded by the owner or a manager only.';
}

window.filterExpensesCategory=function(cat){
  selectedExpensesCategory=cat;
  renderExpenses();
};
$('#expensesSearchInput')?.addEventListener('input',e=>{
  expensesSearchQuery=e.target.value;
  $('#clearExpensesSearchBtn')?.classList.toggle('hidden',!expensesSearchQuery);
  renderExpenses();
});
$('#clearExpensesSearchBtn')?.addEventListener('click',()=>{
  const inp=$('#expensesSearchInput');
  if(inp) inp.value='';
  expensesSearchQuery='';
  $('#clearExpensesSearchBtn')?.classList.add('hidden');
  renderExpenses();
});

function renderCustomers(){
  const debt={};credits.filter(x=>!x.paid).forEach(x=>debt[x.customer_id||x.customer]=(debt[x.customer_id||x.customer]||0)+Number(x.amount));

  // Customers KPIs
  const unpaid=credits.filter(x=>!x.paid);
  const totalUnpaid=unpaid.reduce((a,x)=>a+Number(x.amount||0),0);
  const debtorsSet=new Set(unpaid.map(x=>x.customer_id||x.customer));
  const collections=getCreditRepayments(shop?.id).reduce((a,x)=>a+Number(x.amount||0),0);

  if($('#custKpiTotal')) $('#custKpiTotal').textContent=customers.length;
  if($('#custKpiDebt')) $('#custKpiDebt').textContent=money(totalUnpaid);
  if($('#custKpiDebtors')) $('#custKpiDebtors').textContent=debtorsSet.size;
  if($('#custKpiCollections')) $('#custKpiCollections').textContent=money(collections);

  let custList=customers;
  if(customerSearchQuery){
    const q=customerSearchQuery.toLowerCase().trim();
    custList=custList.filter(c=>
      (c.name&&c.name.toLowerCase().includes(q))||
      (c.phone&&c.phone.toLowerCase().includes(q))||
      (c.email&&c.email.toLowerCase().includes(q))
    );
  }

  $('#customersBody').innerHTML=custList.length?custList.map(c=>{
    const bal=debt[c.id]||debt[c.name]||0;
    return `<tr class="${c.active===false?'muted-row':''}">
      <td><b>${esc(c.name)}</b>${c.active===false?' <span class="badge">Archived</span>':''}</td>
      <td>${esc(c.phone||'—')}</td>
      <td>${esc(c.email||'—')}</td>
      <td><b class="${bal>0?'text-danger':''}">${money(bal)}</b></td>
      <td class="action-cell">
        <button class="btn secondary" onclick="openCustomerLedger('${c.id}')" title="View Statement">📋 Statement</button>
        ${bal>0?`<button class="btn secondary" onclick="openCustomerDebtRepay('${c.id}')">Repay</button> `:''}
        ${bal>0?`<button class="btn ghost whatsapp-btn" onclick="sendWhatsappDebtReminder('${c.id}')" title="WhatsApp Reminder">💬 WA</button> `:''}
        ${can('owner','manager')?`<button class="btn secondary" onclick="openEditCustomer('${c.id}')">Edit</button> ${c.active!==false?`<button class="btn danger" onclick="removeCustomer('${c.id}')">Delete</button>`:''}`:''}
      </td>
    </tr>`;
  }).join(''):`<tr><td colspan="5"><div class="empty-table-state"><span class="empty-icon">👥</span><p>${customers.length?'No matching customers found for this filter.':'No customers in directory yet.'}</p>${can('owner','manager','cashier')?'<button class="btn primary btn-sm" onclick="$(\'#customerModal\')?.showModal()">+ Add Customer</button>':''}</div></td></tr>`;
  const open=credits.filter(x=>!x.paid);
  $('#creditList').innerHTML=open.length?open.map(c=>`
    <div class="item">
      <div>
        <b>${esc(c.customer)}</b>
        <small>${esc(c.note||'Customer credit')}${c.due_date?' · due '+esc(c.due_date):''}</small>
      </div>
      <div class="credit-actions">
        <b>${money(c.amount)}</b>
        <button class="btn secondary" onclick="openRepayCredit('${c.id}')">Repay</button>
        <button class="btn ghost" onclick="openCustomerLedgerByName('${esc(c.customer)}')">Statement</button>
        <button class="btn ghost whatsapp-btn" onclick="sendWhatsappReminderForCredit('${c.id}')">💬 WA</button>
      </div>
    </div>
  `).join(''):'No outstanding credit.';
}

$('#customerSearchInput')?.addEventListener('input',e=>{
  customerSearchQuery=e.target.value;
  $('#clearCustomerSearchBtn')?.classList.toggle('hidden',!customerSearchQuery);
  renderCustomers();
});
$('#clearCustomerSearchBtn')?.addEventListener('click',()=>{
  const inp=$('#customerSearchInput');
  if(inp) inp.value='';
  customerSearchQuery='';
  $('#clearCustomerSearchBtn')?.classList.add('hidden');
  renderCustomers();
});

window.openEditCustomer=function(id){
  if(!can('owner','manager'))return;
  const c=customers.find(x=>x.id===id); if(!c)return;
  const f=$('#editCustomerForm'); f.elements.id.value=c.id; f.elements.name.value=c.name||''; f.elements.phone.value=c.phone||''; f.elements.email.value=c.email||''; $('#editCustomerModal').showModal();
};
$('#editCustomerForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); const f=new FormData(e.target);
  const {error}=await sb.rpc('update_customer_details',{p_customer_id:f.get('id'),p_name:(f.get('name')||'').trim(),p_phone:(f.get('phone')||'').trim()||null,p_email:(f.get('email')||'').trim()||null});
  if(error)return kivuNotify(error.message,'error'); $('#editCustomerModal').close(); await refresh();
});
window.removeCustomer=async function(id){
  const c=customers.find(x=>x.id===id); if(!c||!(await kivuConfirm(`Delete ${c.name}? If it has transaction history Kivu Solutions will archive it instead.`,{danger:true})))return;
  const {data,error}=await sb.rpc('remove_customer_safe',{p_customer_id:id}); if(error)return kivuNotify(error.message,'error'); kivuNotify(data==='archived'?'Customer archived because financial history exists.':'Customer deleted.'); await refresh();
};
window.openEditSupplier=function(id){
  if(!can('owner','manager'))return;
  const s=suppliers.find(x=>x.id===id); if(!s)return;
  const f=$('#editSupplierForm'); f.elements.id.value=s.id; f.elements.name.value=s.name||''; f.elements.phone.value=s.phone||''; f.elements.address.value=s.address||''; f.elements.notes.value=s.notes||''; $('#editSupplierModal').showModal();
};
$('#editSupplierForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); const f=new FormData(e.target);
  const {error}=await sb.rpc('update_supplier_details',{p_supplier_id:f.get('id'),p_name:(f.get('name')||'').trim(),p_phone:(f.get('phone')||'').trim()||null,p_address:(f.get('address')||'').trim()||null,p_notes:(f.get('notes')||'').trim()||null});
  if(error)return kivuNotify(error.message,'error'); $('#editSupplierModal').close(); await refresh();
});
window.removeSupplier=async function(id){
  const s=suppliers.find(x=>x.id===id); if(!s||!(await kivuConfirm(`Delete ${s.name}? If purchase history exists Kivu Solutions will archive it instead.`,{danger:true})))return;
  const {data,error}=await sb.rpc('remove_supplier_safe',{p_supplier_id:id}); if(error)return kivuNotify(error.message,'error'); kivuNotify(data==='archived'?'Supplier archived because purchase history exists.':'Supplier deleted.'); await refresh();
};
function renderDukaAdmin(){
  if(!isDukaAdmin)return;
  const o=platformOverview||{};
  if($('#adminTotalShops')) $('#adminTotalShops').textContent=o.total_shops||0;
  if($('#adminActiveShops')) $('#adminActiveShops').textContent=(o.active_shops||0)+(o.trial_shops||0);
  if($('#adminInactiveShops')) $('#adminInactiveShops').textContent=(o.expired_shops||0)+(o.suspended_shops||0)+(o.cancelled_shops||0);
  if($('#adminMrr')) $('#adminMrr').textContent=money(o.estimated_mrr||0);
  const pm=o.plan_mix||{};
  $('#adminPlanMix').innerHTML=Object.keys(pm).length?Object.entries(pm).map(([k,v])=>`<span class="badge">${esc(k)}: ${v}</span>`).join(' '):'No shops yet.';
  $('#adminShopsBody').innerHTML=platformShops.length?platformShops.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.plan)}</td><td><span class="badge">${esc(s.subscription_status||'active')}</span></td><td>${s.current_period_end?fmt(s.current_period_end):'—'}</td><td>${fmt(s.created_at)}</td></tr>`).join(''):'<tr><td colspan="5">No shops yet.</td></tr>';
}

window.setEmployeeActive=async(id,active)=>{
  if(!can('owner','manager'))return kivuNotify('Only an owner or manager can change staff access.');
  const emp=employees.find(x=>x.id===id);if(!emp)return;
  if(emp.user_id===session.user.id)return kivuNotify('You cannot disable your own account.');
  if(!(await kivuConfirm(`${active?'Reactivate':'Disable'} ${emp.name}?`,{danger:!active})))return;
  const {error}=await sb.rpc('set_employee_active',{p_employee_id:id,p_active:!!active});
  if(error)return kivuNotify(error.message,'error');
  await refresh();
};

$('#changePinBtn')?.addEventListener('click',()=>$('#changePinModal').showModal());
$('#changePinForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=new FormData(e.target),pin=String(f.get('pin')||''),confirmPin=String(f.get('confirmPin')||'');
  if(!/^\d{6}$/.test(pin))return kivuNotify('PIN must be exactly 6 digits.');
  if(pin!==confirmPin)return kivuNotify('PINs do not match.');
  const {error}=await sb.auth.updateUser({password:pin});
  if(error)return kivuNotify(error.message,'error');
  e.target.reset();$('#changePinModal').close();kivuNotify('Your PIN has been changed.');
});



function renderEmployees(){
  if(!$('#employeesBody')||!hasFeature('employees'))return;
  const t=day(new Date());

  // Employees KPIs
  const pending=staffInvites.filter(i=>!i.used_at&&new Date(i.expires_at)>new Date());
  if($('#empKpiTotal')) $('#empKpiTotal').textContent=employees.length;
  if($('#empKpiActive')) $('#empKpiActive').textContent=employees.filter(e=>e.active!==false).length;
  if($('#empKpiInvites')) $('#empKpiInvites').textContent=pending.length;

  $('#employeesBody').innerHTML=employees.length?employees.map(e=>`<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.role)}</td><td>${esc(e.phone||'—')}</td><td><span class="badge">${e.active?'Active':'Disabled'}</span></td><td>${sales.filter(s=>s.user_id===e.user_id&&day(s.created_at)===t).length}</td><td>${can('owner','manager')?`<button class="btn ${e.active?'danger':'secondary'}" onclick="setEmployeeActive('${e.id}',${!e.active})">${e.active?'Disable':'Reactivate'}</button>`:'—'}</td></tr>`).join(''):`<tr><td colspan="6"><div class="empty-table-state"><span class="empty-icon">👥</span><p>No staff team members have joined yet.</p>${can('owner')?'<button class="btn primary btn-sm" onclick="$(\'#staffInviteModal\')?.showModal()">+ Invite Staff</button>':''}</div></td></tr>`;
  const auditPanel=$('#auditList')?.closest('.panel');
  auditPanel?.classList.toggle('hidden',!hasFeature('audit'));
  if(hasFeature('audit')) $('#auditList').innerHTML=audits.length?audits.slice(0,20).map(a=>`<div class="item"><div><b>${esc(a.user_name||'User')} · ${esc(a.action)}</b><small>${esc(a.entity)} · ${fmt(a.created_at)}</small></div></div>`).join(''):'No audit activity yet.';
  if($('#staffInvitesList')){
    $('#staffInvitesList').innerHTML=pending.length?pending.map(i=>`<div class="item"><div><b>${esc(i.employee_name)} · ${esc(roleLabel(i.role))}</b><small>Code: <strong>${esc(i.code)}</strong> · expires ${new Date(i.expires_at).toLocaleDateString()}</small></div></div>`).join(''):'No pending staff invites.';
  }
}
function renderShifts(){
  if(profile.role==='stock_clerk'||!hasFeature('shifts'))return;
  if(currentShift){
    const c=calcShift(currentShift);
    $('#openShiftBtn').classList.add('hidden');
    $('#closeShiftBtn').classList.remove('hidden');
    $('#pettyCashBtn')?.classList.remove('hidden');
    $('#printCurrentShiftZBtn')?.classList.remove('hidden');
    $('#shiftBreakdown').classList.remove('hidden');
    if($('#currentShiftTitle')) $('#currentShiftTitle').textContent=`Open — ${profile.full_name||roleLabel(profile.role)}`;
    if($('#currentShiftDetails')) $('#currentShiftDetails').textContent=`Opened ${fmt(currentShift.opened_at)}`;
    if($('#shiftOpeningCash')) $('#shiftOpeningCash').textContent=money(currentShift.opening_cash);
    if($('#shiftExpectedCash')) $('#shiftExpectedCash').textContent=money(c.expected);
    if($('#shiftDifference')) $('#shiftDifference').textContent='Pending count';
    if($('#shiftCashSales')) $('#shiftCashSales').textContent=money(c.cash);
    if($('#shiftMomoSales')) $('#shiftMomoSales').textContent=money(c.momo);
    if($('#shiftBankSales')) $('#shiftBankSales').textContent=money(c.bank);
    if($('#shiftCreditSales')) $('#shiftCreditSales').textContent=money(c.credit);
    if($('#shiftDebtCollections')) $('#shiftDebtCollections').textContent=money(c.debtCash);
    if($('#shiftPettyCash')) $('#shiftPettyCash').textContent=money(c.pettyCash);
    if($('#shiftExpenses')) $('#shiftExpenses').textContent=money(c.ex);
    if($('#shiftTotalSales')) $('#shiftTotalSales').textContent=money(c.total);
  }else{
    $('#openShiftBtn').classList.remove('hidden');
    $('#closeShiftBtn').classList.add('hidden');
    $('#pettyCashBtn')?.classList.add('hidden');
    $('#printCurrentShiftZBtn')?.classList.add('hidden');
    $('#shiftBreakdown').classList.add('hidden');
    if($('#currentShiftTitle')) $('#currentShiftTitle').textContent='No open shift';
    if($('#currentShiftDetails')) $('#currentShiftDetails').textContent='Open a shift to start cash accountability.';
    if($('#shiftOpeningCash')) $('#shiftOpeningCash').textContent='0 RWF';
    if($('#shiftExpectedCash')) $('#shiftExpectedCash').textContent='0 RWF';
    if($('#shiftDifference')) $('#shiftDifference').textContent='—';
  }
  $('#shiftHistoryBody').innerHTML=shifts.length?shifts.map(s=>{
    const c=calcShift(s),diff=s.difference==null?null:Number(s.difference);
    return `<tr>
      <td>${fmt(s.opened_at)}</td>
      <td>${esc(s.employee_name||'User')}</td>
      <td>${money(c.total)}</td>
      <td>${s.status==='closed'?money(s.expected_cash??c.expected):money(c.expected)}</td>
      <td>${s.actual_cash==null?'—':money(s.actual_cash)}</td>
      <td>${diff==null?'—':money(diff)}</td>
      <td><span class="badge ${s.status==='closed'?'badge-neutral':'badge-success'}">${esc(s.status)}</span></td>
      <td><button class="btn secondary" onclick="openShiftZReport('${s.id}')">🖨️ Z-Report</button></td>
    </tr>`;
  }).join(''):`<tr><td colspan="8"><div class="empty-table-state"><span class="empty-icon">⚖️</span><p>No register shifts recorded yet.</p><button class="btn primary btn-sm" onclick="$(\'#openShiftModal\')?.showModal()">+ Open Shift</button></div></td></tr>`;
}
function renderControls(){
  if(!$('#approvalsList'))return;
  if(!hasFeature('controls')||!can('owner','manager'))return;
  const pending=approvalRequests.filter(x=>x.status==='pending');
  if($('#pendingApprovalCount')) $('#pendingApprovalCount').textContent=pending.length;
  const t=day(new Date());
  if($('#voidedSalesToday')) $('#voidedSalesToday').textContent=sales.filter(x=>x.status==='voided'&&day(x.voided_at||x.created_at)===t).length;
  if($('#stockAdjustmentsToday')) $('#stockAdjustmentsToday').textContent=stockAdjustments.filter(x=>day(x.created_at)===t).length;
  const varTotal=shifts.filter(x=>x.status==='closed'&&day(x.closed_at||x.opened_at)===t).reduce((a,x)=>a+Math.abs(Number(x.difference||0)),0);
  if($('#cashVarianceToday')) $('#cashVarianceToday').textContent=money(varTotal);
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
  const reportCap=$('#reportCapNotice');
  if(reportCap){
    if(sales.length>=1000){
      reportCap.classList.remove('hidden');
      reportCap.textContent='ℹ️ Data Window: Summary metrics and period aggregations are based on the latest 1,000 sales records loaded on this device.';
    } else {
      reportCap.classList.add('hidden');
    }
  }
  const days=+$('#reportPeriod').value,cut=new Date();cut.setDate(cut.getDate()-days);
  const ss=sales.filter(x=>new Date(x.created_at)>=cut&&x.status!=='voided');
  const ee=expenses.filter(x=>new Date(x.created_at)>=cut&&x.approval_status!=='rejected');
  const sa=ss.reduce((a,x)=>a+Number(x.total||0),0);
  const ex=ee.reduce((a,x)=>a+Number(x.amount||0),0);
  const cogs=ss.reduce((a,x)=>a+Number(x.cost||0),0);
  const txCount=new Set(ss.map(x=>x.receipt_no||x.id)).size;

  if($('#reportSales')) $('#reportSales').textContent=money(sa);
  if($('#reportExpenses')) $('#reportExpenses').textContent=money(ex);
  if($('#reportProfit')) $('#reportProfit').textContent=money(sa-cogs-ex);
  if($('#reportTransactions')) $('#reportTransactions').textContent=txCount;

  // Operational metrics
  const avgBasket=txCount>0?Math.round(sa/txCount):0;
  const grossProfit=sa-cogs;
  const marginPct=sa>0?Math.round((grossProfit/sa)*100):0;
  const dailyAvg=days>0?Math.round(sa/days):sa;

  if($('#reportAvgBasket')) $('#reportAvgBasket').textContent=money(avgBasket);
  if($('#reportMarginPct')) $('#reportMarginPct').textContent=`${marginPct}%`;
  if($('#reportDailyAvg')) $('#reportDailyAvg').textContent=money(dailyAvg);

  // Revenue by Payment Channel Share
  let periodCash=0,periodMomo=0,periodBank=0,periodCredit=0;
  const cashTx=new Set(),momoTx=new Set(),bankTx=new Set(),creditTx=new Set();
  ss.forEach(x=>{
    const b=getSalePaymentBreakdown(x);
    periodCash+=b.cash; periodMomo+=b.momo; periodBank+=b.bank; periodCredit+=b.credit;
    const key=x.receipt_no||x.id;
    if(b.cash>0) cashTx.add(key);
    if(b.momo>0) momoTx.add(key);
    if(b.bank>0) bankTx.add(key);
    if(b.credit>0) creditTx.add(key);
  });
  const grossPeriod=periodCash+periodMomo+periodBank+periodCredit;
  const pctCash=grossPeriod>0?Math.round((periodCash/grossPeriod)*100):0;
  const pctMomo=grossPeriod>0?Math.round((periodMomo/grossPeriod)*100):0;
  const pctBank=grossPeriod>0?Math.round((periodBank/grossPeriod)*100):0;
  const pctCredit=grossPeriod>0?Math.round((periodCredit/grossPeriod)*100):0;

  const channelsList=$('#reportChannelsList');
  if(channelsList){
    const channels=[
      {name:'Cash',icon:'💵',amount:periodCash,count:cashTx.size,pct:pctCash,colorClass:'cash'},
      {name:'MTN Mobile Money',icon:'📱',amount:periodMomo,count:momoTx.size,pct:pctMomo,colorClass:'momo'},
      {name:'Bank Transfer',icon:'🏦',amount:periodBank,count:bankTx.size,pct:pctBank,colorClass:'bank'},
      {name:'Customer Credit',icon:'📝',amount:periodCredit,count:creditTx.size,pct:pctCredit,colorClass:'credit'}
    ];
    channelsList.innerHTML=channels.map(ch=>`
      <div class="channel-row">
        <div class="channel-left">
          <span class="channel-icon ${ch.colorClass}">${ch.icon}</span>
          <div>
            <strong class="channel-name">${ch.name}</strong>
            <small class="channel-sub">${ch.count} receipt(s) · ${ch.pct}% of period revenue</small>
          </div>
        </div>
        <div class="channel-right">
          <strong class="channel-amt">${money(ch.amount)}</strong>
        </div>
      </div>
    `).join('');
  }
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
window.toggleBillingCycle = function(cycle) {
  const isAnnual = cycle === 'annual';
  const mBtn = document.getElementById('billingMonthlyBtn');
  const aBtn = document.getElementById('billingAnnualBtn');
  if (mBtn) mBtn.classList.toggle('active', !isAnnual);
  if (aBtn) aBtn.classList.toggle('active', isAnnual);
  document.querySelectorAll('.pricing article').forEach(card => {
    const val = card.querySelector('.price-val');
    const cycleEl = card.querySelector('.price-cycle');
    const sub = card.querySelector('.price-subtext');
    if (val && val.dataset.monthly && val.dataset.annual) {
      val.textContent = isAnnual ? val.dataset.annual : val.dataset.monthly;
    }
    if (cycleEl && cycleEl.dataset.monthly && cycleEl.dataset.annual) {
      cycleEl.textContent = isAnnual ? cycleEl.dataset.annual : cycleEl.dataset.monthly;
    }
    if (sub && sub.dataset.monthly && sub.dataset.annual) {
      sub.textContent = isAnnual ? sub.dataset.annual : sub.dataset.monthly;
    }
  });
};
function renderSubscriptionStatus(){
  if(!$('#subscriptionStatusBadge'))return;
  const status=effectiveSubscriptionStatus();
  const labels={trial:'Free trial',active:'Active',grace:'Grace period',expired:'Expired',suspended:'Suspended',cancelled:'Cancelled'};
  if($('#subscriptionStatusBadge')) $('#subscriptionStatusBadge').textContent=labels[status]||status;
  $('#subscriptionStatusBadge').className=`subscription-status ${status}`;
  if($('#subscriptionPlanName')) $('#subscriptionPlanName').textContent=planLabel();
  let end=null,label='';
  if(status==='trial'){end=toDate(shop.trial_ends_at);label='Trial ends';}
  else if(status==='active'){end=toDate(shop.current_period_end);label='Renews / expires';}
  else if(status==='grace'){end=toDate(shop.grace_ends_at);label='Grace ends';}
  else if(status==='cancelled'){end=toDate(shop.cancelled_at);label='Cancelled';}
  if($('#subscriptionDateLabel')) $('#subscriptionDateLabel').textContent=label||'Access';
  if($('#subscriptionDateValue')) $('#subscriptionDateValue').textContent=shop?.plan==='one_time'?'No monthly renewal':(end?end.toLocaleDateString():(status==='active'?'No expiry set':'—'));
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
  try{await loadPlatformV41();renderDukaAdmin();showPage('dukaadmin',true);}catch(e){kivuNotify(e.message);}
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
  if($('#adminTotalShops')) $('#adminTotalShops').textContent=o.total_shops||0;
  if($('#adminActiveShops')) $('#adminActiveShops').textContent=o.active_shops||0;
  if($('#adminInactiveShops')) $('#adminInactiveShops').textContent=o.inactive_shops||0;
  if($('#adminNeedsHelp')) $('#adminNeedsHelp').textContent=o.needs_assistance||0;
  if($('#adminMrr')) $('#adminMrr').textContent=money(o.estimated_mrr||0);
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
  const {data,error}=await sb.rpc('duka_shop_support_view',{p_shop_id:id}); if(error)return kivuNotify(error.message,'error');
  selectedSupportShopId=id;selectedSupportData=data;renderShopSupport();$('#shopSupportPanel').classList.remove('hidden');$('#shopSupportPanel').scrollIntoView({behavior:'smooth',block:'start'});
};

function renderShopSupport(){
  const d=selectedSupportData;if(!d)return;const s=d.shop||{};
  if($('#supportShopTitle')) $('#supportShopTitle').textContent=s.name||'Shop';
  if($('#supportShopMeta')) $('#supportShopMeta').textContent=[s.district,s.province,PLAN_CONFIG[s.plan||'basic']?.label||s.plan,s.subscription_status,s.onboarding_status,s.app_version?'App '+s.app_version:null].filter(Boolean).join(' · ');
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

$('#supportNoteForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!selectedSupportShopId)return;const note=new FormData(e.target).get('note');const {error}=await sb.rpc('duka_add_shop_note',{p_shop_id:selectedSupportShopId,p_note:note});if(error)return kivuNotify(error.message,'error');e.target.reset();await openShopSupport(selectedSupportShopId);});
$('#supportTicketForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!selectedSupportShopId)return;const f=new FormData(e.target);const {error}=await sb.rpc('duka_create_ticket',{p_shop_id:selectedSupportShopId,p_subject:f.get('subject'),p_description:f.get('description')||null,p_priority:f.get('priority')});if(error)return kivuNotify(error.message,'error');e.target.reset();await openShopSupport(selectedSupportShopId);});
window.updateSupportTicket=async function(id,current){const status=await kivuPrompt('Status: open, in_progress, waiting_customer, resolved, closed',{title:'Ticket Status',defaultValue:current});if(!status)return;const note=(await kivuPrompt('Resolution / update note (optional)',{title:'Resolution Note',defaultValue:''}))||null;const {error}=await sb.rpc('duka_update_ticket',{p_ticket_id:id,p_status:status,p_resolution:note});if(error)return kivuNotify(error.message,'error');await openShopSupport(selectedSupportShopId);};

async function setShopSuspension(flag){if(!selectedSupportShopId)return;const reason=await kivuPrompt(flag?'Reason for suspending this shop:':'Reason for reactivating this shop:',{title:flag?'Suspend Shop':'Reactivate Shop'});if(!reason)return;const {error}=await sb.rpc('duka_set_shop_suspension',{p_shop_id:selectedSupportShopId,p_suspended:flag,p_reason:reason});if(error)return kivuNotify(error.message,'error');await loadPlatformV41();await openShopSupport(selectedSupportShopId);renderDukaAdmin();}
$('#suspendShopBtn')?.addEventListener('click',()=>setShopSuspension(true));$('#reactivateShopBtn')?.addEventListener('click',()=>setShopSuspension(false));

$('#confirmPaymentBtn')?.addEventListener('click',()=>{if(!selectedSupportShopId)return;const f=$('#adminPaymentForm');f.elements.shopId.value=selectedSupportShopId;const now=new Date(),end=new Date();end.setDate(end.getDate()+29);f.elements.from.value=day(now);f.elements.to.value=day(end);$('#adminPaymentModal').showModal();});
$('#adminPaymentForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await sb.rpc('duka_confirm_subscription_payment',{p_shop_id:f.get('shopId'),p_amount:parseMoney(f.get('amount')),p_plan:f.get('plan'),p_payment_method:f.get('method'),p_reference:f.get('reference')||null,p_covered_from:f.get('from'),p_covered_to:f.get('to'),p_note:f.get('note')||null});if(error)return kivuNotify(error.message,'error');$('#adminPaymentModal').close();e.target.reset();await loadPlatformV41();await openShopSupport(selectedSupportShopId);renderDukaAdmin();});

$('#onboardingStatusBtn')?.addEventListener('click',async()=>{if(!selectedSupportShopId)return;const status=await kivuPrompt('Status: registered, setup_incomplete, active, needs_assistance',{title:'Onboarding Status',defaultValue:selectedSupportData?.shop?.onboarding_status||'setup_incomplete'});if(!status)return;const reason=(await kivuPrompt('Reason / note:',{title:'Reason / Note',defaultValue:'Support update'}))||'Support update';const {error}=await sb.rpc('duka_set_onboarding_status',{p_shop_id:selectedSupportShopId,p_status:status,p_reason:reason});if(error)return kivuNotify(error.message,'error');await loadPlatformV41();await openShopSupport(selectedSupportShopId);renderDukaAdmin();});

function renderAdminUsers(){
  const panel=$('#adminManagementPanel');if(!panel)return;const superAdmin=platformAdminProfile?.role==='super_admin';panel.classList.toggle('hidden',!superAdmin);if(!superAdmin)return;
  $('#adminUsersList').innerHTML=platformAdmins.length?platformAdmins.map(a=>`<div class="item"><div><b>${esc(a.display_name||a.email)}</b><small>${esc(adminRoleLabel(a.admin_role))}${a.district?' · '+esc(a.district):a.province?' · '+esc(a.province):''}</small></div><span class="badge">${a.active?'Active':'Disabled'}</span></div>`).join(''):'<div class="notice mini">No admins.</div>';
}
$('#addAdminBtn')?.addEventListener('click',()=>$('#adminUserModal').showModal());
$('#adminUserForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await sb.rpc('duka_manage_admin',{p_email:f.get('email'),p_role:f.get('role'),p_province:f.get('province')||null,p_district:f.get('district')||null,p_display_name:f.get('displayName')||null,p_active:f.get('active')==='true'});if(error)return kivuNotify(error.message,'error');$('#adminUserModal').close();e.target.reset();await loadPlatformV41();renderDukaAdmin();});

function renderPlatformAudit(){const el=$('#platformAuditList');if(!el)return;el.innerHTML=platformAudit.length?platformAudit.slice(0,50).map(x=>`<div class="item"><div><b>${esc(x.action)}</b><small>${esc(x.admin_name||'Admin')} ${x.shop_name?'· '+esc(x.shop_name):''} · ${fmt(x.created_at)}</small>${x.reason?`<small>${esc(x.reason)}</small>`:''}</div></div>`).join(''):'<div class="notice mini">No platform actions yet.</div>';}
async function renderPlatformStatus(){const el=$('#platformStatusBody');if(!el)return;const {data}=await sb.rpc('duka_app_status');appStatusCache=data||{};el.innerHTML=`<div class="item"><div><b>Current version ${esc(appStatusCache.current_version||'4.3')}</b><small>Minimum ${esc(appStatusCache.minimum_version||'4.0')} · Maintenance ${appStatusCache.maintenance_mode?'ON':'OFF'}</small></div>${platformAdminProfile?.role==='super_admin'?'<button id="editPlatformStatusBtn" class="btn secondary">Edit</button>':''}</div>`;$('#editPlatformStatusBtn')?.addEventListener('click',editPlatformStatus);}
async function editPlatformStatus(){const current=appStatusCache||{};const maintenance=await kivuConfirm('Turn maintenance mode ON?\nOK = ON, Cancel = OFF',{title:'Maintenance Mode',confirmText:'Turn ON',cancelText:'Turn OFF',danger:true});const message=(await kivuPrompt('Maintenance message',{title:'Maintenance Message',defaultValue:current.maintenance_message||''}))||'';const cv=(await kivuPrompt('Current app version',{title:'Current App Version',defaultValue:current.current_version||'5.3'}))||'5.3';const mv=(await kivuPrompt('Minimum supported version',{title:'Minimum Version',defaultValue:current.minimum_version||'5.0'}))||'5.0';const {error}=await sb.rpc('duka_set_app_status',{p_maintenance:maintenance,p_message:message,p_current_version:cv,p_minimum_version:mv});if(error)return kivuNotify(error.message,'error');await loadPlatformV41();renderDukaAdmin();}

// Device/session heartbeat. Revoked devices sign out on the next heartbeat.
function getDeviceKey(){let k=localStorage.getItem('duka_device_key');if(!k){k=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());localStorage.setItem('duka_device_key',k);}return k;}
async function deviceHeartbeat(){if(!session||!shop)return;const label=`${navigator.platform||'Device'} · ${navigator.userAgent.includes('Mobile')?'Mobile':'Browser'}`;const {data,error}=await sb.rpc('register_app_device',{p_device_key:getDeviceKey(),p_device_label:label,p_app_version:DUKA_APP_VERSION});if(!error&&data?.revoked){localStorage.removeItem('duka_device_key');kivuNotify('This device session was signed out by the business owner. You can sign in again to start a new authorized session.');await sb.auth.signOut();}}
setInterval(()=>deviceHeartbeat().catch(()=>{}),60000);setTimeout(()=>deviceHeartbeat().catch(()=>{}),2500);

// App version / maintenance check.
async function checkAppStatus(){const {data,error}=await sb.rpc('duka_app_status');if(error)return;appStatusCache=data||{};if(appStatusCache.maintenance_mode&&!isDukaAdmin){kivuNotify(appStatusCache.maintenance_message||'Kivu Solutions is temporarily under maintenance. Please try again later.');}}
setTimeout(()=>checkAppStatus().catch(()=>{}),1800);

// Notifications Center: persistent state, live business alerts, and modern card rendering.
let dismissedAlertsKey = 'kivu_dismissed_alerts_';
function getDismissedAlerts() {
  if (!shop?.id) return {};
  try { return JSON.parse(localStorage.getItem(dismissedAlertsKey + shop.id) || '{}'); } catch(_e) { return {}; }
}
function dismissAllAlerts(alertIds) {
  if (!shop?.id) return;
  const map = getDismissedAlerts();
  const now = Date.now();
  (alertIds || []).forEach(id => { map[id] = now; });
  localStorage.setItem(dismissedAlertsKey + shop.id, JSON.stringify(map));
}

async function loadNotifications() {
  if (!shop) return;
  try {
    const { data } = await sb.from('shop_notifications').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(50);
    shopNotifications = data || [];
  } catch (_e) {
    shopNotifications = [];
  }
  renderNotifications();
}

function renderNotifications() {
  const dismissedMap = getDismissedAlerts();
  const listEl = $('#notificationsList');
  const countBadge = $('#notificationCount');
  const modalBadge = $('#notifUnreadBadge');

  const allNotifs = [];

  // 1. Stored notifications from backend
  (shopNotifications || []).forEach(n => {
    let type = 'system';
    let icon = 'ℹ️';
    let typeClass = 'notif-type-system';
    let typeLabel = 'System';
    let actionText = '';
    let actionPage = '';

    const t = (n.title || '').toLowerCase();
    const m = (n.message || '').toLowerCase();

    if (t.includes('subscription') || t.includes('plan') || t.includes('billing') || m.includes('subscription')) {
      type = 'billing';
      icon = '💳';
      typeClass = 'notif-type-billing';
      typeLabel = 'Subscription';
      actionText = 'Review Plan →';
      actionPage = 'subscription';
    } else if (t.includes('stock') || t.includes('inventory') || m.includes('stock')) {
      type = 'stock';
      icon = '⚠️';
      typeClass = 'notif-type-stock';
      typeLabel = 'Stock Alert';
      actionText = 'View Inventory →';
      actionPage = 'inventory';
    } else if (t.includes('credit') || t.includes('debt') || m.includes('credit')) {
      type = 'credit';
      icon = '💰';
      typeClass = 'notif-type-credit';
      typeLabel = 'Customer Debt';
      actionText = 'View Debtors →';
      actionPage = 'customers';
    } else if (t.includes('invite') || t.includes('staff') || t.includes('employee')) {
      type = 'staff';
      icon = '👥';
      typeClass = 'notif-type-staff';
      typeLabel = 'Team & Staff';
      actionText = 'Manage Staff →';
      actionPage = 'employees';
    }

    allNotifs.push({
      id: 'stored_' + (n.id || Math.random()),
      isStored: true,
      raw: n,
      title: n.title,
      message: n.message,
      time: n.created_at ? fmt(n.created_at) : 'Recent',
      timestamp: n.created_at ? new Date(n.created_at).getTime() : 0,
      read: Boolean(n.read_at),
      type,
      icon,
      typeClass,
      typeLabel,
      actionText,
      actionPage
    });
  });

  // 2. Dynamic live alerts generated from real-time business conditions
  const subStatus = effectiveSubscriptionStatus();
  if (subStatus === 'grace' || subStatus === 'expired' || subStatus === 'trial') {
    const subAlertId = 'live_sub_' + subStatus;
    allNotifs.push({
      id: subAlertId,
      isStored: false,
      title: `Subscription Status: ${subStatus.toUpperCase()}`,
      message: subStatus === 'grace' 
        ? 'Your account is currently in grace period. Please renew to avoid interruption.'
        : subStatus === 'trial'
        ? 'Your free trial of Kivu Control is active. Review plans to ensure uninterrupted access.'
        : 'Your subscription has expired. Operational access is locked until renewed.',
      time: 'Realtime Alert',
      timestamp: Date.now() + 10000,
      read: Boolean(dismissedMap[subAlertId]),
      type: 'billing',
      icon: '💳',
      typeClass: 'notif-type-billing',
      typeLabel: 'Subscription & Billing',
      actionText: 'Review Plan →',
      actionPage: 'subscription'
    });
  }

  const lowProducts = products.filter(p => Number(p.qty || 0) <= Number(p.low_stock || 0));
  if (lowProducts.length > 0) {
    const outCount = lowProducts.filter(p => Number(p.qty || 0) <= 0).length;
    const stockAlertId = 'live_stock_' + lowProducts.length + '_' + outCount;
    allNotifs.push({
      id: stockAlertId,
      isStored: false,
      title: `${lowProducts.length} product(s) low or out of stock`,
      message: outCount > 0 
        ? `${outCount} item(s) are completely out of stock (${lowProducts.slice(0, 3).map(p=>p.name).join(', ')}...). Restock now.`
        : `${lowProducts.length} item(s) are at or below reorder threshold (${lowProducts.slice(0, 3).map(p=>p.name).join(', ')}...).`,
      time: 'Active Alert',
      timestamp: Date.now() + 9000,
      read: Boolean(dismissedMap[stockAlertId]),
      type: 'stock',
      icon: '⚠️',
      typeClass: 'notif-type-stock',
      typeLabel: 'Stock & Inventory',
      actionText: 'Check Stock →',
      actionPage: 'inventory'
    });
  }

  const todayStr = day(new Date());
  const overdueCredit = credits.filter(x => !x.paid && x.due_date && x.due_date < todayStr);
  const totalUnpaidCredit = credits.filter(x => !x.paid).reduce((a, x) => a + Number(x.amount || 0), 0);
  if (overdueCredit.length > 0 || totalUnpaidCredit > 0) {
    const creditAlertId = 'live_credit_' + overdueCredit.length + '_' + Math.round(totalUnpaidCredit);
    allNotifs.push({
      id: creditAlertId,
      isStored: false,
      title: overdueCredit.length > 0 ? `${overdueCredit.length} customer credit invoice(s) overdue` : 'Outstanding Customer Credit (Amadeni)',
      message: overdueCredit.length > 0
        ? `${money(overdueCredit.reduce((a, x) => a + Number(x.amount || 0), 0))} is overdue. Send WhatsApp reminders or review customer ledger.`
        : `Total customer debt outstanding: ${money(totalUnpaidCredit)}. Keep debt under control.`,
      time: 'Customer Ledger',
      timestamp: Date.now() + 8000,
      read: Boolean(dismissedMap[creditAlertId]),
      type: 'credit',
      icon: '💰',
      typeClass: 'notif-type-credit',
      typeLabel: 'Customer Debt',
      actionText: 'View Debtors →',
      actionPage: 'customers'
    });
  }

  if (can('owner', 'manager')) {
    const overdueSuppliers = supplierPurchases.filter(x => Number(x.balance_due || 0) > 0 && x.due_date && x.due_date < todayStr);
    if (overdueSuppliers.length > 0) {
      const supTotal = overdueSuppliers.reduce((a, x) => a + Number(x.balance_due || 0), 0);
      const supplierAlertId = 'live_sup_' + overdueSuppliers.length + '_' + Math.round(supTotal);
      allNotifs.push({
        id: supplierAlertId,
        isStored: false,
        title: `${overdueSuppliers.length} supplier balance(s) overdue`,
        message: `Total ${money(supTotal)} is overdue to suppliers. Review supplier balances.`,
        time: 'Supplier Accounts',
        timestamp: Date.now() + 7000,
        read: Boolean(dismissedMap[supplierAlertId]),
        type: 'supplier',
        icon: '🚚',
        typeClass: 'notif-type-supplier',
        typeLabel: 'Supplier Balances',
        actionText: 'View Suppliers →',
        actionPage: 'suppliers'
      });
    }

    const pendingApprovals = approvalRequests.filter(x => x.status === 'pending');
    const unreviewedShifts = shifts.filter(x => x.status === 'closed' && x.review_status === 'pending');
    if (pendingApprovals.length > 0 || unreviewedShifts.length > 0) {
      const totalRequests = pendingApprovals.length + unreviewedShifts.length;
      const controlAlertId = 'live_controls_' + pendingApprovals.length + '_' + unreviewedShifts.length;
      allNotifs.push({
        id: controlAlertId,
        isStored: false,
        title: `${totalRequests} control action(s) need owner approval`,
        message: `${pendingApprovals.length} void/adjustment request(s) and ${unreviewedShifts.length} closed shift variance(s) waiting for review.`,
        time: 'Anti-Theft Controls',
        timestamp: Date.now() + 6000,
        read: Boolean(dismissedMap[controlAlertId]),
        type: 'control',
        icon: '🛡️',
        typeClass: 'notif-type-control',
        typeLabel: 'Anti-Theft Controls',
        actionText: 'Review Approvals →',
        actionPage: 'controls'
      });
    }

    const pendingInvites = staffInvites.filter(i => !i.used_at && new Date(i.expires_at) > new Date());
    if (pendingInvites.length > 0) {
      const inviteAlertId = 'live_invites_' + pendingInvites.length;
      allNotifs.push({
        id: inviteAlertId,
        isStored: false,
        title: `${pendingInvites.length} pending staff invite(s)`,
        message: `Staff invite code(s) waiting to be activated by your team.`,
        time: 'Staff Management',
        timestamp: Date.now() + 5000,
        read: Boolean(dismissedMap[inviteAlertId]),
        type: 'staff',
        icon: '👥',
        typeClass: 'notif-type-staff',
        typeLabel: 'Staff & Team',
        actionText: 'Manage Staff →',
        actionPage: 'employees'
      });
    }
  }

  window._currentDynamicAlertIds = allNotifs.filter(x => !x.isStored).map(x => x.id);

  allNotifs.sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return b.timestamp - a.timestamp;
  });

  const unreadCount = allNotifs.filter(n => !n.read).length;

  if (countBadge) countBadge.textContent = unreadCount;
  if (modalBadge) modalBadge.textContent = `${unreadCount} unread`;

  const markBtn = $('#markAllReadBtn');
  if (markBtn) {
    markBtn.disabled = unreadCount === 0;
    markBtn.style.opacity = unreadCount === 0 ? '0.6' : '1';
  }

  if (!listEl) return;

  if (allNotifs.length === 0) {
    listEl.innerHTML = `
      <div class="notif-empty-state">
        <div class="notif-empty-icon">🔔</div>
        <h4>All caught up!</h4>
        <p>No new notifications, cashier alerts, or business reminders right now.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = allNotifs.map(n => `
    <div class="notif-card ${n.read ? 'read' : 'unread'}" data-notif-id="${n.id}">
      <div class="notif-badge-col">
        <span class="notif-type-icon ${n.typeClass}">${n.icon}</span>
      </div>
      <div class="notif-content-col">
        <div class="notif-top-row">
          <span class="notif-type-tag ${n.typeClass}">${n.typeLabel}</span>
          <span class="notif-time">${esc(n.time)}</span>
        </div>
        <div class="notif-title">${esc(n.title)}</div>
        <div class="notif-message">${esc(n.message)}</div>
        ${n.actionText ? `
          <div class="notif-actions">
            <button type="button" class="notif-action-link" onclick="$('#notificationsModal')?.close();showPage('${n.actionPage}')">
              ${n.actionText}
            </button>
          </div>
        ` : ''}
      </div>
      ${!n.read ? '<span class="notif-unread-dot" title="Unread notification"></span>' : ''}
    </div>
  `).join('');
}

window.markAllNotificationsRead = async function() {
  dismissAllAlerts(window._currentDynamicAlertIds || []);
  if (shop?.id && sb) {
    try {
      await sb.from('shop_notifications').update({ read_at: new Date().toISOString() }).eq('shop_id', shop.id).is('read_at', null);
    } catch (_e) {}
  }
  (shopNotifications || []).forEach(n => {
    if (!n.read_at) n.read_at = new Date().toISOString();
  });
  renderNotifications();
};

window.renderNotifications = renderNotifications;

$('#notificationsBtn')?.addEventListener('click', async () => {
  await loadNotifications();
  $('#notificationsModal')?.showModal();
});
setTimeout(() => loadNotifications().catch(() => {}), 3000);

// Backup / export controls.
function downloadText(name,text,type='text/plain'){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function rowsToCsv(rows){if(!rows.length)return '';const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';return [keys.map(q).join(','),...rows.map(r=>keys.map(k=>q(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])).join(','))].join('\n');}
$('#exportCsvBtn')?.addEventListener('click',()=>{const blocks=[['products',products],['sales',sales],['customers',customers],['supplier_purchases',supplierPurchases],['supplier_payments',supplierPayments],['expenses',expenses]];blocks.forEach(([n,r])=>downloadText(`kivu-solutions-${n}-${day(new Date())}.csv`,rowsToCsv(r),'text/csv'));});
$('#exportBackupBtn')?.addEventListener('click',()=>downloadText(`kivu-solutions-backup-${day(new Date())}.json`,JSON.stringify({version:DUKA_APP_VERSION,exported_at:new Date().toISOString(),shop,products,sales,customers,credits,suppliers,supplierPurchases,supplierPayments,expenses,employees,shifts},null,2),'application/json'));

// Language shell (major navigation + common controls). Detailed transaction data remains unchanged.
const I18N={en:{dashboard:'Overview',sales:'Sales',hospitality:'Tables & Orders',inventory:'Inventory',suppliers:'Suppliers',expenses:'Expenses',customers:'Customers',employees:'Employees',shifts:'Shifts',controls:'Controls',reports:'Reports',subscription:'Subscription',settings:'Settings',dukaadmin:'Platinum Tech Admin',work:'WORK',operations:'OPERATIONS',manage:'MANAGE',logout:'Logout',plan:'Plan',account:'Account'},rw:{dashboard:'Incamake',sales:'Ibyagurishijwe',hospitality:"Ameza n'Ibicuruzwa",inventory:'Ububiko',suppliers:'Abatanga ibicuruzwa',expenses:'Amafaranga yasohotse',customers:'Abakiriya',employees:'Abakozi',shifts:'Amashifuti',controls:'Igenzura',reports:'Raporo',subscription:'Ifatabuguzi',settings:'Igenamiterere',dukaadmin:'Ubuyobozi bwa Platinum Tech',work:'AKAZI',operations:'IBIKORWA',manage:'UBUYOBOZI',logout:'Sohoka',plan:'Ifatabuguzi',account:'Konti'},fr:{dashboard:'Aperçu',sales:'Ventes',hospitality:'Tables & Commandes',inventory:'Stock',suppliers:'Fournisseurs',expenses:'Dépenses',customers:'Clients',employees:'Employés',shifts:'Services',controls:'Contrôles',reports:'Rapports',subscription:'Abonnement',settings:'Paramètres',dukaadmin:'Admin Platinum Tech',work:'TRAVAIL',operations:'OPÉRATIONS',manage:'GESTION',logout:'Déconnexion',plan:'Forfait',account:'Compte'}};
function applyLanguage(lang){lang=['en','rw','fr'].includes(lang)?lang:'en';localStorage.setItem('duka_lang',lang);$('#languageSelect').value=lang;$$('.nav[data-page]').forEach(b=>{const page=b.dataset.page;const lock=b.querySelector('.nav-lock');const txt=I18N[lang][page]||page;const lbl=b.querySelector('.nav-label');if(lbl){lbl.textContent=txt;}else if(b.childNodes[0]&&b.childNodes[0].nodeType===Node.TEXT_NODE){b.childNodes[0].nodeValue=txt+(lock?' ':'');}});$$('[data-i18n]').forEach(el=>{const k=el.dataset.i18n;if(I18N[lang]&&I18N[lang][k])el.textContent=I18N[lang][k];});}
$('#languageSelect')?.addEventListener('change',e=>applyLanguage(e.target.value));setTimeout(()=>applyLanguage(shop?.preferred_language||localStorage.getItem('duka_lang')||'en'),2200);

// Enhance settings with location + language without disturbing existing V4.0 settings save.
function renderSettingsV41(){if(profile?.role!=='owner'||!shop)return;$('#settingsProvince').value=shop.province||'';$('#settingsDistrict').value=shop.district||'';$('#settingsSector').value=shop.sector||'';$('#settingsCell').value=shop.cell||'';$('#settingsLanguage').value=shop.preferred_language||'en';}
const oldRenderSettings=renderSettings;
renderSettings=function(){oldRenderSettings();renderSettingsV41();};
$('#settingsForm')?.addEventListener('submit',async()=>{if(profile?.role!=='owner')return;setTimeout(async()=>{const {error}=await sb.rpc('update_shop_profile_v41',{p_name:$('#settingsBusinessName').value,p_province:$('#settingsProvince').value||null,p_district:$('#settingsDistrict').value||null,p_sector:$('#settingsSector').value||null,p_cell:$('#settingsCell').value||null,p_language:$('#settingsLanguage').value});if(!error){Object.assign(shop,{province:$('#settingsProvince').value||null,district:$('#settingsDistrict').value||null,sector:$('#settingsSector').value||null,cell:$('#settingsCell').value||null,preferred_language:$('#settingsLanguage').value});applyLanguage(shop.preferred_language);}},250);});

// Make the mode switch visible whenever the account is a platform admin.
const oldApplyPermissions=applyPermissions;
applyPermissions=function(){oldApplyPermissions();$('#modeSwitchBtn')?.classList.toggle('hidden',!isDukaAdmin);};

// Onboarding guidance is integrated into the notification center.

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
  if(rows?.[0]?.device_key===getDeviceKey())return kivuNotify('You cannot revoke the device you are currently using. Use another owner device if you need to force this device out later.');
  const reason=(await kivuPrompt('Reason for revoking this device:',{title:'Revoke Device',defaultValue:'Lost device / staff left'}))||'';if(!reason)return;
  const {error}=await sb.rpc('revoke_app_device',{p_device_id:id,p_reason:reason});if(error)return kivuNotify(error.message,'error');await renderOwnerDevices();
};
window.restoreOwnerDevice=async function(id){
  if(!(await kivuConfirm('Re-authorize this device? It will be allowed to use Kivu Solutions again.')))return;
  const {error}=await sb.rpc('restore_app_device',{p_device_id:id});if(error)return kivuNotify(error.message,'error');await renderOwnerDevices();
};
const oldRenderSettingsV41=renderSettingsV41;
renderSettingsV41=function(){oldRenderSettingsV41();renderOwnerDevices().catch(()=>{});};

$('#featureFlagBtn')?.addEventListener('click',async()=>{if(!selectedSupportShopId)return;const key=await kivuPrompt('Feature key to enable/disable (example: new_reports):',{title:'Feature Key'});if(!key)return;const enabled=await kivuConfirm('Enable this feature? OK = enable, Cancel = disable',{title:'Feature Flag',confirmText:'Enable',cancelText:'Disable'});const note=(await kivuPrompt('Reason / note:',{title:'Feature Note',defaultValue:'Pilot feature'}))||'';const {error}=await sb.rpc('duka_set_feature_flag',{p_shop_id:selectedSupportShopId,p_key:key,p_enabled:enabled,p_note:note});if(error)return kivuNotify(error.message,'error');kivuNotify(`Feature ${key} ${enabled?'enabled':'disabled'} for this shop.`);});
$('#generateExpiryAlertsBtn')?.addEventListener('click',async()=>{const {data,error}=await sb.rpc('generate_subscription_notifications');if(error)return kivuNotify(error.message,'error');kivuNotify(`${data||0} subscription expiry notification(s) generated.`);});

// Live notification conditions are handled directly inside renderNotifications().


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
  if($('#hospitalityTitle')) $('#hospitalityTitle').textContent=shop.business_type==='bar'?'Bar tabs & service':shop.business_type==='restaurant'?'Restaurant tables & service':'Tables, bar tabs & service';
  if($('#openTabsCount')) $('#openTabsCount').textContent=open.length;
  if($('#openTabsValue')) $('#openTabsValue').textContent=money(open.reduce((n,t)=>n+hTabTotal(t.id),0));
  if($('#occupiedTablesCount')) $('#occupiedTablesCount').textContent=new Set(open.map(t=>t.table_id).filter(Boolean)).size;
  if($('#closedTabsToday')) $('#closedTabsToday').textContent=hospitalityTabs.filter(t=>t.status==='closed'&&t.closed_at&&day(t.closed_at)===today).length;
  $('#hospitalityTablesGrid').innerHTML=hospitalityTables.length?hospitalityTables.filter(t=>t.active!==false).map(t=>{const tab=open.find(x=>x.table_id===t.id);return `<button class="hospitality-table-card ${tab?'occupied':''}" ${tab?`onclick="openHospitalityOrder('${tab.id}')"`:`onclick="quickOpenHospitalityTable('${t.id}')"`}><b>${esc(t.name)}</b><span>${tab?'OPEN · '+money(hTabTotal(tab.id)):'Available'}</span><small>${t.seats?`${t.seats} seats`:''}</small></button>`}).join(''):'<div class="empty-state">No tables yet. Add tables, or use open bills without a table for bar-counter customers and takeaway.</div>';
  $('#hospitalityTabsList').innerHTML=open.length?open.map(t=>`<div class="item"><div><b>${esc(hTableName(t.table_id)||t.label||t.customer_name||'Open bill')}</b><small>${esc(t.waiter_name||'Staff')} · ${fmt(t.opened_at)} · ${hTabItems(t.id).length} item(s)</small></div><div><b>${money(hTabTotal(t.id))}</b> <button class="btn primary" onclick="openHospitalityOrder('${t.id}')">Open</button></div></div>`).join(''):'No open bills.';
  const tickets=hospitalityItems.filter(i=>i.sent_at&&!i.served_at&&hospitalityTabs.some(t=>t.id===i.tab_id&&t.status==='open'));
  $('#hospitalityTicketsList').innerHTML=tickets.length?tickets.map(i=>{const t=hospitalityTabs.find(x=>x.id===i.tab_id);return `<div class="item ticket"><div><b>${esc(i.product_name)} × ${i.qty}</b><small>${esc(hTableName(t?.table_id)||t?.label||'Tab')} · ${esc(i.note||'No special note')} · ${fmt(i.sent_at)}</small></div><div><button class="btn ghost" onclick="printKitchenTicket('${i.id}')">Print</button> ${can('owner','manager','cashier','kitchen')?`<button class="btn secondary" onclick="markHospitalityServed('${i.id}')">Mark served</button>`:''}</div></div>`}).join(''):'No pending kitchen/bar tickets.';
  const closed=hospitalityTabs.filter(t=>t.status==='closed').slice(0,100);
  $('#hospitalityClosedBody').innerHTML=closed.length?closed.map(t=>`<tr><td>${fmt(t.closed_at)}</td><td>${esc(hTableName(t.table_id)||t.label||t.customer_name||'Bill')}</td><td>${esc(t.waiter_name||'')}</td><td>${money(t.total)}</td><td>${esc(t.receipt_no||'')}</td></tr>`).join(''):'<tr><td colspan="5">No closed hospitality bills yet.</td></tr>';
}

$('#newTableBtn')?.addEventListener('click',()=>$('#hospitalityTableModal')?.showModal());
$('#newTabBtn')?.addEventListener('click',()=>{fillHospitalitySelects();$('#hospitalityTabModal')?.showModal();});
$('#wastageBtn')?.addEventListener('click',()=>{if(!can('owner','manager'))return kivuNotify('Owner or manager approval is required.');fillHospitalitySelects();$('#hospitalityWastageModal')?.showModal();});
$('#recipeBtn')?.addEventListener('click',()=>{if(!can('owner','manager'))return kivuNotify('Only an owner or manager can configure recipes.');fillHospitalitySelects();loadRecipeRows();$('#hospitalityRecipeModal')?.showModal();});

$('#hospitalityTableForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await sb.rpc('hospitality_save_table',{p_table_id:null,p_name:String(f.get('name')).trim(),p_seats:Number(f.get('seats')||0)||null,p_active:true});if(error)return kivuNotify(error.message,'error');e.target.reset();$('#hospitalityTableModal').close();await refresh();});
$('#hospitalityTabForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {data,error}=await sb.rpc('hospitality_open_tab',{p_table_id:f.get('tableId')||null,p_label:f.get('label')||null,p_customer_name:f.get('customerName')||null});if(error)return kivuNotify(error.message,'error');e.target.reset();$('#hospitalityTabModal').close();await refresh();openHospitalityOrder(data);});
window.quickOpenHospitalityTable=async id=>{const {data,error}=await sb.rpc('hospitality_open_tab',{p_table_id:id,p_label:null,p_customer_name:null});if(error)return kivuNotify(error.message,'error');await refresh();openHospitalityOrder(data);};
window.openHospitalityOrder=id=>{const t=hospitalityTabs.find(x=>x.id===id);if(!t)return;const f=$('#hospitalityOrderForm');f.elements.tabId.value=id;if($('#hospitalityOrderHeading')) $('#hospitalityOrderHeading').textContent=hTableName(t.table_id)||t.label||t.customer_name||'Open bill';renderHospitalityOrder(id);fillHospitalitySelects();$('#hospitalityOrderModal')?.showModal();};
function renderHospitalityOrder(id){const items=hTabItems(id);$('#hospitalityOrderItems').innerHTML=items.length?items.map(i=>`<div class="hospitality-line"><div><b>${esc(i.product_name)}</b><small>${i.qty} × ${money(i.unit_price)}${i.note?' · '+esc(i.note):''}${i.complimentary?' · COMPLIMENTARY':''}</small></div><div><b>${i.complimentary?'0 RWF':money(i.qty*i.unit_price)}</b><small>${i.served_at?'Served':i.sent_at?'Sent':'Not sent'}</small></div></div>`).join(''):'<div class="notice mini">No items on this bill yet.</div>';$('#hospitalityOrderItems').insertAdjacentHTML('beforeend',`<div class="sale-cart-total grand"><span>Bill total</span><strong>${money(hTabTotal(id))}</strong></div>`);}
$('#addHospitalityItemBtn')?.addEventListener('click',async()=>{const f=$('#hospitalityOrderForm'),id=f.elements.tabId.value,pid=f.elements.productId.value,qty=Number(f.elements.qty.value);const {error}=await sb.rpc('hospitality_add_item',{p_tab_id:id,p_product_id:pid,p_qty:qty,p_note:f.elements.note.value||null,p_complimentary:!!f.elements.complimentary.checked});if(error)return kivuNotify(error.message,'error');f.elements.note.value='';f.elements.complimentary.checked=false;await refresh();renderHospitalityOrder(id);});
$('#sendHospitalityOrderBtn')?.addEventListener('click',async()=>{const id=$('#hospitalityOrderForm').elements.tabId.value;const {error}=await sb.rpc('hospitality_send_tab',{p_tab_id:id});if(error)return kivuNotify(error.message,'error');await refresh();renderHospitalityOrder(id);});
window.markHospitalityServed=async id=>{const {error}=await sb.rpc('hospitality_mark_served',{p_item_id:id});if(error)return kivuNotify(error.message,'error');await refresh();};
window.printKitchenTicket=id=>{const i=hospitalityItems.find(x=>x.id===id),t=i&&hospitalityTabs.find(x=>x.id===i.tab_id);if(!i)return;const w=window.open('','_blank','width=360,height=520');if(!w)return kivuNotify('Allow pop-ups to print kitchen/bar tickets.');w.document.write(`<!doctype html><meta charset="utf-8"><title>Order ticket</title><style>body{font:16px/1.35 monospace;padding:14px;width:72mm}h2{margin:0 0 8px;border-bottom:1px dashed #000;padding-bottom:8px}b{font-size:22px}.line{border-top:1px dashed #000;margin:10px 0}</style><h2>${esc(shop.name)} — ORDER</h2><div>${esc(hTableName(t?.table_id)||t?.label||'Counter / Takeaway')}</div><div class="line"></div><b>${esc(i.product_name)} × ${esc(i.qty)}</b><p>${esc(i.note||'No special note')}</p><div class="line"></div><small>${fmt(i.sent_at||i.created_at)} · ${esc(t?.waiter_name||i.created_by_name||'Staff')}</small>`);w.document.close();w.focus();setTimeout(()=>w.print(),150);};

function addHospitalityPaymentRow(method='Cash',amount=''){const box=$('#hospitalityPaymentRows');const d=document.createElement('div');d.className='form-grid hospitality-payment-row';d.innerHTML=`<label>Method<select name="payMethod"><option ${method==='Cash'?'selected':''}>Cash</option><option>Mobile Money</option><option>Bank</option><option>Credit</option><option>Other</option></select></label><label>Amount<input name="payAmount" type="text" inputmode="decimal" class="money-input" value="${formatMoneyString(amount)}" required></label>`;box.appendChild(d);initMoneyInputs(d);}
$('#addHospitalityPaymentBtn')?.addEventListener('click',()=>addHospitalityPaymentRow('Mobile Money',''));
$('#settleHospitalityBtn')?.addEventListener('click',()=>{const id=$('#hospitalityOrderForm').elements.tabId.value,total=hTabTotal(id);$('#hospitalityPaymentForm').elements.tabId.value=id;$('#hospitalityPaymentSummary').innerHTML=`Amount due: <b>${money(total)}</b><br>Use one payment or add rows to split the amount across Cash / MoMo / Bank.`;$('#hospitalityPaymentRows').innerHTML='';addHospitalityPaymentRow('Cash',total);$('#hospitalityPaymentModal')?.showModal();});
$('#hospitalityPaymentForm')?.addEventListener('submit',async e=>{e.preventDefault();const id=e.target.elements.tabId.value;const rows=[...e.target.querySelectorAll('.hospitality-payment-row')],payments=rows.map(r=>({method:r.querySelector('[name=payMethod]').value,amount:parseMoney(r.querySelector('[name=payAmount]').value)})).filter(x=>x.amount>0);const {data,error}=await sb.rpc('hospitality_close_tab',{p_tab_id:id,p_payments:payments});if(error)return kivuNotify(error.message,'error');$('#hospitalityPaymentModal').close();$('#hospitalityOrderModal').close();kivuNotify(`Bill closed. Receipt: ${data}`);await refresh();});
$('#hospitalityWastageForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await sb.rpc('hospitality_record_wastage',{p_product_id:f.get('productId'),p_qty:Number(f.get('qty')),p_reason:f.get('reason')});if(error)return kivuNotify(error.message,'error');e.target.reset();$('#hospitalityWastageModal').close();await refresh();});

function recipeRow(ingredient='',qty=''){const d=document.createElement('div');d.className='form-grid recipe-row';d.innerHTML=`<label>Ingredient / stock item<select name="ingredientId">${products.map(p=>`<option value="${p.id}" ${p.id===ingredient?'selected':''}>${esc(p.name)} (${esc(baseUnitLabel(p))})</option>`).join('')}</select></label><label>Qty consumed per menu item<input name="ingredientQty" type="number" min="0.001" step="0.001" value="${qty}" required></label>`;return d;}
function loadRecipeRows(){const f=$('#hospitalityRecipeForm');if(!f)return;const pid=f.elements.menuProductId.value,box=$('#hospitalityRecipeRows');box.innerHTML='';const rs=hospitalityRecipes.filter(r=>r.menu_product_id===pid);(rs.length?rs:[{}]).forEach(r=>box.appendChild(recipeRow(r.ingredient_product_id||'',r.qty_per_unit||'')));}
$('#hospitalityRecipeForm select[name="menuProductId"]')?.addEventListener('change',loadRecipeRows);
$('#addRecipeRowBtn')?.addEventListener('click',()=>$('#hospitalityRecipeRows')?.appendChild(recipeRow()));
$('#hospitalityRecipeForm')?.addEventListener('submit',async e=>{e.preventDefault();const pid=e.target.elements.menuProductId.value,rows=[...e.target.querySelectorAll('.recipe-row')];const payload=rows.map(r=>({ingredient_product_id:r.querySelector('[name=ingredientId]').value,qty_per_unit:Number(r.querySelector('[name=ingredientQty]').value)})).filter(x=>x.qty_per_unit>0);const saved=await sb.rpc('hospitality_replace_recipe',{p_menu_product_id:pid,p_components:payload});if(saved.error)return kivuNotify(saved.error.message);$('#hospitalityRecipeModal').close();await refresh();kivuNotify('Recipe saved. Ingredient stock will be consumed when the bill is settled.');});


/* ============================================================
   KIVU SOLUTIONS V4.8 — LAUNCH EXPERIENCE
   Offline queue, barcode checkout, role-specific hospitality, imports.
   ============================================================ */
let offlineSnapshotMode=false;
function getAuthUserIdSync(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&/^sb-.*-auth-token$/.test(k)){
        const raw=localStorage.getItem(k);
        if(!raw)continue;
        const parsed=JSON.parse(raw);
        const uid=parsed?.user?.id||parsed?.currentSession?.user?.id;
        if(uid)return uid;
      }
    }
  }catch(_e){}
  return null;
}

function saveOfflineSnapshot(){
  if(!window.KivuOffline||!session?.user?.id||!shop)return;
  const isOwnerOrManager=['owner','manager'].includes(profile?.role);
  window.KivuOffline.saveSnapshot(session.user.id,{
    profile,shop,shopFeatureFlags,products,sales,
    expenses:isOwnerOrManager?expenses:[],
    stockPurchases,
    customers,credits,
    employees:isOwnerOrManager?employees:[],
    shifts,suppliers,supplierPurchases,
    supplierPayments:isOwnerOrManager?supplierPayments:[],
    currentShift,
    hospitalityTables:typeof hospitalityTables!=='undefined'?hospitalityTables:[],
    hospitalityTabs:typeof hospitalityTabs!=='undefined'?hospitalityTabs:[],
    hospitalityItems:typeof hospitalityItems!=='undefined'?hospitalityItems:[],
    hospitalityPayments:typeof hospitalityPayments!=='undefined'?hospitalityPayments:[],
    hospitalityRecipes:typeof hospitalityRecipes!=='undefined'?hospitalityRecipes:[],
    hospitalityWastage:typeof hospitalityWastage!=='undefined'?hospitalityWastage:[],
    shopNotifications:typeof shopNotifications!=='undefined'?shopNotifications:[],
    audits:isOwnerOrManager&&typeof audits!=='undefined'?audits:[],
    staffInvites:isOwnerOrManager&&typeof staffInvites!=='undefined'?staffInvites:[],
    approvalRequests:isOwnerOrManager&&typeof approvalRequests!=='undefined'?approvalRequests:[],
    stockAdjustments:isOwnerOrManager&&typeof stockAdjustments!=='undefined'?stockAdjustments:[],
    saved_at:new Date().toISOString()
  });
}

function restoreOfflineSnapshot(explicitUserId){
  const uid=explicitUserId||session?.user?.id||getAuthUserIdSync();
  if(!uid)return false;
  const snap=window.KivuOffline?.loadSnapshot?.(uid);
  if(!snap||!snap.profile||!snap.shop)return false;
  profile=snap.profile;
  shop=snap.shop;
  shopFeatureFlags=snap.shopFeatureFlags||{};
  products=Array.isArray(snap.products)?snap.products:[];
  sales=Array.isArray(snap.sales)?snap.sales:[];
  expenses=Array.isArray(snap.expenses)?snap.expenses:[];
  stockPurchases=Array.isArray(snap.stockPurchases)?snap.stockPurchases:[];
  customers=Array.isArray(snap.customers)?snap.customers:[];
  credits=Array.isArray(snap.credits)?snap.credits:[];
  employees=Array.isArray(snap.employees)?snap.employees:[];
  shifts=Array.isArray(snap.shifts)?snap.shifts:[];
  suppliers=Array.isArray(snap.suppliers)?snap.suppliers:[];
  supplierPurchases=Array.isArray(snap.supplierPurchases)?snap.supplierPurchases:[];
  supplierPayments=Array.isArray(snap.supplierPayments)?snap.supplierPayments:[];
  currentShift=snap.currentShift||null;
  if(Array.isArray(snap.hospitalityTables))hospitalityTables=snap.hospitalityTables;
  if(Array.isArray(snap.hospitalityTabs))hospitalityTabs=snap.hospitalityTabs;
  if(Array.isArray(snap.hospitalityItems))hospitalityItems=snap.hospitalityItems;
  if(Array.isArray(snap.hospitalityPayments))hospitalityPayments=snap.hospitalityPayments;
  if(Array.isArray(snap.hospitalityRecipes))hospitalityRecipes=snap.hospitalityRecipes;
  if(Array.isArray(snap.hospitalityWastage))hospitalityWastage=snap.hospitalityWastage;
  if(Array.isArray(snap.shopNotifications))shopNotifications=snap.shopNotifications;
  if(Array.isArray(snap.audits))audits=snap.audits;
  if(Array.isArray(snap.staffInvites))staffInvites=snap.staffInvites;
  if(Array.isArray(snap.approvalRequests))approvalRequests=snap.approvalRequests;
  if(Array.isArray(snap.stockAdjustments))stockAdjustments=snap.stockAdjustments;
  offlineSnapshotMode=true;
  return true;
}

function hydrateFromCache(){
  const uid=getAuthUserIdSync();
  if(!uid){
    window.KivuOffline?.clearSnapshot?.();
    return false;
  }
  if(!restoreOfflineSnapshot(uid)){
    window.KivuOffline?.clearSnapshot?.();
    return false;
  }
  document.documentElement.classList.add('has-cached-session');
  $('#authScreen')?.classList.add('hidden');
  $('#appShell')?.classList.remove('hidden');
  try{
    applyPermissions();
    render();
  }catch(_e){}
  return true;
}

function applyOfflineStockDraft(items){
  for(const item of items){const p=products.find(x=>x.id===item.product_id);if(!p)continue;const ratio=item.unit_mode==='bulk'?unitsPerBulk(p):1;p.qty=Math.max(0,Number(p.qty||0)-Number(item.entered_qty||0)*ratio);}
  renderInventory();
}

let enterInFlight=null;
const _enterV48=enter;
enter=function(){
  if(enterInFlight)return enterInFlight;
  enterInFlight=(async()=>{
    const hasCache=hydrateFromCache();
    if(!hasCache&&(!profile||!shop)){
      showAppInitLoader('Preparing your workspace...');
    }
    if(!navigator.onLine&&hasCache){
      await updateConnectivityUI();
      return;
    }
    try{
      offlineSnapshotMode=false;
      await _enterV48();
      if(session&&shop){
        saveOfflineSnapshot();
        await updateConnectivityUI();
        syncOfflineSales().catch(console.warn);
      }
    }catch(err){
      console.error('Enter background refresh error:',err);
      if(!hasCache){
        kivuNotify(err.message||'Could not load Kivu Solutions.');
        await sb.auth.signOut();
      }
    }finally{
      hideAppInitLoader();
      $('#authScreen')?.classList.add('hidden');
      $('#appShell')?.classList.remove('hidden');
      enterInFlight=null;
    }
  })();
  return enterInFlight;
};

const _refreshV48=refresh;
refresh=async function(){
  if(!navigator.onLine){
    saveOfflineSnapshot();
    render();
    return;
  }
  await _refreshV48();
  saveOfflineSnapshot();
  await updateConnectivityUI();
};

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
      let {error}=await sb.rpc('record_sale_cart_v48',{
        p_items:row.items,p_payment:row.payment,p_discount:row.discount||0,
        p_customer_id:row.customer_id||null,p_customer_name:row.customer_name||null,
        p_client_ref:row.client_ref
      });
      if(error&&String(row.payment||'').toLowerCase().includes('split')&&(error.message?.includes('violates check constraint')||error.message?.includes('payment'))){
        const splitMeta=getSplitPaymentDetails(row.client_ref);
        const fallback=(splitMeta&&splitMeta.cash>=splitMeta.momo)?'Cash':'Mobile Money';
        const retry=await sb.rpc('record_sale_cart_v48',{
          p_items:row.items,p_payment:fallback,p_discount:row.discount||0,
          p_customer_id:row.customer_id||null,p_customer_name:row.customer_name||null,
          p_client_ref:row.client_ref
        });
        if(!retry.error) error=null;
      }
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
$('#offlineQueueBtn')?.addEventListener('click',async()=>{const rows=await window.KivuOffline.listSales(shop.id);const errors=rows.filter(x=>x.status==='needs_attention');kivuNotify(rows.length?`${rows.length} offline sale(s) waiting. ${errors.length?errors.length+' need attention because server validation failed. Reconnect and retry after correcting stock/customer data.':'They will sync automatically when online.'}`:'No offline sales waiting.');if(navigator.onLine)syncOfflineSales().catch(console.warn);});
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js?v=5.3.1',{updateViaCache:'none'}).then(reg=>{reg.update().catch(()=>{});reg.addEventListener('updatefound',()=>{const newWorker=reg.installing;if(!newWorker)return;newWorker.addEventListener('statechange',()=>{if(newWorker.state==='installed'&&navigator.serviceWorker.controller){newWorker.postMessage({type:'SKIP_WAITING'});}});});}).catch(e=>console.warn('Service worker:',e.message));let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshing)return;refreshing=true;window.location.reload();});});}

function findProductByBarcode(code){const clean=String(code||'').trim();return products.find(x=>String(x.barcode||'').trim()===clean);}
function chooseProductFromBarcode(code,{autoAdd=false,formSelector='#saleForm'}={}){const p=findProductByBarcode(code);if(!p){kivuNotify('No product matches that barcode. Register the barcode in Inventory first.');return null;}const f=$(formSelector);if(f?.elements?.productId){f.elements.productId.value=p.id;if(formSelector==='#saleForm')refreshSaleUnitOptions();if(f.elements.qty)f.elements.qty.value='1';}if(autoAdd)$('#addSaleItemBtn')?.click();return p;}
$('#saleBarcodeInput')?.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();const code=e.currentTarget.value.trim();if(!code)return;chooseProductFromBarcode(code,{autoAdd:true});e.currentTarget.value='';});
$('#scanSaleBarcodeBtn')?.addEventListener('click',async()=>{const code=await window.KivuCameraScanner?.open('Scan product for sale');if(!code)return;const p=findProductByBarcode(code);if(!p)return kivuNotify('No product matches that barcode. Register the barcode in Inventory first.');quickAddProductToCart(p.id);});
$('#scanProductBarcodeBtn')?.addEventListener('click',async()=>{const code=await window.KivuCameraScanner?.open('Scan barcode for new product');if(code){const input=$('#productBarcodeInput');if(input)input.value=code;}});
$('#scanEditProductBarcodeBtn')?.addEventListener('click',async()=>{const code=await window.KivuCameraScanner?.open('Scan product barcode');if(code){const input=$('#editProductBarcodeInput');if(input)input.value=code;}});
$('#scanStockProductBtn')?.addEventListener('click',async()=>{const code=await window.KivuCameraScanner?.open('Scan product to add stock');if(!code)return;const p=findProductByBarcode(code);if(!p)return kivuNotify('No product matches that barcode. Register the barcode in Inventory first.');const f=$('#stockForm');f.elements.productId.value=p.id;f.elements.qty.focus();});

function parseCsv(text){const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'){if(q&&n==='"'){cell+='"';i++;}else q=!q;}else if(c===','&&!q){row.push(cell);cell='';}else if((c==='\n'||c==='\\r')&&!q){if(c==='\\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);row=[];cell='';}else cell+=c;}row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);if(rows.length<2)return[];const h=rows[0].map(x=>x.trim().toLowerCase());return rows.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,(r[i]||'').trim()])));}
$('#importDataBtn')?.addEventListener('click',()=>{if(!can('owner','manager'))return;$('#importDataModal')?.showModal();});
$('#importDataForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!can('owner','manager'))return kivuNotify('Only owner or manager can import data.');const f=new FormData(e.target),file=f.get('file'),type=f.get('type');if(!file?.text)return kivuNotify('Choose a CSV file.');const rows=parseCsv(await file.text());if(!rows.length)return kivuNotify('No data rows found.');if(rows.length>2000)return kivuNotify('Import at most 2,000 rows at a time.');let payload;if(type==='products'){payload=rows.map(r=>({shop_id:shop.id,name:r.name,qty:Number(r.qty||0),cost:Number(r.cost||0),price:Number(r.price||0),low_stock:Number(r.low_stock||r.low||0),barcode:r.barcode||null,base_unit:r.base_unit||'Piece',bulk_unit:r.bulk_unit||'Carton',units_per_bulk:Number(r.units_per_bulk||1)})).filter(x=>x.name);}else{payload=rows.map(r=>({shop_id:shop.id,name:r.name,phone:r.phone||null,email:r.email||null})).filter(x=>x.name);}if(!payload.length)return kivuNotify('No valid rows found.');const table=type==='products'?'products':'customers';const {error}=await sb.from(table).insert(payload);if(error)return kivuNotify(`Import stopped: ${error.message}`,'error');await audit('imported csv',table,{rows:payload.length});e.target.reset();$('#importDataModal').close();await refresh();kivuNotify(`${payload.length} ${type} imported.`);});

$('#accountantExportBtn')?.addEventListener('click',()=>{if(!can('owner','manager'))return;const rate=Number(shop.tax_rate||0);const rows=sales.map(x=>{const net=Number(x.total||0),tax=rate>0?Math.round(net*rate/(100+rate)):0;return{date:x.created_at,receipt:x.receipt_no,payment:x.payment,customer:x.customer,product:x.product_name,quantity:x.entered_qty||x.qty,unit:x.sold_unit||'',net_sales:net,discount:Number(x.discount||0),cost:Number(x.cost||0),gross_profit:net-Number(x.cost||0),tax_rate:rate,tax_included:tax,employee:x.employee_name};});downloadText(`kivu-accountant-sales-${day(new Date())}.csv`,rowsToCsv(rows),'text/csv');});

const _renderHospitalityV48=renderHospitality;
renderHospitality=function(){
  _renderHospitalityV48();if(!hospitalityEnabled())return;const role=profile?.role;
  $('#newTableBtn')?.classList.toggle('hidden',!can('owner','manager'));$('#recipeBtn')?.classList.toggle('hidden',!can('owner','manager'));$('#wastageBtn')?.classList.toggle('hidden',!can('owner','manager'));$('#newTabBtn')?.classList.toggle('hidden',!can('owner','manager','cashier','waiter'));
  $('#complimentaryWrap')?.classList.toggle('hidden',!can('owner','manager'));$('#requestComplimentaryBtn')?.classList.toggle('hidden',!can('cashier','waiter'));$('#settleHospitalityBtn')?.classList.toggle('hidden',!can('owner','manager','cashier'));$('#addHospitalityItemBtn')?.classList.toggle('hidden',!can('owner','manager','cashier','waiter'));$('#sendHospitalityOrderBtn')?.classList.toggle('hidden',!can('owner','manager','cashier','waiter'));
  $('#hospitalityManagementHead')?.classList.toggle('hidden',role==='kitchen');$('#hospitalityStats')?.classList.toggle('hidden',['waiter','kitchen'].includes(role));$('#hospitalityFloorSection')?.classList.toggle('hidden',role==='kitchen');$('#hospitalityClosedSection')?.classList.toggle('hidden',['waiter','kitchen'].includes(role));
  const panel=$('#hospitalityApprovalsPanel'),list=$('#hospitalityApprovalsList');if(panel&&list&&can('owner','manager')){const pending=approvalRequests.filter(x=>x.request_type==='hospitality_complimentary'&&x.status==='pending');panel.classList.toggle('hidden',pending.length===0);list.innerHTML=pending.map(x=>`<div class="item"><div><b>Complimentary request</b><small>${esc(x.requested_by_name||'Staff')} · ${esc(x.reason||'No reason')}</small></div><div><button class="btn primary" onclick="reviewApproval('${x.id}','approved')">Approve</button> <button class="btn danger" onclick="reviewApproval('${x.id}','rejected')">Reject</button></div></div>`).join('');}else panel?.classList.add('hidden');
};
$('#requestComplimentaryBtn')?.addEventListener('click',async()=>{if(!can('cashier','waiter'))return;const f=$('#hospitalityOrderForm'),reason=await kivuPrompt('Reason for complimentary item (required):',{title:'Complimentary Reason',required:true,defaultValue:''});if(!reason?.trim())return;const {error}=await sb.rpc('hospitality_request_complimentary',{p_tab_id:f.elements.tabId.value,p_product_id:f.elements.productId.value,p_qty:Number(f.elements.qty.value),p_note:f.elements.note.value||null,p_reason:reason.trim()});if(error)return kivuNotify(error.message,'error');f.elements.note.value='';kivuNotify('Complimentary request sent to owner/manager for approval.');await refresh();});

renderSettingsV41=function(){if(profile?.role!=='owner'||!shop)return;$('#settingsProvince').value=shop.province||'';$('#settingsDistrict').value=shop.district||'';$('#settingsSector').value=shop.sector||'';$('#settingsCell').value=shop.cell||'';$('#settingsLanguage').value=shop.preferred_language||'en';if($('#settingsTaxRate'))$('#settingsTaxRate').value=Number(shop.tax_rate||0);if($('#settingsTaxLabel'))$('#settingsTaxLabel').value=shop.tax_label||'VAT';if($('#settingsTaxNumber'))$('#settingsTaxNumber').value=shop.tax_number||'';};
setTimeout(()=>updateConnectivityUI().catch(()=>{}),1000);
window.addEventListener('keydown', e => {
  if (e.key === 'F2') {
    e.preventDefault();
    if (!session || !profile) return;
    if (!can('owner', 'manager', 'cashier')) return;
    if (!ensureSubscriptionAccess()) return;
    const modal = $('#saleModal');
    if (modal && !modal.open) {
      initSaleModal();
      modal.showModal();
    } else {
      $('#saleProductSearch')?.focus();
    }
  }
});
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initMoneyInputs());
} else {
  initMoneyInputs();
}
// Instant Pre-Hydration: populate the entire website with cached data immediately in 0ms!
hydrateFromCache();


/* SETTINGS LOCAL BACKUP & RESTORE (R14) */
$('#exportLocalDataBtn')?.addEventListener('click', () => {
  if(!shop?.id) return;
  const prefix = 'kivu_';
  const data = {
    app: 'Kivu Solutions',
    version: '5.3.0',
    exported_at: new Date().toISOString(),
    shop_id: shop.id,
    shop_name: shop.name,
    keys: {}
  };
  for(let i=0; i<localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith(prefix) && (k.includes(shop.id) || k.includes('held_carts') || k.includes('split') || k.includes('tendered'))){
      try {
        data.keys[k] = JSON.parse(localStorage.getItem(k));
      } catch(_e) {
        data.keys[k] = localStorage.getItem(k);
      }
    }
  }
  const filename = `kivu-local-backup-${shop.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${day(new Date())}.json`;
  downloadText(filename, JSON.stringify(data, null, 2), 'application/json');
  kivuNotify('Local storage backup file exported successfully.', 'success');
});

$('#importLocalDataBtn')?.addEventListener('click', () => {
  $('#importLocalDataFile')?.click();
});

$('#importLocalDataFile')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if(!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if(!data || !data.shop_id || !data.keys){
      return kivuNotify('Invalid backup file: missing shop or keys data.', 'error');
    }
    if(data.shop_id !== shop?.id){
      const match = await kivuConfirm(`This backup belongs to shop "${data.shop_name || data.shop_id}", but your active shop is "${shop.name}". Are you sure you want to restore it anyway?`, { title: 'Shop Mismatch', danger: true });
      if(!match){
        e.target.value = '';
        return;
      }
    } else {
      const confirmed = await kivuConfirm(`Restore ${Object.keys(data.keys).length} local data records from backup exported on ${data.exported_at ? fmt(data.exported_at) : 'backup'}? Existing local records will be merged.`, { title: 'Confirm Local Data Restore', confirmText: 'Restore Data' });
      if(!confirmed){
        e.target.value = '';
        return;
      }
    }
    let count = 0;
    for(const [k, v] of Object.entries(data.keys)){
      try {
        localStorage.setItem(k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
        count++;
      } catch(_e){}
    }
    e.target.value = '';
    kivuNotify(`Successfully restored ${count} local records from backup.`, 'success');
    render();
  } catch(err){
    kivuNotify(`Failed to restore backup: ${err.message}`, 'error');
  }
});

let isSettingsFormDirty = false;
$('#settingsForm')?.addEventListener('input', () => { isSettingsFormDirty = true; });
$('#settingsForm')?.addEventListener('change', () => { isSettingsFormDirty = true; });
$('#settingsForm')?.addEventListener('submit', () => { isSettingsFormDirty = false; });
window.addEventListener('beforeunload', (e) => {
  if (isSettingsFormDirty) {
    e.preventDefault();
    e.returnValue = 'You have unsaved changes in business settings. Are you sure you want to leave?';
  }
});

// Sales Filter Row Listeners
$('#salesFilterStatus')?.addEventListener('change', () => { salesCurrentPage = 1; renderSales(); });
$('#salesFilterPayment')?.addEventListener('change', () => { salesCurrentPage = 1; renderSales(); });
$('#salesDateFrom')?.addEventListener('change', () => { salesCurrentPage = 1; renderSales(); });
$('#salesDateTo')?.addEventListener('change', () => { salesCurrentPage = 1; renderSales(); });
$('#salesSortSelect')?.addEventListener('change', () => { salesCurrentPage = 1; renderSales(); });
