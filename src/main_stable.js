import { createClient } from '@supabase/supabase-js';
import './styles.css';

const cfg = {
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  appName: import.meta.env.VITE_APP_NAME || 'RideMate',
};

const app = document.querySelector('#app');
if (!cfg.url || !cfg.key) {
  app.innerHTML = `<div class="auth"><div class="card"><div class="h1">Setup required</div><p class="muted">Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Netlify environment variables.</p></div></div>`;
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(cfg.url, cfg.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const ROUTES = ['Wah Cantt','Barrier 3','New City Phase 1','New City Phase 2','Taxila','Taxila Bypass','Golra Mor','G-13','NUST','G-11','G-10','G-9','G-8','F-8','Blue Area','I-8','I-9','Faizabad','Rawalpindi Saddar','Commercial Market'];
const state = { session:null, profile:null, privateProfile:null, tab:'home', authMode:'login', notice:'', loading:false, modal:'', filters:{from:'',to:'',rule:'safe'}, vehicles:[], rides:[], myRides:[], bookings:[], requests:[], history:[], docs:[], locations:[], notifications:[], users:[], reports:[] };

const $ = s => document.querySelector(s);
const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const money = n => `Rs. ${Number(n || 0).toLocaleString('en-PK')}`;
const fmt = d => d ? new Date(d).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
const logo = () => `<img src="/icons/icon.svg" alt="RideMate" />`;
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg || 'Done'; document.body.appendChild(t); setTimeout(()=>t.remove(),3200); }
function safeProfile(session){ return { id:session?.user?.id, full_name:session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'User', role:session?.user?.user_metadata?.role || 'passenger', gender:session?.user?.user_metadata?.gender || 'male', travel_mode:'solo', status:'active', verification_status:'unverified', rating:5 }; }
function role(){ return state.profile?.role || 'passenger'; }
function isAdmin(){ return role()==='admin'; }
function withTimeout(promise, ms=12000){ return Promise.race([promise, new Promise((_,rej)=>setTimeout(()=>rej(new Error('Network timeout. Please refresh.')), ms))]); }
async function q(p, fallback=[]){ try { const {data,error}=await withTimeout(p); if(error){ console.warn(error.message); return fallback; } return data ?? fallback; } catch(e){ console.warn(e.message); return fallback; } }

window.resetLocalApp = async function(){ try{ await supabase.auth.signOut(); localStorage.clear(); sessionStorage.clear(); }catch{} location.href='/?reset='+Date.now(); };
window.addEventListener('error', e => { console.error(e.error || e.message); toast(e.message || 'App warning'); });
window.addEventListener('unhandledrejection', e => { console.error(e.reason); toast(e.reason?.message || 'App warning'); });

supabase.auth.onAuthStateChange(async (_event, session) => {
  state.session = session;
  if(!session){ clearState(); renderAuth(); return; }
  state.profile = state.profile || safeProfile(session);
  state.privateProfile = state.privateProfile || { user_id: session.user.id, phone: session.user.user_metadata?.phone || '' };
  render();
  await refreshAll();
});

init();
async function init(){
  app.innerHTML = `<div class="auth"><div class="card"><div class="h1">RideMate</div><p class="muted">Loading app...</p></div></div>`;
  const {data,error}=await supabase.auth.getSession();
  if(error) console.warn(error.message);
  state.session = data?.session || null;
  if(!state.session) return renderAuth();
  state.profile = safeProfile(state.session);
  state.privateProfile = { user_id: state.session.user.id, phone: state.session.user.user_metadata?.phone || '' };
  render();
  await refreshAll();
}
function clearState(){ Object.assign(state,{profile:null,privateProfile:null,vehicles:[],rides:[],myRides:[],bookings:[],requests:[],history:[],docs:[],locations:[],notifications:[],users:[],reports:[],tab:'home',modal:''}); }

async function refreshAll(){
  if(!state.session?.user?.id) return;
  const uid = state.session.user.id;
  const now = new Date().toISOString();
  const [p, pp] = await Promise.all([
    q(supabase.from('profiles').select('*').eq('id',uid).maybeSingle(), null),
    q(supabase.from('private_profiles').select('*').eq('user_id',uid).maybeSingle(), null)
  ]);
  if(p) state.profile = p;
  if(pp) state.privateProfile = pp;

  const [rides,myRides,allBookings,history,vehicles,docs,locations,notifications] = await Promise.all([
    q(supabase.from('rides_public').select('*').eq('status','open').gt('departure_at',now).order('departure_at',{ascending:true}).limit(100)),
    q(supabase.from('rides_public').select('*').eq('driver_id',uid).order('departure_at',{ascending:false}).limit(100)),
    q(supabase.from('bookings_public').select('*').or(`passenger_id.eq.${uid},driver_id.eq.${uid}`).order('created_at',{ascending:false}).limit(150)),
    q(supabase.from('trip_history_public').select('*').or(`passenger_id.eq.${uid},driver_id.eq.${uid}`).order('created_at',{ascending:false}).limit(100)),
    q(supabase.from('vehicles').select('*').eq('owner_id',uid).order('created_at',{ascending:false})),
    q(supabase.from('driver_documents').select('*').eq('user_id',uid)),
    q(supabase.from('trip_locations').select('*').order('created_at',{ascending:false}).limit(100)),
    q(supabase.from('notifications').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(20)),
  ]);
  state.rides=rides; state.myRides=myRides; state.bookings=allBookings.filter(b=>b.passenger_id===uid); state.requests=allBookings.filter(b=>b.driver_id===uid); state.history=history; state.vehicles=vehicles; state.docs=docs; state.locations=locations; state.notifications=notifications;
  if(isAdmin()){
    const [users,reports,adminDocs] = await Promise.all([
      q(supabase.from('profiles').select('*').order('created_at',{ascending:false}).limit(200)),
      q(supabase.from('reports_public').select('*').order('created_at',{ascending:false}).limit(100)),
      q(supabase.from('driver_documents_public').select('*').order('created_at',{ascending:false}).limit(200))
    ]);
    state.users=users; state.reports=reports; state.docs=adminDocs;
  }
  render();
}

function renderAuth(){
  const signup = state.authMode==='signup';
  app.innerHTML = `<div class="auth"><div class="authShell"><div class="authHero"><div class="bigIcon">${logo()}</div><div class="h1">RideMate</div><p>Verified carpool rides for daily commute.</p></div><div class="card"><div class="authTabs"><button class="authTab ${!signup?'active':''}" id="loginTab">Login</button><button class="authTab ${signup?'active':''}" id="signupTab">Sign up</button></div>${state.notice?`<div class="success">${esc(state.notice)}</div>`:''}${signup?signupForm():loginForm()}</div></div></div>`;
  $('#loginTab').onclick=()=>{state.authMode='login';state.notice='';renderAuth();};
  $('#signupTab').onclick=()=>{state.authMode='signup';state.notice='';renderAuth();};
  const lf=$('#loginForm'); if(lf) lf.onsubmit=login;
  const sf=$('#signupForm'); if(sf) sf.onsubmit=signup;
}
function loginForm(){ return `<form id="loginForm" class="grid"><div class="h2">Welcome back</div><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label><button class="btn green">Login</button></form>`; }
function signupForm(){ return `<form id="signupForm" class="grid"><div class="h2">Create account</div><label>Full name<input name="full_name" required></label><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" minlength="6" required></label><div class="grid2"><label>Role<select name="role"><option value="passenger">Passenger</option><option value="driver">Driver</option></select></label><label>Gender<select name="gender"><option value="male">Male</option><option value="female">Female</option></select></label></div><label>Phone<input name="phone" required></label><button class="btn green">Create account</button></form>`; }
async function login(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const {error}=await supabase.auth.signInWithPassword(f); if(error) toast(error.message); }
async function signup(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const {error}=await supabase.auth.signUp({email:f.email,password:f.password,options:{data:{full_name:f.full_name,role:f.role,gender:f.gender,phone:f.phone}}}); if(error) toast(error.message); else { await supabase.auth.signOut(); state.authMode='login'; state.notice='Account created. Confirm email if required, then login.'; renderAuth(); } }

function nav(){
  if(isAdmin()) return [['home','Admin','📊'],['kyc','KYC','✅'],['adminRides','Rides','🚗'],['reports','Reports','🛟'],['profile','Me','👤']];
  if(role()==='driver') return [['home','Home','🏠'],['create','Post','➕'],['trip','Trip','🚦'],['requests','Requests','📩'],['history','History','🧾'],['profile','Me','👤']];
  return [['home','Search','🔎'],['bookings','Trips','🎫'],['live','Live','📍'],['history','History','🧾'],['profile','Me','👤']];
}
function render(){
  if(!state.session) return renderAuth();
  const tabs=nav();
  app.innerHTML = `<div class="shell mobileShell"><div class="statusCap"></div><header class="appHeader"><div class="brand"><div class="appIcon">${logo()}</div><div><div class="title">${esc(cfg.appName)}</div><div class="sub">${esc(state.profile?.full_name)} · ${esc(role())}</div></div></div><div class="headerActions"><button class="headerAction" id="refreshBtn">↻</button><button class="headerAction" id="logoutBtn">Logout</button></div></header><main class="content appContent">${view()}</main>${state.modal||''}<nav class="tabs appTabs">${tabs.map(t=>`<button class="tab ${state.tab===t[0]?'active':''}" data-tab="${t[0]}"><span class="tabIcon">${t[2]}</span><span class="tabText">${t[1]}</span></button>`).join('')}</nav></div>`;
  $('#logoutBtn').onclick=()=>supabase.auth.signOut();
  $('#refreshBtn').onclick=()=>refreshAll();
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.modal='';render();});
  bind();
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

