const fs = require('fs');
const path = require('path');

// --- AUTO RESTORE CREDS FROM ENV (so no QR needed after deploy) ---
(function restoreCreds(){
  try{
    if(process.env.CREDS_B64){
      const dir = './auth_info';
      if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
      const credsJson = Buffer.from(process.env.CREDS_B64, 'base64').toString('utf8');
      fs.writeFileSync(path.join(dir, 'creds.json'), credsJson);
      console.log("✅ Restored creds from CREDS_B64 env");
    }
  }catch(e){ console.log("Restore failed:", e.message); }
})();

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const app = express();
const PORT = process.env.PORT || 10000;

let sock; let qrCodeData=null; let isConnected=false;
const ACADEMIC_ALLIES_ID = "120363411370862499@g.us"; // your ID

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, printQRInTerminal:false, browser: ["JEE Bot","Chrome","1.0"] });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update)=>{
    const { connection, lastDisconnect, qr } = update;
    if(qr){ qrCodeData=qr; console.log("QR Generated"); }
    if(connection==='open'){ isConnected=true; qrCodeData=null; console.log("✅ Connected"); forceOff(); }
    if(connection==='close'){
      isConnected=false;
      if(lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    }
  });
  sock.ev.on('groups.update', async (updates)=>{
    for(const u of updates){
      if(u.id===ACADEMIC_ALLIES_ID && u.ephemeralDuration && u.ephemeralDuration!==0){
        console.log("Detected disappearing ON - turning OFF");
        await forceOff();
      }
    }
  });
}
async function forceOff(){
  if(!sock || !isConnected) return;
  try{ await sock.groupToggleEphemeral(ACADEMIC_ALLIES_ID, 0); console.log("✅ OFF enforced"); }catch(e){ console.log(e.message); }
}
setInterval(()=>forceOff(), 30000);

app.get('/', (req,res)=>res.send(isConnected ? "Connected ✅" : "Not Connected - /qr"));
app.get('/qr', async (req,res)=>{
  if(isConnected) return res.send("Already Connected ✅ <a href='/force-off'>Force OFF</a>");
  if(!qrCodeData) return res.send("No QR - refresh in 10s");
  const img = await QRCode.toDataURL(qrCodeData);
  res.send(`<center><h2>Scan</h2><img src="${img}"><br><a href="/qr">Refresh</a> | <a href="/auth">Download Auth</a></center>`);
});
app.get('/groups', async (req,res)=>{
  if(!isConnected) return res.send("Not connected");
  const groups = await sock.groupFetchAllParticipating();
  let html="<pre>"; for(const id in groups) html+=`${groups[id].subject}\n${id}\n\n`; res.send(html+"</pre>");
});
app.get('/auth', (req,res)=>{
  if(fs.existsSync('./auth_info/creds.json')) res.download('./auth_info/creds.json');
  else res.send("No creds yet");
});
app.get('/force-off', async (req,res)=>{ await forceOff(); res.send("Forced OFF"); });
app.listen(PORT, ()=>console.log("Server on "+PORT));
startBot();
