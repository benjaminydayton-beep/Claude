// The Meridian Ledger — world data: goods, ports, ships, nations and the codex.
// Chart coordinates use a 1000 x 680 space.
const WORLD = {};

WORLD.goods = [
  {id:'cod',   name:'Salt Cod',          base:14,  unit:'barrel', note:'Skarnholt brine, keeps a year'},
  {id:'timber',name:'Northern Timber',   base:20,  unit:'load',   note:'Mast-straight black pine'},
  {id:'sugar', name:'Cane Sugar',        base:26,  unit:'hogshead',note:'Ember Isles, brown and wet'},
  {id:'rum',   name:'Blackwater Rum',    base:34,  unit:'cask',   note:'Aged in pitch-black oak'},
  {id:'leaf',  name:'Emberleaf',         base:44,  unit:'bale',   note:'Smoked by every clerk alive'},
  {id:'kaff',  name:'Kaff Beans',        base:50,  unit:'sack',   note:'Qasreen roast, the scholar\'s vice'},
  {id:'indigo',name:'Indigo Cakes',      base:64,  unit:'chest',  note:'The blue of every uniform'},
  {id:'musket',name:'Hollen Muskets',    base:86,  unit:'crate',  note:'Twelve to a crate, flints extra'},
  {id:'pepper',name:'Ashpepper',         base:98,  unit:'sack',   note:'Grows only on volcanic ash'},
  {id:'porc',  name:'Valcaire Porcelain',base:118, unit:'crate',  note:'Packed in straw, prays in storms'},
  {id:'tinct', name:'Orrin\'s Tincture',  base:132, unit:'case',   note:'Monks\' cure for the grey fever'},
  {id:'silk',  name:'Moonsilk',          base:170, unit:'bolt',   note:'Spun by moths that feed at night'}
];
WORLD.goodById = Object.fromEntries(WORLD.goods.map(g=>[g.id,g]));

WORLD.nations = {
  valcaire:{name:'Kingdom of Valcaire', color:'#2f4a7a', short:'Valcaire'},
  hollen:  {name:'Republic of Hollenmark', color:'#c2702a', short:'Hollenmark'},
  skarn:   {name:'Skarn Jarldoms', color:'#5b6b74', short:'Skarnholt'},
  qasreen: {name:'Sultanate of Qasreen', color:'#2f7a5a', short:'Qasreen'},
  ember:   {name:'Ember Isles Charter', color:'#a2452a', short:'Ember Isles'},
  orrin:   {name:'Order of Saint Orrin', color:'#8a7a3a', short:'Saint Orrin'},
  brack:   {name:'Free Brotherhood of Brack', color:'#2a2a2a', short:'Brack'},
  halveny: {name:'Free City of Halveny', color:'#6a3f7a', short:'Halveny'}
};