function options(){return `<datalist id="routeList">${ROUTES.map(r=>`<option value="${esc(r)}"></option>`).join('')}</datalist>`;}
function compatible(r){ if(!r) return {ok:false,msg:'Ride missing'}; if(r.driver_id===state.session.user.id) return {ok:false,msg:'Own ride'}; if((r.seats_left||0)<=0) return {ok:false,msg:'Full'}; if(r.ride_rule==='male_only'&&state.profile.gender!=='male') return {ok:false,msg:'Male only'}; if(r.ride_rule==='female_only'&&state.profile.gender!=='female') return {ok:false,msg:'Female only'}; if(r.ride_rule==='family_only'&&state.profile.travel_mode!=='family') return {ok:false,msg:'Family only'}; return {ok:true,msg:'Safe match'}; }
function passengerHome(){
  let rides=state.rides.filter(r=>r.driver_id!==state.session.user.id);
  if(state.filters.from) rides=rides.filter(r=>[r.from_city,r.pickup_area,r.via_route].join(' ').toLowerCase().includes(state.filters.from.toLowerCase()));
  if(state.filters.to) rides=rides.filter(r=>[r.to_city,r.dropoff_area,r.via_route].join(' ').toLowerCase().includes(state.filters.to.toLowerCase()));
  if(state.filters.rule==='safe') rides=rides.filter(r=>compatible(r).ok);
  return `${notice()}<div class="screenTitle"><div><div class="h1">Find your seat</div><p class="muted">Search pickup and destination.</p></div><span class="pill green">online</span></div><form id="searchForm" class="card grid"><div class="h2">Search rides</div><label>From / pickup<input id="fFrom" name="from" list="routeList" value="${esc(state.filters.from)}"></label><label>To / dropoff<input id="fTo" name="to" list="routeList" value="${esc(state.filters.to)}"></label><label>Filter<select name="rule"><option value="safe" ${state.filters.rule==='safe'?'selected':''}>Safe match</option><option value="all" ${state.filters.rule==='all'?'selected':''}>All rides</option></select></label>${options()}<button class="btn green">Search rides</button></form>${rides.map(rideCard).join('') || '<div class="empty">No future rides found.</div>'}`;
}
function notice(){ const unread=state.notifications.filter(n=>!n.is_read).slice(0,3); return unread.length?`<div class="card noticeCard"><div class="h2">Notifications</div>${unread.map(n=>`<div class="alert"><b>${esc(n.title)}</b><br>${esc(n.body)}</div>`).join('')}<button class="btn ghost" id="markRead">Mark as read</button></div>`:''; }
function rideCard(r){ const c=compatible(r); const existing=state.bookings.find(b=>b.ride_id===r.id && ['pending','accepted','active'].includes(b.status)); return `<div class="card"><div class="meta"><span class="pill green">Verified driver</span><span class="pill">${r.seats_left} seats</span><span class="pill blue">${fmt(r.departure_at)}</span></div><div class="row" style="margin-top:12px"><div><div class="route">${esc(r.from_city)} → ${esc(r.to_city)}</div><div class="small">${esc(r.pickup_area)} to ${esc(r.dropoff_area)}</div></div><div class="fare">${money(r.price_per_seat)}</div></div><div class="small muted">${esc(r.via_route||'')}</div><div class="line"></div><div class="grid2"><button class="btn ghost" data-details="${r.id}">Details</button><button class="btn green" data-book="${r.id}" ${!c.ok||existing?'disabled':''}>${existing?'Requested':'Request seat'}</button></div></div>`; }
function bookingsView(){ const rows=state.bookings.map(b=>`<div class="card"><div class="row"><div><div class="route">${esc(b.from_city)} → ${esc(b.to_city)}</div><div class="small">${fmt(b.departure_at)} · Driver: ${esc(b.driver_name)}</div></div><span class="pill ${b.status==='accepted'||b.status==='active'?'green':b.status==='pending'?'warn':'bad'}">${esc(b.status)}</span></div><div class="line"></div><div class="grid2"><button class="btn ghost" data-contact="${b.id}" ${['accepted','active','completed'].includes(b.status)?'':'disabled'}>Contact</button><button class="btn danger" data-cancel="${b.id}" ${b.status==='pending'?'':'disabled'}>Cancel</button></div></div>`).join(''); return `<div class="screenTitle"><div><div class="h1">My trips</div><p class="muted">Passenger bookings and requests.</p></div></div>${rows||'<div class="empty">No bookings yet.</div>'}`; }
function driverHome(){ const pending=state.requests.filter(b=>b.status==='pending').length; return `<div class="card hero"><div class="h1">Driver home</div><p>${state.profile?.verification_status==='verified'?'You can post rides.':'Complete KYC before public posting.'}</p></div><div class="kpiGrid"><div class="kpi"><b>${state.myRides.length}</b><span class="small">Your rides</span></div><div class="kpi"><b>${pending}</b><span class="small">Seat requests</span></div></div>${state.myRides.map(r=>`<div class="card"><div class="route">${esc(r.from_city)} → ${esc(r.to_city)}</div><div class="small">${fmt(r.departure_at)} · ${esc(r.status)} · ${r.seats_left}/${r.total_seats} seats</div><div class="line"></div><div class="grid2"><button class="btn ghost" data-details="${r.id}">Details</button><button class="btn danger" data-close="${r.id}" ${r.status!=='open'?'disabled':''}>Close</button></div></div>`).join('') || '<div class="empty">No rides posted yet.</div>'}`; }
function createRideView(){ if(role()!=='driver') return '<div class="empty">Only drivers can post rides.</div>'; if(state.profile?.verification_status!=='verified') return '<div class="card"><div class="h1">KYC required</div><p class="muted">Admin approval is required before posting rides.</p></div>'; if(!state.vehicles.length) return '<div class="card"><div class="h1">Add vehicle first</div><p class="muted">Open profile and add your vehicle.</p></div>'; return `<form id="rideForm" class="card grid"><div class="h1">Post a ride</div><label>Vehicle<select name="vehicle_id">${state.vehicles.map(v=>`<option value="${v.id}">${esc(v.car_model)} · ${esc(v.plate_number)}</option>`).join('')}</select></label><label>From city<input name="from_city" list="routeList" required></label><label>To city<input name="to_city" list="routeList" required></label><label>Pickup area<input name="pickup_area" list="routeList" required></label><label>Dropoff area<input name="dropoff_area" list="routeList" required></label><label>Via route<input name="via_route"></label><div class="grid2"><label>Departure<input name="departure_at" type="datetime-local" required></label><label>Seats<input name="total_seats" type="number" min="1" max="6" value="1"></label></div><div class="grid2"><label>Fare<input name="price_per_seat" type="number" min="0" value="300"></label><label>Rule<select name="ride_rule"><option value="mixed">Mixed</option><option value="male_only">Male only</option><option value="female_only">Female only</option><option value="family_only">Family only</option></select></label></div><label>Notes<textarea name="notes"></textarea></label>${options()}<button class="btn green">Publish ride</button></form>`; }
function requestsView(){ return `<div class="card"><div class="h2">Passenger requests</div></div>${state.requests.map(b=>`<div class="card"><div class="row"><div><div class="route">${esc(b.passenger_name)}</div><div class="small">${esc(b.from_city)} → ${esc(b.to_city)}<br>${esc(b.note||'')}</div></div><span class="pill ${b.status==='pending'?'warn':'green'}">${esc(b.status)}</span></div><div class="line"></div><div class="grid2"><button class="btn green" data-accept="${b.id}" ${b.status!=='pending'?'disabled':''}>Accept</button><button class="btn ghost" data-reject="${b.id}" ${b.status!=='pending'?'disabled':''}>Reject</button></div></div>`).join('') || '<div class="empty">No requests.</div>'}`; }
function driverTripView(){ const active=state.requests.filter(b=>['accepted','active'].includes(b.status)); const ids=[...new Set(active.map(b=>b.ride_id))]; return `<div class="screenTitle"><div><div class="h1">Trip control</div><p class="muted">Start, share location, and complete trips.</p></div></div>${ids.map(id=>{const ride=state.myRides.find(r=>r.id===id)||active.find(b=>b.ride_id===id); const ps=active.filter(b=>b.ride_id===id); return `<div class="card"><div class="route">${esc(ride.from_city)} → ${esc(ride.to_city)}</div><div class="small">${ps.length} accepted passengers</div><div class="line"></div>${ps.map(p=>`<div class="row passengerLine"><span>${esc(p.passenger_name)}<br><span class="small">${esc(p.note||'')}</span></span><span class="pill">${esc(p.status)}</span></div>`).join('')}<div class="grid"><button class="btn green" data-start-all="${id}">Start ride</button><button class="btn ghost" data-share-ride="${id}">Share location</button><button class="btn danger" data-end-all="${id}">End ride</button></div></div>`}).join('') || '<div class="empty">No accepted passengers yet.</div>'}`; }
function latestLoc(b){ return state.locations.find(l=>l.booking_id===b.id && (!b.driver_id || l.user_id===b.driver_id)); }
function liveView(){ const b=state.bookings.find(x=>['accepted','active'].includes(x.status)) || state.requests.find(x=>['accepted','active'].includes(x.status)); if(!b) return '<div class="empty">No active trip yet.</div>'; const loc=latestLoc(b); const map=loc?`https://www.google.com/maps?q=${loc.lat},${loc.lng}`:''; return `<div class="screenTitle"><div><div class="h1">Live trip</div><p class="muted">${esc(b.from_city)} → ${esc(b.to_city)}</p></div></div><div class="nativeMapCard"><div class="mapBlank"><div class="mapPin">📍</div><div><b>${loc?'Location available':'Waiting for location'}</b><br><span>${loc?fmt(loc.created_at):'Driver/passenger has not shared GPS yet.'}</span></div></div>${loc?`<a class="btn green mapBtn" href="${map}" target="_blank">Open map</a>`:''}</div><div class="card grid"><button class="btn green" id="shareLocationBtn">Share my location</button><button class="btn danger" onclick="location.href='tel:15'">Emergency SOS</button></div>`; }
function historyView(){ return `<div class="card"><div class="h1">Trip history</div></div>${state.history.map(h=>`<div class="card"><div class="meta"><span class="pill ${h.status==='completed'?'green':'warn'}">${esc(h.status)}</span><span class="pill">${fmt(h.created_at)}</span></div><div class="route">${esc(h.from_city)} → ${esc(h.to_city)}</div><div class="small">${esc(h.other_party||'')} · ${money(h.price_per_seat)}</div><div class="line"></div><button class="btn ghost" data-rate="${h.id}" ${h.status==='completed'?'':'disabled'}>Rate driver</button></div>`).join('') || '<div class="empty">No history yet.</div>'}`; }
function profileView(){ const p=state.profile||{}, pp=state.privateProfile||{}; const driver=role()==='driver'; return `<div class="card"><div class="h1">Profile</div><form id="profileForm" class="grid"><label>Name<input name="full_name" value="${esc(p.full_name)}" required></label><div class="grid2"><label>Gender<select name="gender"><option value="male" ${p.gender==='male'?'selected':''}>Male</option><option value="female" ${p.gender==='female'?'selected':''}>Female</option></select></label><label>Travel<select name="travel_mode"><option value="solo" ${p.travel_mode==='solo'?'selected':''}>Solo</option><option value="family" ${p.travel_mode==='family'?'selected':''}>Family</option></select></label></div><label>Phone<input name="phone" value="${esc(pp.phone||'')}" required></label><label>Emergency<input name="emergency_contact" value="${esc(pp.emergency_contact||'')}"></label><button class="btn green">Save profile</button></form><button class="btn ghost" style="margin-top:10px" onclick="resetLocalApp()">Reset local app data</button></div>${driver?driverProfileExtra():''}`; }
function driverProfileExtra(){ const docs=['cnic_front','cnic_back','license','vehicle_registration','selfie']; return `<div class="card"><div class="h2">Driver verification</div><span class="pill ${state.profile?.verification_status==='verified'?'green':'warn'}">${esc(state.profile?.verification_status||'unverified')}</span><div class="line"></div>${docs.map(t=>`<div class="row"><span>${esc(t.replaceAll('_',' '))}</span><span class="pill">${esc(state.docs.find(d=>d.doc_type===t)?.status||'missing')}</span></div>`).join('')}<div class="line"></div><form id="docForm" class="grid"><label>Document<select name="doc_type">${docs.map(d=>`<option value="${d}">${esc(d.replaceAll('_',' '))}</option>`).join('')}</select></label><label>Image<input name="file" type="file" accept="image/*" required></label><button class="btn green">Upload document</button></form></div><div class="card"><div class="h2">Vehicles</div>${state.vehicles.map(v=>`<div class="row"><span>${esc(v.car_model)} · ${esc(v.plate_number)}</span><span class="pill">${v.is_verified?'verified':'pending'}</span></div>`).join('')||'<p class="small muted">No vehicle added.</p>'}<div class="line"></div><form id="vehicleForm" class="grid"><label>Car model<input name="car_model" required></label><label>Plate number<input name="plate_number" required></label><label>Color<input name="color"></label><button class="btn green">Add vehicle</button></form></div>`; }
function adminView(){ if(state.tab==='kyc') return `<div class="card"><div class="h1">Driver KYC</div></div>${state.users.filter(u=>u.role==='driver').map(u=>`<div class="card"><div class="route">${esc(u.full_name)}</div><div class="small">${esc(u.id)}</div><span class="pill">${esc(u.verification_status)}</span><div class="line"></div><div class="grid2"><button class="btn green" data-driver-verify="${u.id}">Verify</button><button class="btn ghost" data-driver-unverify="${u.id}">Unverify</button></div></div>`).join('')}`; if(state.tab==='adminRides') return `<div class="card"><div class="h1">Rides</div></div>${state.rides.concat(state.myRides).map(rideCard).join('')}`; if(state.tab==='reports') return `<div class="card"><div class="h1">Reports</div></div>${state.reports.map(r=>`<div class="card"><b>${esc(r.report_type)}</b><p>${esc(r.details)}</p></div>`).join('')||'<div class="empty">No reports.</div>'}`; if(state.tab==='profile') return profileView(); return `<div class="card hero"><div class="h1">Admin</div><p>Manage users, KYC, rides and safety reports.</p></div><div class="kpiGrid"><div class="kpi"><b>${state.users.length}</b><span class="small">Users</span></div><div class="kpi"><b>${state.rides.length}</b><span class="small">Open rides</span></div></div>`; }

