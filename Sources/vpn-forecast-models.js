// Native simple exponential smoothing, selected by the VPN history replay.
// Additive ETS(A,N,N), bounded least squares; no Python in the installed App.
// Equations: https://otexts.com/fpp3/exponential-smoothing.html
function afVPNFitSES(values){
  if(values.length<7)return null;
  var scale=afMean(values)||1,y=values.map(function(v){return v/scale;}),n=y.length;
  var initial=afMean(y.slice(0,4)),max=Math.max.apply(null,y),best=null,bestError=Infinity;
  function run(p,keep){
    var level=p[1],sse=0,residuals=[];
    y.forEach(function(value){var error=value-level;
      sse+=error*error;level+=p[0]*error;if(keep)residuals.push(error*scale);
    });
    return keep?{level:level*scale,trend:0,phi:0,alpha:p[0],beta:0,
      residuals:residuals,sse:sse*scale*scale}:sse;
  }
  [.1,.4,.8].forEach(function(alpha){
    var p=[alpha,initial],error=run(p,false),steps=[.25,.4];
    for(var pass=0;pass<14;pass++){
      for(var sweep=0;sweep<20;sweep++){
        var improved=false;
        for(var j=0;j<2;j++)for(var sign=-1;sign<=1;sign+=2){
          var q=p.slice();q[j]=Math.max(j===0?.001:0,Math.min(j===0?.999:Math.max(2,max*2),q[j]+sign*steps[j]));
          var score=run(q,false);if(score<error-1e-12){p=q;error=score;improved=true;}
        }
        if(!improved)break;
      }
      steps=steps.map(function(v){return v/2;});
    }
    if(error<bestError){bestError=error;best=run(p,true);}
  });
  best.aicc=n*Math.log(Math.max(bestError/n,1e-12))+6+(n>4?24/(n-4):Infinity);
  best.method='ses';return best;
}
// Equal combination of short/medium/long levels, not three independent
// histories. Deduplicate partially filled windows in a short clean tail.
function afVPNFitMultiSES(values){
  if(values.length<7)return null;
  var seen={},members=[],recent=values.slice(-7),median=afQuantile(recent,.5);
  var mad=afQuantile(recent.map(function(v){return Math.abs(v-median);}),.5);
  var cutoff=Math.max(median*3,median+6*mad);
  // An isolated extreme download must not be amplified by overlapping short
  // fits. Keep it in the real history/long fit; sustained high days release
  // this guard, while live counter changes can still adjust the near term.
  var isolated=values.length>=14&&recent.filter(function(v){return v>cutoff;}).length===1;
  (isolated?[35]:[7,14,35]).forEach(function(window){
    var count=Math.min(window,values.length);if(seen[count])return;seen[count]=true;
    var fit=afVPNFitSES(values.slice(-count));
    members.push({days:count,level:fit.level,alpha:fit.alpha});
  });
  return {level:afMean(members.map(function(m){return m.level;})),members:members,isolatedSpike:isolated,method:'multiSES'};
}
function afVPNFutureRate(model,elapsed,at){
  var rate=model.rate;
  (model.components||[]).forEach(function(m){rate+=(m.level-model.rate)/model.components.length*
    Math.exp(-((model.lag||0)+elapsed)/m.days);});
  // Additive, zero-sum weekly component at the long-run level. It preserves
  // complete-week totals (unless a real near-zero level requires clipping)
  // and the same early path for all requested forecast horizons.
  return Math.max(0,rate+model.rate*(afDayTypeFactor(model.dayType,at)-1));
}
function afVPNModelTotal(model,now,horizon){
  var elapsed=0,total=0;
  afVPNCalendar(now,horizon,model.shanghai).forEach(function(step){
    total+=afVPNFutureRate(model,elapsed,now+elapsed*AF_DAY)*step.duration;elapsed+=step.duration;
  });return total;
}
