// IRON FRONT X multiplayer relay. Run with Node.js 20+.
const http=require('http');
const {WebSocketServer}=require('ws');
const crypto=require('crypto');
const PORT=Number(process.env.PORT||3000);
const rooms=new Map();
const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});res.end('IRON FRONT X Multiplayer server ONLINE\n');});
const wss=new WebSocketServer({server,maxPayload:1024*1024});
function emit(ws,msg){if(ws?.readyState===1)ws.send(JSON.stringify(msg));}
function publish(room,msg,except){for(const c of room.clients)if(c!==except)emit(c,msg);}
function roster(room){const msg={type:'players',players:[...room.clients].map(s=>({country:s.country}))};for(const c of room.clients)emit(c,msg);}
function fail(ws,message){emit(ws,{type:'error',message});}
function code(){return crypto.randomBytes(4).toString('hex').toUpperCase();}
function checkCountry(x){return Number.isInteger(x)&&x>=0&&x<250;}
function leave(ws){const r=ws.room;if(!r)return;r.clients.delete(ws);ws.room=null;if(!r.clients.size)rooms.delete(r.code);else{roster(r);publish(r,{type:'notice',text:'Один из игроков вышел из комнаты.'});}}
wss.on('connection',ws=>{
 ws.on('message',raw=>{
  let m;try{m=JSON.parse(raw.toString())}catch{return fail(ws,'Некорректное сообщение')}
  if(!m||typeof m.type!=='string')return;
  if(m.type==='create'||m.type==='join'){
   if(ws.room)return fail(ws,'Уже в комнате');if(!checkCountry(m.country))return fail(ws,'Неверная страна');
   let room;if(m.type==='create'){
    const id=code();room={code:id,clients:new Set(),provinces:new Map(),owned:{}};rooms.set(id,room);
   }else{
    room=rooms.get(String(m.code||'').toUpperCase());if(!room)return fail(ws,'Комната не найдена');if(room.clients.size>=2)return fail(ws,'Комната заполнена (максимум 2 игрока)');
    if([...room.clients].some(s=>s.country===m.country))return fail(ws,'Эта страна уже выбрана другим игроком');
   }
   ws.country=m.country;ws.room=room;room.clients.add(ws);
   emit(ws,{type:'joined',code:room.code,host:m.type==='create',provinces:[...room.provinces.entries()],owned:room.owned});roster(room);return;
  }
  const room=ws.room;if(!room)return fail(ws,'Сначала войди в комнату');
  if(m.type==='full_state'){
   if(room.clients.size!==1)return;
   if(Array.isArray(m.provinces))for(const row of m.provinces.slice(0,20000))if(Array.isArray(row)&&Number.isInteger(row[0])&&row[0]>=0&&row[0]<20000&&Number.isInteger(row[1]))room.provinces.set(row[0],row[1]);
   if(m.owned&&typeof m.owned==='object')room.owned=m.owned;return;
  }
  if(m.type==='province_changes'&&Array.isArray(m.changes)){
   const valid=[];
   for(const [i,owner] of m.changes.slice(0,1500)){if(!Number.isInteger(i)||i<0||i>=20000||!Number.isInteger(owner)||owner < -1||owner>=250)continue;
    // Players may claim territory only for their selected nation, or revert to its original owner.
    if(owner!==ws.country && owner!==-1)continue;
    room.provinces.set(i,owner);valid.push([i,owner]);
   }if(valid.length)publish(room,{type:'province_changes',changes:valid},ws);return;
  }
  if(m.type==='conquest'&&Number.isInteger(m.country)&&m.country>=0&&m.country<250&&m.owner===ws.country){room.owned[m.country]=ws.country;publish(room,{type:'conquest',country:m.country,owner:ws.country},ws);}
 });
 ws.on('close',()=>leave(ws));ws.on('error',()=>leave(ws));
});
server.listen(PORT,'0.0.0.0',()=>console.log('Multiplayer listening on '+PORT));
