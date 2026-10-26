window.KD=(c)=>{for(const t of [window,document]){t.dispatchEvent(new KeyboardEvent('keydown',{keyCode:c,which:c,key:String.fromCharCode(c),bubbles:true}))}};
window.KU=(c)=>{for(const t of [window,document]){t.dispatchEvent(new KeyboardEvent('keyup',{keyCode:c,which:c,key:String.fromCharCode(c),bubbles:true}))}};
window.TAP=async(c,ms=120)=>{KD(c);await W(ms);KU(c)};
window.W=(ms)=>new Promise(r=>setTimeout(r,ms));
window.LOGS=[];const ol=console.log;console.log=function(...a){const s=a.join(' ');if(s.indexOf('@@pf')>=0||s.indexOf('run_build')>=0||s.indexOf('@@pos')>=0)window.LOGS.push(s);return ol.apply(console,a)};
window.M=()=>[...document.querySelectorAll('div')].map(d=>d.textContent).filter(t=>t.startsWith('HZ'))[0].replace(/\n/g,' | ');
window.PF=(s,k)=>{const m=new RegExp(' '+k+'=([\\d.]+)').exec(s);return m?+m[1]:0};
window.JS=async(n=5)=>{let js=[],m=0,l;for(let i=0;i<n;i++){await W(1050);const x=/JS ([\d.]+) \/ (\d+)/.exec(M());js.push(+x[1]);m=Math.max(m,+x[2]);}const av=a=>a.reduce((p,c)=>p+c,0)/a.length;return 'JS '+av(js).toFixed(2)+' max '+m};
window.LAST=()=>LOGS.filter(l=>l.startsWith('@@pf')).slice(-1)[0]||'';
window.PROFRUN=async(keys,ms)=>{const p=new Profiler({sampleInterval:1,maxBufferSize:500000});for(const k of keys)KD(k);await W(ms);for(const k of keys)KU(k);return await p.stop()};
window.SELFTOP=(t,n=14)=>{const fr=t.frames,st=t.stacks;const label=i=>{const f=fr[i];return (f.name||'anon')+':'+f.line+':'+f.column};const self={},incl={};let tot=0;for(const s of t.samples){if(s.stackId===undefined)continue;const ch=[];let id=s.stackId;while(id!==undefined){ch.push(label(st[id].frameId));id=st[id].parentId}if(!ch.some(x=>x.startsWith('tick')))continue;tot++;self[ch[0]]=(self[ch[0]]||0)+1;new Set(ch).forEach(l=>incl[l]=(incl[l]||0)+1)}const f=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>(v/tot*100).toFixed(1)+' '+k).join('\n');return 'tick samples '+tot+'\nSELF\n'+f(self)+'\nINCL\n'+f(incl)};
window.CHAINS=(t,pred,depth=8,n=6)=>{const fr=t.frames,st=t.stacks;const label=i=>{const f=fr[i];return (f.name||'anon')+':'+f.line+':'+f.column};const chains={};for(const s of t.samples){if(s.stackId===undefined)continue;let id=s.stackId;const ch=[];while(id!==undefined&&ch.length<depth){ch.push(label(st[id].frameId));id=st[id].parentId}if(pred(ch)){const k=ch.join(' < ');chains[k]=(chains[k]||0)+1}}return Object.entries(chains).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>v+' '+k).join('\n')};
// walk: keys for ms, report per-2.4s JS and pf
window.WALK=async(k,n=3)=>{const out=[];KD(k);for(let i=0;i<n;i++){await W(2400);const x=/JS ([\d.]+) \/ (\d+)/.exec(M());const l=LAST();out.push(String.fromCharCode(k)+' JS '+x[1]+'/'+x[2]+' es='+PF(l,'enemy_step')+' um='+PF(l,'unit_move')+' '+(/en=\d+/.exec(l)||[''])[0])}KU(k);return out.join('\n')};
'ok'
