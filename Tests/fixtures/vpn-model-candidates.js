// Research candidates only; not assembled into the App.
// Small, native additive ETS candidates; no Python or network in the app.
// Equations: Hyndman & Athanasopoulos, FPP3, exponential smoothing.
// Fitting is bounded least squares, not a port of StatsForecast AutoETS.
function afVPNFitETS(values,damped){
  if(values.length<7)return null;
  var scale=afMean(values)||1,y=values.map(function(v){return v/scale;}),n=y.length;
  var initial=afMean(y.slice(0,Math.min(4,n))),slope=(afMean(y.slice(3,6))-afMean(y.slice(0,3)))/3;
  var max=Math.max.apply(null,y),bounds=damped?[[.001,.999],[0,1],[.8,.98],[0,Math.max(2,max*2)],[-max,max]]:
    [[.001,.999],[0,Math.max(2,max*2)]];
  function clamp(p){return p.map(function(v,i){return Math.max(bounds[i][0],Math.min(bounds[i][1],v));});}
  function run(p,keep){
    var alpha=p[0],beta=damped?alpha*p[1]:0,phi=damped?p[2]:0,level=damped?p[3]:p[1],trend=damped?p[4]:0;
    var sse=0,residuals=[];
    y.forEach(function(value){var expected=level+phi*trend,error=value-expected;
      sse+=error*error;level=expected+alpha*error;trend=phi*trend+beta*error;
      if(keep)residuals.push(error*scale);
    });
    return keep?{level:level*scale,trend:trend*scale,phi:phi,alpha:alpha,beta:beta,
      residuals:residuals,sse:sse*scale*scale}:sse;
  }
  // Deterministic multi-start coordinate search. Bounds and initialization
  // are model constraints, never fitted using future evaluation targets.
  var best=null,bestError=Infinity;
  [.1,.4,.8].forEach(function(alpha){
    var p=damped?[alpha,.1,.9,initial,slope]:[alpha,initial],error=run(p,false);
    var steps=damped?[.25,.25,.05,.4,.2]:[.25,.4];
    for(var pass=0;pass<14;pass++){
      for(var sweep=0;sweep<20;sweep++){
        var improved=false;
        for(var j=0;j<p.length;j++)for(var sign=-1;sign<=1;sign+=2){
          var q=p.slice();q[j]+=sign*steps[j];q=clamp(q);var score=run(q,false);
          if(score<error-1e-12){p=q;error=score;improved=true;}
        }
        if(!improved)break;
      }
      steps=steps.map(function(v){return v/2;});
    }
    if(error<bestError){bestError=error;best=run(p,true);}
  });
  var k=damped?6:3;
  best.aicc=n*Math.log(Math.max(bestError/n,1e-12))+2*k+(n>k+1?2*k*(k+1)/(n-k-1):Infinity);
  best.method=damped?'damped':'ses';return best;
}
function afVPNETSValue(fit,steps){
  var trend=fit.phi?fit.phi*(1-Math.pow(fit.phi,steps))/(1-fit.phi):0;
  return Math.max(0,fit.level+fit.trend*trend);
}
function afVPNDailyModels(rows,now,count){
  if(!rows.length)return {};
  var latest=rows[rows.length-1].start,span=(latest-rows[0].start)/AF_DAY+1,models={};
  function constant(rate){return Array.from({length:count},function(){return rate;});}
  function window(length){var selected=rows.filter(function(r){return r.start>=latest-(length-1)*AF_DAY;});
    return selected.length>=Math.min(3,length)&&selected.length/Math.min(length,span)>=.8?afRate(selected,0,latest):null;}
  var mean7=window(7),mean28=span>=23?window(28):null;
  if(mean7!==null)models.mean7=constant(mean7);
  if(mean28!==null)models.mean28=constant(mean28);
  var tail=[rows[rows.length-1]];
  for(var i=rows.length-2;i>=0&&rows[i].end===tail[0].start;i--)tail.unshift(rows[i]);
  if(tail.length>=7){
    var values=tail.map(function(r){return r.loss;}),ses=afVPNFitSES(values),damped=afVPNFitETS(values,true);
    var lag=Math.floor(now/AF_DAY)-Math.floor(latest/AF_DAY),best=ses.aicc<=damped.aicc?ses:damped;
    [['ses',ses],['damped',damped],['ets',best]].forEach(function(pair){
      models[pair[0]]=Array.from({length:count},function(_,j){return afVPNETSValue(pair[1],lag+j);});
    });
    // OLS on the cumulative-used gauge: the same core idea as predict_linear,
    // with a reset-free seven-day segment and the observed current balance.
    var cumulative=0,points=[0];tail.slice(-7).forEach(function(r){cumulative+=r.loss;points.push(cumulative);});
    var xMean=(points.length-1)/2,yMean=afMean(points),num=0,den=0;
    points.forEach(function(v,j){num+=(j-xMean)*(v-yMean);den+=(j-xMean)*(j-xMean);});
    models.linear=constant(Math.max(0,num/den));
  }
  var history=[],valid=true;
  for(var j=0;j<count;j++){
    var weekday=(Math.floor(now/AF_DAY)+j)%7,same=rows.filter(function(r){return Math.floor(r.start/AF_DAY)%7===weekday;});
    if(same.length<3){valid=false;break;}
    var pairs=same.map(function(r){return {value:r.loss,weight:Math.exp(-(latest-r.start)/AF_DAY/21)};})
      .sort(function(a,b){return a.value-b.value;});
    var half=pairs.reduce(function(s,p){return s+p.weight;},0)/2,sum=0,value=pairs[pairs.length-1].value;
    for(var k=0;k<pairs.length;k++){sum+=pairs[k].weight;if(sum>=half){value=pairs[k].value;break;}}
    history.push(value);
  }
  if(valid)models.historical=history;
  function combine(name,names){if(names.every(function(k){return !!models[k];}))
    models[name]=Array.from({length:count},function(_,j){return afMean(names.map(function(k){return models[k][j];}));});}
  combine('simple',['mean7','mean28']);
  combine('sesMean7',['ses','mean7']);
  combine('etsMean7',['ets','mean7']);
  combine('etsSimple',['ets','simple']);
  combine('etsHistorical',['ets','historical']);
  combine('threeWay',['ets','historical','linear']);
  return models;
}
