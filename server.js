const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const files = {
  questions: 'fragen.json',
  symbolSafe: 'runde2_symbole.json',
  symbolFakePages: 'runde2_fakepages.json',
  images: 'bilder.json',
  sounds: 'sounds.json',
  lies: 'luegen.json',
  fakePages: 'fakepages.json',
  anagram: 'buchstaben_code.json',
  wireBomb: 'runde5_kabel.json',
  bomb: 'runde5_config.json',
  codes: 'codes.json',
  finale: 'finale.json',
  finalMemory: 'memory_finale.json',
  laserRoom: 'laser_raum.json',
  potionRoom: 'giftiger_trank.json',
  ventilationRoom: 'lueftungssystem.json',
  elevatorRoom: 'fahrstuhl.json',
  audioConfig: 'audio_config.json'
};

function readJson(key){
  const file = files[key];
  if(!file) return null;
  return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
}
function writeJson(key, data){
  const file = files[key];
  if(!file) throw new Error('Unbekannte Datei: ' + key);
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2), 'utf8');
}
function loadData(){
  const out = {};
  for(const k of Object.keys(files)) out[k] = readJson(k);
  return out;
}
function alphabetCode(word){
  return String(word||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/Ä/g,'AE').replace(/Ö/g,'OE').replace(/Ü/g,'UE').replace(/ß/g,'SS').replace(/[^A-Z]/g,'').split('').map(ch=>ch.charCodeAt(0)-64).join('');
}
function finalMemoryCode(memory){
  const cards = [...(memory.codeCards || [])].sort((a,b)=>(Number(a.number)||0)-(Number(b.number)||0));
  return memory.autoGenerateFinalCode !== false ? cards.map(c=>String(c.value||'')).join('') : String(memory.finalCode || '');
}

function lieCodeForCurrentItem(){
  const item = (S.data.lies || [])[S.itemIndex] || {};
  if(item.answerCode) return String(item.answerCode);
  if(item.liarCode) return String(item.liarCode);
  const statements = item.statements || [];
  const lie = statements.find(x => x && typeof x === 'object' && (x.isLie === true || x.correct === true || x.lie === true));
  if(lie && lie.code) return String(lie.code);
  return String(item.answer || item.liar || item.code || '');
}

let data = loadData();
const defaultTimer = Number(data.bomb?.timerSeconds || 1800);
const defaultPenalty = Number(data.bomb?.errorPenaltySeconds || 60);
const defaultBombTimer = Number(data.bomb?.bombTimerSeconds || 300);
const defaultBombPenalty = Number(data.bomb?.bombPenaltySeconds || 20);
let S = {
  round: 0,
  itemIndex: 0,
  gameStarted: false,
  message: 'Lobby geöffnet. Spieler können beitreten.',
  players: [],
  teamChefId: '',
  buzzedId: '',
  buzzerEnabled: false,
  teamChefRequired: false,
  showRules: false,
  revealed: false,
  locks: {},
  codeEntries: {},
  notes: {},
  anagramSolved: false,
  safe: { progress: [], solved: false },
  memory: { flipped: [] },
  bomb: { running:false, status:'bereit', phase:1, errors:0, wireProgress: [], timer: defaultBombTimer, initialSeconds: defaultBombTimer, penaltySeconds: defaultBombPenalty },
  laser: { settings:{}, solved:false },
  potion: { selected:'', solved:false },
  ventilation: { settings:{}, solved:false },
  elevator: { progress:[], solved:false },
  finale: { started:false, warningActive:false, acknowledgements:{} },
  escape: { timer: defaultTimer, initialSeconds: defaultTimer, running: false, errorPenaltySeconds: defaultPenalty, escaped: false },
  audio: { ...(data.audioConfig.global || { musicEnabled:true, musicVolume:.35, sfxVolume:.8 }) },
  data
};

