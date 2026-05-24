
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const cfg = {
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  appName: import.meta.env.VITE_APP_NAME || 'RideMate',
  supportPhone: import.meta.env.VITE_SUPPORT_PHONE || '03000000000',
};

const app = document.querySelector('#app');
if (!cfg.url || !cfg.key) {
  app.innerHTML = `<div class="auth"><div class="card"><div class="h1">Setup required</div><p class="muted">Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Netlify environment variables.</p></div></div>`;
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(cfg.url, cfg.key);

const ROUTE_SUGGESTIONS = [
  'Wah Cantt','Wah Barrier 2','Barrier 3','University of Wah','Nawababad','Gulshan-e-Anwar','Jinnah Colony','Wah Model Town',
  'New City Phase 1','New City Phase 2','Losar Sharfoo','Taxila','Taxila Bypass','HITEC University',
  'Golra Mor','G-13','NUST','G-11','F-11','G-10','G-9','G-8','PIMS','F-8','Blue Area','I-8','I-9','I-10','Faizabad',
  'Rawalpindi Saddar','Murree Road','Commercial Market','Shamsabad','RA Bazar'
];

const ROUTE_TEMPLATES = [
  {name:'Wah Barrier 3 → Blue Area', from:'Barrier 3 Wah Cantt', to:'Blue Area Islamabad', via:'Taxila → Golra Mor → G-9/G-8 → Blue Area'},
  {name:'New City → G-13 / NUST', from:'New City Phase 2', to:'G-13 Islamabad', via:'Taxila → Golra Mor → G-13 → NUST'},
  {name:'Wah Cantt → F-8 / PIMS', from:'Wah Cantt', to:'F-8 Islamabad', via:'GT Road → Golra → PIMS/F-8'},
  {name:'Taxila → I-8 / I-9', from:'Taxila', to:'I-8 Islamabad', via:'GT Road → IJP → I-8/I-9'},
  {name:'Wah → Rawalpindi Saddar', from:'Wah Cantt', to:'Rawalpindi Saddar', via:'Taxila → Tarnol/Chungi → Saddar'},
];

const state = {
  session:null, profile:null, privateProfile:null,
  vehicles:[], rides:[], myRides:[], myBookings:[], requests:[], history:[], reports:[], users:[], documents:[], locations:[], notifications:[],
  tab:'home', authMode:'login', authNotice:'', filters:{from:'',to:'',time:'any',rule:'safe'}, adminKycSearch:'', selectedKycUser:null,
  modal:null, loading:false
};

const $ = (s) => document.querySelector(s);
const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const money = (n) => `Rs. ${Number(n || 0).toLocaleString('en-PK')}`;
const fmt = (d) => d ? new Date(d).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';

const timeout = (ms, label='Request timeout') => new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms));
const withTimeout = (promise, ms=6000, label='Request timeout') => Promise.race([promise, timeout(ms, label)]);
function debounce(fn, wait=250){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; }
const fallbackProfile = (session) => ({
  id: session?.user?.id,
  full_name: session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'User',
  role: session?.user?.user_metadata?.role || 'passenger',
  gender: session?.user?.user_metadata?.gender || 'male',
  travel_mode: 'solo',
  status: 'active',
  verification_status: 'unverified',
  rating: 5
});
async function resetLocalApp(){
  try {
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
  } catch(e) {}
  location.href = location.origin + '/?v=reset-' + Date.now();
}
window.resetLocalApp = resetLocalApp;




function showBoot(message='Loading RideMate...'){
  app.innerHTML = `<div class="auth"><div class="authShell"><div class="authHero"><div class="bigIcon">${logo()}</div><div class="h1">RideMate</div><p>${esc(message)}</p></div><div class="card"><div class="h2">Starting app</div><p class="small muted">If this screen stays, reset local app data once.</p><div class="grid2"><button class="btn green" onclick="location.reload()">Reload</button><button class="btn ghost" onclick="resetLocalApp()">Reset app</button></div></div></div></div>`;
}

const role = () => state.profile?.role || 'passenger';
const isAdmin = () => role()==='admin';

function logo(){ return `<img src="/icons/icon.svg" alt="RideMate" />`; }
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3200); }
function safeJson(data){ try{return JSON.stringify(data)}catch{return '{}'} }

window.addEventListener('error', (event) => {
  app.innerHTML = `<div class="auth"><div class="card"><div class="h1">Something went wrong</div><p class="muted">${esc(event.message)}</p><button class="btn green" onclick="location.reload()">Reload app</button></div></div>`;
});

async function init(){
  try {
    showBoot();
    const { data, error } = await withTimeout(supabase.auth.getSession(), 3500, 'Session check timeout');
    if (error) throw error;
    state.session = data.session;

    if (!state.session) {
      renderAuth();
      return;
    }

    // Render immediately using auth metadata. Do not block UI on database reads.
    state.profile = fallbackProfile(state.session);
    state.privateProfile = { user_id: state.session.user.id, phone: state.session.user.user_metadata?.phone || '' };
    render();

    // Load actual database data in background.
    await loadMe();
    await loadData();
    subscribeRealtime();
    render();
  } catch (err) {
    console.error('RideMate boot error:', err);
    if (state.session) render();
    else renderAuth();
    setTimeout(() => toast(err.message || 'App loaded with limited data'), 300);
  }
}
supabase.auth.onAuthStateChange(async (_event, session) => {
  try {
    state.session = session;
    if (!session) {
      resetState();
      renderAuth();
      return;
    }

    state.profile = state.profile || fallbackProfile(session);
    state.privateProfile = state.privateProfile || { user_id: session.user.id, phone: session.user.user_metadata?.phone || '' };
    render();

    await loadMe();
    await loadData();
    subscribeRealtime();
    render();
  } catch (err) {
    console.error('Auth state warning:', err);
    toast(err.message || 'Some data could not load');
    if (state.session) render();
    else renderAuth();
  }
});
function resetState(){
  Object.assign(state,{profile:null,privateProfile:null,vehicles:[],rides:[],myRides:[],myBookings:[],requests:[],history:[],reports:[],users:[],documents:[],locations:[],notifications:[],tab:'home',modal:null});
}

