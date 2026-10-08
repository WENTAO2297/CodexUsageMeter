#!/usr/bin/env node
// A minimal read-only protocol fixture. No actual account or model calls.
const readline=require('readline');
const mode=process.env.FAKE_USAGE_MODE||'noise';
const lines=readline.createInterface({input:process.stdin});
function reply(value){process.stdout.write(JSON.stringify(value)+'\n');}
lines.on('line',line=>{
 const request=JSON.parse(line);
 if(request.method==='initialize'&&mode!=='init-timeout') reply({id:request.id,result:{}});
 if(request.method!=='account/rateLimits/read') return;
 if(mode==='exit') process.exit(1);
 if(mode==='quota-timeout') return;
 if(mode==='rpc-error') {reply({id:request.id,error:{code:-32603,message:'synthetic failure'}});return;}
 process.stdout.write('non-protocol stdout\n');
 reply({method:'account/rateLimits/updated',params:{}});
 process.stderr.write('synthetic stderr warning\n');
 setTimeout(()=>reply({id:request.id,result:{rateLimits:{primary:{usedPercent:12,windowDurationMins:10080,resetsAt:2000000000},secondary:null}}}),mode==='slow'?11000:0);
});