function broadcast(){ io.emit('state', S); }
function isChef(id){ return !S.teamChefRequired || !S.teamChefId || id === S.teamChefId; }
function unlock(id){ S.locks[id]=true; }
function penalty(reason){
  const seconds = Math.max(0, Number(S.escape.errorPenaltySeconds || 0));
  if(seconds > 0 && S.gameStarted && !S.escape.escaped){
    S.escape.timer = Math.max(0, Number(S.escape.timer || 0) - seconds);
    S.message = (reason || 'Fehler!') + ' -' + Math.round(seconds/60*10)/10 + ' Min.';
    if(S.escape.timer <= 0){
      S.escape.running = false;
      S.message = 'Zeit abgelaufen! Der Escape Room ist verloren.';
      io.emit('playSound','explosion');
    }
  } else if(reason) S.message = reason;
}

function bombPenalty(reason){
  const seconds = Math.max(0, Number(S.bomb.penaltySeconds || S.data.bomb?.bombPenaltySeconds || 20));
  if(seconds > 0 && S.gameStarted && S.round === 6 && S.bomb.status !== 'exploded' && S.bomb.status !== 'defused'){
    S.bomb.timer = Math.max(0, Number(S.bomb.timer || 0) - seconds);
    S.message = (reason || 'Bomben-Fehler!') + ' -' + seconds + ' Sek. Bombenzeit.';
    if(S.bomb.timer <= 0){
      S.bomb.running = false;
      S.bomb.status = 'exploded';
      S.message = 'Die Bombe ist explodiert!';
      io.emit('playSound','explosion');
    }
  } else if(reason) S.message = reason;
}
function startFinaleWarning(){
  S.finale = { started:false, warningActive:true, acknowledgements:{} };
  S.message = '🚨 KRITISCHER SYSTEMFEHLER: Team-Modus beendet. Ab jetzt spielt jeder allein. Alle Spieler müssen bestätigen.';
}
function finaleAllAcknowledged(){
  const ids = (S.players || []).map(p=>p.id);
  return ids.length > 0 && ids.every(id => S.finale?.acknowledgements?.[id]);
}

function setRound(r){
  S.round = Number(r);
  S.itemIndex = 0;
  S.revealed = false;
  S.buzzedId = '';
  S.showRules = false;
  // Wichtig: Systemfehler darf ausschließlich beim echten Finale (Runde 11) aktiv sein.
  if(S.round !== 11){ S.finale = { started:false, warningActive:false, acknowledgements:{} }; }
  if([5,6,7,8,9,10].includes(S.round)){ S.teamChefRequired = true; S.buzzerEnabled = false; }
  if(S.round === 1 || S.round === 11){ S.teamChefRequired = false; S.buzzerEnabled = false; }
  if(S.round === 6){
    S.bomb.status='bereit';
    S.bomb.timer = Number(S.bomb.initialSeconds || S.data.bomb?.bombTimerSeconds || 300);
    S.bomb.running = false;
    S.bomb.phase = 1;
    S.bomb.errors = 0;
    S.bomb.wireProgress = [];
    S.message = S.teamChefId ? 'Bombenrunde bereit. Bomben-Timer startet mit dem Teamchef.' : 'Bombenrunde bereit. Wähle zuerst einen Teamchef aus.';
  }
  if(S.round === 7){ S.laser={settings:{},solved:false}; S.message = S.teamChefId ? 'Laser-Raum gestartet. Teamchef stellt die Spiegel ein.' : 'Laser-Raum bereit. Wähle zuerst einen Teamchef aus.'; }
  if(S.round === 8){ S.potion={selected:'',solved:false}; S.message = S.teamChefId ? 'Labor gestartet. Teamchef wählt den Trank.' : 'Labor bereit. Wähle zuerst einen Teamchef aus.'; }
  if(S.round === 9){ S.ventilation={settings:{},solved:false}; S.message = S.teamChefId ? 'Lüftungssystem gestartet. Teamchef stellt Ventile ein.' : 'Lüftung bereit. Wähle zuerst einen Teamchef aus.'; }
  if(S.round === 10){ S.elevator={progress:[],solved:false}; S.message = S.teamChefId ? 'Fahrstuhl gestartet. Teamchef drückt die Etagenfolge.' : 'Fahrstuhl bereit. Wähle zuerst einen Teamchef aus.'; }
  if(S.round === 11) startFinaleWarning();
  else if(S.round < 6){ S.message = 'Runde ' + S.round + ' gestartet.'; }
}

