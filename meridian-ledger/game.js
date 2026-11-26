// The Meridian Ledger — game engine and interface.
'use strict';
const KEY = 'meridian-ledger-save-v1';
const DEADLINE = 1080;            // three years of 360 days
const START_DEBT = 30000;
const WAGE = 0.8;                 // crowns per sailor per day
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('en-US');
const rand = (a,b) => a + Math.random()*(b-a);
const randi = (a,b) => Math.floor(rand(a,b+1));
const pick = a => a[Math.floor(Math.random()*a.length)];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

let S = null;          // the whole game state, saved to browser storage
let TAB = 'market';
let paused = false;    // a letter or event is open
let lastTick = 0;

// ───────────────────────── state ─────────────────────────
function newGame(name){
  const markets = {};
  for(const p of WORLD.ports){
    markets[p.id] = {};
    for(const g of WORLD.goods){
      const t = target(p,g.id);
      markets[p.id][g.id] = {stock: Math.round(t*rand(.75,1.2)), bias: rand(.9,1.12)};
    }
  }
  return {
    v:1, name: name || 'Marrow', day:0, port:'aub', coins:1400, debt:START_DEBT, rate:.02,
    ship:{type:'patience', name:'Patience', hull:100, guns:4, crew:14, cargo:{}},
    markets, mods:[], seen:{}, flags:{}, codex:['foundering','charter','corvane','goods'],
    quests:{}, log:[], voyage:null, over:null, stats:{trades:0, profit:0, voyages:0, pirates:0},
    nextMod: 6, paidSinceStart:0
  };
}
function target(p,gid){ return p.produce.includes(gid) ? 260 : p.demand.includes(gid) ? 48 : 110; }
function mult(p,gid){ return p.produce.includes(gid) ? .55 : p.demand.includes(gid) ? 1.75 : 1.0; }
function modFor(pid,gid){ let m=1; for(const x of S.mods) if(x.port===pid&&x.good===gid&&x.until>S.day) m*=x.mult; return m; }
function price(pid,gid){
  const p=WORLD.portById[pid], g=WORLD.goodById[gid], m=S.markets[pid][gid];
  const scarcity = clamp(Math.pow(target(p,gid)/Math.max(4,m.stock), .55), .5, 2.3);
  return Math.max(2, g.base*mult(p,gid)*m.bias*scarcity*modFor(pid,gid));
}
const buyPrice = (pid,gid) => Math.ceil(price(pid,gid)*1.05);
const sellPrice = (pid,gid) => Math.floor(price(pid,gid)*.95);

const shipDef = () => WORLD.shipById[S.ship.type];
const cargoUsed = () => Object.values(S.ship.cargo).reduce((a,c)=>a+c.q,0);
const cargoSpace = () => shipDef().cargo - cargoUsed();
function cargoValue(pid){ let v=0; for(const [gid,c] of Object.entries(S.ship.cargo)) v+=c.q*(pid?sellPrice(pid,gid):WORLD.goodById[gid].base); return v; }
function netWorth(){ return S.coins + cargoValue() + shipDef().cost*.5 - S.debt; }
function dateStr(d){ d = d ?? S.day; const m=Math.floor(d/30)%12, y=1743+Math.floor((d+60)/360), dd=d%30+1; return `${dd} ${WORLD.months[(m+2)%12]} ${y}`; }
function daysLeft(){ return DEADLINE - S.day; }
function addCargo(gid,q,cost){ const c=S.ship.cargo[gid]||{q:0,cost:0}; c.cost=(c.cost*c.q+cost*q)/(c.q+q); c.q+=q; S.ship.cargo[gid]=c; }
function removeCargo(gid,q){ const c=S.ship.cargo[gid]; if(!c) return 0; const n=Math.min(q,c.q); c.q-=n; if(c.q<=0) delete S.ship.cargo[gid]; return n; }
function unlock(id){ if(!S.codex.includes(id)){ S.codex.push(id); const e=WORLD.codex.find(c=>c.id===id); if(e) log(`New journal entry: ${e.title}.`,'story'); } }
function unlockBy(trigger){ for(const e of WORLD.codex) if(e.unlock===trigger) unlock(e.id); }

function log(text, cls){ S.log.unshift({d:S.day, t:text, c:cls||''}); if(S.log.length>80) S.log.length=80; renderLog(); }
function remember(pid){ S.seen[pid] = {day:S.day, p:Object.fromEntries(WORLD.goods.map(g=>[g.id,[buyPrice(pid,g.id),sellPrice(pid,g.id)]]))}; }

// ───────────────────────── time ─────────────────────────
function passDay(){
  S.day++;
  for(const p of WORLD.ports) for(const g of WORLD.goods){ const m=S.markets[p.id][g.id], t=target(p,g.id); m.stock += (t-m.stock)*.035 + rand(-1.5,1.5); m.stock=Math.max(3,m.stock); }
  S.mods = S.mods.filter(x=>x.until>S.day);
  if(S.day >= S.nextMod){ spawnMod(); S.nextMod = S.day + randi(12,22); }
  // wages accrue at sea and are paid when the ship makes port
  S.wages = (S.wages||0) + S.ship.crew*WAGE;
  // monthly interest
  if(S.day % 30 === 0 && S.debt>0){ const i=Math.round(S.debt*S.rate); S.debt += i; log(`The Corvane Company added ${fmt(i)} crowns of interest. You owe ${fmt(S.debt)}.`,'bad'); }
  storyClock();
  if(S.day >= DEADLINE && S.debt > 0 && !S.over) endGame('seized');
}

const MOD_TEMPLATES = [
  {port:'qas',good:'musket',m:2.3,t:'Skirmishes on the Qasreen frontier. The Sultana\'s agents are buying muskets at any price.'},
  {port:'hal',good:'rum',m:2.0,t:'The Feast of Lamps comes to Halveny. Every tavern in the glass city wants rum.'},
  {port:'cen',good:'tinct',m:2.4,t:'Grey fever in Port Cendre. Orrin\'s Tincture is worth its weight in silver there.'},
  {port:'aub',good:'silk',m:2.0,t:'Princess Celeste weds at Aubergard. The court has ordered moonsilk by the shipload.'},
  {port:'cen',good:'leaf',m:2.1,t:'Leaf-rot on the Ember plantations. Emberleaf has turned scarce in Port Cendre.'},
  {port:'ska',good:'sugar',m:.5,t:'A Hollen convoy dumped its sugar at Skarnholt. Nobody there will pay for more.'},
  {port:'vri',good:'timber',m:2.0,t:'Vrijhaven\'s admiralty is refitting the fleet. Timber is wanted even there.'},
  {port:'orr',good:'cod',m:2.2,t:'A Valcairean squadron provisions at Saint Orrin\'s Light. Salt cod sells dear.'},
  {port:'qas',good:'porc',m:2.0,t:'The Mirror Palace holds its porcelain exhibition. Collectors are paying absurd sums.'},
  {port:'qas',good:'pepper',m:2.3,t:'The ashpepper harvest failed on the Qasreen terraces.'},
  {port:'hal',good:'silk',m:2.3,t:'A moth blight in Halveny\'s towers. Moonsilk is suddenly rare at the source.'},
  {port:'blk',good:'porc',m:.45,t:'The Brotherhood took a Company convoy. Blackwater is drowning in cheap porcelain.'},
  {port:'ska',good:'kaff',m:2.2,t:'The jarls have taken to kaff over mead. Skarnholt cannot get enough of it.'},
  {port:'vri',good:'pepper',m:2.1,t:'Speculators on the Vrijhaven bourse are cornering ashpepper.'},
  {port:'aub',good:'kaff',m:.55,t:'A Company Indiaman unloaded a year\'s kaff at Aubergard. The price has collapsed.'},
  {port:'blk',good:'musket',m:2.2,t:'Mother Kesh is arming the Brotherhood. Blackwater wants every musket afloat.'},
  {port:'orr',good:'indigo',m:2.0,t:'The Scriptorium is illuminating a new psalter. The monks need indigo for their inks.'},
  {port:'cen',good:'timber',m:2.2,t:'Mount Cendre rumbled and shook down half the warehouses. Port Cendre needs timber.'}
];
function spawnMod(){
  const opts = MOD_TEMPLATES.filter(t=>!S.mods.some(m=>m.port===t.port&&m.good===t.good));
  const t = pick(opts); if(!t) return;
  S.mods.push({port:t.port, good:t.good, mult:t.m, until:S.day+randi(30,55), text:t.t, heard:false});
}

