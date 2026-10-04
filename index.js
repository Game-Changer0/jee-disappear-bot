const fs = require('fs');
const path = require('path');

if (fs.existsSync('./auth_info') && process.env.CREDS_B64) {
  try{
    const files = fs.readdirSync('./auth_info');
    for(const f of files){
      if(f !== 'creds.json'){
        try{ fs.unlinkSync(path.join('./auth_info', f)); }catch{}
      }
    }
  }catch{}
}

if(process.env.CREDS_B64){
  try{
    const dir='./auth_info';
    if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'creds.json'), Buffer.from(process.env.CREDS_B64,'base64').toString('utf8'));
    console.log("✅ Restored creds");
  }catch(e){ console.log(e.message); }
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const app = express();
const PORT = process.env.PORT || 10000;

let sock, qrCodeData=null, isConnected=false;
const ACADEMIC_ALLIES_ID = "120363153088558278@g.us";

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ 
    version, 
    auth: state, 
    printQRInTerminal:false, 
    browser:["JEE Bot","Chrome","1.0"],
    syncFullHistory:false, 
    markOnlineOnConnect:false
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({connection, lastDisconnect, qr})=>{
    if(qr){ qrCodeData=qr; console.log("QR ready"); }
    if(connection==='open'){ isConnected=true; qrCodeData=null; console.log("✅ Connected"); setTimeout(()=>forceOff(),2000); }
    if(connection==='close'){
      isConnected=false;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("Closed",code);
      if(code !== DisconnectReason.loggedOut) setTimeout(startBot, 5000);
    }
  });
  sock.ev.on('groups.update', async (u)=>{
    try{ for(const x of u){ if(x.id===ACADEMIC_ALLIES_ID && x.ephemeralDuration!==0) await forceOff(); } }catch{}
  });
}

async function forceOff(){
  if(!isConnected || !sock) return;
  try{ await sock.groupToggleEphemeral(ACADEMIC_ALLIES_ID, 0); console.log("✅ OFF enforced"); }catch(e){ console.log("skip",e.message); }
}
setInterval(()=>{ if(isConnected) forceOff(); }, 60000);

app.get('/', (req,res)=>res.status(200).send(isConnected?"Connected ✅ - Academic Allies protected":"Starting... - wait 20s"));
app.get('/force-off', async (req,res)=>{ await forceOff(); res.status(200).send("OK - OFF enforced"); });
app.get('/qr', async (req,res)=>{
  if(isConnected) return res.send("Connected ✅");
  if(!qrCodeData) return res.status(200).send("No QR yet - refresh after 10s");
  const img = await QRCode.toDataURL(qrCodeData);
  res.send(`<center><img src="${img}"><br>Scan</center>`);
});
app.get('/groups', async (req,res)=>{
  if(!isConnected) return res.send("Not connected");
  const g = await sock.groupFetchAllParticipating();
  let h="<pre>"; for(const id in g) h+=`${g[id].subject}\n${id}\n\n`; res.send(h+"</pre>");
});
app.get('/auth', (req,res)=>{
  if(fs.existsSync('./auth_info/creds.json')) res.download('./auth_info/creds.json');
  else res.send("No creds");
});

app.listen(PORT, ()=>console.log("Server on "+PORT));
startBot();