function fullReset(keepPlayers=true){
  const newData = loadData();
  const t = Number(newData.bomb?.timerSeconds || 1800);
  const p = Number(newData.bomb?.errorPenaltySeconds || 60);
  const bt = Number(newData.bomb?.bombTimerSeconds || 300);
  const bp = Number(newData.bomb?.bombPenaltySeconds || 20);
  const players = keepPlayers ? S.players : [];
  S = {
    round:0, itemIndex:0, gameStarted:false, message:'Reset. Lobby geöffnet.', players,
    teamChefId:'', buzzedId:'', buzzerEnabled:false, teamChefRequired:false, showRules:false, revealed:false,
    locks:{}, codeEntries:{}, notes:{}, anagramSolved:false, safe:{progress:[],solved:false}, memory:{flipped:[]},
    bomb:{running:false,status:'bereit',phase:1,errors:0,wireProgress:[],timer:bt,initialSeconds:bt,penaltySeconds:bp},
    laser:{settings:{},solved:false}, potion:{selected:'',solved:false}, ventilation:{settings:{},solved:false}, elevator:{progress:[],solved:false},
    finale:{started:false,warningActive:false,acknowledgements:{}},
    escape:{timer:t, initialSeconds:t, running:false, errorPenaltySeconds:p, escaped:false},
    audio:{...(newData.audioConfig.global || {musicEnabled:true,musicVolume:.35,sfxVolume:.8})}, data:newData
  };
}

app.get('/api/:key', (req,res) => {
  try { res.json(readJson(req.params.key)); } catch(e){ res.status(404).json({error:e.message}); }
});
app.post('/api/:key', (req,res) => {
  try {
    writeJson(req.params.key, req.body);
    S.data = loadData();
    if(req.params.key === 'bomb'){
      S.escape.initialSeconds = Number(S.data.bomb.timerSeconds || S.escape.initialSeconds);
      S.escape.errorPenaltySeconds = Number(S.data.bomb.errorPenaltySeconds || S.escape.errorPenaltySeconds);
      S.bomb.initialSeconds = Number(S.data.bomb.bombTimerSeconds || S.bomb.initialSeconds || 300);
      S.bomb.penaltySeconds = Number(S.data.bomb.bombPenaltySeconds || S.bomb.penaltySeconds || 20);
      if(!S.gameStarted) { S.escape.timer = S.escape.initialSeconds; S.bomb.timer = S.bomb.initialSeconds; }
    }
    S.message = 'JSON gespeichert: ' + req.params.key;
    broadcast(); res.json({ok:true});
  } catch(e){ res.status(400).json({error:e.message}); }
});
app.get('/', (_,res)=>res.redirect('/player.html'));