function bind(){
  const sf=$('#searchForm'); if(sf) sf.onsubmit=async e=>{e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); state.filters={from:f.from||'',to:f.to||'',rule:f.rule||'safe'}; try{ const {data,error}=await supabase.rpc('search_rides_v2',{p_from:state.filters.from||null,p_to:state.filters.to||null,p_limit:100}); if(!error) state.rides=data||[]; }catch{} render(); };
  const rf=$('#rideForm'); if(rf) rf.onsubmit=createRide;
  const pf=$('#profileForm'); if(pf) pf.onsubmit=saveProfile;
  const vf=$('#vehicleForm'); if(vf) vf.onsubmit=addVehicle;
  const df=$('#docForm'); if(df) df.onsubmit=submitDoc;
  const mr=$('#markRead'); if(mr) mr.onclick=markNotificationsRead;
  const sl=$('#shareLocationBtn'); if(sl) sl.onclick=shareLocation;
  const close=$('#modalClose'); if(close) close.onclick=()=>{state.modal='';render();};
  const book=$('#bookRideForm'); if(book) book.onsubmit=submitBooking;
  const rating=$('#ratingForm'); if(rating) rating.onsubmit=submitRating;
  document.querySelectorAll('[data-details]').forEach(b=>b.onclick=()=>showRideDetails(b.dataset.details));
  document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>openBookingModal(b.dataset.book));
  document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>rpc('cancel_booking_request',{p_booking_id:b.dataset.cancel,p_reason:'Cancelled by passenger'}));
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>rpc('close_ride',{p_ride_id:b.dataset.close}));
  document.querySelectorAll('[data-accept]').forEach(b=>b.onclick=()=>rpc('accept_booking_request',{p_booking_id:b.dataset.accept}));
  document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>rpc('reject_booking_request',{p_booking_id:b.dataset.reject,p_reason:'Rejected by driver'}));
  document.querySelectorAll('[data-start-all]').forEach(b=>b.onclick=()=>rpc('start_ride_for_passengers',{p_ride_id:b.dataset.startAll}));
  document.querySelectorAll('[data-end-all]').forEach(b=>b.onclick=()=>rpc('end_ride_for_passengers',{p_ride_id:b.dataset.endAll}));
  document.querySelectorAll('[data-share-ride]').forEach(b=>b.onclick=()=>shareDriverLocationForRide(b.dataset.shareRide));
  document.querySelectorAll('[data-contact]').forEach(b=>b.onclick=()=>getContact(b.dataset.contact));
  document.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>openRatingModal(b.dataset.rate));
  document.querySelectorAll('[data-driver-verify]').forEach(b=>b.onclick=()=>rpc('admin_set_driver_verified',{p_user_id:b.dataset.driverVerify,p_verified:true}));
  document.querySelectorAll('[data-driver-unverify]').forEach(b=>b.onclick=()=>rpc('admin_set_driver_verified',{p_user_id:b.dataset.driverUnverify,p_verified:false}));
}
async function rpc(fn,args){ if(state.loading) return; state.loading=true; const {error}=await supabase.rpc(fn,args); state.loading=false; if(error) toast(error.message); else {toast('Updated'); await refreshAll();} }
async function createRide(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); if(new Date(f.departure_at)<=new Date()) return toast('Departure time must be in future'); const {error}=await supabase.rpc('create_ride_v2',{p_vehicle_id:f.vehicle_id,p_from_city:f.from_city,p_to_city:f.to_city,p_pickup_area:f.pickup_area,p_dropoff_area:f.dropoff_area,p_via_route:f.via_route||null,p_departure_at:new Date(f.departure_at).toISOString(),p_total_seats:+f.total_seats,p_price_per_seat:+f.price_per_seat,p_ride_rule:f.ride_rule,p_trip_type:'one_way',p_recurrence_type:'once',p_recurrence_days:null,p_allow_monthly_booking:false,p_monthly_price:null,p_notes:f.notes||null}); if(error) toast(error.message); else {toast('Ride posted'); state.tab='home'; await refreshAll();} }
function openBookingModal(id){ const r=state.rides.find(x=>x.id===id)||state.myRides.find(x=>x.id===id); if(!r) return toast('Ride not found'); const c=compatible(r); state.modal=`<div class="modalBack"><div class="modal"><button class="btn ghost" id="modalClose">Close</button><div class="h1">Request seat</div><p class="muted">${esc(r.from_city)} → ${esc(r.to_city)}</p><form id="bookRideForm" class="grid"><input type="hidden" name="ride_id" value="${esc(id)}"><label>Your pickup point<input name="requested_pickup" list="routeList"></label><label>Note<textarea name="note"></textarea></label>${options()}<button class="btn green" ${!c.ok?'disabled':''}>${c.ok?'Send request':esc(c.msg)}</button></form></div></div>`; render(); }
async function submitBooking(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const note=[f.requested_pickup?`Requested pickup: ${f.requested_pickup}`:'',f.note||''].filter(Boolean).join(' | ')||null; const {error}=await supabase.rpc('create_booking_request_v2',{p_ride_id:f.ride_id,p_seats_requested:1,p_note:note}); if(error) toast(error.message); else {state.modal=''; toast('Request sent'); await refreshAll();} }
async function saveProfile(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const [a,b]=await Promise.all([supabase.from('profiles').update({full_name:f.full_name,gender:f.gender,travel_mode:f.travel_mode}).eq('id',state.session.user.id),supabase.from('private_profiles').update({phone:f.phone,emergency_contact:f.emergency_contact||null}).eq('user_id',state.session.user.id)]); if(a.error||b.error) toast(a.error?.message||b.error?.message); else {toast('Profile saved'); await refreshAll();} }
async function addVehicle(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const {error}=await supabase.from('vehicles').insert({owner_id:state.session.user.id,car_model:f.car_model,plate_number:f.plate_number,color:f.color||null}); if(error) toast(error.message); else {toast('Vehicle added'); await refreshAll();} }
async function submitDoc(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const file=e.target.querySelector('input[name="file"]')?.files?.[0]; if(!file) return toast('Select image'); const path=`${state.session.user.id}/${f.doc_type}-${Date.now()}-${file.name}`; const up=await supabase.storage.from('kyc-documents').upload(path,file,{upsert:true,contentType:file.type}); if(up.error) return toast(up.error.message); const {data}=supabase.storage.from('kyc-documents').getPublicUrl(path); const {error}=await supabase.from('driver_documents').insert({user_id:state.session.user.id,doc_type:f.doc_type,file_url:data.publicUrl,status:'pending'}); if(error) toast(error.message); else {toast('Document uploaded'); await refreshAll();} }
async function getContact(id){ const {data,error}=await supabase.rpc('get_booking_contact',{p_booking_id:id}); if(error) toast(error.message); else alert(`Contact: ${data.full_name}\nPhone: ${data.phone}\nEmergency: ${data.emergency_contact||'Not added'}`); }
function openRatingModal(id){ state.modal=`<div class="modalBack"><div class="modal"><button class="btn ghost" id="modalClose">Close</button><div class="h1">Rate driver</div><form id="ratingForm" class="grid"><input type="hidden" name="history_id" value="${esc(id)}"><label>Rating<select name="rating"><option value="5">5 Excellent</option><option value="4">4 Good</option><option value="3">3 Average</option><option value="2">2 Poor</option><option value="1">1 Bad</option></select></label><label>Review<textarea name="review_text"></textarea></label><button class="btn green">Submit rating</button></form></div></div>`; render(); }
async function submitRating(e){ e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const {error}=await supabase.rpc('submit_driver_rating',{p_history_id:f.history_id,p_rating:+f.rating,p_review_text:f.review_text||null}); if(error) toast(error.message); else {state.modal=''; toast('Rating submitted'); await refreshAll();} }
async function markNotificationsRead(){ const ids=state.notifications.filter(n=>!n.is_read).map(n=>n.id); if(!ids.length) return; const {error}=await supabase.from('notifications').update({is_read:true}).in('id',ids); if(error) toast(error.message); else await refreshAll(); }
async function shareDriverLocationForRide(rideId){ const passengers=state.requests.filter(b=>b.ride_id===rideId && ['accepted','active'].includes(b.status)); if(!passengers.length) return toast('No accepted passengers'); saveGeo(passengers.map(b=>b.id)); }
async function shareLocation(){ const active=state.bookings.find(b=>['accepted','active'].includes(b.status))||state.requests.find(b=>['accepted','active'].includes(b.status)); if(!active) return toast('No active trip'); saveGeo([active.id]); }
function saveGeo(bookingIds){ if(!navigator.geolocation) return toast('Location not supported'); navigator.geolocation.getCurrentPosition(async pos=>{ const rows=bookingIds.map(id=>({booking_id:id,user_id:state.session.user.id,lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy})); const {error}=await supabase.from('trip_locations').insert(rows); if(error) toast(error.message); else {toast('Location shared'); await refreshAll();}},()=>toast('Location permission denied'),{enableHighAccuracy:true,timeout:10000}); }
function showRideDetails(id){ const r=state.rides.find(x=>x.id===id)||state.myRides.find(x=>x.id===id); if(!r) return toast('Ride not found'); state.modal=`<div class="modalBack"><div class="modal"><button class="btn ghost" id="modalClose">Close</button><div class="h1">${esc(r.from_city)} → ${esc(r.to_city)}</div><p class="muted">${fmt(r.departure_at)}</p><div class="card" style="box-shadow:none"><div class="row"><span>Pickup</span><b>${esc(r.pickup_area)}</b></div><div class="row"><span>Dropoff</span><b>${esc(r.dropoff_area)}</b></div><div class="row"><span>Seats</span><b>${r.seats_left}/${r.total_seats}</b></div><div class="row"><span>Fare</span><b>${money(r.price_per_seat)}</b></div><div class="row"><span>Driver</span><b>${esc(r.driver_name||'')}</b></div></div>${role()==='passenger'?`<button class="btn green" data-book="${r.id}">Request seat</button>`:''}</div></div>`; render(); }

setInterval(()=>{ if(state.session && document.visibilityState==='visible') refreshAll(); }, 60000);
