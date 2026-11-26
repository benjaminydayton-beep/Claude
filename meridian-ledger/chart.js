// The Meridian Ledger — hand-inked sea chart renderer.
const CHART = (() => {
  const W = 1000, H = 680, K = 2; // logical size and backing scale
  let cv, cx, bg, mask, mctx, waves = [], hover = null, t0 = performance.now();
  const INK = '#2b1d12', INK2 = '#5a4330', SEA = '#cdbf98', SEA_INK = 'rgba(52,86,84,';
  const FONT_D = '"IM Fell English SC","IM Fell English",Garamond,serif';
  const FONT_I = '"IM Fell English",Garamond,serif';

  function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return((s>>>0)%100000)/100000}}
  function blobPts(l, off){
    const r = rng(l.s*977), n = 90, ph = [r()*6.28, r()*6.28, r()*6.28, r()*6.28];
    const pts = [];
    for(let i=0;i<n;i++){
      const a = i/n*Math.PI*2;
      const wob = 1 + .13*Math.sin(a*3+ph[0]) + .08*Math.sin(a*5+ph[1]) + .05*Math.sin(a*9+ph[2]) + .03*Math.sin(a*17+ph[3]);
      pts.push([l.x + Math.cos(a)*(l.rx*wob + off), l.y + Math.sin(a)*(l.ry*wob + off)]);
    }
    return pts;
  }
  function pathPts(c, pts){
    c.beginPath();
    for(let i=0;i<pts.length;i++){
      const p=pts[i], q=pts[(i+1)%pts.length], m=[(p[0]+q[0])/2,(p[1]+q[1])/2];
      if(i===0){const z=pts[pts.length-1];c.moveTo((z[0]+p[0])/2,(z[1]+p[1])/2)}
      c.quadraticCurveTo(p[0],p[1],m[0],m[1]);
    }
    c.closePath();
  }

  function compass(c, x, y, R){
    c.save(); c.translate(x,y);
    // rings
    c.strokeStyle=INK; c.lineWidth=1.2;
    for(const rr of [R, R*.92, R*.42]){c.beginPath();c.arc(0,0,rr,0,7);c.stroke()}
    for(let i=0;i<64;i++){const a=i/64*Math.PI*2, l=i%8===0?.84:i%2?.89:.86;c.beginPath();c.moveTo(Math.cos(a)*R*l,Math.sin(a)*R*l);c.lineTo(Math.cos(a)*R*.92,Math.sin(a)*R*.92);c.lineWidth=.8;c.stroke()}
    // points: 16 minor, 8 mid, 4 major
    const pt=(a,len,w,fillA,fillB)=>{
      for(const side of [-1,1]){
        c.beginPath();c.moveTo(0,0);
        c.lineTo(Math.cos(a+side*w)*len*.28,Math.sin(a+side*w)*len*.28);
        c.lineTo(Math.cos(a)*len,Math.sin(a)*len);c.closePath();
        c.fillStyle=side<0?fillA:fillB;c.fill();c.strokeStyle=INK;c.lineWidth=.8;c.stroke();
      }
    };
    for(let i=0;i<16;i++) pt(i/16*Math.PI*2+Math.PI/16, R*.55, .35, '#e5d3a8', '#b99a62');
    for(let i=0;i<8;i++) pt(i/8*Math.PI*2+Math.PI/8, R*.72, .3, '#d9c391', '#7a3a2a');
    for(let i=0;i<4;i++) pt(i/4*Math.PI*2-Math.PI/2, R*.95, .26, '#efe1bd', INK);
    c.beginPath();c.arc(0,0,R*.07,0,7);c.fillStyle='#9b2a22';c.fill();c.stroke();
    // fleur at north
    c.fillStyle=INK; c.font=`${R*.26}px ${FONT_D}`; c.textAlign='center'; c.textBaseline='bottom';
    c.fillText('N',0,-R*1.02);
    c.restore();
  }

  function mountain(c,x,y,s){
    c.beginPath();c.moveTo(x-s,y);c.lineTo(x,y-s*1.3);c.lineTo(x+s,y);
    c.fillStyle='rgba(234,217,180,.9)';c.fill();
    c.strokeStyle=INK2;c.lineWidth=.9;c.stroke();
    c.beginPath();c.moveTo(x,y-s*1.3);c.lineTo(x+s*.35,y);c.moveTo(x+s*.15,y-s*.85);c.lineTo(x+s*.55,y-s*.2);c.lineWidth=.5;c.stroke();
  }
  function tree(c,x,y,s){
    c.beginPath();c.moveTo(x,y);c.lineTo(x,y-s*.5);c.strokeStyle=INK2;c.lineWidth=.7;c.stroke();
    c.beginPath();c.arc(x,y-s*.9,s*.5,0,7);c.fillStyle='rgba(98,110,62,.55)';c.fill();c.lineWidth=.6;c.stroke();
  }
  function serpent(c,x,y){
    c.save();c.translate(x,y);c.strokeStyle=INK;c.fillStyle='rgba(61,107,106,.35)';c.lineWidth=1.3;
    for(let i=0;i<3;i++){const hx=i*34;c.beginPath();c.moveTo(hx,0);c.bezierCurveTo(hx+4,-24,hx+26,-24,hx+30,0);c.fill();c.stroke();
      c.beginPath();c.moveTo(hx+6,-1);c.lineTo(hx+24,-1);c.lineWidth=.6;c.stroke();c.lineWidth=1.3}
    // head
    c.beginPath();c.moveTo(102,0);c.bezierCurveTo(108,-30,128,-36,140,-26);c.lineTo(146,-30);c.lineTo(142,-20);c.bezierCurveTo(134,-16,124,-14,118,0);c.fill();c.stroke();
    c.beginPath();c.arc(133,-26,1.6,0,7);c.fillStyle=INK;c.fill();
    // tail
    c.beginPath();c.moveTo(-2,0);c.quadraticCurveTo(-16,-14,-26,-6);c.lineTo(-30,-14);c.lineTo(-22,-2);c.stroke();
    // splash marks
    c.lineWidth=.7;for(const sx of [-8,30,64,98,120]){c.beginPath();c.moveTo(sx,4);c.quadraticCurveTo(sx+5,1,sx+10,4);c.stroke()}
    c.restore();
  }

  function buildStatic(){
    bg = document.createElement('canvas'); bg.width=W*K; bg.height=H*K;
    const c = bg.getContext('2d'); c.scale(K,K);
    // vellum ground
    const g = c.createRadialGradient(W*.45,H*.4,50,W*.5,H*.5,W*.75);
    g.addColorStop(0,'#eadbb7');g.addColorStop(.7,'#dcc597');g.addColorStop(1,'#b8955f');
    c.fillStyle=g;c.fillRect(0,0,W,H);
    // foxing & stains
    const r=rng(42);
    for(let i=0;i<70;i++){const x=r()*W,y=r()*H,s=4+r()*40;const sg=c.createRadialGradient(x,y,0,x,y,s);sg.addColorStop(0,`rgba(120,80,30,${.04+r()*.07})`);sg.addColorStop(1,'rgba(120,80,30,0)');c.fillStyle=sg;c.fillRect(x-s,y-s,s*2,s*2)}
    // faint sea tint
    c.fillStyle='rgba(61,107,106,.07)';c.fillRect(0,0,W,H);

    // rhumb lines
    const roses=[[150,420],[700,300]];
    c.lineWidth=.5;
    for(const [rx,ry] of roses){
      for(let i=0;i<32;i++){const a=i/32*Math.PI*2;c.beginPath();c.moveTo(rx,ry);c.lineTo(rx+Math.cos(a)*1400,ry+Math.sin(a)*1400);
        c.strokeStyle=i%4===0?'rgba(43,29,18,.22)':i%2?'rgba(61,107,106,.14)':'rgba(155,42,34,.14)';c.stroke()}
    }

    // land mask
    mask=document.createElement('canvas');mask.width=W;mask.height=H;mctx=mask.getContext('2d',{willReadFrequently:true});
    // coastal water-lines (engraved ripples)
    for(const l of WORLD.land){
      for(let i=7;i>=1;i--){pathPts(c,blobPts(l,i*4.2));c.strokeStyle=SEA_INK+(0.34-i*0.04)+')';c.lineWidth=.8;c.stroke()}
    }
    for(const l of WORLD.land){
      const pts=blobPts(l,0);
      pathPts(c,pts);
      const lg=c.createLinearGradient(l.x,l.y-l.ry,l.x,l.y+l.ry);
      lg.addColorStop(0,l.ruin?'#8d8573':'#d8c08a');lg.addColorStop(1,l.ruin?'#6c6658':'#c7aa72');
      c.fillStyle=lg;c.fill();
      // inner hatching
      c.save();pathPts(c,pts);c.clip();
      c.strokeStyle='rgba(90,67,48,.16)';c.lineWidth=.6;
      for(let k=-H;k<W+H;k+=5){c.beginPath();c.moveTo(k,0);c.lineTo(k-H,H);c.stroke()}
      // inner shadow along coast
      pathPts(c,blobPts(l,-6));c.strokeStyle='rgba(90,67,48,.18)';c.lineWidth=6;c.stroke();
      c.restore();
      pathPts(c,pts);c.strokeStyle=INK;c.lineWidth=1.6;c.stroke();
      pathPts(mctx,pts);mctx.fillStyle='#000';mctx.fill();
    }
    const onLand=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&mctx.getImageData(x|0,y|0,1,1).data[3]>0;
    const deep=(x,y,d)=>onLand(x,y)&&onLand(x+d,y)&&onLand(x-d,y)&&onLand(x,y+d)&&onLand(x,y-d);

    // relief: mountains & woods
    const rr=rng(7);
    for(let i=0;i<900;i++){
      const x=rr()*W,y=rr()*H;
      if(!deep(x,y,16))continue;
      if(WORLD.ports.some(p=>Math.hypot(p.x-x,p.y-y)<38))continue;
      if(rr()<.45) mountain(c,x,y,5+rr()*5); else if(rr()<.5) tree(c,x,y,7);
    }
    // the drowned spires
    const sp=WORLD.spires;
    c.strokeStyle=INK;c.fillStyle='#4a453a';
    for(let i=0;i<7;i++){const a=i/7*6.28,d=8+(i%3)*4,x=sp.x+Math.cos(a)*d,y=sp.y+Math.sin(a)*d*.6,h=10+((i*37)%11);
      c.beginPath();c.moveTo(x-2.4,y+2);c.lineTo(x-1,y-h);c.lineTo(x,y-h-4);c.lineTo(x+1,y-h);c.lineTo(x+2.4,y+2);c.closePath();c.fill();c.lineWidth=.7;c.stroke()}

    // sea waves texture
    const wr=rng(99);waves=[];
    for(let i=0;i<1400&&waves.length<170;i++){const x=wr()*W,y=wr()*H;if(onLand(x,y)||onLand(x+12,y)||onLand(x,y+8)||onLand(x,y-8))continue;
      if(WORLD.ports.some(p=>Math.hypot(p.x-x,p.y-y)<34))continue;waves.push({x,y,p:wr()*6.28,s:.7+wr()*.6})}

    // compass roses
    compass(c,150,420,62);
    // sea serpent near the Spires, a warning
    serpent(c,640,505);

    // labels
    c.textAlign='center';c.textBaseline='middle';
    const lbl=(t,x,y,size,rot,col,sp,font)=>{c.save();c.translate(x,y);c.rotate(rot||0);c.font=`${size}px ${font||FONT_D}`;c.fillStyle=col||INK2;
      if(sp){c.letterSpacing=sp+'px'}c.fillText(t,0,0);c.restore()};
    lbl('MER  ARDENT',520,430,34,-.06,'rgba(52,86,84,.55)',10,FONT_I);
    lbl('The Valley that Drowned',740,336,12,0,'rgba(43,29,18,.65)',0,FONT_I);
    lbl('The Southern Gyre',430,470,14,.08,'rgba(52,86,84,.6)',2,FONT_I);
    lbl('Skarn Squalls',190,186,12,.2,'rgba(52,86,84,.6)',1,FONT_I);
    lbl('Halveny Straits',770,440,11,-.3,'rgba(52,86,84,.6)',1,FONT_I);
    lbl('VALCAIRE',560,52,20,0,'rgba(47,74,122,.8)',8);
    lbl('HOLLENMARK',170,52,15,0,'rgba(194,112,42,.85)',5);
    lbl('SKARN',48,330,15,-1.45,'rgba(70,80,90,.85)',6);
    lbl('QASREEN',960,300,17,1.5,'rgba(47,122,90,.85)',7);
    lbl('EMBER ISLES',230,630,15,0,'rgba(162,69,42,.85)',5);
    lbl('BRACK',640,640,12,0,'rgba(43,29,18,.75)',5);
    lbl('HALVENY',945,600,12,0,'rgba(106,63,122,.85)',4);
    lbl('Gull Isle',360,282,10,0,INK2,0,FONT_I);
    lbl('Sentinel',680,180,10,0,INK2,0,FONT_I);
    // imprint & scale
    c.textAlign='left';
    lbl('',0,0,1);
    c.font=`italic 10px ${FONT_I}`;c.fillStyle=INK2;c.fillText('Drawn at the Scriptorium of S. Orrin, 1741 AL',14,668);
    c.strokeStyle=INK;c.lineWidth=1;c.beginPath();c.moveTo(14,650);c.lineTo(134,650);c.stroke();
    for(let i=0;i<=4;i++){c.beginPath();c.moveTo(14+i*30,646);c.lineTo(14+i*30,654);c.stroke();if(i<4&&i%2===0){c.fillStyle=INK;c.fillRect(14+i*30,648,30,4)}}
    c.font=`9px ${FONT_I}`;c.fillText('Leagues  0      50     100',14,640);
    // border
    c.strokeStyle=INK;c.lineWidth=2;c.strokeRect(5,5,W-10,H-10);c.lineWidth=.7;c.strokeRect(10,10,W-20,H-20);
    for(let x=10;x<W-10;x+=25){c.fillStyle=(x/25|0)%2?INK:'rgba(0,0,0,0)';c.fillRect(x,5,25,5);c.fillRect(x,H-10,25,5)}
    for(let y=10;y<H-10;y+=25){c.fillStyle=(y/25|0)%2?INK:'rgba(0,0,0,0)';c.fillRect(5,y,5,25);c.fillRect(W-10,y,5,25)}
  }

  function flag(c,x,y,col){
    c.beginPath();c.moveTo(x,y);c.lineTo(x,y-20);c.strokeStyle=INK;c.lineWidth=1.2;c.stroke();
    const t=(performance.now()-t0)/400;
    c.beginPath();c.moveTo(x,y-20);
    c.quadraticCurveTo(x+7,y-22+Math.sin(t)*1.5,x+14,y-18+Math.sin(t+1)*1.5);
    c.lineTo(x,y-13);c.closePath();c.fillStyle=col;c.fill();c.lineWidth=.7;c.stroke();
  }

  function ship(c,x,y,dir,scale){
    const t=(performance.now()-t0)/500;
    c.save();c.translate(x,y+Math.sin(t)*1.2);c.rotate(Math.sin(t*.8)*.04);c.scale(dir<0?-scale:scale,scale);
    // hull
    c.beginPath();c.moveTo(-14,0);c.lineTo(14,0);c.quadraticCurveTo(12,7,6,8);c.lineTo(-10,8);c.quadraticCurveTo(-14,6,-16,-2);c.closePath();
    c.fillStyle='#4a2f1c';c.fill();c.strokeStyle=INK;c.lineWidth=1;c.stroke();
    c.beginPath();c.moveTo(-13,3);c.lineTo(12,3);c.strokeStyle='#c99a3e';c.lineWidth=.8;c.stroke();
    // masts
    c.strokeStyle=INK;c.lineWidth=1.1;
    c.beginPath();c.moveTo(-4,0);c.lineTo(-4,-24);c.moveTo(6,0);c.lineTo(6,-20);c.moveTo(14,-1);c.lineTo(22,-8);c.stroke();
    // sails
    const sail=(mx,top,w,h)=>{c.beginPath();c.moveTo(mx-w,top);c.quadraticCurveTo(mx+2,top+h*.5,mx-w,top+h);c.lineTo(mx+w,top+h);c.quadraticCurveTo(mx+w+4,top+h*.5,mx+w,top);c.closePath();c.fillStyle='#f3e8cc';c.fill();c.lineWidth=.7;c.stroke()};
    sail(-4,-22,6,9);sail(-4,-12,7,9);sail(6,-18,5,8);sail(6,-9,6,7);
    c.beginPath();c.moveTo(14,-1);c.lineTo(22,-8);c.lineTo(12,-12);c.closePath();c.fillStyle='#f3e8cc';c.fill();c.stroke();
    // pennant
    c.beginPath();c.moveTo(-4,-24);c.lineTo(-14,-26+Math.sin(t*3));c.lineTo(-4,-27);c.fillStyle='#9b2a22';c.fill();
    c.restore();
  }

  function bez(a,b){
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
    return {a,b,c:{x:mx-dy/len*len*.08,y:my+dx/len*len*.08}};
  }
  function bpt(B,u){const v=1-u;return {x:v*v*B.a.x+2*v*u*B.c.x+u*u*B.b.x,y:v*v*B.a.y+2*v*u*B.c.y+u*u*B.b.y}}

  function draw(S){
    if(!bg)return;
    cx.setTransform(1,0,0,1,0,0);cx.drawImage(bg,0,0);cx.setTransform(K,0,0,K,0,0);
    const t=(performance.now()-t0)/1000;
    // animated wave strokes
    cx.strokeStyle='rgba(52,86,84,.45)';cx.lineWidth=.8;
    for(const w of waves){const o=Math.sin(t*1.2+w.p)*2;cx.beginPath();cx.moveTo(w.x-6*w.s+o,w.y);cx.quadraticCurveTo(w.x-3*w.s+o,w.y-3*w.s,w.x+o,w.y);cx.quadraticCurveTo(w.x+3*w.s+o,w.y-3*w.s,w.x+6*w.s+o,w.y);cx.stroke()}
    // spire light
    if(S.flags.spires){const sp=WORLD.spires,pulse=.5+.5*Math.sin(t*2);const lg=cx.createRadialGradient(sp.x,sp.y,0,sp.x,sp.y,40);lg.addColorStop(0,`rgba(255,250,220,${.5+.3*pulse})`);lg.addColorStop(1,'rgba(255,250,220,0)');cx.fillStyle=lg;cx.fillRect(sp.x-40,sp.y-40,80,80)}
    // fog around spires
    for(let i=0;i<6;i++){const sp=WORLD.spires,a=t*.15+i,fx=sp.x+Math.cos(a)*30,fy=sp.y+Math.sin(a*1.3)*14;const fg=cx.createRadialGradient(fx,fy,0,fx,fy,46);fg.addColorStop(0,'rgba(240,235,220,.35)');fg.addColorStop(1,'rgba(240,235,220,0)');cx.fillStyle=fg;cx.fillRect(fx-46,fy-46,92,92)}
    // Orrin lamp
    const orr=WORLD.portById.orr;{const pulse=.5+.5*Math.sin(t*3);const lg=cx.createRadialGradient(orr.x+5,orr.y-12,0,orr.x+5,orr.y-12,30);lg.addColorStop(0,`rgba(255,214,120,${.45+.35*pulse})`);lg.addColorStop(1,'rgba(255,214,120,0)');cx.fillStyle=lg;cx.fillRect(orr.x-30,orr.y-45,70,70)}

    const here=S.voyage?null:WORLD.portById[S.port];
    // routes from the current port
    if(here){
      for(const p of WORLD.ports){if(p.id===here.id)continue;const B=bez(here,p),hov=hover===p.id;
        cx.beginPath();cx.moveTo(here.x,here.y);cx.quadraticCurveTo(B.c.x,B.c.y,p.x,p.y);
        cx.setLineDash(hov?[6,4]:[2,5]);cx.lineWidth=hov?2:1;cx.strokeStyle=hov?'rgba(155,42,34,.9)':'rgba(43,29,18,.35)';cx.stroke()}
      if(S.flags.spires&&hover==='ys'){const B=bez(here,WORLD.spires);cx.beginPath();cx.moveTo(here.x,here.y);cx.quadraticCurveTo(B.c.x,B.c.y,WORLD.spires.x,WORLD.spires.y);cx.setLineDash([6,4]);cx.lineWidth=2;cx.strokeStyle='rgba(155,42,34,.9)';cx.stroke()}
      cx.setLineDash([]);
    }
    // voyage path
    if(S.voyage){const v=S.voyage,from=WORLD.portById[v.from],to=v.to==='ys'?WORLD.spires:WORLD.portById[v.to],B=bez(from,to);
      cx.beginPath();cx.moveTo(from.x,from.y);cx.quadraticCurveTo(B.c.x,B.c.y,to.x,to.y);cx.setLineDash([6,4]);cx.lineWidth=1.6;cx.strokeStyle='rgba(155,42,34,.85)';cx.stroke();cx.setLineDash([]);
    }
    // ports
    cx.textBaseline='middle';
    for(const p of WORLD.ports){
      const n=WORLD.nations[p.nation],hov=hover===p.id,isHere=here&&here.id===p.id;
      flag(cx,p.x+6,p.y-3,n.color);
      cx.beginPath();cx.arc(p.x,p.y,isHere||hov?6.5:5,0,7);cx.fillStyle=isHere?'#9b2a22':'#efe1bd';cx.fill();cx.strokeStyle=INK;cx.lineWidth=1.4;cx.stroke();
      cx.beginPath();cx.arc(p.x,p.y,2,0,7);cx.fillStyle=INK;cx.fill();
      const left=p.x>800;cx.textAlign=left?'right':'left';
      cx.font=`${hov?17:15}px ${FONT_D}`;cx.lineWidth=4;cx.strokeStyle='rgba(234,217,180,.85)';
      const lx=p.x+(left?-12:12),ly=p.y+14;cx.strokeText(p.name,lx,ly);cx.fillStyle=INK;cx.fillText(p.name,lx,ly);
    }
    if(S.flags.spires){cx.textAlign='center';cx.font=`15px ${FONT_D}`;cx.lineWidth=4;cx.strokeStyle='rgba(234,217,180,.85)';cx.strokeText('Ys Morrow',WORLD.spires.x,WORLD.spires.y+24);cx.fillStyle='#9b2a22';cx.fillText('Ys Morrow',WORLD.spires.x,WORLD.spires.y+24)}

    // the ship
    let sx,sy,dir=1;
    if(S.voyage){const v=S.voyage,from=WORLD.portById[v.from],to=v.to==='ys'?WORLD.spires:WORLD.portById[v.to],B=bez(from,to);
      const u=Math.min(1,v.progress),p=bpt(B,u),p2=bpt(B,Math.min(1,u+.02));sx=p.x;sy=p.y;dir=p2.x>=p.x?1:-1;
      // wake
      cx.strokeStyle='rgba(255,255,255,.6)';cx.lineWidth=1;for(let i=1;i<5;i++){const q=bpt(B,Math.max(0,u-i*.012));cx.beginPath();cx.arc(q.x,q.y+5,1.5+i*.6,0,Math.PI);cx.stroke()}
    } else {sx=here.x+16;sy=here.y-8;dir=here.x>700?-1:1;if(here.x>700)sx=here.x-16}
    ship(cx,sx,sy,dir,.85);
  }

  function toLogical(e){const r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H}}
  function hitTest(x,y,S){
    for(const p of WORLD.ports){if(Math.hypot(p.x-x,p.y-y)<22||(x>p.x&&x<p.x+110&&Math.abs(y-p.y-14)<10&&p.x<=800)||(x<p.x&&x>p.x-110&&Math.abs(y-p.y-14)<10&&p.x>800))return p.id}
    if(S.flags.spires&&Math.hypot(WORLD.spires.x-x,WORLD.spires.y-y)<26)return 'ys';
    return null;
  }

  function init(canvas){cv=canvas;cx=cv.getContext('2d');const go=()=>{buildStatic()};(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(go,go)}
  function setHover(id){hover=id}
  function travelDays(fromId,toId,speed){const a=WORLD.portById[fromId],b=toId==='ys'?WORLD.spires:WORLD.portById[toId];return Math.max(2,Math.round(Math.hypot(a.x-b.x,a.y-b.y)*1.04/(26*speed)))}
  function pointAt(fromId,toId,u){const a=WORLD.portById[fromId],b=toId==='ys'?WORLD.spires:WORLD.portById[toId];return bpt(bez(a,b),u)}
  return {init,draw,toLogical,hitTest,setHover,travelDays,pointAt,W,H};
})();