async function loadMe(){
  if(!state.session?.user?.id) return;
  const uid = state.session.user.id;

  const [profileRes, privateRes] = await Promise.allSettled([
    withTimeout(supabase.from('profiles').select('*').eq('id',uid).maybeSingle(), 5000, 'Profile query timeout'),
    withTimeout(supabase.from('private_profiles').select('*').eq('user_id',uid).maybeSingle(), 5000, 'Private profile query timeout')
  ]);

  if (profileRes.status === 'fulfilled' && !profileRes.value.error && profileRes.value.data) {
    state.profile = profileRes.value.data;
  } else {
    console.warn('Using fallback profile', profileRes.reason || profileRes.value?.error);
    state.profile = state.profile || fallbackProfile(state.session);
  }

  if (privateRes.status === 'fulfilled' && !privateRes.value.error && privateRes.value.data) {
    state.privateProfile = privateRes.value.data;
  } else {
    state.privateProfile = state.privateProfile || { user_id: uid, phone: '' };
  }
}
async function loadData(){
  if(!state.session) return;
  const uid = state.session.user.id;
  const nowIso = new Date().toISOString();

  const run = async (query, label) => {
    try {
      const { data, error } = await withTimeout(query, 7000, `${label} timeout`);
      if (error) {
        console.warn(`${label} warning:`, error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn(`${label} failed:`, e.message);
      return [];
    }
  };

  const queries = {
    rides: run(supabase.from('rides_public').select('*').eq('status','open').gt('departure_at', nowIso).order('departure_at',{ascending:true}).limit(100), 'rides'),
    myRides: run(supabase.from('rides_public').select('*').eq('driver_id',uid).order('departure_at',{ascending:false}).limit(100), 'my rides'),
    bookings: run(supabase.from('bookings_public').select('*').or(`passenger_id.eq.${uid},driver_id.eq.${uid}`).order('created_at',{ascending:false}).limit(150), 'bookings'),
    history: run(supabase.from('trip_history_public').select('*').or(`passenger_id.eq.${uid},driver_id.eq.${uid}`).order('created_at',{ascending:false}).limit(100), 'history'),
    vehicles: run(supabase.from('vehicles').select('*').eq('owner_id',uid).order('created_at',{ascending:false}), 'vehicles'),
    docs: run(supabase.from('driver_documents').select('*').eq('user_id',uid), 'documents'),
    locations: run(supabase.from('trip_locations').select('*').order('created_at',{ascending:false}).limit(100), 'locations'),
    notifications: run(supabase.from('notifications').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(20), 'notifications')
  };

  const result = await Promise.all(Object.values(queries));
  const [rides, myRides, allBookings, history, vehicles, docs, locations, notifications] = result;

  state.rides = rides;
  state.myRides = myRides;
  state.myBookings = allBookings.filter(b=>b.passenger_id===uid);
  state.requests = allBookings.filter(b=>b.driver_id===uid);
  state.history = history;
  state.vehicles = vehicles;
  state.documents = docs;
  state.locations = locations;
  state.notifications = notifications;

  if(isAdmin()){
    const [users, reports, adminDocs] = await Promise.all([
      run(supabase.from('profiles').select('*').order('created_at',{ascending:false}).limit(200), 'admin users'),
      run(supabase.from('reports_public').select('*').order('created_at',{ascending:false}).limit(100), 'admin reports'),
      run(supabase.from('driver_documents_public').select('*').order('created_at',{ascending:false}).limit(200), 'admin documents')
    ]);
    state.users = users;
    state.reports = reports;
    state.documents = adminDocs;
  }
}
let channel;
function subscribeRealtime(){
  if(channel || !state.session?.user?.id) return;
  const uid = state.session.user.id;
  // Targeted realtime only. Broad table subscriptions are avoided for scale.
  channel = supabase.channel(`ridemate-user-${uid}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${uid}`},()=>loadData().then(render).catch(console.warn))
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'notifications',filter:`user_id=eq.${uid}`},()=>loadData().then(render).catch(console.warn))
    .subscribe();
}
// Lightweight polling fallback. Keeps app fresh without heavy global realtime.
setInterval(()=>{ if(state.session && document.visibilityState==='visible') loadData().then(render).catch(console.warn); }, 45000);

function renderAuth(){
  const isSignup = state.authMode==='signup';
  app.innerHTML = `<div class="auth"><div class="authShell"><div class="authHero"><div class="bigIcon">${logo()}</div><div class="h1">RideMate</div><p>Verified drivers, flexible pickup requests, live trip sharing, and clean daily commute management.</p></div><div class="card"><div class="authTabs"><button class="authTab ${!isSignup?'active':''}" id="showLogin">Login</button><button class="authTab ${isSignup?'active':''}" id="showSignup">Sign up</button></div>${state.authNotice?`<div class="success">${esc(state.authNotice)}</div>`:''}${!isSignup?loginForm():signupForm()}</div></div></div>`;
  $('#showLogin').onclick=()=>{state.authMode='login';state.authNotice='';renderAuth();};
  $('#showSignup').onclick=()=>{state.authMode='signup';state.authNotice='';renderAuth();};
  const login = $('#loginForm'); if(login) login.onsubmit=doLogin;
  const signup = $('#signupForm'); if(signup) signup.onsubmit=doSignup;
}
function loginForm(){ return `<div class="h2">Welcome back</div><p class="small muted">Login with your confirmed email and password.</p><form id="loginForm" class="grid"><label>Email<input name="email" type="email" required placeholder="you@email.com"></label><label>Password<input name="password" type="password" required placeholder="minimum 6 characters"></label><button class="btn green">Login</button></form>`; }
function signupForm(){ return `<div class="h2">Create account</div><p class="small muted">Driver accounts require CNIC, license, and vehicle verification before public posting.</p><form id="signupForm" class="grid"><label>Full name<input name="full_name" required placeholder="Full name"></label><label>Email<input name="email" type="email" required placeholder="you@email.com"></label><label>Password<input name="password" type="password" minlength="6" required placeholder="minimum 6 characters"></label><div class="grid2"><label>Role<select name="role"><option value="passenger">Passenger</option><option value="driver">Driver</option></select></label><label>Gender<select name="gender"><option value="male">Male</option><option value="female">Female</option></select></label></div><label>Phone<input name="phone" required placeholder="03000000000"></label><button class="btn">Create account</button></form>`; }
async function doLogin(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const {error}=await supabase.auth.signInWithPassword(f); if(error) toast(error.message); }
async function doSignup(e){
  e.preventDefault(); const f=Object.fromEntries(new FormData(e.target));
  const {error}=await supabase.auth.signUp({email:f.email,password:f.password,options:{data:{full_name:f.full_name,role:f.role,gender:f.gender,phone:f.phone}}});
  if(error) toast(error.message); else { await supabase.auth.signOut(); state.authMode='login'; state.authNotice='Account registered successfully. Please confirm your email, then login.'; renderAuth(); }
}

function render(){
  try {
    if(!state.session) return renderAuth();
    const tabs = navTabs();
    app.innerHTML = `<div class="shell mobileShell"><div class="statusCap"></div><header class="appHeader"><div class="brand"><div class="appIcon">${logo()}</div><div><div class="title">${cfg.appName}</div><div class="sub">${esc(state.profile?.full_name)} · ${esc(role())}</div></div></div><div class="headerActions"><button class="headerAction" id="refreshBtn">↻</button><button class="headerAction" id="logoutBtn">Logout</button></div></header><main class="content appContent">${view()}</main>${state.modal||''}<nav class="tabs appTabs">${tabs.map(t=>`<button class="tab ${state.tab===t.id?'active':''}" data-tab="${t.id}"><span class="tabIcon">${t.icon}</span><span class="tabText">${t.label}</span></button>`).join('')}</nav></div>`;
    $('#logoutBtn').onclick=()=>supabase.auth.signOut(); const rb=$('#refreshBtn'); if(rb) rb.onclick=()=>loadData().then(render).catch(e=>toast(e.message||'Refresh failed'));
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab; state.modal=null; render();});
    bindEvents();
  } catch (err) {
    console.error('Render error:', err);
    app.innerHTML = `<div class="auth"><div class="card"><div class="h1">App error</div><p class="muted">${esc(err.message || err)}</p><button class="btn green" onclick="location.reload()">Reload</button></div></div>`;
  }
}

function navTabs(){
  if(isAdmin()) return [{id:'home',label:'Admin',icon:'📊'},{id:'kyc',label:'KYC',icon:'✅'},{id:'adminRides',label:'Rides',icon:'🚗'},{id:'reports',label:'Reports',icon:'🛟'},{id:'profile',label:'Me',icon:'👤'}];
  if(role()==='driver') return [{id:'home',label:'Home',icon:'🏠'},{id:'create',label:'Post',icon:'➕'},{id:'trip',label:'Trip',icon:'🚦'},{id:'requests',label:'Requests',icon:'📩'},{id:'history',label:'History',icon:'🧾'},{id:'profile',label:'Me',icon:'👤'}];
  return [{id:'home',label:'Search',icon:'🔎'},{id:'bookings',label:'Trips',icon:'🎫'},{id:'live',label:'Live',icon:'📍'},{id:'history',label:'History',icon:'🧾'},{id:'profile',label:'Me',icon:'👤'}];
}
function view(){
  if(isAdmin()) return adminView();
  if(state.tab==='home') return role()==='driver'?driverHome():passengerHome();
  if(state.tab==='create') return createRideView();
  if(state.tab==='trip') return driverTripView();
  if(state.tab==='requests') return requestsView();
  if(state.tab==='bookings') return bookingsView();
  if(state.tab==='live') return liveView();
  if(state.tab==='history') return historyView();
  if(state.tab==='profile') return profileView();
  return passengerHome();
}