// ───────────────────────── trading ─────────────────────────
function buy(gid,q){
  const pid=S.port, m=S.markets[pid][gid];
  q = Math.min(q, cargoSpace(), Math.floor(m.stock-2));
  let spent=0, n=0;
  while(n<q){ const bp=buyPrice(pid,gid); if(S.coins<bp) break; S.coins-=bp; spent+=bp; m.stock-=1; n++; }
  if(n>0){ addCargo(gid,n,spent/n); S.stats.trades++; sfx('coin'); log(`Bought ${n} ${WORLD.goodById[gid].name} for ${fmt(spent)} crowns.`); }
  remember(pid); render(); save();
}
function sell(gid,q){
  const pid=S.port, m=S.markets[pid][gid], c=S.ship.cargo[gid]; if(!c) return;
  q=Math.min(q,c.q); let got=0;
  for(let i=0;i<q;i++){ const sp=sellPrice(pid,gid); got+=sp; m.stock+=1; }
  const profit = got - c.cost*q;
  removeCargo(gid,q); S.coins+=got; S.stats.trades++; S.stats.profit+=profit; sfx('coin');
  log(`Sold ${q} ${WORLD.goodById[gid].name} for ${fmt(got)} crowns (${profit>=0?'profit':'loss'} of ${fmt(Math.abs(profit))}).`, profit>=0?'good':'bad');
  questDelivery(); remember(pid); render(); save();
}
// how many can be bought before price passes the limit, used for the max button
function maxBuy(gid){
  const pid=S.port, m=S.markets[pid][gid], saved=m.stock; let coins=S.coins, n=0, cap=Math.min(cargoSpace(),Math.floor(m.stock-2));
  while(n<cap){ const bp=buyPrice(pid,gid); if(coins<bp) break; coins-=bp; m.stock-=1; n++; }
  m.stock=saved; return n;
}

// ───────────────────────── voyages ─────────────────────────
function voyageDays(to){ return CHART.travelDays(S.port,to,shipDef().speed); }
function routeHazard(from,to){
  const a=WORLD.portById[from], b=to==='ys'?WORLD.spires:WORLD.portById[to]; const r={pirate:0,storm:0,fog:0};
  for(let i=0;i<=10;i++){ const u=i/10, x=a.x+(b.x-a.x)*u, y=a.y+(b.y-a.y)*u;
    for(const h of WORLD.hazards){ const d=Math.hypot(h.x-x,h.y-y); if(d<h.r) r[h.kind]=Math.max(r[h.kind],(1-d/h.r)*h.w); } }
  return r;
}
function hazardWords(h){ const w=[]; if(h.pirate>.25) w.push(h.pirate>.6?'pirate-haunted':'pirates about'); if(h.storm>.25) w.push(h.storm>.6?'storm-tossed':'squally'); if(h.fog>.2) w.push('fogbound'); return w.length?w.join(', '):'fair waters'; }

function setSail(to){
  if(S.over||S.voyage) return;
  if(S.ship.crew < Math.ceil(shipDef().crew*.6)) return toast(`Too few hands. The ${shipDef().name} needs at least ${Math.ceil(shipDef().crew*.6)} crew to sail.`);
  const days=voyageDays(to);
  S.voyage={from:S.port,to,days,elapsed:0,progress:0,haz:routeHazard(S.port,to),acc:0};
  S.stats.voyages++;
  log(`Weighed anchor at ${WORLD.portById[S.port].name}, bound for ${to==='ys'?'Ys Morrow':WORLD.portById[to].name}. ${days} days at sea.`);
  sfx('bell'); TAB='market'; render(); save();
}
const DAY_MS = 380;
function tickVoyage(dt){
  const v=S.voyage; if(!v||paused) return;
  v.acc += dt;
  v.progress = Math.min(1,(v.elapsed + Math.min(1,v.acc/DAY_MS))/v.days);
  if(v.acc >= DAY_MS){
    v.acc=0; v.elapsed++; passDay(); if(S.over) return;
    if(v.elapsed>=v.days){ arrive(); return; }
    rollSeaEvent();
    renderStats();
    if(v.elapsed%3===0) save();
  }
  $('voyage').hidden=false;
  $('voyTxt').textContent=`Bound for ${v.to==='ys'?'Ys Morrow':WORLD.portById[v.to].name} · day ${v.elapsed+1} of ${v.days}`;
  $('voyBar').style.width=(v.progress*100)+'%';
}
function payWages(){
  const w=Math.round(S.wages||0); S.wages=0; if(w<=0) return;
  if(S.coins>=w){ S.coins-=w; log(`Paid the crew ${fmt(w)} crowns in wages.`); return; }
  const short=w-S.coins, gone=Math.min(S.ship.crew-2, Math.ceil(short/40));
  S.coins=0; if(gone>0){ S.ship.crew-=gone; log(`You could not pay the crew in full. ${gone} sailor${gone>1?'s':''} took their sea-chests and walked off down the quay.`,'bad'); }
}
function arrive(){
  const v=S.voyage; S.voyage=null; $('voyage').hidden=true;
  if(v.to==='ys'){ S.port=v.from; spiresDive(); return; }
  S.port=v.to; const p=WORLD.portById[S.port];
  log(`Dropped anchor at ${p.name}.`,'good'); sfx('bell');
  payWages();
  unlockBy('port:'+p.id); remember(p.id);
  storyArrival(p.id);
  render(); save();
}

// ───────────────────────── sea events ─────────────────────────
function rollSeaEvent(){
  const h=S.voyage.haz, r=Math.random();
  const pPirate = .012 + h.pirate*.09, pStorm = .01 + h.storm*.08, pOther = .035;
  if(r < pPirate) return evPirates();
  if(r < pPirate+pStorm) return evStorm();
  if(r < pPirate+pStorm+pOther) return pick([evFlotsam,evCustoms,evBecalmed,evFever,evTrader,evWhale,evLight])();
}
function damage(n){
  S.ship.hull -= n; if(S.ship.hull<=0 && !S.over){ S.ship.hull=0; endGame('sunk'); return true; } return false;
}
function loseCargoFrac(f){ const lost=[]; for(const gid of Object.keys(S.ship.cargo)){ const n=Math.ceil(S.ship.cargo[gid].q*f); if(n>0){ removeCargo(gid,n); lost.push(`${n} ${WORLD.goodById[gid].name}`);} } return lost.length?lost.join(', '):'nothing of note'; }

