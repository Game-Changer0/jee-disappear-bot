const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

let sock;
let qrCodeData = null;
let isConnected = false;
let lastQRTime = 0;

// --- EDIT THIS: Groups you want disappearing on ---
// Leave empty [] to apply to ALL groups
const TARGET_GROUPS = []; 
// Example: ["120363153088558278@g.us", "120363259468433847@g.us"]

// disappearing time: 0=off, 86400=24h, 604800=7days, 7776000=90days
const DISAPPEARING_DURATION = 86400; // 24 hours

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();
  
  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["JEE Bot", "Chrome", "1.0"]
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if(qr){
      qrCodeData = qr;
      lastQRTime = Date.now();
      console.log("QR Generated");
    }
    if(connection === 'open'){
      isConnected = true;
      qrCodeData = null;
      console.log("✅ Connected!");
      // save auth to backup file for you to download if needed
      try{
        if(fs.existsSync('./auth_info/creds.json')){
          const creds = fs.readFileSync('./auth_info/creds.json', 'utf8');
          fs.writeFileSync('./auth_backup.json', creds);
          console.log("Auth backed up to auth_backup.json");
        }
      }catch{}
    }
    if(connection === 'close'){
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed", lastDisconnect?.error);
      isConnected = false;
      if(shouldReconnect) startBot();
    }
  });

  // Ignore all messages - do nothing
  sock.ev.on('messages.upsert', async () => {});
}

async function setDisappearingForGroups(){
  if(!sock || !isConnected) return "Not connected";
  try{
    const groups = await sock.groupFetchAllParticipating();
    let count = 0;
    for(const id in groups){
      if(TARGET_GROUPS.length > 0 && !TARGET_GROUPS.includes(id)) continue;
      try{
        await sock.groupToggleEphemeral(id, DISAPPEARING_DURATION);
        console.log(`✅ Disappearing set for ${groups[id].subject} - ${id}`);
        count++;
        await new Promise(r=>setTimeout(r,2000));
      }catch(e){ console.log(`Fail ${id}: ${e.message}`); }
    }
    return `Done - Set for ${count} groups`;
  }catch(e){ return `Error: ${e.message}`; }
}

// --- Routes ---
app.get('/', (req,res)=>{
  res.send(isConnected ? "Bot Connected ✅" : "Bot Not Connected - scan /qr");
});

app.get('/qr', async (req,res)=>{
  if(isConnected) return res.send("<h2>Already Connected ✅</h2><a href='/set-disappear'>Set Disappearing Now</a>");
  if(!qrCodeData) return res.send("No QR yet, refresh after 10 sec. If expired, wait for new one.");
  try{
    const qrImg = await QRCode.toDataURL(qrCodeData);
    res.send(`<div style="text-align:center"><h2>Scan QR (Valid 60 sec)</h2><img src="${qrImg}"><br><br><a href="/qr">Refresh QR</a><br><a href="/groups">List Groups</a></div>`);
  }catch(e){ res.send("Error generating QR"); }
});

app.get('/groups', async (req,res)=>{
  if(!isConnected) return res.send("Not connected");
  try{
    const groups = await sock.groupFetchAllParticipating();
    let html = "<h2>Groups:</h2><pre>";
    for(const id in groups){
      html += `${groups[id].subject}\n${id}\n\n`;
    }
    html += "</pre><p>Copy the ID you want and put in TARGET_GROUPS in index.js</p>";
    res.send(html);
  }catch(e){ res.send(e.message); }
});

app.get('/set-disappear', async (req,res)=>{
  const result = await setDisappearingForGroups();
  res.send(result);
});

app.get('/auth', (req,res)=>{
  // Download auth to save it - so you don't need QR again
  if(fs.existsSync('./auth_backup.json')){
    res.download('./auth_backup.json');
  }else{
    res.send("No auth backup yet. Connect first.");
  }
});

app.listen(PORT, ()=>console.log(`Server on ${PORT}`));
startBot();