function suggestions(){ return `<datalist id="routeSuggestions">${ROUTE_SUGGESTIONS.map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist>`; }
function templatesOptions(){ return `<option value="">Custom route</option>${ROUTE_TEMPLATES.map((r,i)=>`<option value="${i}">${esc(r.name)}</option>`).join('')}`; }
function compatible(r){
  if(r.driver_id===state.session.user.id) return {ok:false,msg:'Your own ride'};
  if((r.seats_left||0)<=0) return {ok:false,msg:'Full'};
  if(r.ride_rule==='male_only' && state.profile.gender!=='male') return {ok:false,msg:'Male only'};
  if(r.ride_rule==='female_only' && state.profile.gender!=='female') return {ok:false,msg:'Female only'};
  if(r.ride_rule==='family_only' && state.profile.travel_mode!=='family') return {ok:false,msg:'Family only'};
  return {ok:true,msg:'Safe match'};
}
function routeSummary(r){ return [r.trip_type, r.recurrence_type && r.recurrence_type!=='once'?r.recurrence_type:'', r.allow_monthly_booking?'monthly seats':''].filter(Boolean).join(' · '); }


function getRouteAreas(){
  const templateAreas = ROUTE_TEMPLATES.flatMap(r => [r.from, r.to, r.name, r.via]);
  return templateAreas
    .concat(ROUTE_SUGGESTIONS)
    .concat([
      'Wah Cantt','Wah Barrier 1','Wah Barrier 2','Wah Barrier 3','Barrier 1','Barrier 2','Barrier 3',
      'New City Phase 1','New City Phase 2','New City Phase 3','Lalazar Wah Cantt','Taxila','HIT Taxila','Taxila Bypass',
      'Islamabad','Blue Area','F-6','F-7','F-8','F-10','F-11','G-9','G-10','G-11','G-13','G-14','I-8','I-9','I-10','H-8','H-9','Faizabad','Zero Point',
      'Rawalpindi','Saddar Rawalpindi','Raja Bazaar','Committee Chowk','6th Road','Commercial Market','Chandni Chowk','Marrir Chowk','Peshawar Road'
    ])
    .filter(Boolean);
}
const UNIQUE_AREAS=[...new Set(getRouteAreas().filter(Boolean))].sort((a,b)=>a.localeCompare(b));
function locationSuggestHtml(inputId,value,placeholder,label){
  const q=(value||'').toLowerCase().trim();
  const matches=UNIQUE_AREAS.filter(x=>!q||x.toLowerCase().includes(q)).slice(0,10);
  return `<div class="locBox"><label>${label}<input id="${inputId}" data-loc-input="${inputId}" value="${esc(value||'')}" placeholder="${esc(placeholder)}" autocomplete="off"></label><div class="locDropdown ${q?'open':''}" data-loc-menu="${inputId}">${matches.map(x=>`<button type="button" class="locOption" data-loc-target="${inputId}" data-loc-value="${esc(x)}">${esc(x)}</button>`).join('')||'<div class="locEmpty">No matching location</div>'}</div></div>`;
}
function updateLocationMenu(input){
  const menu=input.closest('.locBox')?.querySelector('.locDropdown'); if(!menu) return;
  const q=input.value.toLowerCase().trim();
  const matches=UNIQUE_AREAS.filter(x=>!q||x.toLowerCase().includes(q)).slice(0,10);
  menu.classList.add('open');
  menu.innerHTML=matches.map(x=>`<button type="button" class="locOption" data-loc-target="${input.id}" data-loc-value="${esc(x)}">${esc(x)}</button>`).join('')||'<div class="locEmpty">No matching location</div>';
  menu.querySelectorAll('[data-loc-value]').forEach(btn=>btn.onclick=()=>{input.value=btn.dataset.locValue; menu.classList.remove('open');});
}
function bindLocationDropdowns(){
  document.querySelectorAll('[data-loc-input]').forEach(input=>{
    input.oninput=()=>updateLocationMenu(input);
    input.onfocus=()=>updateLocationMenu(input);
    input.onblur=()=>setTimeout(()=>input.closest('.locBox')?.querySelector('.locDropdown')?.classList.remove('open'),150);
  });
  document.querySelectorAll('[data-loc-value]').forEach(btn=>btn.onclick=()=>{const t=document.getElementById(btn.dataset.locTarget); if(t){t.value=btn.dataset.locValue;t.closest('.locBox')?.querySelector('.locDropdown')?.classList.remove('open');}});
}

function notificationBanner(){
  const unread = state.notifications.filter(n=>!n.is_read).slice(0,3);
  if(!unread.length) return '';
  return `<div class="card noticeCard"><div class="h2">Notifications</div>${unread.map(n=>`<div class="alert" style="margin-top:8px"><b>${esc(n.title)}</b><br>${esc(n.body)}</div>`).join('')}<button class="btn ghost" id="markNotificationsRead" style="margin-top:10px">Mark as read</button></div>`;
}

async function performRideSearch(from, to, time='any', rule='safe'){
  state.filters.from = from || '';
  state.filters.to = to || '';
  state.filters.time = time || 'any';
  state.filters.rule = rule || 'safe';
  try {
    const { data, error } = await supabase.rpc('search_rides_v2', { p_from: state.filters.from || null, p_to: state.filters.to || null, p_limit: 100 });
    if(error) throw error;
    state.rides = data || [];
  } catch (e) {
    // fallback to local filtering if RPC is not deployed yet
    console.warn('search_rides_v2 fallback:', e.message);
  }
}

function passengerHome(){
  let rides=state.rides.filter(r=>r.driver_id!==state.session.user.id);
  if(state.filters.from) rides=rides.filter(r=>[r.from_city,r.pickup_area,r.via_route].join(' ').toLowerCase().includes(state.filters.from.toLowerCase()));
  if(state.filters.to) rides=rides.filter(r=>[r.to_city,r.dropoff_area,r.via_route].join(' ').toLowerCase().includes(state.filters.to.toLowerCase()));
  if(state.filters.rule==='safe') rides=rides.filter(r=>compatible(r).ok);
  const cards=rides.map(rideCard).join('')||`<div class="empty">No future rides found. Try a nearby pickup point or ask a driver to post this route.</div>`;
  return `${notificationBanner()}<div class="screenTitle"><div><div class="h1">Find your seat</div><p class="muted">Search pickup and destination.</p></div><span class="pill green">online</span></div><form id="searchForm" class="card"><div class="h2">Search rides</div><div class="grid">${locationSuggestHtml('fFrom',state.filters.from,'New City Phase 2','From / pickup')}${locationSuggestHtml('fTo',state.filters.to,'Blue Area Islamabad','To / dropoff')}<div class="grid2"><label>Time<select name="time" id="fTime"><option value="any" ${state.filters.time==='any'?'selected':''}>Any</option><option value="morning" ${state.filters.time==='morning'?'selected':''}>Morning</option><option value="evening" ${state.filters.time==='evening'?'selected':''}>Evening</option></select></label><label>Filter<select name="rule" id="fRule"><option value="safe" ${state.filters.rule==='safe'?'selected':''}>Safe match</option><option value="all" ${state.filters.rule==='all'?'selected':''}>All rides</option></select></label></div><button class="btn green">Search rides</button></div></form>${cards}<div class="card"><button type="button" class="btn ghost" id="saveRouteBtn">Save this route for later alerts</button></div>`;
}

