const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const app = express();
const PORT = process.env.PORT || 10000;

let sock;
let qrCodeData = null;
let isConnected = false;

// === SET ONLY YOUR ACADEMIC ALLIES GROUP ID HERE ===
const ACADEMIC_ALLIES_ID = "120363411370862499@g.us"; // <-- REPLACE WITH REAL ID from /groups

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
      console.log("✅ Connected! Watching only:", ACADEMIC_ALLIES_ID);
      // Ensure disappearing OFF on start
      try{ await sock.groupToggleEphemeral(ACADEMIC_ALLIES_ID, 0); console.log("✅ Academic Allies: Disappearing forced OFF"); }catch(e){ console.log("Initial off fail:", e.message); }
    }
    if(connection === 'close'){
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      isConnected = false;
      if(shouldReconnect) startBot();
    }
  });

  // AUTO-ENFORCE: whenever group settings change
  sock.ev.on('groups.update', async (updates) => {
    for(const update of updates){
      if(update.id === ACADEMIC_ALLIES_ID && update.ephemeralDuration !== undefined){
        if(update.ephemeralDuration !== 0){
          console.log(`Someone turned ON disappearing (${update.ephemeralDuration}s) in Academic Allies - turning OFF...`);
          await new Promise(r=>setTimeout(r,1500));
          try{
            await sock.groupToggleEphemeral(ACADEMIC_ALLIES_ID, 0);
            console.log("✅ Auto turned OFF again");
          }catch(e){ console.log("Auto-off fail:", e.message); }
        }
      }
    }
  });

  sock.ev.on('messages.upsert', async () => {});
}

app.get('/', (req,res)=> res.send(isConnected ? `Bot Connected ✅ Watching ONLY ${ACADEMIC_ALLIES_ID}` : "Not Connected - go to /qr"));
app.get('/qr', async (req,res)=>{
  if(isConnected) return res.send("Already Connected ✅");
  if(!qrCodeData) return res.send("No QR yet, wait 10s and refresh");
  const qrImg = await QRCode.toDataURL(qrCodeData);
  res.send(`<div style="text-align:center"><h2>Scan QR</h2><img src="${qrImg}"><br><a href="/qr">Refresh</a></div>`);
});
app.get('/groups', async (req,res)=>{
  if(!isConnected) return res.send("Not connected");
  const groups = await sock.groupFetchAllParticipating();
  let html = "<h2>Copy ID for Academic Allies:</h2><pre>";
  for(const id in groups){ html += `${groups[id].subject}\n${id}\n\n`; }
  res.send(html+"</pre>");
});

app.listen(PORT, ()=>console.log(`Server on ${PORT}`));
startBot();