function evPirates(){
  const strength = randi(4,12) + Math.floor(S.day/120);
  const flagName = pick(['the Brotherhood of Brack','a Skarn raider','a Qasreen corsair','an unflagged brigantine','the infamous Red Wren']);
  const tribute = Math.max(150, Math.round((S.coins*.15 + cargoValue()*.1)/10)*10);
  const runChance = clamp(.35 + (shipDef().speed-1)*1.1 - strength*.01, .1, .9);
  const fightChance = clamp(.5 + (S.ship.guns - strength)*.05 + (S.ship.crew/shipDef().crew-1)*.2, .08, .93);
  showEvent({title:'Sail on the Horizon', seal:'☠', text:[
    `A lookout cries from the tops. ${flagName[0].toUpperCase()+flagName.slice(1)} is bearing down on you with perhaps ${strength} guns run out and a black pennant at the masthead.`,
    `Your ${S.ship.guns} guns are loaded. The crew looks to you.`],
   choices:[
    {label:`Clear for action`, sub:`About ${Math.round(fightChance*100)}% chance to carry the day`, go:()=>{
      sfx('cannon');
      if(Math.random()<fightChance){ const loot=randi(200,700)+strength*60; S.coins+=loot; S.stats.pirates++; const sunk=damage(randi(5,16)); if(sunk) return;
        return result('Victory', `Your broadside shatters their foremast. They strike their colours, and you take ${fmt(loot)} crowns from their strongbox. Hull damage is light.`); }
      const lost=loseCargoFrac(.5); const sunk=damage(randi(18,34)); S.ship.crew=Math.max(2,S.ship.crew-randi(1,4)); if(sunk) return;
      result('Boarded', `They grapple and board. When the smoke clears they have taken ${lost}, and your hull is badly holed.`);
    }},
    {label:`Crowd on sail and run`, sub:`About ${Math.round(runChance*100)}% chance to escape`, go:()=>{
      if(Math.random()<runChance) return result('Escaped', 'You shake out every reef and claw to windward. By nightfall their sails are gone below the horizon.');
      const lost=loseCargoFrac(.35); const sunk=damage(randi(10,24)); if(sunk) return;
      result('Overhauled', `They catch you at dusk. A short, ugly fight costs you ${lost} and a good deal of planking.`);
    }},
    {label:`Pay tribute of ${fmt(tribute)} crowns`, sub: S.coins>=tribute?'They will let you pass':'You cannot afford it', disabled:S.coins<tribute, go:()=>{
      S.coins-=tribute; result('Tribute Paid', 'A boat comes across, the purse goes over, and they sheer off with a mocking salute.');
    }}
  ]});
}
function evStorm(){
  showEvent({title:'Weather Coming', seal:'⚡', text:[
    'The glass is falling fast. To the south the sky has turned the colour of a bruise, and the swell is already heavy under the counter.',
    'The bosun wants to know what you will do.'],
   choices:[
    {label:'Batten down and ride it out', sub:'Hull will suffer', go:()=>{ const d=randi(8,26); if(damage(d)) return; result('Weathered', `A night of screaming rigging and green water across the deck. Dawn finds you afloat, with ${d} points of hull damage.`); }},
    {label:'Jettison deck cargo to stay light', sub:'Lose a share of the hold, spare the hull', go:()=>{ const lost=loseCargoFrac(.25); if(damage(randi(2,8))) return; result('Lightened', `Over the side go ${lost}. The ship rides high and survives with little damage.`); }},
    {label:'Run before the wind', sub:'Adds days to the voyage', go:()=>{ const extra=randi(2,4); S.voyage.days+=extra; if(Math.random()<.3&&damage(randi(4,10))) return; result('Driven Off Course', `You scud before the gale under bare poles. It costs ${extra} days to beat back to your course.`); }}
  ]});
}
function evFlotsam(){
  const g=pick(WORLD.goods.slice(0,9)), q=Math.min(cargoSpace(),randi(3,10));
  if(q>0) addCargo(g.id,q,0);
  showEvent({title:'Flotsam', seal:'⚓', text:[`Floating crates and a shattered spar: some poor ship's misfortune. ${q>0?`Your boat crew hauls aboard ${q} ${g.unit}s of ${g.name}, still sealed.`:'Your hold is too full to take any of it aboard.'}`], choices:[{label:'Carry on', go:close}]});
}
function evCustoms(){
  const muskets=S.ship.cargo.musket?.q||0;
  if(!muskets) return showEvent({title:'Revenue Cutter', seal:'⚜', text:['A Valcairean revenue cutter runs alongside and an officer in a powdered wig inspects your papers. Finding nothing amiss, he wishes you a pleasant voyage and tips his hat.'],choices:[{label:'Carry on',go:close}]});
  const fine=Math.round(muskets*25);
  showEvent({title:'Revenue Cutter', seal:'⚜', text:[`A Valcairean revenue cutter signals you to heave to. The officer finds ${muskets} crates of muskets in your hold and declares them "instruments of rebellion under the Ordinance of 1739".`,'He suggests a fine. His eyes suggest something smaller.'],
   choices:[
    {label:`Pay the fine of ${fmt(fine)} crowns`, disabled:S.coins<fine, go:()=>{S.coins-=fine;result('Fined','He writes a receipt in a beautiful hand and leaves.')}},
    {label:`Slip him a purse of ${fmt(Math.round(fine*.4))}`, sub:'He may be honest', disabled:S.coins<fine*.4, go:()=>{ S.coins-=Math.round(fine*.4); if(Math.random()<.75) return result('Bribed','The purse vanishes into his coat. The muskets, officially, do not exist.'); removeCargo('musket',muskets); result('An Honest Man','Unluckily, he is the one honest officer in the Valcairean revenue service. He keeps the purse and the muskets.'); }},
    {label:'Surrender the muskets', go:()=>{removeCargo('musket',muskets);result('Confiscated','The crates are swung across to the cutter.')}}
   ]});
}
function evBecalmed(){
  const extra=randi(1,3); S.voyage.days+=extra;
  showEvent({title:'Becalmed', seal:'☼', text:[`The wind dies. For ${extra} day${extra>1?'s':''} the sails hang slack and the pitch bubbles in the deck seams. The crew whistles for a breeze; the old hands say that only angers the sea.`],choices:[{label:'Wait for the wind',go:close}]});
}
function evFever(){
  const has=(S.ship.cargo.tinct?.q||0)>0;
  showEvent({title:'Grey Fever', seal:'✚', text:['The grey fever has come aboard. Three men lie in their hammocks, pale and shaking, and the surgeon looks frightened.'],
   choices:[
    {label:'Dose them with Orrin\'s Tincture', sub:has?'Uses one case':'You carry none', disabled:!has, go:()=>{removeCargo('tinct',1);result('Recovered','Within two days all three are back at their stations. The monks of Saint Orrin know their business.')}},
    {label:'Let the surgeon do his best', go:()=>{const n=randi(1,3);S.ship.crew=Math.max(2,S.ship.crew-n);result('Burial at Sea',`${n} of them do not recover. You read the service yourself as they are committed to the deep.`)}}
   ]});
}
function evTrader(){
  const g=pick(WORLD.goods), q=randi(8,20), each=Math.max(2,Math.round(g.base*.65)), total=each*q;
  showEvent({title:'A Passing Merchantman', seal:'⚖', text:[`A Hollen fluyt hails you. Her master has ${q} ${g.unit}s of ${g.name} he would rather not carry further, and offers them at ${each} crowns each.`],
   choices:[
    {label:`Buy them all for ${fmt(total)}`, sub:cargoSpace()<q?'Not enough room in the hold':'', disabled:S.coins<total||cargoSpace()<q, go:()=>{S.coins-=total;addCargo(g.id,q,each);result('Bargain Struck','The crates swing across on a whip from the main yard.')}},
    {label:'Decline politely', go:close}
   ]});
}
function evWhale(){
  showEvent({title:'Whales', seal:'∿', text:['A pod of grey whales surfaces beside the ship, close enough to smell their breath. The Skarn hands pour rum over the side for luck.','You feel, absurdly, that the sea has noticed you.'],choices:[{label:'Watch them go',go:()=>{if(S.ship.hull<shipDef().hull)S.ship.hull=Math.min(shipDef().hull,S.ship.hull+3);close()}}]});
}
function evLight(){
  showEvent({title:'A Light Beneath the Water', seal:'✦', text:['In the middle watch the helmsman calls you on deck. Far below the keel, steady and white, a light is shining up through the black water.','It follows the ship for an hour, then goes out. Nobody speaks of it at breakfast.'],choices:[{label:'Mark it in the log',go:()=>{S.flags.sawLight=true;close()}}]});
}

// ───────────────────────── letters & events ─────────────────────────
const queue = [];
function showEvent(ev){ queue.push(ev); if(!paused) nextModal(); }
function nextModal(){
  const ev=queue.shift(); const root=$('modalRoot');
  if(!ev){ root.innerHTML=''; paused=false; render(); save(); return; }
  paused=true;
  const body=ev.text.map(p=>`<p>${p}</p>`).join(''), drop=ev.text[0].length>140;
  root.innerHTML=`<div class="veil" role="dialog" aria-modal="true" aria-labelledby="lt"><article class="letter">
    ${ev.seal?`<div class="seal-mark" aria-hidden="true">${ev.seal}</div>`:''}
    <h2 id="lt">${ev.title}</h2><div class="dateline">${ev.dateline||(dateStr()+(S.voyage?' · at sea':' · '+WORLD.portById[S.port].name))}</div>
    <div class="body${drop?' drop':''}">${body}</div>
    ${ev.input?`<p><label for="nameIn" class="italic">${ev.input}</label><input id="nameIn" maxlength="24" value="${ev.inputValue||''}" autocomplete="off"></p>`:''}
    <div class="choices">${ev.choices.map((c,i)=>`<button class="btn" type="button" data-ch="${i}" ${c.disabled?'disabled':''}>${c.label}${c.sub?`<small>${c.sub}</small>`:''}</button>`).join('')}</div>
  </article></div>`;
  root.querySelectorAll('[data-ch]').forEach(b=>b.onclick=()=>{ const c=ev.choices[+b.dataset.ch]; root.innerHTML=''; paused=false; c.go&&c.go(); if(!paused) nextModal(); });
  const f=root.querySelector('input')||root.querySelector('button:not([disabled])'); f&&f.focus();
}
function close(){ /* choice handlers call this when nothing follows */ }
function result(title,text){ showEvent({title,text:[text],choices:[{label:'Continue',go:close}]}); }

