const fs = require('fs');
const path = require('path');

// FORCE CLEAN if no CREDS_B64 - to get fresh QR
if(!process.env.CREDS_B64 && fs.existsSync('./auth_info')){
  console.log("No CREDS_B64 found - deleting old auth to force QR");
  try{ fs.rmSync('./auth_info', {recursive:true, force:true}); }catch{}
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
  sock = makeWASocket({ version, auth: state, printQRInTerminal:false, browser:["JEE Bot","Chrome","1.0"], syncFullHistory:false, markOnlineOnConnect:false });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({connection, lastDisconnect, qr})=>{
    if(qr){ qrCodeData=qr; console.log("QR ready - scan now"); }
    if(connection==='open'){ isConnected=true; qrCodeData=null; console.log("✅ Connected"); setTimeout(()=>forceOff(),2000); }
    if(connection==='close'){
      isConnected=false;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("Closed",code);
      if(code === DisconnectReason.loggedOut){
        console.log("Logged out - deleting auth");
        try{ fs.rmSync('./auth_info',{recursive:true, force:true}); }catch{}
      }
      if(code !== DisconnectReason.loggedOut) setTimeout(startBot, 5000);
    }
  });
  sock.ev.on('groups.update', async (u)=>{ try{ for(const x of u){ if(x.id===ACADEMIC_ALLIES_ID && x.ephemeralDuration!==0) await forceOff(); } }catch{} });
}
async function forceOff(){
  if(!isConnected || !sock) return;
  try{ await sock.groupToggleEphemeral(ACADEMIC_ALLIES_ID, 0); console.log("✅ OFF enforced"); }catch(e){ console.log("skip",e.message); }
}
setInterval(()=>{ if(isConnected) forceOff(); }, 60000);

app.get('/', (req,res)=>res.status(200).send(isConnected?"Connected ✅":"Starting - go to /qr"));
app.get('/force-off', async (req,res)=>{ await forceOff(); res.status(200).send("OK"); });
app.get('/qr', async (req,res)=>{
  if(isConnected) return res.send("Connected ✅ Already");
  if(!qrCodeData) return res.status(200).send("Generating QR... wait 10s and refresh this page");
  const img = await QRCode.toDataURL(qrCodeData);
  res.send(`<center><h2>Scan in WhatsApp > Linked Devices</h2><img src="${img}"><br><br><a href="/qr">Refresh</a></center>`);
});
app.get('/groups', async (req,res)=>{
  if(!isConnected) return res.send("Not connected");
  const g = await sock.groupFetchAllParticipating();
  let h="<pre>"; for(const id in g) h+=`${g[id].subject}\n${id}\n\n`; res.send(h+"</pre>");
});
app.get('/auth', (req,res)=>{
  if(fs.existsSync('./auth_info/creds.json')) res.download('./auth_info/creds.json');
  else res.send("No creds - connect first");
});
app.listen(PORT, ()=>console.log("Server on "+PORT));
startBot();