io.on('connection', socket => {
  socket.emit('state', S);

  socket.on('player:join', ({name, avatar}) => {
    const old = S.players.find(p=>p.id===socket.id);
    const cleanName = String(name||'Spieler').slice(0,24);
    if(old){ old.name = cleanName || old.name; old.avatar = avatar || old.avatar; }
    else S.players.push({ id: socket.id, name: cleanName, avatar: avatar || '🧩' });
    S.message = cleanName + ' ist der Lobby beigetreten.';
    broadcast();
  });
  socket.on('disconnect', () => {
    S.players = S.players.filter(p=>p.id!==socket.id);
    delete S.notes[socket.id];
    if(S.finale?.acknowledgements) delete S.finale.acknowledgements[socket.id];
    if(S.finale?.warningActive && finaleAllAcknowledged()){ S.finale.started=true; S.finale.warningActive=false; S.message='Finale freigegeben. Jeder gegen jeden!'; }
    if(S.teamChefId===socket.id) S.teamChefId='';
    if(S.buzzedId===socket.id) S.buzzedId='';
    broadcast();
  });
  socket.on('player:note', txt => { S.notes[socket.id] = String(txt||'').slice(0,2000); broadcast(); });
  socket.on('player:code', ({id, code}) => {
    if(!S.gameStarted) return;
    const lock = (S.data.codes||[]).find(c=>c.id===id);
    if(!lock) return;
    const expected = (lock.type === 'lie_code' || lock.id === 'tuer4_luege') ? lieCodeForCurrentItem() : lock.code;
    const ok = String(code||'').trim().toUpperCase() === String(expected||'').trim().toUpperCase();
    if(ok){
      if(lock.requireAllPlayers){ S.codeEntries[id] = S.codeEntries[id] || {}; S.codeEntries[id][socket.id]=true; if(S.players.length && S.players.every(p=>S.codeEntries[id]?.[p.id])) unlock(id); }
      else unlock(id);
      S.message = lock.successText || 'Code richtig.';
      io.emit('playSound','correct');
    } else { penalty('Code falsch!'); io.emit('playSound','wrong'); }
    broadcast();
  });
  socket.on('player:finalEscape', code => {
    if(!S.gameStarted || S.round !== 11 || !S.finale?.started) return;
    const finalLock = (S.data.codes||[]).find(c=>c.id === 'final_exit');
    const expected = finalLock?.code || finalMemoryCode(S.data.finalMemory || {});
    const ok = String(code||'').trim().toUpperCase() === String(expected||'').trim().toUpperCase();
    if(ok){
      unlock('final_exit');
      S.escape.escaped = true;
      S.escape.running = false;
      const p = S.players.find(x=>x.id===socket.id);
      S.message = '🏆 ' + (p?.name || 'Ein Spieler') + ' ist durch die Tür entkommen!';
      io.emit('playSound','winner');
      io.emit('winner', p || {});
    } else { penalty('Finaler Exit-Code falsch!'); io.emit('playSound','wrong'); }
    broadcast();
  });
  socket.on('player:symbol', id => {
    if(!S.gameStarted || S.round!==2 || !isChef(socket.id) || S.safe.solved) return;
    const seq = S.data.symbolSafe.sequence || [];
    const next = seq[S.safe.progress.length];
    if(id === next){ S.safe.progress.push(id); io.emit('playSound','correct'); if(S.safe.progress.length===seq.length){ S.safe.solved=true; unlock('tuer2'); S.message='Symbol-Tresor geöffnet.'; } }
    else { S.safe.progress=[]; penalty('Falsches Symbol. Reihenfolge zurückgesetzt!'); io.emit('playSound','wrong'); }
    broadcast();
  });
  socket.on('player:anagram', ({word, number}) => {
    if(!S.gameStarted || S.round!==5 || !isChef(socket.id)) return;
    const item = (S.data.anagram||[])[0] || {};
    const rightWord = String(item.wordAnswer||'').toUpperCase();
    const rightNum = item.autoGenerateNumberCode ? alphabetCode(item.wordAnswer) : String(item.numberAnswer||'');
    if(String(word||'').trim().toUpperCase()===rightWord && String(number||'').trim()===rightNum){ S.anagramSolved=true; unlock('tuer5_buchstaben'); S.message=item.successText||'Buchstaben-Code gelöst.'; io.emit('playSound','correct'); }
    else { penalty('Buchstaben-Code falsch!'); io.emit('playSound','wrong'); }
    broadcast();
  });
  socket.on('player:wire', id => {
    if(!S.gameStarted || S.round!==6 || !isChef(socket.id) || S.bomb.status==='exploded' || S.bomb.status==='defused') return;
    const seq = S.data.wireBomb.sequence || [];
    const next = seq[S.bomb.wireProgress.length];
    if(id === next){
      S.bomb.wireProgress.push(id); S.message='Kabel korrekt getrennt.'; io.emit('playSound','correct');
      if(S.bomb.wireProgress.length===seq.length){ S.bomb.phase=2; S.bomb.status='phase2'; S.message='Phase 1 geschafft. Die Bombe ist noch nicht das Finale. Starte danach Runde 7 Laser-Raum.'; S.finale={started:false,warningActive:false,acknowledgements:{}}; }
    } else {
      S.bomb.errors++; bombPenalty('Falsches Kabel!'); io.emit('playSound','wrong');
      if(S.bomb.errors >= (S.data.bomb.maxErrors||3)){ S.bomb.status='exploded'; S.bomb.running=false; io.emit('playSound','explosion'); S.message='Die Bombe ist explodiert!'; }
    }
    broadcast();
  });
  socket.on('player:lieGuess', choice => { // alt: nicht mehr in der Oberfläche genutzt
    if(!S.gameStarted || S.round !== 4) return;
    const item = (S.data.lies || [])[S.itemIndex] || {};
    const expected = String(item.answer || item.liar || '').trim().toUpperCase();
    const selected = String(choice || '').trim().toUpperCase();
    if(!expected || !selected) return;
    if(selected === expected){
      unlock('tuer4');
      S.message = 'Richtig! Die Lüge wurde gefunden.';
      io.emit('playSound','correct');
    } else {
      penalty('Falsche Auswahl bei Wer lügt!');
      io.emit('playSound','wrong');
    }
    broadcast();
  });


  socket.on('player:laserSubmit', settings => {
    if(!S.gameStarted || S.round!==7 || !isChef(socket.id) || S.laser.solved) return;
    const sol = S.data.laserRoom?.solution || {};
    const ok = Object.keys(sol).length && Object.keys(sol).every(k => String((settings||{})[k]||'') === String(sol[k]||''));
    if(ok){ S.laser.settings = {...settings}; S.laser.solved = true; unlock('tuer7_laser'); S.message = S.data.laserRoom?.successText || 'Laser-Raum gelöst.'; io.emit('playSound','correct'); }
    else { S.laser.settings = {...(settings||{})}; penalty('Laser falsch ausgerichtet!'); io.emit('playSound','wrong'); }
    broadcast();
  });
  socket.on('player:potionChoose', id => {
    if(!S.gameStarted || S.round!==8 || !isChef(socket.id) || S.potion.solved) return;
    const ok = String(id||'') === String(S.data.potionRoom?.correctBottleId || '');
    S.potion.selected = String(id||'');
    if(ok){ S.potion.solved = true; unlock('tuer8_trank'); S.message = S.data.potionRoom?.successText || 'Richtiger Trank gewählt.'; io.emit('playSound','correct'); }
    else { penalty('Falscher Trank!'); io.emit('playSound','wrong'); }
    broadcast();
  });
  socket.on('player:ventilationSubmit', settings => {
    if(!S.gameStarted || S.round!==9 || !isChef(socket.id) || S.ventilation.solved) return;
    const sol = S.data.ventilationRoom?.solution || {};
    const ok = Object.keys(sol).length && Object.keys(sol).every(k => String((settings||{})[k]||'') === String(sol[k]||''));
    if(ok){ S.ventilation.settings = {...settings}; S.ventilation.solved = true; unlock('tuer9_lueftung'); S.message = S.data.ventilationRoom?.successText || 'Lüftungssystem gelöst.'; io.emit('playSound','correct'); }
    else { S.ventilation.settings = {...(settings||{})}; penalty('Lüftung falsch eingestellt!'); io.emit('playSound','wrong'); }
    broadcast();
  });
  socket.on('player:elevatorPress', id => {
    if(!S.gameStarted || S.round!==10 || !isChef(socket.id) || S.elevator.solved) return;
    const seq = S.data.elevatorRoom?.sequence || [];
    const next = seq[S.elevator.progress.length];
    if(String(id||'') === String(next||'')){
      S.elevator.progress.push(String(id));
      if(S.elevator.progress.length === seq.length){ S.elevator.solved = true; unlock('tuer10_fahrstuhl'); S.message = S.data.elevatorRoom?.successText || 'Fahrstuhl aktiviert.'; io.emit('playSound','correct'); }
      else { S.message = 'Etage korrekt. Nächste Etage wählen.'; io.emit('playSound','correct'); }
    } else { S.elevator.progress = []; penalty('Falsche Fahrstuhl-Etage! Reihenfolge zurückgesetzt.'); io.emit('playSound','wrong'); }
    broadcast();
  });
  socket.on('admin:resetLaser', () => { S.laser={settings:{},solved:false}; delete S.locks.tuer7_laser; broadcast(); });
  socket.on('admin:resetPotion', () => { S.potion={selected:'',solved:false}; delete S.locks.tuer8_trank; broadcast(); });
  socket.on('admin:resetVentilation', () => { S.ventilation={settings:{},solved:false}; delete S.locks.tuer9_lueftung; broadcast(); });
  socket.on('admin:resetElevator', () => { S.elevator={progress:[],solved:false}; delete S.locks.tuer10_fahrstuhl; broadcast(); });

  socket.on('player:memoryFlip', n => { if(!S.gameStarted || S.round!==11 || !S.finale?.started) return; S.memory.flipped = [Number(n)]; broadcast(); });

  socket.on('player:finaleAck', () => {
    if(!S.gameStarted || S.round !== 11 || !S.finale?.warningActive) return;
    S.finale.acknowledgements = S.finale.acknowledgements || {};
    S.finale.acknowledgements[socket.id] = true;
    const p = S.players.find(x=>x.id===socket.id);
    S.message = (p?.name || 'Ein Spieler') + ' hat den Systemfehler bestätigt.';
    if(finaleAllAcknowledged()){
      S.finale.started = true;
      S.finale.warningActive = false;
      S.message = 'Finale freigegeben. Team-Modus beendet. Jeder gegen jeden!';
    }
    broadcast();
  });

  socket.on('admin:startGame', () => { S.gameStarted = true; S.round = 1; S.itemIndex = 0; S.escape.timer = Number(S.escape.initialSeconds || 1800); S.escape.running = true; S.escape.escaped = false; S.message = 'Spiel gestartet. Entkommt, bevor die Zeit abläuft!'; broadcast(); });
  socket.on('admin:pauseGameTimer', v => { S.escape.running = !!v; broadcast(); });
  socket.on('admin:setGameTimer', seconds => { S.escape.initialSeconds = Math.max(60, Number(seconds||1800)); S.escape.timer = S.escape.initialSeconds; broadcast(); });
  socket.on('admin:setPenalty', seconds => { S.escape.errorPenaltySeconds = Math.max(0, Number(seconds||0)); broadcast(); });
  socket.on('admin:round', r => { if(!S.gameStarted) S.gameStarted = true; setRound(r); broadcast(); });
  socket.on('admin:setTeamChef', id => {
    S.teamChefId = String(id || '');
    if(S.teamChefId){
      const p = S.players.find(x => x.id === S.teamChefId);
      S.message = '👑 Teamchef gesetzt: ' + (p?.name || 'Spieler');
      if(S.round === 6){
        S.teamChefRequired = true;
        if(S.bomb.status === 'bereit' || S.bomb.status === 'paused'){
          S.bomb.status = 'läuft';
        }
        S.bomb.running = true;
      }
    } else {
      S.message = 'Teamchef entfernt.';
      if(S.round === 6){
        S.bomb.running = false;
        S.bomb.status = 'bereit';
      }
    }
    broadcast();
  });
  socket.on('admin:reset', () => { fullReset(true); broadcast(); });
  socket.on('admin:rules', v => { S.showRules=!!v; broadcast(); });
  socket.on('admin:next', () => { S.itemIndex++; S.revealed=false; broadcast(); });
  socket.on('admin:prev', () => { S.itemIndex=Math.max(0,S.itemIndex-1); S.revealed=false; broadcast(); });
  socket.on('admin:reveal', () => { S.revealed=!S.revealed; broadcast(); });
  socket.on('admin:winner', id => { const p=S.players.find(x=>x.id===id); S.message='🏆 Gewinner: '+(p?.name||'Spieler'); io.emit('winner', p||{}); io.emit('playSound','winner'); broadcast(); });
  socket.on('admin:unlockCode', id => { unlock(id); broadcast(); });
  socket.on('admin:resetCodes', () => { S.locks={}; S.codeEntries={}; broadcast(); });
  socket.on('admin:clearCodeEntries', id => { if(id) delete S.codeEntries[id]; else S.codeEntries={}; broadcast(); });
  socket.on('admin:clearAllNotes', () => { S.notes={}; broadcast(); });
  socket.on('admin:clearNote', id => { delete S.notes[id]; broadcast(); });
  socket.on('admin:resetAnagram', () => { S.anagramSolved=false; delete S.locks.tuer5_buchstaben; broadcast(); });
  socket.on('admin:resetSymbolSafe', () => { S.safe={progress:[],solved:false}; delete S.locks.tuer2; broadcast(); });
  socket.on('admin:resetMemory', () => { S.memory={flipped:[]}; broadcast(); });
  socket.on('admin:setAudio', obj => { S.audio={...S.audio,...(obj||{})}; broadcast(); });
  socket.on('admin:testSound', key => io.emit('playSound', key));
  socket.on('admin:bombTimer', act => { if(act==='start') S.bomb.running=true; if(act==='pause') S.bomb.running=false; if(act==='reset'){ S.bomb={running:false,status:'bereit',phase:1,errors:0,wireProgress:[],timer:Number(S.bomb.initialSeconds||S.data.bomb?.bombTimerSeconds||300),initialSeconds:Number(S.bomb.initialSeconds||S.data.bomb?.bombTimerSeconds||300),penaltySeconds:Number(S.bomb.penaltySeconds||S.data.bomb?.bombPenaltySeconds||20)}; } broadcast(); });
  socket.on('admin:addTime', n => { if(S.round===6) S.bomb.timer=Math.max(0,Number(S.bomb.timer||0)+Number(n||0)); else S.escape.timer=Math.max(0,S.escape.timer+Number(n||0)); broadcast(); });
  socket.on('admin:setBombTimer', seconds => { S.bomb.initialSeconds = Math.max(30, Number(seconds||300)); S.bomb.timer = S.bomb.initialSeconds; broadcast(); });
  socket.on('admin:setBombPenalty', seconds => { S.bomb.penaltySeconds = Math.max(0, Number(seconds||0)); broadcast(); });
  socket.on('admin:bombPhase', n => { S.bomb.phase=Number(n); broadcast(); });
  socket.on('admin:resetWires', () => { S.bomb.wireProgress=[]; S.bomb.errors=0; S.bomb.status='bereit'; broadcast(); });
});