function rideCard(r){
  const c=compatible(r), existing=state.myBookings.find(b=>b.ride_id===r.id && ['pending','accepted','active'].includes(b.status));
  return `<div class="card"><div class="meta"><span class="pill green">Verified driver</span><span class="pill">${r.seats_left} seats</span><span class="pill blue">${fmt(r.departure_at)}</span></div><div class="row" style="margin-top:12px"><div><div class="route">${esc(r.from_city)} → ${esc(r.to_city)}</div><div class="small">${esc(r.pickup_area)} to ${esc(r.dropoff_area)}</div></div><div class="fare">${money(r.price_per_seat)}</div></div><div class="small muted">${esc(r.via_route || '')} ${routeSummary(r)?' · '+esc(routeSummary(r)):''}</div><div class="line"></div><div class="grid2"><button class="btn ghost" data-details="${r.id}">Details</button><button class="btn green" data-book="${r.id}" ${!c.ok||existing?'disabled':''}>${existing?'Requested':'Request'}</button></div></div>`;
}

function driverHome(){
  const verified = state.profile?.verification_status==='verified';
  const pendingReq = state.requests.filter(b=>b.status==='pending').length;
  const rides = state.myRides.map(r=>`<div class="card"><div class="row"><div><div class="route">${esc(r.from_city)} → ${esc(r.to_city)}</div><div class="small">${fmt(r.departure_at)} · ${esc(r.status)} · ${r.seats_left}/${r.total_seats} seats left</div></div><span class="pill ${r.status==='open'?'green':'warn'}">${esc(r.status)}</span></div><div class="line"></div><div class="grid2"><button class="btn ghost" data-details="${r.id}">Details</button><button class="btn danger" data-close="${r.id}" ${r.status!=='open'?'disabled':''}>Close</button></div></div>`).join('') || `<div class="empty">No rides posted yet.</div>`;
  return `<div class="card hero"><div class="h1">Driver home</div><p>${verified?'You are verified and can post rides.':'Complete driver KYC before public posting.'}</p></div><div class="kpiGrid"><div class="kpi"><b>${state.myRides.length}</b><span class="small">Your rides</span></div><div class="kpi"><b>${pendingReq}</b><span class="small">Seat requests</span></div></div>${!verified?`<div class="card"><div class="h2">Verification required</div><p class="small muted">Upload CNIC, license, vehicle registration and selfie in Profile. Admin approval is required before public rides.</p><button class="btn green" data-tab-go="profile">Complete KYC</button></div>`:''}${rides}`;
}

function createRideView(){
  if(role()!=='driver') return `<div class="empty">Only drivers can post rides.</div>`;
  if(state.profile.verification_status!=='verified') return `<div class="card"><div class="h1">KYC required</div><p class="muted">Submit CNIC, license, vehicle registration and selfie. Admin approval is required before posting public rides.</p><button class="btn green" onclick="state.tab='profile';render()">Open profile & upload documents</button></div>`;
  if(!state.vehicles.length) return `<div class="card"><div class="h1">Add vehicle first</div><p class="muted">A verified vehicle improves passenger trust.</p><button class="btn green" onclick="state.tab='profile';render()">Add vehicle</button></div>`;
  return `<form id="rideForm" class="card"><div class="h1">Post a ride</div><p class="muted">Use searchable location fields so passengers can find your ride easily.</p><div class="grid"><label>Vehicle<select name="vehicle_id">${state.vehicles.map(v=>`<option value="${v.id}">${esc(v.car_model || v.make || '')} ${esc(v.model || '')} · ${esc(v.plate_number)}</option>`).join('')}</select></label>${locationSuggestHtml('rFrom','Wah Cantt','Wah Cantt','From city / start area')}${locationSuggestHtml('rTo','Islamabad','Islamabad','To city / destination')}${locationSuggestHtml('rPickup','Barrier 3','Barrier 3','Main pickup area')}${locationSuggestHtml('rDropoff','Blue Area','Blue Area','Main dropoff area')}<label>Via route<input name="via_route" id="rVia" placeholder="GT Road → Taxila → Golra → G-9/G-8"></label><div class="grid2"><label>Departure date/time<input name="departure_at" type="datetime-local" required></label><label>Seats<input name="total_seats" type="number" min="1" max="6" value="1"></label></div><div class="grid2"><label>Price per seat<input name="price_per_seat" type="number" min="0" value="300"></label><label>Ride rule<select name="ride_rule"><option value="mixed">Mixed</option><option value="male_only">Male only</option><option value="female_only">Female only</option><option value="family_only">Family only</option></select></label></div><label>Driver notes<textarea name="notes" placeholder="Example: I can pickup from New City Phase 2 if nearby."></textarea></label><button class="btn green">Publish ride</button></div></form>`;
}

function driverTripView(){
  const accepted = state.requests.filter(b=>['accepted','active'].includes(b.status));
  const rideIds = [...new Set(accepted.map(b=>b.ride_id))];
  const cards = rideIds.map(rideId=>{
    const ride = state.myRides.find(r=>r.id===rideId) || accepted.find(b=>b.ride_id===rideId);
    const passengers = accepted.filter(b=>b.ride_id===rideId);
    const activeCount = passengers.filter(b=>b.status==='active').length;
    return `<div class="card"><div class="row"><div><div class="route">${esc(ride.from_city)} → ${esc(ride.to_city)}</div><div class="small">${fmt(ride.departure_at)} · ${passengers.length} accepted passengers · ${activeCount} active</div></div><span class="pill ${activeCount?'green':'warn'}">${activeCount?'ride started':'ready'}</span></div><div class="line"></div><div class="h3">Accepted passengers</div>${passengers.map(p=>`<div class="row passengerLine"><span>${esc(p.passenger_name)}<br><span class="small">${esc(p.note || 'No pickup note')}</span></span><span class="pill ${p.status==='active'?'green':'blue'}">${esc(p.status)}</span></div>`).join('')}<div class="line"></div><div class="grid"><button class="btn green" data-start-ride-all="${rideId}">Start ride & notify passengers</button><button class="btn ghost" data-share-driver-location="${rideId}">Share location now</button><button class="btn danger" data-end-ride-all="${rideId}" ${activeCount?'':'disabled'}>End ride & complete trip</button></div></div>`;
  }).join('');
  return `<div class="screenTitle"><div><div class="h1">Trip control</div><p class="muted">Start, share location, and end rides.</p></div><span class="pill green">driver</span></div>${cards || '<div class="empty">No accepted passengers yet. Accepted requests will appear here.</div>'}`;
}

function requestsView(){ return `<div class="card"><div class="h2">Passenger requests</div><p class="small muted">Accept requests here. After accepting, use the Trip tab to start the ride and notify all accepted passengers.</p></div>` + (state.requests.map(requestCard).join('') || `<div class="empty">No passenger requests yet.</div>`); }
function requestCard(b){
  return `<div class="card"><div class="row"><div><div class="route">${esc(b.passenger_name)}</div><div class="small">${esc(b.passenger_gender)} · ${esc(b.from_city)} → ${esc(b.to_city)}</div></div><span class="pill ${b.status==='pending'?'warn':'green'}">${esc(b.status)}</span></div>${b.note?`<div class="alert" style="margin-top:12px"><b>Passenger pickup request:</b><br>${esc(b.note)}</div>`:''}<div class="line"></div><div class="grid2"><button class="btn green" data-accept="${b.id}" ${b.status!=='pending'?'disabled':''}>Accept</button><button class="btn ghost" data-reject="${b.id}" ${b.status!=='pending'?'disabled':''}>Reject</button></div><button class="btn green" style="margin-top:10px" data-active="${b.id}" ${b.status!=='accepted'?'disabled':''}>Start live trip</button></div>`;
}