// ───────────────────────── the story ─────────────────────────
function intro(){
  showEvent({title:'The Meridian Ledger', seal:'M', dateline:'1 Seedmonth 1743 AL · Aubergard', text:[
    'Three hundred years ago the sky fell into the Valley of Aurel and the sea rushed in. The empire drowned in a night. Its crown, the Meridian Diadem, was never found. The nations that grew on its shores have traded, warred and lied across the Mer Ardent ever since.',
    'Your father, Captain Elias Marrow, died last autumn in a rented room in Aubergard. He left you his brig, the Patience, a crew who are owed back wages, and a debt to the Corvane Company that would make a duke blink.',
    'What name will you sign in the ledger?'],
   input:'Your family name', inputValue:'Marrow',
   choices:[{label:'Sign the ledger', go:()=>{ const v=($('nameIn')?.value||'').trim(); S.name=v||'Marrow'; veyLetter(); }}]});
}
function veyLetter(){
  showEvent({title:'From the Desk of Silas Vey', seal:'C', text:[
    `Captain ${S.name},`,
    `Please accept the Company's condolences. Your late father was a colourful man. He was also, at his death, in debt to this house for ${fmt(START_DEBT)} crowns, a debt which passes to you with the vessel.`,
    `The Company is patient. Interest runs at two parts in the hundred each month. The full sum falls due on 1 Seedmonth 1746, three years hence. Should it remain unpaid, the Patience and all she carries become Company property.`,
    'I trust you have your father\'s talent for trade, and not his talent for disappearing.',
    'Your servant, S. Vey, Chief Factor'],
   choices:[{label:'Fold the letter away', go:fatherLetter}]});
}
function fatherLetter(){
  S.flags.letter1=true; unlockBy('story:letter1'); S.quests.chart=1;
  showEvent({title:'A Letter in Your Father\'s Hand', seal:'E', text:[
    'The tavern keeper of the Drowned Lion presses a sealed packet into your hand. "He said to give it to you, if it came to that."',
    '"My dear one. If you are reading this, I ran out of time, and you have inherited my debts. I am sorry. I borrowed that money for a reason, and the reason is not drink, whatever they tell you.',
    'I found the way to Ys. The monks of Saint Orrin copied me a chart of the drowned city, but I had to pawn its pieces to keep the search alive. Go to the Light. Ask for Brother Anselm. And whatever you do, do not let Silas Vey learn what the chart is for."',
    'Below, in a shakier hand: "Trade well. Trust the Light."'],
   choices:[{label:'Set your course for Saint Orrin\'s Light', go:()=>{ log('Your father\'s letter points to Brother Anselm at Saint Orrin\'s Light.','story'); }}]});
}
function fragCount(){ const f=S.quests.frags||{}; return ['orr','blk','aub'].filter(k=>f[k]).length; }
function gainFragment(k, how){
  S.quests.frags=S.quests.frags||{}; S.quests.frags[k]=true; log(`Chart fragment recovered (${fragCount()} of 3): ${how}.`,'story'); sfx('bell');
  if(fragCount()===3){ unlockBy('story:frag3'); S.flags.spires=true; unlockBy('story:spires');
    showEvent({title:'The Meridian Chart', seal:'✦', text:[
      'You lay the three pieces on the chart table. The torn edges meet. Together they show the drowned valley as it was, every street of Ys inked in faded red, and a single safe channel threading east of Saint Orrin\'s Light into the heart of the Spirefog.',
      'At the centre, in your father\'s hand: "The Palace of the Meridian. Vault beneath the lantern tower. The light still burns."',
      'Ys Morrow is now marked on your chart. The fog is no place for a damaged ship.'],
     choices:[{label:'Mark the course', go:close}]});
  }
}
function storyArrival(pid){
  if(pid==='orr' && S.quests.chart===1){ S.quests.chart=2;
    showEvent({title:'Brother Anselm', seal:'✝', text:[
      'The keeper of the Scriptorium is a small man with ink on his fingers and lamp-soot in his eyebrows. He knew your father well.',
      '"Elias commissioned a chart from us: the Meridian Chart, a true map of drowned Ys, copied from the Order\'s oldest scrolls. He could not pay, so he left it in three pieces as pledges. One with us. One he lost at dice to Mother Kesh of Blackwater Cay. The third," and here he lowers his voice, "he gave as collateral to the Corvane Company."',
      '"Our piece I will return gladly, if you can do the brothers a kindness. Winter comes hard on this rock. Bring us fifteen barrels of salt cod."'],
     choices:[{label:'Promise to return with the cod', go:()=>log('Quest: deliver 15 Salt Cod to Brother Anselm at Saint Orrin\'s Light.','story')}]});
  }
  if(S.flags.veyDemandPending){ S.flags.veyDemandPending=false; S.flags.veyDemand=true;
    showEvent({title:'A Reminder from the Company', seal:'C', text:[
      `Captain ${S.name}, the Company notes that a year has passed and the debt has only grown. The directors require a show of good faith.`,
      `Pay at least 6,000 crowns into the Counting-House at Aubergard by ${dateStr(480)}. Otherwise the Company will consider the risk revised, and the rate with it.`,
      'S. Vey'],choices:[{label:'Noted',go:close}]});
  }
  if(S.flags.ratePending){ S.flags.ratePending=false;
    showEvent({title:'The Rate is Revised', seal:'C', text:['The Company regrets that no show of good faith was received. With immediate effect the interest on your account rises by a full part in the hundred each month.','S. Vey'],choices:[{label:'Curse quietly',go:close}]});
  }
}
function storyClock(){
  if(S.day===300 && !S.flags.veyDemand) S.flags.veyDemandPending=true;
  if(S.day===480 && S.flags.veyDemand && S.paidSinceStart<6000 && S.debt>0){ S.rate+=.01; S.flags.ratePending=true; log('The Company raised your interest by a full point a month.','bad'); }
  if(daysLeft()===90 && S.debt>0) log('Ninety days until the Company\'s note falls due.','bad');
  if(daysLeft()===30 && S.debt>0) log('Thirty days until the Company seizes the ship.','bad');
}
function questDelivery(){ /* deliveries are handled by tavern buttons */ }

function spiresDive(){
  sfx('bell');
  const knowsLight=S.flags.sawLight;
  showEvent({title:'Into the Spirefog', seal:'✦', text:[
    'The fog closes behind you like a door. The compass needle swings, steadies, swings again. Black stone towers loom out of the white, close enough to touch, their windows full of seawater.',
    'Somewhere below, a bell rings once. Then you see it: a steady white light under the water, directly ahead.'],
   choices:[
    {label:'Follow the light', sub:knowsLight?'You have seen this light before':'A gamble', go:()=>{ if(knowsLight||Math.random()<.55) return vault(); if(damage(randi(15,30))) return; result('Shoals','The light leads you onto a drowned rooftop. You tear free, badly holed, and the fog parts onto the palace at last.'); showEvent(vaultEv()); }},
    {label:'Sound every fathom by the chart', sub:'Slow but sure. Costs four days.', go:()=>{ for(let i=0;i<4;i++){passDay(); if(S.over) return;} vault(); }},
    {label:'Turn back while you can', go:()=>{ S.port='orr'; payWages(); log('You turned back from the Spirefog and made for Saint Orrin\'s Light.'); render(); }}
   ]});
}
function vaultEv(){ return {title:'The Vault Beneath the Lantern', seal:'♛', text:[
  'Your divers go down on lines into the Palace of the Meridian. They come up white-faced. The lantern tower is still lit, an Aurelian lamp of starglass burning without fuel after three hundred years.',
  'Beneath it, in a sealed bronze coffer, lies the Meridian Diadem: white gold, and at its brow a lens that turns of its own accord to point north.',
  'Wedged beside the coffer is a Valcairean sea-chest, much newer. Inside, wrapped in oilcloth, are your father\'s instruments and a final page: "Vey has guessed. If he takes the Diadem he will sell it to whichever crown will start the war he can finance. Better it stays drowned than that."'],
  choices:[{label:'Bring the Diadem aboard', go:()=>{ S.flags.diadem='carry'; S.port='orr'; payWages(); log('You recovered the Meridian Diadem and brought the Patience\'s people safe to Saint Orrin\'s Light.','story'); remember('orr');
    result('Who Should Hold It?','The Diadem can be given to the Order of Saint Orrin here, sold to King Aurelien at Aubergard, sold to the Sultana at Qasr al-Mira, or handed to Silas Vey for your debt. Every choice changes the sea.'); }}]}; }
