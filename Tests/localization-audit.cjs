const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readSource}=require('./sources.cjs');
const ctx=vm.createContext({});
vm.runInContext(['core','forecast-core','vpn-traffic-core','i18n'].map(readSource).join('\n'),ctx);
ctx.uiLanguage='zh-CN';
const cases=Object.keys(ctx.UI_ZH);
for(const n of [0,1,5,20,81.5,100]) {
 cases.push(n+'% remaining',n+'% remaining · stale','Budget '+n+'%/day · learning',
 'Budget '+n+'%/h · gaps','On track · ~0–'+n+'% at reset',
 'If pace holds: ~'+n+'% in 30m','If pace holds: ~'+n+'% at reset');
}
for(const unit of ['B','K','M','G','T']) cases.push('1'+unit+' remaining · stale','1'+unit+' / 400'+unit+' used',
 'Budget ~12.5'+unit+'/day · learning','If reported pace holds: ~300'+unit+' left');
cases.push('If pace holds: empty within 1h 30m','Resets 10/14 09:37 · 6d 3h',
 'Estimated empty 10d before reset','Estimated empty <1d before reset',
 'Est. empty 1d early','Est. empty 366d early','Est. empty <1d early','Traffic · Estimated empty 10d before reset',
 'May run out ~5d early','May run out ~<1d early','May run out 3–7d early','Traffic · May run out ~5d early',
 'Resets in 6d 3h','Resets in 1h 30m','Resets in 5m',
 'Expires in 12d','Expires in 1h','Expires in 5m',
 'Historical rough estimate · ~0–30% at reset',
 '≈3.2d','<1d','Estimated at reset','Est. at 1d reset','Est. at 30d reset','Est. at 365d reset',
 '↻ 2 uses · Expires 10/30, 11/7','If reported pace holds: <1 days left',
 'Forecast: Paused · quota stale','Traffic · Checking','MaoMaoYun  ·  Connected',
 'Typical (P50) and higher (P90) observed consumption from 3 historical blocks, rounded up to whole hours. Scenarios, not confidence bounds. Incomplete blocks are excluded.',
 'Conditional estimate from 1h of continuous recent observations, including idle time. Projects only 30m.',
 'Conditional P90 scenario from 3 consecutive UTC 24h blocks as long as the website reset days. Reported u+d are billed bytes. Completeness is unverified and may undercount usage; this is not a safety or risk judgment.');
const now=1800000000000,hash='a'.repeat(64);
const snapshot=ctx.normalizeMaoMaoYunTraffic({accountKey:hash,credentialRevision:hash,reportedAt:now,
 usedBytes:1024,totalBytes:4096,remainingBytes:3072,resetDays:30},now);
for(const state of ['loading','signingIn','authRequired','keychainLocked','rateLimited','invalid','error','timeout','ready']) {
 for(const data of [null,snapshot]) {
  const p=ctx.maoMaoYunTrafficPresentation(data,state,now,null);
  cases.push(p.value,p.detail,p.detail.split(' · ')[0].trim(),p.usage,p.todayUsage,p.resetText,p.forecastText);
 }
}
for(const text of cases) {
 const zh=ctx.uiText(text);
 const residue=zh.replace(/https?:\/\/\S+|app\.maomao234\.com|MaoMaoYun|ChatGPT|Codex|\bToken\b|\bApp\b|VPN|UTC|P50|P90/g,'');
 assert(!/[A-Za-z]{2,}/.test(residue),`Untranslated: ${text}\n=> ${zh}`);
 ctx.uiLanguage='en';assert.equal(ctx.uiText(text),text,'English uses original canonical text');ctx.uiLanguage='zh-CN';
}
console.log(`Localization audit passed: ${cases.length} state/number/time/accessibility cases, no unintended English and reversible English presentation.`);
