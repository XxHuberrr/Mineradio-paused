'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const crypto=require('node:crypto');
const native=require('../desktop/qishui-native-playback');
const qishui=require('../qishui-api');
const https=require('node:https');
const identity={deviceId:'7000000000000000',installId:'700000000000000'};

test('Mac playback signs its matching platform/version and final POST bytes, without browser-only headers',()=>{
 const r=native.buildTrackRequest('test-track','sessionid=fixture',identity);
 const url=new URL(r.url);
 assert.equal(url.hostname,'api.qishui.com');
 assert.equal(url.searchParams.get('device_platform'),'mac');
 assert.equal(url.searchParams.get('device_type'),'MacOS');
 assert.equal(url.searchParams.get('version_name'),'2.9.1');
 assert.equal(url.searchParams.get('version_code'),'20090100');
 assert.equal(url.searchParams.get('device_id'),identity.deviceId);
 assert.equal(url.searchParams.get('iid'),identity.installId);
 assert.equal(r.headers['User-Agent'],'LunaPC/2.9.1(273418830)');
 assert.equal(r.headers.Host,url.host);
 assert.equal(r.headers.Connection,'close');
 assert(!Object.keys(r.headers).some(k=>/^(origin|referer)$/i.test(k)));
 assert.deepEqual(JSON.parse(r.body),{track_id:'test-track',media_type:'track',queue_type:''});
 assert.equal(r.headers['Content-Length'],Buffer.byteLength(r.body));
 assert.equal(r.headers['X-SS-STUB'],crypto.createHash('md5').update(r.body).digest('hex').toUpperCase());
 assert.throws(()=>native.buildTrackRequest('id','cookie',{}),/identity/i);
});

test('native signing keeps account credentials in stdin and terminates a hung helper',async()=>{
 let call,input,child;
 function spawn(executable,args,options){
   call={executable,args,options};child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
   child.stdin={end:value=>{input=value;}};child.kill=()=>{child.killed=true;};return child;
 }
 const r=native.buildTrackRequest('fixture','sessionid=secret-fixture',identity);
 const pending=native.signRequest({executable:'/official/汽水音乐',modulePath:'/official/bdms.node'},r,{spawn,timeoutMs:20});
 await assert.rejects(pending,/timeout/i);
 assert.equal(child.killed,true);
 assert(!call.args.join(' ').includes('secret-fixture'));
 assert.equal(JSON.parse(input).headers.Cookie,'sessionid=secret-fixture');
 assert.equal(call.options.env.ELECTRON_RUN_AS_NODE,'1');
});

test('native signing accepts only complete signatures and rejects injected header values',async()=>{
 for(const headers of [{'X-Helios':'one','x-helios':'duplicate'}, {'X-Helios':'one'}, {'X-Helios':'one','X-Medusa':'bad\r\nInjected: yes'}, {'X-Helios':'one','X-Medusa':'two'}]){
   const spawn=()=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
     child.stdin={end:()=>queueMicrotask(()=>{child.stdout.emit('data',Buffer.from('MR_SIGNATURE:'+JSON.stringify(headers)+'\n'));child.emit('close',0);})};return child;};
   const pending=native.signRequest({executable:'/official/client',modulePath:'/official/bdms.node'},native.buildTrackRequest('id','sessionid=fixture',identity),{spawn});
   if(headers['X-Medusa']==='two')assert.deepEqual(await pending,headers);
   else await assert.rejects(pending,/signature/i);
 }
});

test('signed Mac metadata enables a verified VIP full track while preserving the free-account entitlement gate',async t=>{
 const originalPrepare=native.prepareTrackRequest,originalRequest=https.request;
 let isVip=true,requests=0;
 native.prepareTrackRequest=async(id,cookie)=>({...native.buildTrackRequest(id,cookie,identity),headers:{'X-Helios':'fixture','X-Medusa':'fixture','User-Agent':'LunaPC/2.9.1(273418830)'}});
 https.request=(target,options,callback)=>{const req=new EventEmitter();req.write=()=>{};req.destroy=e=>req.emit('error',e);req.end=()=>queueMicrotask(()=>{
   const url=new URL(target);let body;
   if(url.pathname==='/luna/pc/track_v2'){
     requests++;assert.equal(options.headers['X-Helios'],'fixture');assert.equal(options.headers['User-Agent'],'LunaPC/2.9.1(273418830)');
     body={data:{track:{id:'full-track',duration_ms:193000,label_info:{only_vip_playable:true}},track_player:{video_model:JSON.stringify({video_duration:193,video_list:[{main_url:Buffer.from('https://media.example/full.m4a').toString('base64'),bitrate:64000,format:'aac'}]})}}};
   }else{assert.equal(url.pathname,'/luna/pc/me');body={data:{my_info:{id:'fixture-user'},is_vip:isVip}};}
   const response=new EventEmitter();response.statusCode=200;response.headers={};callback(response);response.emit('data',Buffer.from(JSON.stringify(body)));response.emit('end');});return req;};
 t.after(()=>{native.prepareTrackRequest=originalPrepare;https.request=originalRequest;qishui._test.clearQishuiRuntimeCaches();});
 qishui._test.clearQishuiRuntimeCaches();
 const full=await qishui.handleQishuiSongUrl({id:'full-track'},'sessionid=fixture');
 assert.equal(full.playable,true);assert.equal(full.trial,false);assert.equal(full.duration,193);
 assert.equal(full.source,'qishui-pc-track-v2');
 isVip=false;qishui._test.clearQishuiRuntimeCaches();
 const denied=await qishui.handleQishuiSongUrl({id:'full-track'},'sessionid=fixture');
 assert.equal(denied.playable,false);assert.equal(denied.reason,'vip_required');assert(!denied.url);
 assert.equal(requests,2);
});

test('Windows and Linux never read Mac signer credentials or start its helper',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),childProcess=require('node:child_process');
 const source=fs.readFileSync(require.resolve('../desktop/qishui-native-playback'),'utf8');
 for(const platform of ['win32','linux']){
   const sandbox={module:{exports:{}},process:{platform,arch:'x64',env:{QISHUI_QR_CONFIG_FILE:'fixture'}},
     require:specifier=>{
       if(specifier==='node:fs')return {...fs,promises:{...fs.promises,readFile:()=>assert.fail('must not read Mac identity on '+platform)}};
       if(specifier==='node:child_process')return {...childProcess,spawn:()=>assert.fail('must not start Mac helper on '+platform)};
       return require(specifier);
     }};
   vm.runInNewContext(source,sandbox,{filename:'qishui-native-playback.js'});
   assert.equal(await sandbox.module.exports.prepareTrackRequest('track','sessionid=fixture'),null);
 }
});