// produce: cheap here. demand: dear here. Everything else trades at a fair middling price.
WORLD.ports = [
  {id:'aub', name:'Aubergard', nation:'valcaire', x:478, y:150, yard:true, bank:true,
   produce:['porc'], demand:['kaff','sugar','pepper','silk','leaf'],
   desc:'Crown city of Valcaire. Slate roofs, cathedral bells, and the marble Counting-House of the Corvane Company on the Quai des Lions.',
   tavern:'The Drowned Lion'},
  {id:'vri', name:'Vrijhaven', nation:'hollen', x:262, y:112, yard:true,
   produce:['musket','timber'], demand:['pepper','sugar','leaf','indigo'],
   desc:'Canal city of the Hollen Republic, where the stock exchange never closes and windmills grind gunpowder day and night.',
   tavern:'De Zeven Sterren'},
  {id:'ska', name:'Skarnholt', nation:'skarn', x:118, y:262, yard:false,
   produce:['cod','timber'], demand:['rum','kaff','sugar','leaf','tinct'],
   desc:'A fjord town of tarred longhouses. The jarls trade fish and timber for anything that warms a winter.',
   tavern:'The Frozen Horn'},
  {id:'orr', name:'Saint Orrin\'s Light', nation:'orrin', x:540, y:330, yard:false,
   produce:['tinct'], demand:['cod','rum','indigo','timber'],
   desc:'A rock in the middle of the sea crowned by the Great Lamp. The monks brew tincture, copy charts, and keep the light that has never once gone out.',
   tavern:'The Pilgrim\'s Rest'},
  {id:'qas', name:'Qasr al-Mira', nation:'qasreen', x:858, y:212, yard:true,
   produce:['kaff','pepper'], demand:['musket','timber','porc','cod'],
   desc:'City of the Mirror Palace. Its domes are tiled in green glass and its spice souk smells for a league out to sea.',
   tavern:'House of the Seven Lamps'},
  {id:'cen', name:'Port Cendre', nation:'ember', x:300, y:520, yard:false,
   produce:['sugar','leaf','indigo'], demand:['timber','musket','cod','tinct','porc'],
   desc:'Chartered colony on the slopes of a smoking volcano. Ash falls like snow in the dry season and the fields grow fat on it.',
   tavern:'The Cinder & Cask'},
  {id:'blk', name:'Blackwater Cay', nation:'brack', x:586, y:572, yard:true, freeport:true,
   produce:['rum'], demand:['musket','tinct','porc','silk'],
   desc:'A freeport of rope bridges and stilt houses, where no flag is honoured and no question is asked. Cheap ships, dear lives.',
   tavern:'The Hanged Admiral'},
  {id:'hal', name:'Halveny', nation:'halveny', x:850, y:478, yard:false,
   produce:['silk'], demand:['cod','rum','musket','indigo','timber'],
   desc:'The glass city. Moonsilk moths are farmed in its lantern-lit towers, and every alley glitters with blown glass.',
   tavern:'The Moth & Candle'}
];
WORLD.portById = Object.fromEntries(WORLD.ports.map(p=>[p.id,p]));

// The drowned capital. Not a port. Reachable only by the story.
WORLD.spires = {id:'ys', name:'Ys Morrow', x:740, y:372};

// Regions of danger: pirates around the Cay, storms in the southern Gyre, fog at the Spires.
WORLD.hazards = [
  {kind:'pirate', x:600, y:560, r:200, w:1.0, name:'Brack waters'},
  {kind:'pirate', x:780, y:420, r:110, w:0.5, name:'Halveny Straits'},
  {kind:'storm',  x:420, y:470, r:200, w:0.9, name:'The Southern Gyre'},
  {kind:'storm',  x:160, y:170, r:140, w:0.7, name:'Skarn Squalls'},
  {kind:'fog',    x:740, y:372, r:90,  w:1.0, name:'The Spirefog'}
];

// Land masses: [cx, cy, rx, ry, seed, kind]. Drawn as noisy coastlines.
WORLD.land = [
  {x:470,y:40,rx:330,ry:88,s:3},   // Valcaire mainland (north)
  {x:200,y:70,rx:120,ry:60,s:9},   // Hollen lowlands
  {x:40,y:250,rx:80,ry:170,s:4},   // Skarn coast (west)
  {x:960,y:220,rx:110,ry:170,s:7}, // Qasreen (east)
  {x:250,y:600,rx:150,ry:90,s:11}, // Ember Isles main
  {x:150,y:510,rx:45,ry:30,s:13},  // Ember islet
  {x:610,y:620,rx:80,ry:42,s:5},   // Brack cays
  {x:690,y:590,rx:28,ry:18,s:17},
  {x:930,y:540,rx:90,ry:90,s:2},   // Halveny peninsula
  {x:545,y:318,rx:30,ry:22,s:19},  // Orrin rock
  {x:740,y:372,rx:20,ry:14,s:23,ruin:true}, // Drowned Spires
  {x:360,y:300,rx:22,ry:14,s:29},  // Gull isle
  {x:680,y:200,rx:26,ry:16,s:31}   // Sentinel isle
];