function googleMapsUrl(lat, lng){
  return `https://www.google.com/maps?q=${encodeURIComponent(lat + ',' + lng)}`;
}
function googleMapsDirectionsUrl(fromLoc, toText){
  if(!fromLoc) return '';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fromLoc.lat + ',' + fromLoc.lng)}&destination=${encodeURIComponent(toText || '')}&travelmode=driving`;
}
function shareLocationMessage(booking, loc){
  if(!loc) return 'RideMate live location is not available yet.';
  return `RideMate live location: ${googleMapsUrl(loc.lat, loc.lng)}\\nRoute: ${booking.from_city} to ${booking.to_city}`;
}

function latestLocationForBooking(bookingId, userId){
  return state.locations.find(l => l.booking_id === bookingId && (!userId || l.user_id === userId));
}
function staticMapBox(loc, title='Live location', destination=''){
  if(!loc) return `<div class="nativeMapCard"><div class="mapBlank"><div class="mapPin">📍</div><div><b>Waiting for location</b><br><span>Driver/passenger has not shared live GPS yet.</span></div></div></div>`;
  const mapsUrl = googleMapsUrl(loc.lat, loc.lng);
  const dirUrl = googleMapsDirectionsUrl(loc, destination);
  return `<div class="nativeMapCard"><div class="mapPreview"><div class="routeLine"></div><div class="movingPin">📍</div><div class="mapInfo"><b>${esc(title)}</b><br>Updated: ${fmt(loc.created_at)}<br>${Number(loc.lat).toFixed(5)}, ${Number(loc.lng).toFixed(5)}</div></div><div class="grid2" style="margin-top:12px"><a class="btn green mapBtn" href="${mapsUrl}" target="_blank" rel="noopener">Open map</a><a class="btn ghost mapBtn" href="${dirUrl || mapsUrl}" target="_blank" rel="noopener">Directions</a></div></div>`;
}

function liveView(){
  const active = state.myBookings.find(b=>['accepted','active'].includes(b.status)) || state.requests.find(b=>['accepted','active'].includes(b.status));
  if(!active) return `<div class="screenTitle"><div><div class="h1">Live trip</div><p class="muted">Live location appears after a booking is accepted and the driver starts the trip.</p></div></div><div class="empty">No active trip yet.</div>`;
  const isPassenger = active.passenger_id === state.session.user.id;
  const driverLoc = latestLocationForBooking(active.id, active.driver_id);
  const passengerLoc = latestLocationForBooking(active.id, active.passenger_id);
  const visibleLoc = isPassenger ? driverLoc : (driverLoc || passengerLoc);
  const shareText = shareLocationMessage(active, visibleLoc);
  return `<div class="screenTitle"><div><div class="h1">Live trip</div><p class="muted">${esc(active.from_city)} → ${esc(active.to_city)}</p></div><span class="pill ${visibleLoc?'green':'warn'}">${visibleLoc?'location on':'waiting'}</span></div>${staticMapBox(visibleLoc, isPassenger?'Driver live location':'Shared ride location', active.dropoff_area || active.to_city)}<div class="card nativePanel"><div class="h2">${isPassenger ? 'Passenger live view' : 'Driver live controls'}</div><p class="small muted">${isPassenger ? 'When driver shares GPS, open Google Maps to see latest location and directions.' : 'Turn location on when leaving for pickup. Accepted passengers will receive live location.'}</p><div class="grid"><button class="btn green" id="shareLocationBtn">${isPassenger ? 'Share my pickup location' : 'Share live location now'}</button><button class="btn ghost" id="copyMapsLinkBtn" ${visibleLoc?'':'disabled'}>Copy Google Maps link</button><button class="btn ghost" id="familyShareBtn" ${visibleLoc?'':'disabled'}>Copy family tracking message</button><button class="btn danger" id="sosBtn">Emergency SOS</button></div></div>`;
}

function historyView(){
  const rows = state.history.map(h=>`<div class="card"><div class="meta"><span class="pill ${h.status==='completed'?'green':h.status==='expired'?'warn':'bad'}">${esc(h.status)}</span><span class="pill">${fmt(h.created_at)}</span></div><div class="route" style="margin-top:10px">${esc(h.from_city)} → ${esc(h.to_city)}</div><div class="small">${esc(h.other_party || '')} · ${money(h.price_per_seat || 0)}</div><div class="line"></div><div class="grid2"><button class="btn ghost" data-history-details="${h.id}">Details</button><button class="btn ghost" data-rate="${h.id}" ${h.status!=='completed'?'disabled':''}>Rate driver</button></div></div>`).join('');
  return `<div class="card"><div class="h1">Trip history</div><p class="muted">Completed, cancelled, rejected and expired rides stay here. Passengers can rate drivers after completed trips.</p></div>${rows || '<div class="empty">No history yet.</div>'}`;
}

function profileView(){
  const p=state.profile||{}, pp=state.privateProfile||{};
  const isDriver = role()==='driver';
  const vehicles = state.vehicles.map(v=>`<div class="row"><span>${esc(v.car_model)} · ${esc(v.plate_number)}</span><span class="pill ${v.is_verified?'green':'warn'}">${v.is_verified?'verified':'pending'}</span></div>`).join('') || '<p class="small muted">No vehicle added.</p>';
  const docs = ['cnic_front','cnic_back','license','vehicle_registration','selfie'].map(t=>`<div class="row"><span>${labelDoc(t)}</span><span class="pill ${state.documents.find(d=>d.doc_type===t && d.status==='approved')?'green':state.documents.find(d=>d.doc_type===t)?'warn':'bad'}">${state.documents.find(d=>d.doc_type===t)?.status || 'missing'}</span></div>`).join('');
  return `<div class="card"><div class="h1">Profile</div><form id="profileForm" class="grid"><label>Full name<input name="full_name" value="${esc(p.full_name)}" required></label><div class="grid2"><label>Gender<select name="gender"><option value="male" ${p.gender==='male'?'selected':''}>Male</option><option value="female" ${p.gender==='female'?'selected':''}>Female</option></select></label><label>Travel mode<select name="travel_mode"><option value="solo" ${p.travel_mode==='solo'?'selected':''}>Solo</option><option value="family" ${p.travel_mode==='family'?'selected':''}>Family</option></select></label></div><label>Phone<input name="phone" value="${esc(pp.phone||'')}" required></label><label>Emergency contact<input name="emergency_contact" value="${esc(pp.emergency_contact||'')}" placeholder="Family phone"></label><button class="btn green">Save profile</button></form><button class="btn ghost" style="margin-top:10px" onclick="resetLocalApp()">Reset local app data</button></div>${isDriver?`<div class="card"><div class="h2">Driver verification</div><div class="meta"><span class="pill ${p.verification_status==='verified'?'green':'warn'}">${esc(p.verification_status||'pending')}</span></div><div class="line"></div>${docs}<div class="line"></div><form id="docForm" class="grid"><label>Document type<select name="doc_type"><option value="cnic_front">CNIC front</option><option value="cnic_back">CNIC back</option><option value="license">Driving license</option><option value="vehicle_registration">Vehicle registration</option><option value="selfie">Selfie verification</option></select></label><label>Upload image<input name="file" type="file" accept="image/*" required></label><p class="small muted">Upload a clear image. Admin will review it before driver approval.</p><button class="btn">Upload document</button></form></div><div class="card"><div class="h2">Vehicles</div>${vehicles}<div class="line"></div><form id="vehicleForm" class="grid"><div class="grid2"><label>Car model<input name="car_model" required placeholder="Honda City"></label><label>Plate number<input name="plate_number" required placeholder="ABC-123"></label></div><label>Color<input name="color" placeholder="White"></label><button class="btn">Add vehicle</button></form></div>`:''}`;
}
function labelDoc(t){ return ({cnic_front:'CNIC front',cnic_back:'CNIC back',license:'Driving license',vehicle_registration:'Vehicle registration',selfie:'Selfie verification'}[t]||t); }

function adminView(){
  if(state.tab==='kyc') return adminKyc();
  if(state.tab==='adminRides') return adminRides();
  if(state.tab==='reports') return adminReports();
  if(state.tab==='profile') return profileView();
  return `<div class="card hero"><div class="h1">Admin</div><p>Manage users, driver KYC, route quality, rides and safety reports.</p></div><div class="kpiGrid"><div class="kpi"><b>${state.users.length}</b><span class="small">Users</span></div><div class="kpi"><b>${state.rides.length}</b><span class="small">Open rides</span></div><div class="kpi"><b>${state.documents.filter(d=>d.status==='pending').length}</b><span class="small">Pending KYC</span></div><div class="kpi"><b>${state.reports.length}</b><span class="small">Reports</span></div></div><div class="card"><div class="h2">Users</div><table class="table"><tr><th>User</th><th>Role</th><th>Status</th></tr>${state.users.map(u=>`<tr><td>${esc(u.full_name)}<br><span class="small">${esc(u.id)}</span></td><td>${esc(u.role)}</td><td>${esc(u.status)}<br><button class="btn ghost" data-user-status="${u.id}:${u.status==='active'?'blocked':'active'}">${u.status==='active'?'Block':'Activate'}</button></td></tr>`).join('')}</table></div>`;
}
function adminKyc(){
  const drivers = state.users.filter(u => u.role === 'driver');
  const q = (state.adminKycSearch || '').toLowerCase();
  const filtered = drivers.filter(u => [u.full_name,u.id,u.status,u.verification_status].join(' ').toLowerCase().includes(q));
  const selected = state.selectedKycUser ? state.users.find(u=>u.id===state.selectedKycUser) : null;
  if (selected) {
    const docs = state.documents.filter(d=>d.user_id===selected.id);
    const approvedCount = docs.filter(d=>d.status==='approved').length;
    const required = ['cnic_front','cnic_back','license','vehicle_registration','selfie'];
    return `<div class="card"><button class="btn ghost" id="backKycUsers">Back to drivers</button><div class="h1" style="margin-top:12px">${esc(selected.full_name)}</div><p class="muted">Driver verification detail. Admin can approve a driver when at least 3 required documents are approved.</p><div class="meta"><span class="pill ${selected.verification_status==='verified'?'green':'warn'}">${esc(selected.verification_status||'unverified')}</span><span class="pill blue">${approvedCount}/${required.length} approved</span></div></div>${required.map(t=>{
      const d = docs.find(x=>x.doc_type===t);
      return `<div class="card"><div class="row"><div><div class="route">${labelDoc(t)}</div><div class="small">${d ? esc(d.file_url) : 'Not submitted yet'}</div></div><span class="pill ${d?.status==='approved'?'green':d?.status==='rejected'?'bad':d?'warn':'bad'}">${d?.status || 'missing'}</span></div>${d?.file_url ? `<div class="docPreview"><img src="${esc(d.file_url)}" alt="${esc(labelDoc(t))}" onerror="this.style.display='none'"></div>` : ''}${d?`<div class="line"></div><div class="grid2"><button class="btn green" data-doc-approve="${d.id}">Approve</button><button class="btn ghost" data-doc-reject="${d.id}">Reject</button></div>`:''}</div>`;
    }).join('')}<div class="card"><div class="h2">Driver approval</div><p class="small muted">Recommended: approve only after CNIC, license, vehicle registration and selfie are valid. System allows approval when at least 3 documents are approved.</p><button class="btn green" data-driver-verify="${selected.id}" ${approvedCount < 3 ? 'disabled' : ''}>Approve driver</button><button class="btn ghost" style="margin-top:10px" data-driver-unverify="${selected.id}">Remove verification</button></div>`;
  }
  return `<div class="card"><div class="h1">Driver KYC</div><p class="muted">Search driver users and open their submitted documents.</p><label>Search users<input id="kycSearch" value="${esc(state.adminKycSearch)}" placeholder="Search by name, status, ID"></label></div>${filtered.map(u=>{
    const docs = state.documents.filter(d=>d.user_id===u.id);
    const approvedCount = docs.filter(d=>d.status==='approved').length;
    return `<div class="card kycUserCard" data-open-kyc-user="${u.id}"><div class="row"><div><div class="route">${esc(u.full_name)}</div><div class="small">${esc(u.id)}<br>${approvedCount} documents approved</div></div><span class="pill ${u.verification_status==='verified'?'green':'warn'}">${esc(u.verification_status||'unverified')}</span></div></div>`;
  }).join('') || '<div class="empty">No drivers found.</div>'}`;
}

function adminRides(){ return `<div class="card"><div class="h1">Rides</div><table class="table"><tr><th>Route</th><th>Driver</th><th>Status</th></tr>${state.rides.concat(state.myRides).map(r=>`<tr><td>${esc(r.from_city)} → ${esc(r.to_city)}<br><span class="small">${fmt(r.departure_at)}</span></td><td>${esc(r.driver_name)}</td><td>${esc(r.status)}<br><button class="btn ghost" data-close="${r.id}">Close</button></td></tr>`).join('')}</table></div>`; }
function adminReports(){ return `<div class="card"><div class="h1">Reports</div>${state.reports.map(r=>`<div class="card" style="box-shadow:none"><div class="row"><b>${esc(r.report_type)}</b><span class="pill warn">${esc(r.status)}</span></div><p class="small">${esc(r.details)}</p><button class="btn green" data-report-resolve="${r.id}">Resolve</button></div>`).join('') || '<div class="empty">No reports.</div>'}</div>`; }

function bindEvents(){
  bindLocationDropdowns();
  const searchForm=$('#searchForm');
  if(searchForm) searchForm.onsubmit=async(e)=>{e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); await performRideSearch(document.getElementById('fFrom')?.value||'', document.getElementById('fTo')?.value||'', f.time||'any', f.rule||'safe'); render();};
  const saveRouteBtn=$('#saveRouteBtn'); if(saveRouteBtn) saveRouteBtn.onclick=()=>{ const f=$('#fFrom')?.value || state.filters.from; const t=$('#fTo')?.value || state.filters.to; state.filters.from=f; state.filters.to=t; saveRoute(); };
  const templateSelect=$('#templateSelect'); if(templateSelect) templateSelect.onchange=applyTemplate;
  const rideForm=$('#rideForm'); if(rideForm) rideForm.onsubmit=createRide;
  const profileForm=$('#profileForm'); if(profileForm) profileForm.onsubmit=saveProfile;
  const vehicleForm=$('#vehicleForm'); if(vehicleForm) vehicleForm.onsubmit=addVehicle;
  const docForm=$('#docForm'); if(docForm) docForm.onsubmit=submitDoc;
  document.querySelectorAll('[data-tab-go]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tabGo; render();});
  document.querySelectorAll('[data-details]').forEach(b=>b.onclick=()=>showRideDetails(b.dataset.details));
  document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>openBookingModal(b.dataset.book));
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>rpc('close_ride',{p_ride_id:b.dataset.close}));
  document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>rpc('cancel_booking_request',{p_booking_id:b.dataset.cancel,p_reason:'Cancelled by passenger'}));
  document.querySelectorAll('[data-accept]').forEach(b=>b.onclick=()=>rpc('accept_booking_request',{p_booking_id:b.dataset.accept}));
  document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>rpc('reject_booking_request',{p_booking_id:b.dataset.reject,p_reason:'Rejected by driver'}));
  document.querySelectorAll('[data-active]').forEach(b=>b.onclick=()=>rpc('start_booking_trip',{p_booking_id:b.dataset.active}));
  document.querySelectorAll('[data-start-ride-all]').forEach(b=>b.onclick=()=>startRideAll(b.dataset.startRideAll));
  document.querySelectorAll('[data-share-driver-location]').forEach(b=>b.onclick=()=>shareDriverLocationForRide(b.dataset.shareDriverLocation));
  document.querySelectorAll('[data-end-ride-all]').forEach(b=>b.onclick=()=>endRideAll(b.dataset.endRideAll));
  const markNotificationsRead=$('#markNotificationsRead'); if(markNotificationsRead) markNotificationsRead.onclick=markNotificationsReadFn;
  document.querySelectorAll('[data-contact]').forEach(b=>b.onclick=()=>getContact(b.dataset.contact));
  document.querySelectorAll('[data-doc-approve]').forEach(b=>b.onclick=()=>adminDoc(b.dataset.docApprove,'approved'));
  document.querySelectorAll('[data-doc-reject]').forEach(b=>b.onclick=()=>adminDoc(b.dataset.docReject,'rejected'));
  document.querySelectorAll('[data-driver-verify]').forEach(b=>b.onclick=()=>adminVerify(b.dataset.driverVerify));
  document.querySelectorAll('[data-driver-unverify]').forEach(b=>b.onclick=()=>adminUnverify(b.dataset.driverUnverify));
  document.querySelectorAll('[data-open-kyc-user]').forEach(b=>b.onclick=()=>{state.selectedKycUser=b.dataset.openKycUser; render();});
  const backKycUsers=$('#backKycUsers'); if(backKycUsers) backKycUsers.onclick=()=>{state.selectedKycUser=null; render();};
  const kycSearch=$('#kycSearch'); if(kycSearch) kycSearch.oninput=debounce((e)=>{state.adminKycSearch=e.target.value; render();}, 300);
  document.querySelectorAll('[data-user-status]').forEach(b=>b.onclick=()=>{const [id,status]=b.dataset.userStatus.split(':'); rpc('admin_set_user_status',{p_user_id:id,p_status:status});});
  document.querySelectorAll('[data-report-resolve]').forEach(b=>b.onclick=()=>supabase.from('reports').update({status:'resolved'}).eq('id',b.dataset.reportResolve).then(()=>loadData().then(render)));
  document.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>openRatingModal(b.dataset.rate));
  const bookRideForm=$('#bookRideForm'); if(bookRideForm) bookRideForm.onsubmit=submitBooking;
  const close=$('#modalClose'); if(close) close.onclick=()=>{state.modal=null; render();};
  const ratingForm=$('#ratingForm'); if(ratingForm) ratingForm.onsubmit=submitRating;
  const shareLoc=$('#shareLocationBtn'); if(shareLoc) shareLoc.onclick=shareLocation;
  const family=$('#familyShareBtn'); if(family) family.onclick=()=>{const active=state.myBookings.find(b=>['accepted','active'].includes(b.status))||state.requests.find(b=>['accepted','active'].includes(b.status)); const loc=active && (latestLocationForBooking(active.id, active.driver_id)||latestLocationForBooking(active.id, state.session.user.id)); navigator.clipboard?.writeText(shareLocationMessage(active, loc)).then(()=>toast('Family message copied'));};
  const copyMaps=$('#copyMapsLinkBtn'); if(copyMaps) copyMaps.onclick=()=>{const active=state.myBookings.find(b=>['accepted','active'].includes(b.status))||state.requests.find(b=>['accepted','active'].includes(b.status)); const loc=active && (latestLocationForBooking(active.id, active.driver_id)||latestLocationForBooking(active.id, state.session.user.id)); if(loc) navigator.clipboard?.writeText(googleMapsUrl(loc.lat, loc.lng)).then(()=>toast('Google Maps link copied'));};
  const sos=$('#sosBtn'); if(sos) sos.onclick=()=>location.href='tel:15';
}
async function rpc(fn,args){
  if(state.loading) return;
  state.loading=true;
  try {
    const {error}=await supabase.rpc(fn,args);
    if(error) toast(error.message);
    else {toast('Updated'); await loadData(); render();}
  } finally {
    state.loading=false;
  }
}

function applyTemplate(e){ const r=ROUTE_TEMPLATES[+e.target.value]; if(!r) return; const f=$('#rideForm'); f.from_city.value=r.from; f.to_city.value=r.to; f.pickup_area.value=r.from; f.dropoff_area.value=r.to; f.via_route.value=r.via; }
async function saveRoute(){ const from=state.filters.from.trim(), to=state.filters.to.trim(); if(!from||!to) return toast('From and To required'); const {error}=await supabase.from('saved_routes').insert({user_id:state.session.user.id,from_city:from,to_city:to,notify_enabled:true}); if(error) toast(error.message); else toast('Custom route saved'); }
async function createRide(e){
  e.preventDefault(); const f=Object.fromEntries(new FormData(e.target));
  f.from_city = document.getElementById('rFrom')?.value || f.from_city;
  f.to_city = document.getElementById('rTo')?.value || f.to_city;
  f.pickup_area = document.getElementById('rPickup')?.value || f.pickup_area;
  f.dropoff_area = document.getElementById('rDropoff')?.value || f.dropoff_area;
  f.recurrence_type = f.recurrence_type || 'once';
  f.recurrence_days = f.recurrence_days || '';
  f.allow_monthly_booking = f.allow_monthly_booking || 'false';
  f.monthly_price = f.monthly_price || '';
  f.trip_type = f.trip_type || 'one_way';
  if(!f.from_city || !f.to_city || !f.pickup_area || !f.dropoff_area) return toast('From, To, Pickup and Dropoff are required');
  if(new Date(f.departure_at)<=new Date()) return toast('Departure time must be in future');
  if(f.recurrence_type==='custom' && !f.recurrence_days.trim()) return toast('Custom days required');
  if(f.allow_monthly_booking==='true' && !f.monthly_price) return toast('Monthly price required');
  const {error}=await supabase.rpc('create_ride_v2',{p_vehicle_id:f.vehicle_id,p_from_city:f.from_city,p_to_city:f.to_city,p_pickup_area:f.pickup_area,p_dropoff_area:f.dropoff_area,p_via_route:f.via_route||null,p_departure_at:new Date(f.departure_at).toISOString(),p_total_seats:+f.total_seats,p_price_per_seat:+f.price_per_seat,p_ride_rule:f.ride_rule,p_trip_type:f.trip_type,p_recurrence_type:f.recurrence_type,p_recurrence_days:f.recurrence_days||null,p_allow_monthly_booking:f.allow_monthly_booking==='true',p_monthly_price:f.monthly_price?+f.monthly_price:null,p_notes:f.notes||null});
  if(error) toast(error.message); else {toast('Ride posted'); state.tab='home'; await loadData(); render();}
}
function openBookingModal(id){ const r=state.rides.find(x=>x.id===id)||state.myRides.find(x=>x.id===id); const c=compatible(r); state.modal=`<div class="modalBack"><div class="modal"><button class="btn ghost" id="modalClose">Close</button><div class="h1">Request seat</div><p class="muted">${esc(r.from_city)} → ${esc(r.to_city)} · ${fmt(r.departure_at)}</p><div class="card" style="box-shadow:none"><div class="row"><span>Driver pickup</span><b>${esc(r.pickup_area)}</b></div><div class="row"><span>Driver dropoff</span><b>${esc(r.dropoff_area)}</b></div><div class="row"><span>Fare</span><b>${money(r.price_per_seat)}</b></div></div><form id="bookRideForm" class="grid"><input type="hidden" name="ride_id" value="${esc(id)}"><label>Your pickup point<input name="requested_pickup" list="routeSuggestions" placeholder="New City Phase 2 Gate"></label><label>Note for driver<textarea name="note" placeholder="I can join from New City if you pass nearby."></textarea></label>${suggestions()}<button class="btn green" ${!c.ok?'disabled':''}>${c.ok?'Send request':esc(c.msg)}</button></form></div></div>`; render(); }
async function submitBooking(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const note=[f.requested_pickup?`Requested pickup: ${f.requested_pickup}`:'', f.note||''].filter(Boolean).join(' | ') || null; const {error}=await supabase.rpc('create_booking_request_v2',{p_ride_id:f.ride_id,p_seats_requested:1,p_note:note}); if(error) toast(error.message); else {state.modal=null; toast('Request sent'); await loadData(); render();} }
async function saveProfile(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const [a,b]=await Promise.all([supabase.from('profiles').update({full_name:f.full_name,gender:f.gender,travel_mode:f.travel_mode}).eq('id',state.session.user.id),supabase.from('private_profiles').update({phone:f.phone,emergency_contact:f.emergency_contact||null}).eq('user_id',state.session.user.id)]); if(a.error||b.error) toast(a.error?.message||b.error?.message); else {toast('Profile saved'); await loadMe(); render();} }
async function addVehicle(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const {error}=await supabase.from('vehicles').insert({owner_id:state.session.user.id,car_model:f.car_model,plate_number:f.plate_number,color:f.color||null}); if(error) toast(error.message); else {toast('Vehicle added'); await loadData(); render();} }
function compressImage(file, maxWidth=1400, quality=0.72){
  return new Promise((resolve) => {
    if(!file.type.startsWith('image/')) return resolve(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if(!blob) return resolve(file);
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {type:'image/jpeg'}));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

async function submitDoc(e){
  e.preventDefault();
  const form = e.target;
  const f = Object.fromEntries(new FormData(form));
  const file = form.querySelector('input[name="file"]')?.files?.[0];
  if(!file) return toast('Please select an image');
  if(!file.type.startsWith('image/')) return toast('Only image files are allowed');
  if(file.size > 8 * 1024 * 1024) return toast('Image must be less than 8MB');
  const finalFile = await compressImage(file);
  if(finalFile.size > 3 * 1024 * 1024) return toast('Compressed image is still too large. Please use a clearer smaller image.');
  const path = `${state.session.user.id}/${f.doc_type}-${Date.now()}.jpg`;
  const up = await supabase.storage.from('kyc-documents').upload(path, finalFile, { upsert: true, contentType: finalFile.type });
  if(up.error) return toast(up.error.message);
  const { data } = supabase.storage.from('kyc-documents').getPublicUrl(path);
  const {error}=await supabase.from('driver_documents').insert({user_id:state.session.user.id,doc_type:f.doc_type,file_url:data.publicUrl,status:'pending'});
  if(error) toast(error.message); else {toast('Document uploaded'); await loadData(); render();}
}

async function getContact(id){ const {data,error}=await supabase.rpc('get_booking_contact',{p_booking_id:id}); if(error) toast(error.message); else alert(`Contact: ${data.full_name}\nPhone: ${data.phone}\nEmergency: ${data.emergency_contact || 'Not added'}`); }
async function adminDoc(id,status){ const {error}=await supabase.from('driver_documents').update({status}).eq('id',id); if(error) toast(error.message); else {toast('Document updated'); await loadData(); render();} }
async function adminVerify(uid){ await supabase.rpc('admin_set_driver_verified',{p_user_id:uid,p_verified:true}); toast('Driver verified'); await loadData(); render(); }
async function adminUnverify(uid){ await supabase.rpc('admin_set_driver_verified',{p_user_id:uid,p_verified:false}); toast('Driver verification removed'); await loadData(); render(); }
async function startRideAll(rideId){
  const {error}=await supabase.rpc('start_ride_for_passengers',{p_ride_id:rideId});
  if(error) return toast(error.message);
  toast('Ride started. Passengers notified.');
  await loadData();
  state.tab='trip';
  render();
  setTimeout(()=>shareDriverLocationForRide(rideId), 500);
}

async function shareDriverLocationForRide(rideId){
  if(!navigator.geolocation) return toast('Location not supported');
  navigator.geolocation.getCurrentPosition(async pos=>{
    const passengers = state.requests.filter(b => b.ride_id === rideId && ['accepted','active'].includes(b.status));
    if(!passengers.length) return toast('No accepted passengers for this ride');
    const rows = passengers.map(b => ({
      booking_id:b.id,
      user_id:state.session.user.id,
      lat:pos.coords.latitude,
      lng:pos.coords.longitude,
      accuracy:pos.coords.accuracy
    }));
    const {error}=await supabase.from('trip_locations').insert(rows);
    if(error) toast(error.message); else {toast('Live location shared with accepted passengers'); await loadData(); render();}
  },()=>toast('Location permission denied'),{enableHighAccuracy:true,timeout:10000});
}

async function markNotificationsReadFn(){
  const unreadIds = state.notifications.filter(n=>!n.is_read).map(n=>n.id);
  if(!unreadIds.length) return;
  const {error}=await supabase.from('notifications').update({is_read:true}).in('id', unreadIds);
  if(error) toast(error.message); else {await loadData(); render();}
}

async function endRideAll(rideId){
  if(!confirm('End this ride for all active/accepted passengers?')) return;
  const {error}=await supabase.rpc('end_ride_for_passengers',{p_ride_id:rideId});
  if(error) return toast(error.message);
  toast('Ride completed and moved to history');
  await loadData();
  state.tab='history';
  render();
}

async function shareLocation(){
  if(!navigator.geolocation) return toast('Location not supported');
  navigator.geolocation.getCurrentPosition(async pos=>{
    const active = state.myBookings.find(b=>['accepted','active'].includes(b.status)) || state.requests.find(b=>['accepted','active'].includes(b.status));
    if(!active) return toast('No active trip');
    const lat = pos.coords.latitude, lng = pos.coords.longitude, accuracy = pos.coords.accuracy;
    let rows = [];
    if(active.driver_id === state.session.user.id){
      const sameRideBookings = state.requests.filter(b => b.ride_id === active.ride_id && ['accepted','active'].includes(b.status));
      rows = sameRideBookings.map(b => ({booking_id:b.id,user_id:state.session.user.id,lat,lng,accuracy}));
      if(!rows.length) rows = [{booking_id:active.id,user_id:state.session.user.id,lat,lng,accuracy}];
    } else {
      rows = [{booking_id:active.id,user_id:state.session.user.id,lat,lng,accuracy}];
    }
    const {error}=await supabase.from('trip_locations').insert(rows);
    if(error) toast(error.message); else {toast('Live location shared'); await loadData(); render();}
  },()=>toast('Location permission denied'),{enableHighAccuracy:true,timeout:10000});
}

function showRideDetails(id){ const r=state.rides.find(x=>x.id===id)||state.myRides.find(x=>x.id===id); state.modal=`<div class="modalBack"><div class="modal"><button class="btn ghost" id="modalClose">Close</button><div class="h1">${esc(r.from_city)} → ${esc(r.to_city)}</div><p class="muted">${fmt(r.departure_at)}</p><div class="card" style="box-shadow:none"><div class="row"><span>Pickup</span><b>${esc(r.pickup_area)}</b></div><div class="row"><span>Dropoff</span><b>${esc(r.dropoff_area)}</b></div><div class="row"><span>Via</span><b>${esc(r.via_route||'')}</b></div><div class="row"><span>Seats</span><b>${r.seats_left}/${r.total_seats}</b></div><div class="row"><span>Fare</span><b>${money(r.price_per_seat)}</b></div><div class="row"><span>Driver</span><b>${esc(r.driver_name)} · ${esc(r.driver_gender)}</b></div></div>${role()==='passenger'?`<button class="btn green" data-book="${r.id}">Request seat</button>`:''}</div></div>`; render(); }

if('serviceWorker' in navigator) window.addEventListener('load', async () => {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch(e) {}
});
init();