let lastBombTickAt = 0;
setInterval(()=>{
  if(S.gameStarted && S.escape.running && !S.escape.escaped){
    S.escape.timer = Math.max(0, Number(S.escape.timer||0) - 1);
    if(S.escape.timer <= 0){
      S.escape.running=false;
      S.message='Zeit abgelaufen! Der Escape Room ist verloren.';
      io.emit('playSound','explosion');
    }
    broadcast();
  }
  if(S.gameStarted && S.round===6 && S.bomb.running && S.bomb.status !== 'exploded' && S.bomb.status !== 'defused'){
    S.bomb.timer = Math.max(0, Number(S.bomb.timer||0) - 1);
    const tickCfg = S.data.audioConfig?.bombTick || {};
    const minTickMs = Math.max(800, Number(tickCfg.minSecondsBetweenBeeps || 1.5) * 1000);
    const now = Date.now();
    if(tickCfg.enabled && S.bomb.timer > 0 && now - lastBombTickAt >= minTickMs){
      lastBombTickAt = now;
      io.emit('playSound','bombTick');
    }
    if(S.bomb.timer <= 0){
      S.bomb.running=false;
      S.bomb.status='exploded';
      S.message='Die Bombe ist explodiert!';
      io.emit('playSound','explosion');
    }
    broadcast();
  }
},1000);

server.listen(PORT, () => console.log('Gamesco Escape Quiz läuft auf Port ' + PORT));