WORLD.ships = [
  {id:'patience', name:'Brig', cost:6000, cargo:60, hull:100, guns:4, speed:1.0, crew:14,
   desc:'Your father\'s brig. Honest, leaky, slow to answer the helm.'},
  {id:'sloop', name:'Revenue Sloop', cost:7500, cargo:45, hull:80, guns:8, speed:1.4, crew:10,
   desc:'A decommissioned Valcairean customs cutter. Outruns anything with a keel.'},
  {id:'fluyt', name:'Hollen Fluyt', cost:11000, cargo:150, hull:110, guns:2, speed:0.85, crew:16,
   desc:'Pear-shaped and wallowing, but she carries more than any ship her size.'},
  {id:'snow', name:'Merchant Snow', cost:16000, cargo:115, hull:150, guns:12, speed:1.1, crew:22,
   desc:'A well-armed trader. Pirates think twice.'},
  {id:'indiaman', name:'Corvane Indiaman', cost:34000, cargo:270, hull:240, guns:26, speed:0.95, crew:44,
   desc:'A floating warehouse with a frigate\'s broadside. The Company\'s own pattern.'}
];
WORLD.shipById = Object.fromEntries(WORLD.ships.map(s=>[s.id,s]));

WORLD.months = ['Frostmonth','Thawmonth','Seedmonth','Rainmonth','Bloommonth','Highsun','Hearthsun','Harvest','Reaping','Ashfall','Gloaming','Deepwinter'];

