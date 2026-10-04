const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

let sock;
let qrCodeData = null;
let isConnected = false;

const ACADEMIC_ALLIES_ID = "120363411370862499@g.us"; // <-- PUT YOUR REAL ID HERE

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, printQRInTerminal: false, browser: ["JEE Bot","Chrome","1.0"] });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if(qr){ qrCodeData = qr; console.log("QR Generated"); }
    if(connection === 'open'){
      isConnected = true; qrCodeData = null;
      console.log("✅ Connected");
      forceOff();
    }
    if(connection === 'close'){
      isConnected = false;
      if(lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    }
  });

  // Listen for change
  sock.ev.on('groups.update', async (updates) => {
    for(const u of updates){
      if(u.id === ACADEMIC_ALLIES_ID && u.ephemeralDuration && u.ephemeralDuration !== 0){
        console.log("Detected ON - turning OFF");
        await forceOff();
      }
    }
  });
}

async function forceOff(){
  if(!sock || !isConnected) return;
  try{
    await sock.groupToggleEphemeral(ACADEMIC_ALLIES_ID, 0);
    console.log("✅ Disappearing OFF enforced for Academic Allies");
  }catch(e){ console.log("forceOff error", e.message); }
}

// Auto check every 30 sec - so even if event missed, it will turn off again
setInterval(()=>{ forceOff(); }, 30000);

app.get('/', (req,res)=> res.send(isConnected ? "Connected ✅" : "Not Connected - /qr"));
app.get('/qr', async (req,res)=>{
  if(isConnected) return res.send("Already Connected ✅");
  if(!qrCodeData) return res.send("No QR - refresh in 10s");
  const img = await QRCode.toDataURL(qrCodeData);
  res.send(`<center><h2>Scan QR</h2><img src="${img}"><br><a href="/qr">Refresh</a><br><a href="/groups">Groups</a><br><a href="/auth">Download Auth</a></center>`);
});
app.get('/groups', async (req,res)=>{
  if(!isConnected) return res.send("Not connected");
  const groups = await sock.groupFetchAllParticipating();
  let html = "<pre>";
  for(const id in groups) html += `${groups[id].subject}\n${id}\n\n`;
  res.send(html+"</pre>");
});
app.get('/auth', (req,res)=>{
  try{
    const credsPath = './auth_info/creds.json';
    if(fs.existsSync(credsPath)){
      res.download(credsPath, 'creds.json');
    } else {
      res.send("No creds yet - connect first then try again. Path: "+credsPath+" exists? "+fs.existsSync('./auth_info'));
    }
  }catch(e){ res.send("Auth error: "+e.message); }
});
app.get('/force-off', async (req,res)=>{
  await forceOff();
  res.send("Forced OFF");
});

app.listen(PORT, ()=>console.log("Server on "+PORT));
startBot();