function vault(){ showEvent(vaultEv()); }
function diademTo(who){
  S.flags.diadem=who;
  const texts={
    orrin:['Brother Anselm weeps when you lay it on the altar beneath the Great Lamp. "It will be kept here, where no crown can wear it."','The Order pays your debt to the Corvane Company in full from the Scriptorium\'s treasury. Silas Vey is said to have broken a quill in half when the receipt arrived.'],
    crown:['King Aurelien IX receives you in the Hall of Lions and pays 45,000 crowns in gold. The next morning Valcaire claims the eastern shore as its Aurelian inheritance.','Qasreen recalls its ambassador. The price of muskets doubles everywhere. You are rich, and the sea is darker.'],
    sultana:['Sultana Ilsabet holds the Diadem up beneath the Mirror Dome, and the lens swings north towards Valcaire. She pays 40,000 crowns and offers you the freedom of every Qasreen port.','In Aubergard they burn your likeness in the square. In Qasr al-Mira they name a street after you.'],
    vey:['Silas Vey does not smile, quite. He signs the cancellation of your debt in his beautiful hand and locks the Diadem in a strongbox.','Within the month the Company is lending to both Valcaire and Qasreen against the war everyone now expects. You are free. Your father would not be pleased.']};
  if(who==='orrin'){ S.paidSinceStart+=S.debt; S.debt=0; }
  if(who==='crown'){ S.coins+=45000; for(const p of ['qas','blk','cen']) S.mods.push({port:p,good:'musket',mult:2,until:S.day+200,text:'War between Valcaire and Qasreen. Muskets are wanted everywhere.',heard:true}); }
  if(who==='sultana'){ S.coins+=40000; S.mods.push({port:'qas',good:'porc',mult:1.6,until:S.day+300,text:'Qasreen celebrates the Diadem\'s return.',heard:true}); }
  if(who==='vey'){ S.paidSinceStart+=S.debt; S.debt=0; }
  showEvent({title:'The Diadem\'s Fate', seal:'♛', text:texts[who], choices:[{label:'So be it', go:()=>{ log('The Meridian Diadem has a new keeper.','story'); checkFree(); }}]});
}
function checkFree(){
  if(S.debt<=0 && !S.flags.free){ S.flags.free=true; sfx('bell');
    showEvent({title:'Free and Clear', seal:'✓', text:[
      `The clerk of the Counting-House stamps your note PAID and hands back your father's pledge. Captain ${S.name} owes the Corvane Company nothing.`,
      `It is ${dateStr()}. ${daysLeft()>0?`You had ${daysLeft()} days to spare.`:''} You may keep trading to build your fortune, or retire now and see how the chroniclers will remember you.`],
     choices:[{label:'Keep trading',go:close},{label:'Retire to a house on the Quai des Lions',go:()=>endGame('retire')}]});
  }
}
function rankFor(w){ return w<0?'Ruined':w<10000?'A Coasting Trader':w<30000?'A Respectable Merchant':w<70000?'A Merchant Prince':w<150000?'Lord of the Meridian':'Richer Than Crowns'; }
function endGame(kind){
  S.over=kind; S.voyage=null; $('voyage').hidden=true; const w=netWorth();
  const t={
    seized:['The Lion\'s Mouth Closes',[`On ${dateStr()} Company bailiffs board the ${S.ship.name} at first light. Silas Vey watches from the quay with his hands folded. The debt stood at ${fmt(S.debt)} crowns.`,'Your father\'s ship is sold within the week. The chroniclers do not record your name.']],
    sunk:['Lost with All Hands',[`The ${S.ship.name} goes down on ${dateStr()}, her seams opened by one blow too many. The sea that swallowed Aurel takes one more ship without remark.`,'In the Drowned Lion they pour a cup for you, and then forget.']],
    retire:['A House on the Quai',[`Captain ${S.name} retires on ${dateStr()} with a fortune of ${fmt(w)} crowns.`, S.flags.diadem&&S.flags.diadem!=='carry'?'The ballads say you found the Meridian Diadem. The ballads, for once, are right.':'The ballads say you outfoxed the Corvane Company. That is enough for a ballad.']]
  }[kind];
  const rank = kind==='retire'?rankFor(w):'Ruined';
  showEvent({title:t[0], seal:kind==='retire'?'★':'✕', text:[...t[1], `<b>The chronicle remembers you as: ${rank}.</b> ${S.stats.voyages} voyages, ${S.stats.trades} trades, ${S.stats.pirates} pirates beaten, ${fmt(S.stats.profit)} crowns of trading profit.`],
    choices:[{label:'Begin a new chronicle',go:()=>{ S=newGame(); render(); renderLog(); intro(); }}, ...(kind==='retire'?[]:[])]});
  save();
}