// Codex entries. `unlock` names the trigger that reveals each entry; 'start' entries are open from the beginning.
WORLD.codex = [
  {id:'foundering', title:'The Foundering', unlock:'start', text:[
    'Three hundred and nine years ago the Mer Ardent did not exist. Where its waters roll there was the Valley of Aurel, and in it the greatest city the world had known: Ys, capital of the Aurelian Empire, whose emperors wore a crown of white gold called the Meridian Diadem.',
    'On the night of the Landfall, chroniclers write, the sky "fell into the valley like a dropped lantern". By dawn the sea had broken through the Gates of Morrow and the valley was gone. Calendars across the world still count their years from that night: this is the year 1743 AL, After Landfall.',
    'The empire\'s provinces became the nations that ring the sea today. Each claims to be Aurel\'s true heir. None has ever found the Diadem.']},
  {id:'charter', title:'The Charter of Brass', unlock:'start', text:[
    'In 1688 AL, after forty years of the Salt Wars, the coastal powers signed the Charter of Brass at Saint Orrin\'s Light. It guarantees that any merchant flying a chartered pennant may enter any harbour of the signatories to buy and sell.',
    'The Charter made the Mer Ardent rich. It also made the trading companies more powerful than some kings. The greatest of them is the Corvane Company of Aubergard, which lends to crowns, insures fleets, and holds the notes of half the captains afloat, your late father among them.']},
  {id:'corvane', title:'The Corvane Company', unlock:'start', text:[
    'Founded by the banker Ottoline Corvane in 1701 AL, the Company began by insuring cargoes against storm and piracy. It now owns warehouses in every chartered port, three dozen Indiamen, and a private navy it calls "escorts".',
    'Its chief factor in Aubergard is Silas Vey, a soft-spoken man with ink-stained cuffs who is said never to forget a debt. Captains call the Company\'s counting-house "the Lion\'s Mouth". Coin goes in. Nothing comes out.']},
  {id:'valcaire', title:'Kingdom of Valcaire', unlock:'port:aub', text:[
    'The oldest crown on the sea, ruled by King Aurelien IX from the Palace of Lions. Valcaire claims direct descent from the last Aurelian emperor and stamps the Diadem on its coins, though no living Valcairean has seen it.',
    'Its kilns at Aubergard produce the finest porcelain in the world, thin enough to read through. Its court consumes spice, silk and kaff in quantities that keep the whole sea in business.']},
  {id:'hollen', title:'Republic of Hollenmark', unlock:'port:vri', text:[
    'A republic of burghers who drained their marshes with windmills and then went to sea. Hollenmark has no king; it is governed by the Seventeen, the heads of its great trading houses.',
    'The Vrijhaven arsenal makes the best flintlocks on the Mer Ardent and sells them to every side of every war. "Hollen powder is always dry," the saying goes, "and Hollen hands are never clean."']},
  {id:'skarn', title:'The Skarn Jarldoms', unlock:'port:ska', text:[
    'Fjord-folk who refused both the Aurelian Empire and the Charter, until hunger made them sign. Each jarl rules a valley and a fleet of cod-boats. Their pine is the straightest in the world; every navy on the sea is masted with it.',
    'Skarn sailors say the sea is the drowned valley\'s grave and must be respected as one. They pour a cup of rum over the side before every voyage.']},
  {id:'qasreen', title:'Sultanate of Qasreen', unlock:'port:qas', text:[
    'The eastern shore was Aurel\'s richest province and fell under the Qasreen dynasty soon after the Foundering. Sultana Ilsabet al-Mira rules from the Mirror Palace, whose glass dome was once, legend says, a lens from the Aurelian observatory.',
    'Kaff and ashpepper grow on the volcanic terraces behind the city. The Sultanate is at uneasy peace with Valcaire and buys Hollen muskets by the thousand.']},
  {id:'ember', title:'The Ember Isles Charter', unlock:'port:cen', text:[
    'A volcanic archipelago settled under a joint charter by Valcaire and Hollenmark. The ash-fed soil grows sugar, emberleaf and indigo with frightening ease. The planters grow rich; the volcano, Mount Cendre, grows restless.',
    'Port Cendre is governed by the Intendant Margaux Dufresne, who is famous for two things: collecting every tax owed, and paying every bounty promised.']},
  {id:'orrin', title:'The Order of Saint Orrin', unlock:'port:orr', text:[
    'Saint Orrin was a lamplighter of Ys who, the story goes, swam out of the flood holding a lit lantern above the water. Where he came ashore on a bare rock, his followers built the Great Lamp, and it has burned for three centuries.',
    'The monks are neutral in all wars. They brew a tincture of rock-moss that cures the grey fever, and their scriptorium keeps the best sea charts in existence, including, rumour has it, charts of the drowned city itself.']},
  {id:'brack', title:'Blackwater Cay & the Brotherhood', unlock:'port:blk', text:[
    'The Cay was a prison colony until the prisoners took it in 1714 AL. Now it is a freeport where privateers sell prizes, smugglers refit, and the Brotherhood of Brack keeps a rough kind of order.',
    'The Brotherhood is led by the Admiral of the Cay, currently a one-eyed woman called Mother Kesh, who wears a Valcairean admiral\'s coat she took from its owner along with his ship.']},
  {id:'halveny', title:'Free City of Halveny', unlock:'port:hal', text:[
    'Halveny bought its freedom from Qasreen in 1650 AL with a single ship\'s hold of moonsilk. Its glassblowers make the lanterns that moonsilk moths are bred under; the moths spin only in that pale light.',
    'The city is governed by the Guild of Lamps and is fiercely, expensively neutral.']},
  {id:'goods', title:'On the Trade of the Mer Ardent', unlock:'start', text:[
    'Every port makes something cheaply and wants something dearly. Buy where a good is made (shown in green in the market) and sell where it is wanted (shown in red). Prices fall as you flood a market and recover over the following weeks.',
    'Listen in the taverns: wars, festivals, blights and fevers send prices soaring. A captain who hears first sells first.']},
  {id:'spires', title:'The Drowned Spires', unlock:'story:spires', text:[
    'At low tide the tallest towers of Ys break the surface east of Saint Orrin\'s Light: a ring of black stone fingers wrapped in a fog that never lifts. Compasses spin there. Ships that enter seldom leave.',
    'Salvagers who come back speak of bells ringing underwater, and of a light below the waves, steady and white, like a lamp that was never put out.']},
  {id:'marrow', title:'Captain Elias Marrow', unlock:'story:letter1', text:[
    'Your father. Thirty years a trader on the Mer Ardent, never rich, never quite ruined. Two years ago he borrowed heavily from the Corvane Company and stopped trading. He spent the money, and his last two years, on something he would not name.',
    'He died in Aubergard in Ashfall of 1742 AL. The physician said a fever. The harbour said drink. Neither knew him.']},
  {id:'diadem', title:'The Meridian Diadem', unlock:'story:frag3', text:[
    'The white-gold crown of the Aurelian emperors, said to be set with a lens of starglass that showed true north even in the dark. Whoever holds it holds the strongest claim to Aurel\'s inheritance, and with it every shore of the sea.',
    'Valcaire would pay a kingdom for it. Qasreen would go to war for it. The Corvane Company, which lends to both, would profit from either.']}
];
