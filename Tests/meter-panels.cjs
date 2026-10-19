const assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('./sources.cjs');
const c=vm.createContext({});vm.runInContext(readSource('core')+'\n'+readSource('meter-panels-core'),c);
const now=2000000000,week=10080,w={remaining:34,durationMins:week,resetAt:now+.56*week*60};
for(const [label,symbol] of Object.entries({'Above pace':'exclamationmark.triangle.fill','On pace':'checkmark.circle.fill',
 'Quota low':'exclamationmark.circle.fill','Last known':'clock','Resetting':'arrow.triangle.2.circlepath',
 'Profile data':'checkmark.circle','Read failed':'exclamationmark.circle','Reserve at reset':'checkmark.circle.fill'}))
 assert.equal(c.meterStatusSymbol(label),symbol,'status symbols preserve their meaning');
assert.equal(c.meterStatusSymbol('Est. empty 3d early'),'exclamationmark.triangle.fill');
assert.equal(c.meterStatusSymbol('VPN Traffic'),null,'ordinary headings do not acquire decorative icons');
assert.equal(c.quotaPaceModel(w,now,false).label,'Above pace');
assert.equal(c.quotaPaceModel({...w,remaining:60},now,false).label,'On pace');
assert.equal(c.quotaPaceModel({...w,remaining:51},now,false).label,'On pace','5-point dead zone');
assert.equal(c.quotaPaceModel({...w,remaining:50.9},now,false).tone,'warning');
assert.equal(c.quotaPaceModel({...w,remaining:5},now,false).tone,'critical');
assert.equal(c.quotaPaceModel({...w,remaining:0},now,false).label,'Exhausted');
assert.equal(c.quotaPaceModel(w,now,true).label,'Last known');
assert.equal(c.quotaPaceModel({...w,remaining:null},now,false).label,'No data');
assert.equal(c.quotaPaceModel({...w,durationMins:null},now,false).fraction,null);
assert.equal(c.quotaPaceModel({...w,resetAt:now-1},now,false).label,'Resetting');
assert.equal(c.quotaPaceModel({...w,resetAt:now+week*60+61},now,false).fraction,null,'do not invent a larger official cycle');
const session=c.quotaPaceModel({remaining:99,durationMins:300,resetAt:now+4.55*3600},now,false);
assert.equal(session.label,'On pace');assert.equal(session.percent,91);
const response={result:{rateLimits:{primary:{usedPercent:30,windowDurationMins:10080,resetsAt:now+86400}},
  rateLimitResetCredits:{availableCount:2,credits:[{status:'available',expiresAt:now+10*86400,grantedAt:now-20*86400,
    id:'PRIVATE ID',title:'PRIVATE TITLE'},{status:'used',expiresAt:now+100},{status:'available',expiresAt:now+20*86400,grantedAt:now-10*86400}]}}};
const normalized=c.normalizeUsage(response);assert.equal(normalized.resetCards.length,2);
assert(!/PRIVATE|status|title|id/.test(JSON.stringify(normalized.resetCards)));
assert.equal(c.normalizeUsage({result:{rateLimits:response.result.rateLimits}}).credits,null,'missing reset metadata is not zero cards');
let cards=c.observeResetCards(normalized.resetCards,[],[],now,2);
let model=c.resetCardsModel(cards,2,now,false);
assert.equal(model.rows.length,2);assert(Math.abs(model.rows[0].fraction-1/3)<1e-9,'official 30-day lifetime, no guessed grant');
assert.equal(model.rows[0].expiresAt,now+10*86400);assert.equal(model.rows[0].fromObservation,false);
const resumed=c.observeResetCards(normalized.resetCards,[],cards,now+86400,2);
assert.equal(resumed[0].observedAt,now,'restart/refresh does not reset the origin');
assert(c.resetCardsModel(resumed,2,now+86400,false).rows[0].fraction<model.rows[0].fraction);
const fallback=c.observeResetCards([], [now+86400,now+86400],[],now,2);
assert.equal(fallback.length,2,'same expiry does not discard a second card');
const later=c.observeResetCards([], [now+86400,now+86400],fallback,now+3600,2);
model=c.resetCardsModel(later,3,now+3600,false);
assert(model.rows[0].fromObservation);assert(Math.abs(model.rows[0].fraction-23/24)<1e-9);
assert.equal(model.rows[2].state,'unknown','unknown extra card keeps its real count, no invented date');
assert.equal(c.resetCardsModel(cards,null,now,false).count,null);
assert.equal(c.resetCardsModel([],0,now,false).rows[0].state,'empty');
assert.equal(c.resetCardsModel(cards,2,now+30*86400,false).rows[0].state,'expired');
assert.equal(c.resetCardsModel(cards,2,now,true).rows[0].tone,'muted');
for(const invalid of [{grantedAt:now+100,expiresAt:now},{expiresAt:'wrong'},{expiresAt:true}]){
 const row=c.resetCardMetadata([invalid])[0];assert.equal(row.grantedAt,null);
}
assert.equal(c.compactTokenCount(0),'0');assert.equal(c.compactTokenCount(1000),'1K');
assert.equal(c.compactTokenCount(415000000),'415M');assert.equal(c.compactTokenCount(1234500000),'1.2B');
for(const invalid of [null,-1,Infinity,NaN,1.2])assert.equal(c.compactTokenCount(invalid),'—');
console.log('Meter models passed: quota/time pace, dead zone/stale/reset/Session, real grant and expiry, duplicate/unknown/zero cards, restart-preserved countdown and compact token units.');
