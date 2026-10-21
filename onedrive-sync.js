/* OneDrive sync without a paid backend. OAuth 2.0 authorization code + PKCE; Microsoft Graph app folder. */
(function () {
  'use strict';
  const M=window.TreeMerge;
  const CLIENT_KEY='tree-task.onedrive.client-id';
  const TOKENS_KEY='tree-task.onedrive.tokens.v2';
  const PKCE_KEY='tree-task.onedrive.pkce.v2';
  const BASE_KEY='tree-task.onedrive.base.v2';
  const RECOVERY_KEY='tree-task.recovery.v2';
  const AUTH='https://login.microsoftonline.com/common/oauth2/v2.0';
  const GRAPH='https://graph.microsoft.com/v1.0';
  const LIMITED_SCOPE='openid profile offline_access Files.ReadWrite.AppFolder';
  const BROAD_SCOPE='openid profile offline_access Files.ReadWrite';
  const FILE='tree-task.json';
  const INITIAL_DELAY=2600;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function getJSON(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
  function setJSON(key,v){localStorage.setItem(key,JSON.stringify(v));}
  function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function random(){const b=new Uint8Array(32);crypto.getRandomValues(b);return b64url(b);}
  function decodeId(jwt){try{return JSON.parse(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{return {};}}
  function nameFromToken(t){const c=decodeId(t.id_token||'');return c.preferred_username||c.name||'Microsoft account';}
  class RemoteError extends Error {constructor(message,status){super(message);this.status=status;}}
  class OneDriveSync {
    constructor(ui){this.ui=ui;this.timer=0;this.lock=false;this.pending=false;this.pause=false;this.dialogMode='';this.tokens=getJSON(TOKENS_KEY);this.accountKey=null;this.base=null;this.folderId=null;this.cloud=null;this.latestConflict=null;this.status('offline','Saved on this device');}
    get clientId(){return(localStorage.getItem(CLIENT_KEY)||'').trim();}
    get redirectUri(){return(location.origin+location.pathname);}
    get configured(){return /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(this.clientId);}
    get connected(){return Boolean(this.tokens?.access_token&&this.accountKey);}
    status(kind,message){this.ui.status(kind,message,this.connected,nameFromToken(this.tokens||{}));}
    async start(){
      try {
        const query=new URLSearchParams(location.search);
        if(query.has('code')||query.has('error')){
          // Never preserve temporary OAuth codes in browser history.
          history.replaceState(null,'',this.redirectUri+location.hash);
          await this.handleRedirect(query);
        }
        if(this.tokens?.access_token&&this.configured){
          await this.identify();this.status('pending','Checking OneDrive…');this.schedule(100);
        } else this.status('offline',this.configured?'Connect OneDrive in settings':'Local only · Set up OneDrive');
      } catch(e){this.error(e);}
    }
    async signIn(clientId,broad=false){
      if(!isSecureContext||!crypto.subtle) throw Error('Open Tree Task on HTTPS or localhost to sign in.');
      if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(clientId.trim()))throw Error('Enter the Application (client) ID from your Microsoft registration.');
      localStorage.setItem(CLIENT_KEY,clientId.trim());
      const verifier=random();const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
      const state=random();
      const scope=broad?BROAD_SCOPE:LIMITED_SCOPE;
      sessionStorage.setItem(PKCE_KEY,JSON.stringify({state,verifier,scope,redirectUri:this.redirectUri,issued:Date.now()}));
      const q=new URLSearchParams({client_id:clientId.trim(),response_type:'code',redirect_uri:this.redirectUri,response_mode:'query',scope,code_challenge:b64url(digest),code_challenge_method:'S256',state,prompt:'select_account'});
      location.assign(AUTH+'/authorize?'+q);
    }
    async handleRedirect(q){
      const saved=JSON.parse(sessionStorage.getItem(PKCE_KEY)||'null');sessionStorage.removeItem(PKCE_KEY);
      if(!saved||!q.get('state')||saved.state!==q.get('state')||saved.redirectUri!==this.redirectUri||Date.now()-saved.issued>15*60*1000)throw Error('Sign-in verification expired or failed. Please try connecting again.');
      if(q.has('error'))throw Error('Microsoft sign-in: '+(q.get('error_description')||q.get('error')));
      const params={client_id:this.clientId,grant_type:'authorization_code',code:q.get('code'),redirect_uri:this.redirectUri,code_verifier:saved.verifier,scope:saved.scope||LIMITED_SCOPE};
      this.tokens=await this.postToken(params);
      await this.identify();
      this.status('pending','Connected · Loading OneDrive…');
      this.schedule(100);
    }
    async postToken(params){
      let res;
      try{res=await fetch(AUTH+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),cache:'no-store'});}catch{throw new RemoteError('Cannot reach Microsoft sign-in. Check internet connection.',0);}
      let body={};try{body=await res.json();}catch{}
      if(!res.ok)throw new RemoteError(body.error_description||'Microsoft sign-in needs to be repeated.',res.status);
      const value={...body,requested_scope:params.scope||this.tokens?.requested_scope||LIMITED_SCOPE,received_at:Date.now(),id_token:body.id_token||this.tokens?.id_token,refresh_token:body.refresh_token||this.tokens?.refresh_token};
      setJSON(TOKENS_KEY,value);return value;
    }
    async token(){
      if(!this.tokens)throw Error('Connect to OneDrive first.');
      if(this.tokens.access_token&&Date.now()<this.tokens.received_at+(Number(this.tokens.expires_in||3600)-90)*1000)return this.tokens.access_token;
      if(!this.tokens.refresh_token)throw new RemoteError('Sign in to OneDrive again to resume syncing.',401);
      this.tokens=await this.postToken({client_id:this.clientId,grant_type:'refresh_token',refresh_token:this.tokens.refresh_token,scope:this.tokens.requested_scope||LIMITED_SCOPE});
      return this.tokens.access_token;
    }
    async graph(path,method='GET',body=null,extra={}){
      const bearer=await this.token();
      let res;try{res=await fetch(GRAPH+path,{method,headers:{Authorization:'Bearer '+bearer,...extra},body,cache:'no-store'});}catch{throw new RemoteError('Offline. Your tasks remain saved locally.',0);}
      if(!res.ok){let msg='';try{const err=await res.json();msg=err.error?.message||'';}catch{}
        throw new RemoteError(msg||`OneDrive returned HTTP ${res.status}.`,res.status);
      }
      if(res.status===204)return null;
      return res.json();
    }
    async identify(){
      const drive=await this.graph('/me/drive?$select=id,driveType');
      const next=this.clientId+':'+drive.id;
      if(this.accountKey!==next){this.folderId=null;this.accountKey=next;const saved=getJSON(BASE_KEY);
        this.base=saved?.accountKey===next&&saved?.baseNodes?{...saved,baseNodes:M.validate(saved.baseNodes)}:null;}
      this.status('pending','OneDrive connected');
    }
    async getFolder(){if(this.folderId)return this.folderId;const item=await this.graph('/me/drive/special/approot');this.folderId=item.id;return item.id;}
    async getRemote(){
      const folder=await this.getFolder();let item;
      try{item=await this.graph(`/me/drive/items/${encodeURIComponent(folder)}:/${FILE}`);}catch(e){if(e.status===404)return null;throw e;}
      let url=item['@microsoft.graph.downloadUrl'];
      if(!url){item=await this.graph(`/me/drive/items/${encodeURIComponent(item.id)}?$select=id,name,eTag,@microsoft.graph.downloadUrl`);url=item['@microsoft.graph.downloadUrl'];}
      if(!url)throw Error('OneDrive did not provide a file download URL. No changes were applied.');
      let res;try{res=await fetch(url,{cache:'no-store'});}catch{throw new RemoteError('Could not download the task file. Local tasks are safe.',0);}
      if(!res.ok)throw new RemoteError('Could not read task file from OneDrive.',res.status);
      const text=await res.text();let parsed;
      try{parsed=JSON.parse(text);}catch{throw Error('The OneDrive task file is not valid JSON. No changes were applied.');}
      if(parsed?.version!==1)throw Error('Unknown OneDrive file format. No changes were applied.');
      return {id:item.id,etag:item.eTag,nodes:M.validate(parsed.nodes)};
    }
    async createFile(nodes){
      // Explicit conflictBehavior:fail prevents two new devices creating over each other.
      // An upload session avoids leaving a zero-byte placeholder if the browser closes.
      const folder=await this.getFolder();let session;
      try{
        session=await this.graph(`/me/drive/items/${encodeURIComponent(folder)}:/${FILE}:/createUploadSession`,
          'POST',JSON.stringify({item:{name:FILE,'@microsoft.graph.conflictBehavior':'fail'}}),
          {'Content-Type':'application/json'});
      }catch(e){if(e.status===409||e.status===412)return null;throw e;}
      if(!session?.uploadUrl||!session.uploadUrl.startsWith('https://'))throw Error('OneDrive did not provide a safe upload session URL.');
      const bytes=new TextEncoder().encode(JSON.stringify({version:1,nodes}));
      let res;
      try{
        // OneDrive upload session URLs contain their own short-lived authorization.
        // Microsoft explicitly warns not to send the Graph access token to this URL.
        res=await fetch(session.uploadUrl,{method:'PUT',headers:{
          'Content-Range':`bytes 0-${bytes.length-1}/${bytes.length}`,
          'Content-Type':'application/octet-stream'
        },body:bytes,cache:'no-store'});
      }catch{throw new RemoteError('OneDrive upload interrupted. Your tasks are saved locally.',0);}
      if(res.status===409||res.status===412)return null;
      if(!res.ok)throw new RemoteError('OneDrive upload failed with HTTP '+res.status,res.status);
      let item=null;try{item=await res.json();}catch{}
      if(!item?.id||!item?.eTag)throw Error('OneDrive did not confirm the new file. Check sync before continuing.');
      return {id:item.id,etag:item.eTag,nodes};
    }
    async putFile(id,etag,nodes){
      if(!etag)throw Error('OneDrive did not supply an ETag. Cannot safely upload.');
      const raw=JSON.stringify({version:1,nodes});
      const item=await this.graph(`/me/drive/items/${encodeURIComponent(id)}/content`,'PUT',raw,{'Content-Type':'application/json','If-Match':etag});
      if(!item?.eTag)throw Error('Upload response has no ETag; please retry syncing.');
      return {id:item.id,etag:item.eTag,nodes};
    }
    remember(nodes,label){
      try{const list=getJSON(RECOVERY_KEY)||[];list.unshift({at:new Date().toISOString(),label,nodes:M.clone(nodes)});
        while(list.length>5)list.pop();setJSON(RECOVERY_KEY,list);}catch(e){console.warn('Recovery copy could not be stored',e);}
    }
    storeBase(remote){
      this.base={accountKey:this.accountKey,baseNodes:M.clone(remote.nodes),id:remote.id,etag:remote.etag};
      setJSON(BASE_KEY,this.base);
    }
    onChange(){if(this.connected&&!this.pause)this.schedule(INITIAL_DELAY);else if(this.connected)this.status('pending','Local changes awaiting sync');}
    schedule(ms=INITIAL_DELAY){clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync(),ms);}
    async sync(){
      if(this.lock){this.pending=true;return;}
      if(!this.tokens||!this.configured)return;
      if(!navigator.onLine){this.status('offline','Offline · Saved on this device');return;}
      if(this.pause){this.status('conflict','Sync paused · Review changes');return;}
      if(this.ui.isEditing()){this.schedule(4000);this.status('pending','Saved locally · Waiting until editing ends');return;}
      this.lock=true;
      this.status('pending','Syncing with OneDrive…');
      try{
        if(!this.accountKey)await this.identify();
        for(let attempts=0;attempts<3;attempts++){
          const local=M.clone(this.ui.getNodes());
          const remote=await this.getRemote();
          if(!M.equal(local,this.ui.getNodes())){this.schedule(600);return;}
          if(!this.base){
            if(remote){this.requestDecision('first',local,remote,'OneDrive already contains a tree. Choose which one to use on this device.');return;}
            const created=await this.createFile(local);
            if(!created)continue;
            this.storeBase(created);this.finish(local);return;
          }
          if(!remote){this.requestDecision('missing',local,null,'The OneDrive file was deleted. Choose whether to recreate it or disconnect from sync.');return;}
          const base=this.base.baseNodes;
          const localChanged=!M.equal(local,base), remoteChanged=!M.equal(remote.nodes,base);
          if(!localChanged){
            if(remoteChanged){if(this.ui.isEditing()||!M.equal(local,this.ui.getNodes())){this.schedule(800);return;}
              this.remember(local,'Before downloading OneDrive changes');this.ui.setNodes(remote.nodes);}
            this.storeBase(remote);this.finish(remote.nodes);return;
          }
          let upload=local;
          if(remoteChanged){
            const merged=M.merge(base,local,remote.nodes);
            if(!merged.ok){this.requestDecision('conflict',local,remote,merged.reason);return;}
            upload=merged.nodes;
          }
          try{
            const written=await this.putFile(remote.id,remote.etag,upload);
            this.storeBase(written);
            if(M.equal(local,this.ui.getNodes())&&!this.ui.isEditing()&&!M.equal(local,upload)){
              this.remember(local,'Before merging changes from OneDrive');this.ui.setNodes(upload);
            }
            this.finish(upload);return;
          }catch(e){if(e.status===409||e.status===412)continue;throw e;}
        }
        this.status('pending','OneDrive changed during sync · Retry');this.schedule(6000);
      }catch(e){this.error(e);}finally{this.lock=false;if(this.pending){this.pending=false;this.schedule(400);}}
    }
    finish(expected){
      const clean=M.equal(expected,this.ui.getNodes());this.status(clean?'ok':'pending',clean?'Synced with OneDrive':'Saved locally · Upload pending');
      if(!clean)this.schedule(900);
    }
    error(e){console.warn('Tree Task sync:',e);const authIssue=[400,401,403].includes(e.status)&&(!navigator.onLine||e.status===401);
      this.status('error',authIssue?'OneDrive sign-in may need renewal':(e.message||'Sync failed; changes saved locally'));
    }
    requestDecision(mode,local,remote,reason){this.pause=true;this.latestConflict={mode,local,remote,reason};
      this.status('conflict','Needs your choice · No changes overwritten');this.ui.conflict(this.latestConflict);
    }
    async decide(choice){
      const issue=this.latestConflict;if(!issue)return;
      if(choice==='later'){this.ui.closeConflict();return;}
      if(!M.equal(issue.local,this.ui.getNodes())){this.pause=false;this.latestConflict=null;this.ui.closeConflict();this.schedule(200);return;}
      if(choice==='cloud'){
        const latest=await this.getRemote();
        if(!latest||!issue.remote||latest.etag!==issue.remote.etag){this.pause=false;this.latestConflict=null;this.ui.closeConflict();this.schedule(300);return;}
        this.remember(issue.local,'Before selecting OneDrive tree');this.ui.setNodes(latest.nodes);this.storeBase(latest);
        this.pause=false;this.latestConflict=null;this.ui.closeConflict();this.finish(latest.nodes);return;
      }
      if(choice==='local'){
        const latest=await this.getRemote();
        if((latest?.etag||null)!==(issue.remote?.etag||null)){
          this.pause=false;this.latestConflict=null;this.ui.closeConflict();this.schedule(200);return;
        }
        if(latest)this.remember(latest.nodes,'OneDrive copy before choosing this device');
        let written;
        if(latest)written=await this.putFile(latest.id,latest.etag,issue.local);
        else written=await this.createFile(issue.local);
        if(!written){this.pause=false;this.latestConflict=null;this.ui.closeConflict();this.schedule(250);return;}
        this.storeBase(written);this.pause=false;this.latestConflict=null;this.ui.closeConflict();this.finish(issue.local);
      }
    }
    async select(choice){try{this.status('pending','Resolving sync choice…');await this.decide(choice);}catch(e){this.error(e);this.ui.conflict(this.latestConflict);}}
    force(){this.pause=false;this.latestConflict=null;this.ui.closeConflict();this.sync();}
    disconnect(){
      clearTimeout(this.timer);this.pause=true;this.tokens=null;this.accountKey=null;this.base=null;this.folderId=null;
      localStorage.removeItem(TOKENS_KEY);localStorage.removeItem(BASE_KEY);this.status('offline','Disconnected · Data stays on device');
    }
    recovery(){return getJSON(RECOVERY_KEY)||[];}
  }
  window.TreeOneDrive = OneDriveSync;
})();