// ───────────────────────── interface ─────────────────────────
function renderStats(){
  const d=shipDef();
  $('stats').innerHTML=[
    ['Date',dateStr(),''],['Days left',daysLeft()>0?fmt(daysLeft()):'—',''],
    ['Crowns',fmt(S.coins),'coin'],['Owed',fmt(S.debt),'debt'],
    ['Hull',`${S.ship.hull}/${d.hull}`,''],['Hold',`${cargoUsed()}/${d.cargo}`,''],['Crew',`${S.ship.crew}`,'']
  ].map(([k,v,c])=>`<div class="stat ${c}"><b>${k}</b><span class="num">${v}</span></div>`).join('');
}
function tabsFor(){
  if(S.voyage) return [['sea','At Sea'],['book','Price Book'],['journal','Journal']];
  const p=WORLD.portById[S.port], t=[['market','Market'],['book','Price Book'],['yard',p.yard?'Shipyard':'Chandler'],['tavern','Tavern']];
  if(p.bank) t.push(['bank','Counting-House']);
  t.push(['journal','Journal']); return t;
}
function render(){
  if(!S) return;
  renderStats();
  const tabs=tabsFor(); if(!tabs.some(t=>t[0]===TAB)) TAB=tabs[0][0];
  $('tabs').innerHTML=tabs.map(([id,l])=>`<button role="tab" type="button" aria-selected="${id===TAB}" data-tab="${id}">${l}</button>`).join('');
  if(S.voyage){ const to=S.voyage.to==='ys'?'Ys Morrow':WORLD.portById[S.voyage.to].name;
    $('porthead').innerHTML=`<h2>At Sea</h2><div class="sub">The ${shipDef().name} ${S.ship.name!==shipDef().name?`“${S.ship.name}” `:''}bound for ${to}, ${hazardWords(S.voyage.haz)}</div>`; }
  else { const p=WORLD.portById[S.port], n=WORLD.nations[p.nation];
    $('porthead').innerHTML=`<h2>${p.name}</h2><div class="sub">${n.name}${p.freeport?' · freeport':''}. ${p.desc}</div>`; }
  const pane=$('pane');
  pane.innerHTML = ({market:paneMarket,book:paneBook,yard:paneYard,tavern:paneTavern,bank:paneBank,journal:paneJournal,sea:paneSea}[TAB])();
  wirePane();
}
function hint(pid,gid){ const r=price(pid,gid)/WORLD.goodById[gid].base; return r<.78?'cheap':r>1.3?'dear':''; }
function paneMarket(){
  const pid=S.port, d=shipDef(), used=cargoUsed();
  let rows='';
  for(const g of WORLD.goods){
    const c=S.ship.cargo[g.id], bp=buyPrice(pid,g.id), sp=sellPrice(pid,g.id), h=hint(pid,g.id);
    const tag=h==='cheap'?'<span class="cheap">made here</span>':h==='dear'?'<span class="dear">wanted</span>':'';
    const mod=S.mods.find(m=>m.port===pid&&m.good===g.id&&m.heard);
    rows+=`<tr><td><span class="gname">${g.name}</span> ${tag}<span class="gnote">${mod?mod.text:g.note}</span></td>
      <td class="num ${h}">${bp}</td><td class="num ${h}">${sp}</td>
      <td class="num">${c?`${c.q}<span class="gnote">paid ${Math.round(c.cost)}</span>`:'·'}</td>
      <td><span class="btns"><button class="btn" data-buy="${g.id}" data-q="1" title="Buy 1">+1</button><button class="btn" data-buy="${g.id}" data-q="10" title="Buy 10">+10</button><button class="btn" data-buy="${g.id}" data-q="max" title="Buy as many as you can">Max</button></span></td>
      <td><span class="btns"><button class="btn ghost" data-sell="${g.id}" data-q="1" ${c?'':'disabled'} title="Sell 1">−1</button><button class="btn ghost" data-sell="${g.id}" data-q="all" ${c?'':'disabled'} title="Sell all">All</button></span></td></tr>`;
  }
  return `<div class="hold"><span>Hold <b class="num">${used} / ${d.cargo}</b></span><span>Crowns <b class="num">${fmt(S.coins)}</b></span><span>Cargo worth here <b class="num">${fmt(cargoValue(pid))}</b></span></div>
    <div class="meter"><i style="width:${used/d.cargo*100}%"></i></div>
    <div style="overflow-x:auto;margin-top:8px"><table class="mk"><thead><tr><th>Goods</th><th>Buy</th><th>Sell</th><th>Hold</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted italic">Prices move as you trade: each unit bought raises the price, each sold lowers it. Click a port on the chart to set sail.</p>`;
}
function paneBook(){
  const head=WORLD.ports.map(p=>`<th title="${p.name}">${p.name.split(/[ ']/)[0].slice(0,6)}</th>`).join('');
  let rows='';
  for(const g of WORLD.goods){
    const vals=WORLD.ports.map(p=>{const s=S.seen[p.id];return s?s.p[g.id][1]:null});
    const known=vals.filter(v=>v!=null), hi=Math.max(...known), lo=Math.min(...known);
    rows+=`<tr><td class="gname">${g.name}</td>${vals.map(v=>`<td class="num ${v==null?'muted':v===hi&&known.length>1?'dear':v===lo&&known.length>1?'cheap':''}">${v==null?'?':v}</td>`).join('')}</tr>`;
  }
  const ages=WORLD.ports.map(p=>{const s=S.seen[p.id];return `<td class="num muted">${s?(S.day-s.day)+'d':'—'}</td>`}).join('');
  return `<p class="muted">Selling prices as you last saw them. Green is the lowest known, red the highest. Prices recover toward normal within a few weeks.</p>
   <div style="overflow-x:auto"><table class="mk"><thead><tr><th>Goods</th>${head}</tr></thead><tbody>${rows}<tr><td class="muted italic">seen</td>${ages}</tr></tbody></table></div>`;
}
function paneYard(){
  const p=WORLD.portById[S.port], d=shipDef(), miss=d.hull-S.ship.hull, rp=p.yard?5:9, repairAll=miss*rp, maxCrew=Math.ceil(d.crew*1.25), maxGuns=d.guns+6;
  let out=`<div class="card"><div class="row"><h4>${d.name}${S.ship.name!==d.name?` “${S.ship.name}”`:''}</h4><span class="muted">${d.desc}</span></div>
   <dl class="kv"><dt>Hull</dt><dd class="num">${S.ship.hull} / ${d.hull}</dd><dt>Guns</dt><dd class="num">${S.ship.guns}</dd><dt>Crew</dt><dd class="num">${S.ship.crew} (needs ${Math.ceil(d.crew*.6)} to sail, ${d.crew} to fight well)</dd><dt>Wages</dt><dd class="num">${fmt(S.ship.crew*WAGE*30)} crowns a month</dd><dt>Speed</dt><dd class="num">${d.speed.toFixed(2)}</dd></dl></div>
   <h3>Repairs</h3><div class="row"><span>${miss>0?`${miss} points of damage at ${rp} crowns each${p.yard?'':' (no proper yard here)'}`:'Hull sound.'}</span>
   <span class="btns"><button class="btn" data-act="rep10" ${miss>0&&S.coins>=Math.min(10,miss)*rp?'':'disabled'}>Patch 10</button><button class="btn" data-act="repall" ${miss>0&&S.coins>=repairAll?'':'disabled'}>Repair all · ${fmt(repairAll)}</button></span></div>
   <h3>Crew</h3><div class="row"><span>Sign on sailors for 30 crowns each (up to ${maxCrew}).</span><span class="btns"><button class="btn" data-act="hire1" ${S.ship.crew<maxCrew&&S.coins>=30?'':'disabled'}>Hire 1</button><button class="btn" data-act="hire5" ${S.ship.crew+5<=maxCrew&&S.coins>=150?'':'disabled'}>Hire 5</button><button class="btn ghost" data-act="fire1" ${S.ship.crew>2?'':'disabled'}>Pay off 1</button></span></div>`;
  if(p.yard){
    out+=`<h3>Ordnance</h3><div class="row"><span>Mount a nine-pounder for 260 crowns (up to ${maxGuns}).</span><button class="btn" data-act="gun" ${S.ship.guns<maxGuns&&S.coins>=260?'':'disabled'}>Buy gun</button></div><h3>Ships for Sale</h3><p class="muted">The yard takes your current ship at half its value.</p>`;
    const trade=Math.round(d.cost*.5);
    for(const s of WORLD.ships){ if(s.id===d.id||s.id==='patience') continue;
      const cost=s.cost-trade, fits=cargoUsed()<=s.cargo;
      out+=`<div class="card"><div class="row"><h4>${s.name}</h4><b class="num">${fmt(s.cost)} crowns</b></div><p class="muted">${s.desc}</p>
       <dl class="kv"><dt>Hold</dt><dd class="num">${s.cargo}</dd><dt>Hull</dt><dd class="num">${s.hull}</dd><dt>Guns</dt><dd class="num">${s.guns}</dd><dt>Speed</dt><dd class="num">${s.speed.toFixed(2)}</dd><dt>Crew</dt><dd class="num">${s.crew}</dd></dl>
       <div class="row" style="margin-top:6px"><span>After trade-in: <b class="num">${fmt(cost)}</b></span><button class="btn" data-ship="${s.id}" ${S.coins>=cost&&fits?'':'disabled'}>${fits?'Buy her':'Hold too full'}</button></div></div>`; }
  }
  return out;
}
const TAVERN_LINES={
  aub:'Off-duty clerks argue about the price of kaff in voices meant to be overheard.',
  vri:'A long table of Hollen burghers smokes emberleaf and reads the bourse lists aloud.',
  ska:'A fire the size of a cart burns in the hearth. The jarl\'s men are singing about cod.',
  orr:'Pilgrims and salvagers share the long benches. Nobody here drinks much, out of respect for the monks.',
  qas:'Kaff thick as tar, served in glass cups. A storyteller recites the Fall of Ys for small coins.',
  cen:'Ash on every windowsill. The planters drink rum punch and talk about the volcano as if it were a neighbour.',
  blk:'Every second drinker is wanted somewhere. Mother Kesh holds court in the back under a stolen admiral\'s portrait.',
  hal:'The tables are lit by moonsilk lanterns, and the glass on every shelf hums when a ship\'s gun fires in the harbour.'
};
function paneTavern(){
  const p=WORLD.portById[S.port]; const f=S.quests.frags||{};
  let q='';
  if(p.id==='orr'&&S.quests.chart===2&&!f.orr){ const have=S.ship.cargo.cod?.q||0;
    q+=`<div class="card"><h4>Brother Anselm</h4><p>"Fifteen barrels of salt cod, and our piece of the chart is yours."</p><button class="btn" data-act="givecod" ${have>=15?'':'disabled'}>Give 15 Salt Cod (you have ${have})</button></div>`; }
  if(p.id==='blk'&&S.quests.chart>=2&&!f.blk){ const m=S.ship.cargo.musket?.q||0;
    q+=`<div class="card"><h4>Mother Kesh</h4><p>"Marrow's whelp. Aye, I've his scrap of chart. Won it fair, near enough. Two thousand five hundred and it's yours. Or ten crates of Hollen muskets. My lads are short of iron."</p>
     <span class="btns"><button class="btn" data-act="keshpay" ${S.coins>=2500?'':'disabled'}>Pay 2,500</button><button class="btn" data-act="keshmusk" ${m>=10?'':'disabled'}>Give 10 muskets (you have ${m})</button></span></div>`; }
  if(p.id==='aub'&&S.quests.chart>=2&&!f.aub){
    q+=`<div class="card"><h4>A Company Clerk</h4><p>A nervous young clerk from the Counting-House sidles over. "The Factor keeps your father's pledge in the strongroom. For three thousand I could misfile it into your hands. He'd know, though. He always knows."</p><button class="btn" data-act="bribe" ${S.coins>=3000?'':'disabled'}>Bribe the clerk · 3,000</button><p class="muted italic">Or pay the debt below 10,000 and the Company must return it.</p></div>`; }
  if(S.flags.diadem==='carry'){
    if(p.id==='orr') q+=`<div class="card"><h4>The Great Lamp</h4><p>Anselm waits by the altar. "Leave it here, where no crown can wear it, and the Order will clear your father's debt."</p><button class="btn" data-act="d_orrin">Give the Diadem to the Order</button></div>`;
    if(p.id==='qas') q+=`<div class="card"><h4>An Envoy of the Mirror Palace</h4><p>"The Sultana will pay forty thousand crowns for what you carry."</p><button class="btn" data-act="d_sultana">Sell the Diadem to Qasreen · 40,000</button></div>`;
  }
  return `<p class="italic">${p.tavern}. ${TAVERN_LINES[p.id]}</p>${q}
   <h3>The Talk of the Docks</h3><div class="row"><span>Stand a round to loosen tongues.</span><button class="btn" data-act="round" ${S.coins>=25?'':'disabled'}>Buy a round · 25</button></div>
   <div id="rumors">${(S.lastRumors||[]).filter(r=>r.port===S.port&&r.day===S.day).map(r=>`<div class="rumor">${r.t}</div>`).join('')}</div>`;
}
function hearRumor(){
  S.coins-=25; sfx('coin');
  let t; const unheard=S.mods.filter(m=>!m.heard);
  if(unheard.length&&Math.random()<.7){ const m=pick(unheard); m.heard=true; t=`"${m.text}" (${WORLD.portById[m.port].name})`; log('Rumour: '+m.text,'story'); }
  else { const g=pick(WORLD.goods), best=WORLD.ports.filter(p=>p.id!==S.port).sort((a,b)=>sellPrice(b.id,g.id)-sellPrice(a.id,g.id))[0];
    t=pick([`A purser swears ${g.name} is fetching ${sellPrice(best.id,g.id)} a ${g.unit} at ${best.name}.`,`"If I had a hold of ${g.name}, I'd take it to ${best.name}. ${sellPrice(best.id,g.id)} a ${g.unit}, they're paying."`]); }
  S.lastRumors=(S.lastRumors||[]).concat({port:S.port,day:S.day,t}).slice(-6);
  render();
}
function paneBank(){
  const f=S.quests.frags||{}; const canDiadem=S.flags.diadem==='carry';
  return `<p class="italic">Marble floors, a hundred scratching quills, and the Company's lion over every door. Silas Vey's office overlooks the harbour.</p>
   <dl class="kv"><dt>Owed</dt><dd class="num">${fmt(S.debt)} crowns</dd><dt>Interest</dt><dd class="num">${(S.rate*100).toFixed(1)}% a month (≈${fmt(S.debt*S.rate)})</dd><dt>Falls due</dt><dd>${dateStr(DEADLINE)} · ${fmt(Math.max(0,daysLeft()))} days</dd><dt>Paid so far</dt><dd class="num">${fmt(S.paidSinceStart)}</dd></dl>
   <h3>Repay</h3>
   <div class="qty"><input type="range" id="payAmt" min="0" max="${Math.max(0,Math.min(S.coins,S.debt))}" step="50" value="${Math.min(S.coins,S.debt,1000)}" aria-label="Amount to repay"><b class="num" id="payLbl">${fmt(Math.min(S.coins,S.debt,1000))}</b></div>
   <span class="btns"><button class="btn big" data-act="pay" ${S.debt>0&&S.coins>0?'':'disabled'}>Pay into the account</button><button class="btn ghost" data-act="borrow" ${S.debt<40000?'':'disabled'}>Borrow 2,000 more</button></span>
   ${S.quests.chart>=2&&!f.aub?`<div class="card"><h4>Your Father's Pledge</h4><p>${S.debt<=10000?'Your debt is low enough that the Company must return the collateral.':'The Company holds a chart fragment as collateral until your debt falls to 10,000 or less.'}</p><button class="btn" data-act="pledge" ${S.debt<=10000?'':'disabled'}>Reclaim the pledge</button></div>`:''}
   ${canDiadem?`<div class="card"><h4>The Diadem</h4><p>Word of what you carry has reached the palace and the Company alike.</p><span class="btns"><button class="btn" data-act="d_crown">Sell to King Aurelien · 45,000</button><button class="btn ghost" data-act="d_vey">Give it to Vey for the debt</button></span></div>`:''}
   ${S.flags.free?`<p><button class="btn big" data-act="retire">Retire and close the ledger</button></p>`:''}`;
}
function paneJournal(){
  const f=S.quests.frags||{};
  const qs=[
    ['Clear the Corvane debt',S.debt<=0,`${fmt(S.debt)} crowns owed by ${dateStr(DEADLINE)}`],
    ['Find Brother Anselm at Saint Orrin\'s Light',S.quests.chart>=2,'Your father\'s letter named him'],
    ['Chart fragment: the Scriptorium',!!f.orr,'15 barrels of salt cod for the brothers'],
    ['Chart fragment: Mother Kesh',!!f.blk,'Blackwater Cay. 2,500 crowns or 10 crates of muskets'],
    ['Chart fragment: the Company strongroom',!!f.aub,'Pay the debt below 10,000, or bribe a clerk at Aubergard'],
    ['Reach Ys Morrow and the vault beneath the lantern',!!S.flags.diadem,S.flags.spires?'Sail to the Spires on your chart. Repair first.':'Needs all three fragments'],
  ].filter((q,i)=>i<2||S.quests.chart>=2);
  const rum=S.mods.filter(m=>m.heard&&m.until>S.day);
  return `<h3>Undertakings</h3>${qs.map(([t,d,s])=>`<div class="quest ${d?'done':''}"><span class="seal" aria-hidden="true"></span><div><b>${t}</b><div class="muted">${d?'Done':s}</div></div></div>`).join('')}
   <h3>Rumours Heard</h3>${rum.length?rum.map(m=>`<div class="rumor">${m.text} <span class="muted">(${WORLD.portById[m.port].name}, about ${m.until-S.day} more days)</span></div>`).join(''):'<p class="muted">Nothing yet. Buy a round in a tavern.</p>'}
   <h3>Codex of the Mer Ardent</h3><div class="codex">${WORLD.codex.map(e=>S.codex.includes(e.id)?`<details><summary>${e.title}</summary>${e.text.map(p=>`<p>${p}</p>`).join('')}</details>`:`<details><summary class="locked">Unwritten page</summary><p class="muted">Explore further to learn more.</p></details>`).join('')}</div>
   <h3>The Ledger</h3><dl class="kv"><dt>Net worth</dt><dd class="num">${fmt(netWorth())}</dd><dt>Voyages</dt><dd class="num">${S.stats.voyages}</dd><dt>Trades</dt><dd class="num">${S.stats.trades}</dd><dt>Trading profit</dt><dd class="num">${fmt(S.stats.profit)}</dd><dt>Pirates beaten</dt><dd class="num">${S.stats.pirates}</dd></dl>
   <p><button class="btn ghost" data-act="restart">Start a new chronicle</button></p>`;
}
function paneSea(){
  const v=S.voyage, items=Object.entries(S.ship.cargo);
  return `<p class="italic">The sea runs grey-green under the forefoot. ${v.haz.pirate>.4?'The lookouts are doubled.':v.haz.storm>.4?'The bosun keeps glancing at the glass.':'The watch below is asleep.'}</p>
   <h3>In the Hold</h3>${items.length?`<table class="mk"><tbody>${items.map(([g,c])=>`<tr><td>${WORLD.goodById[g].name}</td><td class="num">${c.q}</td><td class="num muted">paid ${Math.round(c.cost)}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">Empty. Ballast and rats.</p>'}
   ${S.flags.diadem==='carry'?'<p class="dear italic">The Meridian Diadem lies wrapped in oilcloth in your cabin.</p>':''}`;
}

function act(a){
  const d=shipDef(), p=WORLD.portById[S.port], rp=p.yard?5:9;
  const f=(S.quests.frags=S.quests.frags||{});
  switch(a){
    case 'rep10':{const n=Math.min(10,d.hull-S.ship.hull);S.coins-=n*rp;S.ship.hull+=n;break}
    case 'repall':{const n=d.hull-S.ship.hull;S.coins-=n*rp;S.ship.hull=d.hull;log(`Shipwrights repaired the hull for ${fmt(n*rp)} crowns.`);break}
    case 'hire1':S.coins-=30;S.ship.crew++;break;
    case 'hire5':S.coins-=150;S.ship.crew+=5;break;
    case 'fire1':S.ship.crew--;break;
    case 'gun':S.coins-=260;S.ship.guns++;sfx('cannon');break;
    case 'round':return hearRumor();
    case 'givecod':removeCargo('cod',15);gainFragment('orr','Brother Anselm\'s piece');break;
    case 'keshpay':S.coins-=2500;keshReveal();break;
    case 'keshmusk':removeCargo('musket',10);keshReveal();break;
    case 'bribe':S.coins-=3000;S.rate+=.005;gainFragment('aub','misfiled out of the Company strongroom');log('Vey will notice. The Company raised your interest by half a point.','bad');break;
    case 'pledge':gainFragment('aub','the Company returned your father\'s pledge');break;
    case 'pay':{const amt=Math.min(+$('payAmt').value,S.coins,S.debt);if(amt<=0)return;S.coins-=amt;S.debt-=amt;S.paidSinceStart+=amt;sfx('coin');log(`Paid ${fmt(amt)} crowns to the Corvane Company. ${fmt(S.debt)} remains.`,'good');checkFree();break}
    case 'borrow':S.coins+=2000;S.debt+=2000;log('Borrowed 2,000 crowns more from the Company.','bad');break;
    case 'd_orrin':diademTo('orrin');break;
    case 'd_sultana':diademTo('sultana');break;
    case 'd_crown':diademTo('crown');break;
    case 'd_vey':diademTo('vey');break;
    case 'retire':endGame('retire');return;
    case 'restart':showEvent({title:'Begin Again?',text:['This closes the current chronicle for good.'],choices:[{label:'Yes, start a new chronicle',go:()=>{S=newGame();S.log=[];renderLog();intro()}},{label:'No, keep sailing',go:close}]});return;
  }
  render(); save();
}
function keshReveal(){
  gainFragment('blk','won back from Mother Kesh');
  showEvent({title:'Mother Kesh Remembers', seal:'☠', text:['Kesh pushes the scrap across the table and keeps her hand on it a moment longer.','"I\'ll tell you something for free, Marrow. Two years back a Company man paid me to take your father\'s old ship, the Constance, and bring him every paper aboard. Soft-spoken fellow. Ink on his cuffs. I took the gold and I let your father go, because I liked him. But your Silas Vey wants that chart, and he wanted it before your father was dead."'],choices:[{label:'Pocket the fragment',go:close}]});
}
function shipBuy(id){
  const s=WORLD.shipById[id], cost=s.cost-Math.round(shipDef().cost*.5); if(S.coins<cost) return;
  S.coins-=cost; S.ship.type=id; S.ship.hull=s.hull; S.ship.guns=s.guns; S.ship.name=s.name;
  log(`Bought a ${s.name}. The old ship went in part exchange.`,'good'); sfx('bell'); render(); save();
}
function wirePane(){
  const pane=$('pane');
  pane.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{const g=b.dataset.buy,q=b.dataset.q==='max'?maxBuy(g):+b.dataset.q;if(q<=0)return toast(cargoSpace()<=0?'The hold is full.':'Not enough crowns.');buy(g,q)});
  pane.querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>{const g=b.dataset.sell,c=S.ship.cargo[g];if(!c)return;sell(g,b.dataset.q==='all'?c.q:+b.dataset.q)});
  pane.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>act(b.dataset.act));
  pane.querySelectorAll('[data-ship]').forEach(b=>b.onclick=()=>shipBuy(b.dataset.ship));
  const r=$('payAmt'); if(r) r.oninput=()=>$('payLbl').textContent=fmt(r.value);
}
function renderLog(){
  if(!S) return;
  $('log').innerHTML='<h3>Ship\'s Log</h3>'+S.log.slice(0,40).map(l=>`<p class="${l.c}"><span class="d">${dateStr(l.d)}</span>${l.t}</p>`).join('');
}
let toastT;
function toast(msg){ let el=document.querySelector('.toast'); if(!el){el=document.createElement('div');el.className='toast';el.setAttribute('role','status');document.body.appendChild(el)} el.textContent=msg; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true,2600); }

// ───────────────────────── chart interaction ─────────────────────────
function portTip(id,e){
  const tip=$('tip'), wrap=$('chartWrap').getBoundingClientRect();
  if(!id){ tip.hidden=true; return; }
  let html;
  if(id==='ys'){ html=`<b>Ys Morrow</b>The drowned capital. ${S.voyage?'':`${voyageDays('ys')} days. Fogbound.`}`; }
  else { const p=WORLD.portById[id], n=WORLD.nations[p.nation], visited=!!S.seen[id];
    const g=ids=>ids.map(i=>WORLD.goodById[i].name).join(', ');
    html=`<b>${p.name}</b><span class="italic">${n.name}</span><br>`+
      (S.voyage||id===S.port?'':`${voyageDays(id)} days, ${hazardWords(routeHazard(S.port,id))}<br>`)+
      (visited?`Makes: ${g(p.produce)}<br>Wants: ${g(p.demand)}`:'<i>Not yet visited</i>'); }
  tip.innerHTML=html; tip.hidden=false;
  const x=e.clientX-wrap.left+14, y=e.clientY-wrap.top+14;
  tip.style.left=Math.min(x,wrap.width-250)+'px'; tip.style.top=Math.min(y,wrap.height-110)+'px';
}
function onChartClick(e){
  if(paused||S.over) return;
  const {x,y}=CHART.toLogical(e), id=CHART.hitTest(x,y,S);
  if(!id||S.voyage) return;
  if(id===S.port){ TAB='market'; render(); return; }
  const name=id==='ys'?'Ys Morrow':WORLD.portById[id].name, days=voyageDays(id), haz=routeHazard(S.port,id);
  const wages=Math.round(days*S.ship.crew*WAGE), d=shipDef();
  const warn=[];
  if(id==='ys'&&S.ship.hull<d.hull*.7) warn.push('Your hull is too weak for the Spirefog. The crew refuses to go until she is repaired to at least 70%.');
  if(S.ship.crew<Math.ceil(d.crew*.6)) warn.push(`You need at least ${Math.ceil(d.crew*.6)} crew to sail.`);
  if(cargoUsed()===0&&id!=='ys') warn.push('Your hold is empty.');
  const blocked=(id==='ys'&&S.ship.hull<d.hull*.7)||S.ship.crew<Math.ceil(d.crew*.6);
  showEvent({title:`Set Course for ${name}?`, seal:'⚓', text:[
    `${days} days under sail through ${hazardWords(haz)}. Wages for the passage, paid on arrival, come to about ${fmt(wages)} crowns.`,
    ...(warn.length?[warn.join(' ')]:[])],
   choices:[{label:`Weigh anchor for ${name}`,disabled:blocked,go:()=>setSail(id)},{label:'Stay in harbour',go:close}]});
}

// ───────────────────────── sound ─────────────────────────
let AC=null, soundOn=false;
function sfx(kind){
  if(!soundOn) return;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    const t=AC.currentTime, o=AC.createOscillator(), g=AC.createGain(); o.connect(g); g.connect(AC.destination);
    if(kind==='coin'){ o.type='triangle'; o.frequency.setValueAtTime(1800,t); o.frequency.exponentialRampToValueAtTime(2600,t+.05); g.gain.setValueAtTime(.08,t); g.gain.exponentialRampToValueAtTime(.001,t+.18); o.start(t); o.stop(t+.2); }
    if(kind==='bell'){ o.type='sine'; o.frequency.setValueAtTime(660,t); g.gain.setValueAtTime(.12,t); g.gain.exponentialRampToValueAtTime(.001,t+1.6); o.start(t); o.stop(t+1.7);
      const o2=AC.createOscillator(),g2=AC.createGain();o2.connect(g2);g2.connect(AC.destination);o2.frequency.value=1650;g2.gain.setValueAtTime(.04,t);g2.gain.exponentialRampToValueAtTime(.001,t+1);o2.start(t);o2.stop(t+1.1); }
    if(kind==='cannon'){ const len=AC.sampleRate*.6, buf=AC.createBuffer(1,len,AC.sampleRate), d=buf.getChannelData(0); for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);
      const src=AC.createBufferSource(), lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=380; src.buffer=buf; src.connect(lp); lp.connect(g); g.gain.value=.5; src.start(t); }
  }catch(_){}
}

// ───────────────────────── save, loop, boot ─────────────────────────
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(_){} }
function load(){ try{ const s=JSON.parse(localStorage.getItem(KEY)); if(s&&s.v===1&&s.markets) return s; }catch(_){} return null; }
function frame(now){
  const dt=Math.min(100, now-(lastTick||now)); lastTick=now;
  if(S&&!S.over) tickVoyage(dt);
  if(S) CHART.draw(S);
  requestAnimationFrame(frame);
}
function start(data){
  CHART.init($('map'));
  S = (data&&data.S) || load();
  const fresh=!S; if(fresh) S=newGame();
  const cv=$('map');
  cv.addEventListener('mousemove',e=>{ const {x,y}=CHART.toLogical(e), id=CHART.hitTest(x,y,S); CHART.setHover(id); cv.style.cursor=id?'pointer':'crosshair'; portTip(id,e); });
  cv.addEventListener('mouseleave',()=>{ CHART.setHover(null); $('tip').hidden=true; });
  cv.addEventListener('click',onChartClick);
  $('tabs').addEventListener('click',e=>{ const b=e.target.closest('[data-tab]'); if(b){ TAB=b.dataset.tab; render(); } });
  $('soundBtn').onclick=()=>{ soundOn=!soundOn; $('soundBtn').textContent='Sound: '+(soundOn?'on':'off'); try{localStorage.setItem(KEY+'-sound',soundOn?'1':'0')}catch(_){} if(soundOn) sfx('bell'); };
  try{ soundOn=localStorage.getItem(KEY+'-sound')==='1'; $('soundBtn').textContent='Sound: '+(soundOn?'on':'off'); }catch(_){}
  remember(S.port); render(); renderLog();
  if(fresh){ log('You inherit the Patience at Aubergard, with a hold full of nothing and a debt full of zeroes.'); intro(); }
  else if(S.over){ endGame(S.over); }
  requestAnimationFrame(frame);
}
window.claude?.hot?.snapshot?.(()=>({S}));
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
