/* eslint-disable */
/**
 * Quality Head dashboard — ported from the design jsx (Process / Product /
 * Customer Complaint / SPC tabs). Self-contained, inline-styled; mock data
 * for now (backend wiring is a later step). The jsx's own landing page, India
 * map and App wrapper are dropped — routing/plant selection is handled by the
 * app shell (BanmoreQuality.jsx) — and the inline base64 logo is swapped for
 * the shared asset.
 */
import { useState, useRef, useEffect, Fragment } from "react";
import { IconButton, Tooltip } from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import jkLogo from "@/assets/jk-logo.png";
import ProductionTimeRangeSelect from "@/components/production/TimeRangeSelect.jsx";
import SharedUserMenu from "@/components/user-menu/UserMenu.jsx";
import { MOCK_USER } from "@/lib/mockData.js";
import {
  getProcessKpiChildren,
  getProcessKpiHistory,
  getProcessKpiValues,
  getSpcDetail,
  getSpcFilterOptions,
  getSpcSummary,
  getSpcWidgets,
  PROCESS_KPI_NAME,
} from "@/api/quality.js";

// The gold workbook covers 2026-04-01 → 2026-06-30, so the live view opens on
// the FRD base date (real "today" is outside the data range). The header date
// picker drives which snapshot the Process cards read.
const QUALITY_DATA_DATE = "2026-06-10";
const QUALITY_MONTH_FROM = "2026-06-01";
const QUALITY_MONTH_TO = "2026-06-30";
const QUALITY_USER = {
  ...MOCK_USER,
  name: "Quality Head",
  role: "Quality Head",
  email: "quality.head@jktyre.example",
  employeeId: "JK-QH-00142",
  avatarInitials: "QH",
};

/* ─── LOGO ─── */
const LOGO = jkLogo;

/* ─── LIGHT THEME ─── */
const C={bg:"#F3F4F8",cd:"#FFFFFF",c2:"#F7F8FA",bd:"#E0E3EA",tx:"#1A1D26",md:"#4A5168",mu:"#8891A5",ac:"#E8651A",aL:"rgba(232,101,26,.07)",aB:"rgba(232,101,26,.28)",tl:"#1A9A3E",bl:"#2563EB",rd:"#DC2626",am:"#CA8A04",gn:"#1A9A3E",pp:"#7C3AED",cy:"#0D9488",sh:"0 1px 3px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04)",r:8};
const rc=v=>v>=90?C.gn:v>=80?C.am:C.rd;
const fmt=n=>typeof n==="number"?n.toLocaleString("en-IN"):n;

const isBanmorePlant=p=>p&&typeof p.name==="string"&&p.name.toLowerCase().indexOf("banmore")===0;
const TT_FACTOR={
  All:{rate:1.00,invRate:1.00,vol:1.00},
  PCR:{rate:1.025,invRate:0.78,vol:0.58},
  TBR:{rate:0.965,invRate:1.34,vol:0.42}
};
/* Adjust a numeric value based on tyre-type filter. For Banmore (PCR-only), no scaling. */
function tAdjust(v,name,tt,plant){
  if(isBanmorePlant(plant)||tt==="All"||tt==null) return v;
  if(typeof v!=="number"){const n=parseFloat(v);if(isNaN(n))return v;const adj=tAdjust(n,name,tt,plant);return typeof v==="string"?String(adj)+v.replace(/^-?\d*\.?\d+/,""):adj;}
  const f=TT_FACTOR[tt]||TT_FACTOR.All;
  const isRate=/%|Rate|OEE|FTQ|Compliance|Availability|Yield|Efficiency|MTBF|MTTR/i.test(name);
  const isInv=/Scrap|Reject|Loss|Defect|Absent|Downtime|NCM|Breakdown|Hold|Reduced|Stoppage|Repeat/i.test(name);
  let factor;
  if(isRate){factor=isInv?f.invRate:f.rate;}
  else{factor=f.vol;if(isInv)factor=factor*(tt==="PCR"?0.75:1.30);}
  const adj=v*factor;
  return Math.abs(adj)<10?Math.round(adj*100)/100:Math.round(adj);
}

function TyreTypeFilter({value,onChange,plant,disabled,disabledReason}){
  const banmore=isBanmorePlant(plant);
  if(banmore){
    return(<div title="Banmore plant produces PCR only" style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",background:C.tl+"18",border:"1px solid "+C.tl+"40",borderRadius:8,fontSize:12,fontWeight:700,color:C.tl,letterSpacing:".4px"}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:C.tl}}/>PCR ONLY
    </div>);
  }
  const opts=["All","PCR","TBR"];
  return(<div title={disabled?(disabledReason||"Not applicable for this view"):"Filter by tyre type"} style={{display:"flex",gap:1,background:disabled?C.bg:C.bg,borderRadius:12,padding:2,opacity:disabled?0.4:1,pointerEvents:disabled?"none":"auto"}}>
    {opts.map(o=>{const a=value===o;const col=o==="PCR"?C.bl:o==="TBR"?C.tl:C.tx;return(<button key={o} onClick={()=>!disabled&&onChange(o)} style={{padding:"4px 10px",borderRadius:10,border:"none",fontSize:12,fontWeight:a?700:500,background:a?C.cd:"transparent",color:a?col:C.mu,cursor:disabled?"not-allowed":"pointer",letterSpacing:".4px"}}>{o}</button>);})}
  </div>);
}

/* Banner showing the active tyre-type filter on a tab where it applies */
function TyreTypeBanner({tt,plant,disabled}){
  const banmore=isBanmorePlant(plant);
  if(banmore){return null;} /* the PCR ONLY badge in header already conveys this */
  if(disabled){return(<div style={{fontSize:12,color:C.mu,fontStyle:"italic"}}>Tyre-type filter not applicable — plant-wide metrics</div>);}
  if(tt==="All"){return null;}
  const col=tt==="PCR"?C.bl:C.tl;
  return(<div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 9px",background:col+"12",border:"1px solid "+col+"33",borderRadius:6,fontSize:12,fontWeight:700,color:col,letterSpacing:".3px",alignSelf:"flex-start"}}>
    <span style={{width:5,height:5,borderRadius:"50%",background:col}}/>SHOWING {tt} ONLY <span style={{fontSize:11,fontWeight:500,color:C.mu,marginLeft:2}}>— mock data scaled to {tt} mix</span>
  </div>);
}

/* ─── TIME RANGE (preset + from/to date picker) ─── */
function _pad2(n){return String(n).padStart(2,"0");}
function _toIso(d){return d.getFullYear()+"-"+_pad2(d.getMonth()+1)+"-"+_pad2(d.getDate());}
function _rangeFromPreset(p){
  const end=new Date();
  const start=new Date();
  if(p==="Today"){/* same day */}
  else if(p==="Week"){start.setDate(start.getDate()-6);}
  else if(p==="Month"){start.setDate(start.getDate()-29);}
  else if(p==="Year"){start.setMonth(start.getMonth()-11);start.setDate(1);}
  return{from:_toIso(start),to:_toIso(end)};
}
function _daysBetween(from,to){
  if(!from||!to)return 0;
  const d1=new Date(from),d2=new Date(to);
  if(isNaN(d1)||isNaN(d2))return 0;
  return Math.max(1,Math.round((d2-d1)/86400000)+1);
}
function _autoPreset(from,to){
  const d=_daysBetween(from,to);
  if(d<=2)return"Today";
  if(d<=14)return"Week";
  if(d<=180)return"Month";
  return"Year";
}
function TimeRangeSelect({preset,setPreset,from,to,setFrom,setTo,compact,shift,setShift}){
  const presets=["Today","Month","Year"];
  const onPreset=p=>{const r=_rangeFromPreset(p);setPreset(p);setFrom(r.from);setTo(r.to);};
  const onFrom=e=>{setFrom(e.target.value);setPreset("");};
  const onTo=e=>{setTo(e.target.value);setPreset("");};
  const days=_daysBetween(from,to);
  return(<div style={{display:"flex",alignItems:"flex-start",gap:6,flexWrap:"wrap"}}>
    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:3}}>
      <div style={{display:"flex",gap:1,background:C.bg,borderRadius:10,padding:2}}>
        {presets.map(t=>(<button key={t} onClick={()=>onPreset(t)} style={{padding:"3px 9px",borderRadius:8,border:"none",fontSize:11,fontWeight:preset===t?700:400,background:preset===t?C.cd:"transparent",color:preset===t?C.tx:C.mu,cursor:"pointer"}}>{t}</button>))}
      </div>
      {preset==="Today"&&setShift&&(<select value={shift||"All"} onChange={e=>setShift(e.target.value)} title="Filter by shift" style={{marginLeft:4,padding:"2px 6px",border:"1px solid "+C.bd,borderRadius:6,background:(shift&&shift!=="All")?C.aL:C.cd,fontSize:10,fontFamily:"inherit",color:(shift&&shift!=="All")?C.ac:C.mu,fontWeight:600,cursor:"pointer",outline:"none"}}>
        <option value="All">All Shifts</option>
        <option value="A">Shift A</option>
        <option value="B">Shift B</option>
        <option value="C">Shift C</option>
      </select>)}
    </div>
    <div title="From — To" style={{display:"flex",alignItems:"center",gap:2,padding:"2px 6px",border:"1px solid "+C.bd,borderRadius:8,background:C.cd}}>
      <input type="date" value={from||""} onChange={onFrom} style={{border:"none",outline:"none",background:"transparent",fontSize:11,fontFamily:"inherit",color:C.tx,padding:"2px 0",width:96}}/>
      <span style={{color:C.bd,fontSize:11}}>{"–"}</span>
      <input type="date" value={to||""} onChange={onTo} style={{border:"none",outline:"none",background:"transparent",fontSize:11,fontFamily:"inherit",color:C.tx,padding:"2px 0",width:96}}/>
      {!compact&&!preset&&days>0&&<span style={{color:C.ac,fontWeight:700,fontSize:10,padding:"1px 5px",background:C.aL,borderRadius:4,marginLeft:2}}>{days}d</span>}
    </div>
  </div>);
}

function _hash(s){let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return Math.abs(h);}
function _genTrendSeries(kpi,range,effV){
  const v=typeof effV==="number"?effV:parseFloat(String(kpi.v).replace(/,/g,""));
  if(isNaN(v))return null;
  const n=range==="Today"?8:range==="Week"?7:range==="Month"?12:range==="Year"?5:7;
  const labels=range==="Today"?["00","03","06","09","12","15","18","21"]:range==="Week"?["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]:range==="Month"?["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"]:range==="Year"?["FY21","FY22","FY23","FY24","FY25"]:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  if(kpi.sp&&kpi.sp.length>1){
    const sp=kpi.sp;
    const arr=[];
    for(let i=0;i<n;i++){
      const t=i*(sp.length-1)/Math.max(n-1,1);
      const lo=Math.floor(t),hi=Math.min(lo+1,sp.length-1),f=t-lo;
      arr.push(sp[lo]*(1-f)+sp[hi]*f);
    }
    const last=arr[arr.length-1];
    const k=last!==0?v/last:1;
    const out=arr.map(x=>Math.round(x*k*100)/100);
    out[out.length-1]=Math.round(v*100)/100;
    return {labels,series:out};
  }
  const seed=_hash((kpi.id||kpi.n||"x")+range);
  const arr=[];
  for(let i=0;i<n;i++){
    const x=(seed%1000)/1000+i*0.137;
    const noise=(Math.sin(x*9.7+i)*0.06+Math.cos(x*4.3+i*0.5)*0.035)*Math.max(Math.abs(v),0.5);
    const drift=v*0.08*(i/Math.max(n-1,1)-0.5);
    arr.push(Math.round((v-drift+noise)*100)/100);
  }
  arr[arr.length-1]=Math.round(v*100)/100;
  return {labels,series:arr};
}
function _genInsight(series,target,current,inv,name){
  const avg=series.reduce((a,b)=>a+b,0)/series.length;
  const best=inv?Math.min(...series):Math.max(...series);
  const worst=inv?Math.max(...series):Math.min(...series);
  const gap=inv?(current-target):(current-target);
  const last3=series.slice(-3).reduce((a,b)=>a+b,0)/3;
  const first3=series.slice(0,3).reduce((a,b)=>a+b,0)/3;
  const improving=inv?(first3>last3):(last3>first3);
  const stable=Math.abs(last3-first3)/Math.max(Math.abs(avg),0.5)<0.02;
  const onTarget=inv?(current<=target):(current>=target);
  let txt="";
  if(onTarget){txt+="Currently meeting target ";}else{txt+="Currently "+Math.abs(gap).toFixed(2)+" "+(inv?"above":"below")+" target ";}
  if(stable){txt+="— stable performance over the period.";}
  else if(improving){txt+="— trending in the right direction.";}
  else{txt+="— negative trend; investigate root cause.";}
  return{avg:Math.round(avg*100)/100,best:Math.round(best*100)/100,worst:Math.round(worst*100)/100,gap:Math.round(gap*100)/100,text:txt,bestIdx:series.indexOf(best),worstIdx:series.indexOf(worst)};
}
function TrendChart({labels,series,target,color,bestIdx,worstIdx}){
  const w=620,h=200,padL=44,padR=16,padT=14,padB=30;
  const allVals=[...series,target];
  const min=Math.min(...allVals),max=Math.max(...allVals);
  const rng=max-min||Math.abs(max)*0.1||1;
  const yMin=min-rng*0.15,yMax=max+rng*0.20,yR=yMax-yMin;
  const cw=w-padL-padR,ch=h-padT-padB;
  const xStep=cw/Math.max(labels.length-1,1);
  const x=i=>padL+i*xStep;
  const y=v=>padT+ch-((v-yMin)/yR)*ch;
  const pts=series.map((v,i)=>x(i)+","+y(v)).join(" ");
  const area=`${x(0)},${padT+ch} ${pts} ${x(series.length-1)},${padT+ch}`;
  const fmt2=v=>(Math.abs(v)<10?v.toFixed(1):Math.round(v).toString());
  return(<svg width="100%" viewBox={"0 0 "+w+" "+h} style={{display:"block",maxHeight:240}}>
    {[0,0.25,0.5,0.75,1].map((p,i)=>(<line key={i} x1={padL} y1={padT+ch*p} x2={padL+cw} y2={padT+ch*p} stroke={C.bd} strokeWidth="0.5" strokeDasharray={i===0||i===1?"":"2,3"}/>))}
    {[0,0.5,1].map((p,i)=>{const v=yMax-(yMax-yMin)*p;return <text key={i} x={padL-6} y={padT+ch*p+3} fontSize="9" fill={C.mu} textAnchor="end">{fmt2(v)}</text>;})}
    <polygon points={area} fill={color} opacity="0.08"/>
    <line x1={padL} y1={y(target)} x2={padL+cw} y2={y(target)} stroke={C.am} strokeWidth="1.5" strokeDasharray="5,4"/>
    <text x={padL+cw-4} y={y(target)-5} fontSize="9" fill={C.am} fontWeight="700" textAnchor="end">Target {fmt2(target)}</text>
    <polyline points={pts} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
    {series.map((v,i)=>{const isBest=i===bestIdx,isWorst=i===worstIdx;return(<g key={i}>
      <circle cx={x(i)} cy={y(v)} r={isBest||isWorst?4.5:3} fill={isBest?C.gn:isWorst?C.rd:color} stroke="#fff" strokeWidth="1.5"/>
      {(isBest||isWorst)&&<text x={x(i)} y={y(v)-9} fontSize="8" fill={isBest?C.gn:C.rd} fontWeight="700" textAnchor="middle">{isBest?"BEST":"WORST"}</text>}
    </g>);})}
    {labels.map((l,i)=>(<text key={i} x={x(i)} y={h-padB+14} fontSize="9" fill={C.mu} textAnchor="middle">{l}</text>))}
  </svg>);
}
/* Pick the right chart type based on KPI intent (name + unit) */
function pickChartType(kpi){
  if(kpi.chart) return kpi.chart;
  const n=(kpi.n||"").toLowerCase();
  const u=(kpi.u||"").toLowerCase();
  if(/days without|days since|safe days/.test(n)) return "progress";
  const barUnits=["nos","cases","batches","events","count","tickets","tyres","projects","members","stockouts","alarms","kgs"];
  if(barUnits.some(x=>u.indexOf(x)>=0)) return "bar";
  if(/₹|inr|lakh|cr/i.test(kpi.u||"")) return "bar";
  const barNames=["ncm hold","lot hold","open capa","overdue","stockout","repeat failure","anomalies","audits","stoppage","complaint","breakdown hour","downtime hour","manpower absent","production loss","milestones","absentee","spare"];
  if(barNames.some(x=>n.indexOf(x)>=0)) return "bar";
  return "line";
}

function TrendBar({labels,series,target,color,bestIdx,worstIdx}){
  const w=620,h=200,padL=44,padR=16,padT=20,padB=30;
  const allVals=[...series,target];
  const dataMax=Math.max(...allVals);
  const yMin=0,yMax=dataMax*1.20||1,yR=yMax-yMin;
  const cw=w-padL-padR,ch=h-padT-padB;
  const xStep=cw/series.length;
  const barW=Math.min(48,xStep*0.62);
  const xPos=i=>padL+i*xStep+(xStep-barW)/2;
  const yPos=v=>padT+ch-((v-yMin)/yR)*ch;
  const fmt2=v=>(Math.abs(v)<10?(Math.round(v*10)/10).toString():Math.round(v).toString());
  return(<svg width="100%" viewBox={"0 0 "+w+" "+h} style={{display:"block",maxHeight:240}}>
    {[0,0.25,0.5,0.75,1].map((p,i)=>(<line key={i} x1={padL} y1={padT+ch*p} x2={padL+cw} y2={padT+ch*p} stroke={C.bd} strokeWidth="0.5" strokeDasharray={p===1?"":"2,3"}/>))}
    {[0,0.5,1].map((p,i)=>{const v=yMax-(yMax-yMin)*p;return <text key={i} x={padL-6} y={padT+ch*p+3} fontSize="9" fill={C.mu} textAnchor="end">{fmt2(v)}</text>;})}
    <line x1={padL} y1={yPos(target)} x2={padL+cw} y2={yPos(target)} stroke={C.am} strokeWidth="1.5" strokeDasharray="5,4"/>
    <text x={padL+cw-4} y={yPos(target)-5} fontSize="9" fill={C.am} fontWeight="700" textAnchor="end">Target {fmt2(target)}</text>
    {series.map((v,i)=>{
      const isBest=i===bestIdx,isWorst=i===worstIdx;
      const bh=Math.max(0,(padT+ch)-yPos(v));
      const fill=isBest?C.gn:isWorst?C.rd:color;
      return(<g key={i}>
        <rect x={xPos(i)} y={yPos(v)} width={barW} height={bh} fill={fill} opacity={isBest||isWorst?1:0.85} rx="2.5"/>
        <text x={xPos(i)+barW/2} y={yPos(v)-4} fontSize="8" fill={isBest?C.gn:isWorst?C.rd:C.tx} fontWeight="700" textAnchor="middle">{fmt2(v)}</text>
      </g>);
    })}
    {labels.map((l,i)=>(<text key={i} x={xPos(i)+barW/2} y={h-padB+14} fontSize="9" fill={C.mu} textAnchor="middle">{l}</text>))}
  </svg>);
}

function TrendProgress({current,target,unit,color,series,labels}){
  const pct=target?Math.min(150,Math.max(0,(current/target)*100)):0;
  const onTarget=pct>=100;
  const barW=Math.min(100,pct);
  const w=620,h=70,padL=44,padR=16,padT=8,padB=18;
  const mn=Math.min(...series),mx=Math.max(...series),rn=mx-mn||1;
  const cw=w-padL-padR,ch=h-padT-padB;
  const xStep=cw/Math.max(series.length-1,1);
  const pts=series.map((v,i)=>(padL+i*xStep)+","+(padT+ch-((v-mn)/rn)*ch)).join(" ");
  return(<div style={{padding:"6px 4px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",fontSize:13,color:C.mu,marginBottom:8}}>
      <span style={{fontWeight:600}}>0</span>
      <span style={{fontWeight:700,color:C.am}}>Target: {target} {unit||""}</span>
    </div>
    <div style={{position:"relative",height:36,background:C.c2,borderRadius:18,border:"1px solid "+C.bd,overflow:"hidden"}}>
      <div style={{width:barW+"%",height:"100%",background:onTarget?C.gn:color,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:14,transition:"width .4s"}}>
        <span style={{fontSize:15,fontWeight:700,color:"#fff",whiteSpace:"nowrap"}}>{current} {unit||""}</span>
      </div>
      <div style={{position:"absolute",left:Math.min(100,(target/Math.max(current,target))*100)+"%",top:-3,bottom:-3,width:2,background:C.am,transform:"translateX(-1px)"}}/>
    </div>
    <div style={{textAlign:"center",marginTop:12,fontSize:16,fontWeight:700,color:onTarget?C.gn:C.tx}}>
      {Math.round(pct)}% of target {onTarget&&<span style={{fontSize:13,marginLeft:6,padding:"2px 7px",borderRadius:4,background:C.gn+"18",color:C.gn}}>ON TRACK</span>}
    </div>
    <div style={{fontSize:12,color:C.mu,fontWeight:600,textTransform:"uppercase",marginTop:14,marginBottom:2}}>Trajectory</div>
    <svg width="100%" viewBox={"0 0 "+w+" "+h} style={{display:"block",maxHeight:90}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      {series.map((v,i)=>(<circle key={i} cx={padL+i*xStep} cy={padT+ch-((v-mn)/rn)*ch} r="2.5" fill={color}/>))}
      {labels.map((l,i)=>(<text key={i} x={padL+i*xStep} y={h-padB+13} fontSize="9" fill={C.mu} textAnchor="middle">{l}</text>))}
    </svg>
  </div>);
}

/* ── KPI-aligned category charts (drill-structure visualizations) ── */
function _cres(k){const m={gn:C.gn,rd:C.rd,am:C.am,bl:C.bl,tl:C.tl,pp:C.pp,tx:C.tx};return m[k]||k||C.bl;}
function HBarChart({items,unit,target,hb}){
  const w=620,rowH=36,padL=160,padR=70,padT=8;
  const h=padT+items.length*rowH+(target!=null?24:8);
  const vals=items.map(i=>i.v).concat(items.map(i=>i.t!=null?i.t:(target!=null?target:0)));
  const max=Math.max(...vals)*1.12||1;
  const x=v=>padL+(v/max)*(w-padL-padR);
  return(<svg viewBox={"0 0 "+w+" "+h} style={{width:"100%",height:"auto"}}>
    {items.map((it,i)=>{
      const y0=padT+i*rowH;
      const t=it.t!=null?it.t:target;
      const ok=t==null?null:(hb?it.v>=t:it.v<=t);
      const col=ok==null?C.bl:ok?C.gn:C.rd;
      return(<g key={i}>
        <text x={padL-8} y={y0+rowH/2+4} fontSize="11.5" fill={C.tx} textAnchor="end">{it.l}</text>
        <rect x={padL} y={y0+8} width={w-padL-padR} height={rowH-18} rx="4" fill={C.bd} opacity="0.35"/>
        <rect x={padL} y={y0+8} width={Math.max(x(it.v)-padL,2)} height={rowH-18} rx="4" fill={col} opacity="0.85"/>
        {t!=null&&<line x1={x(t)} y1={y0+4} x2={x(t)} y2={y0+rowH-6} stroke={C.am} strokeWidth="2" strokeDasharray="3 2"/>}
        <text x={x(it.v)+6} y={y0+rowH/2+4} fontSize="11" fontWeight="700" fill={C.tx}>{it.v}</text>
      </g>);
    })}
    {target!=null&&<text x={x(target)} y={h-6} fontSize="9.5" fill={C.am} fontWeight="700" textAnchor="middle">{"Target "+target+(unit?" "+unit:"")}</text>}
  </svg>);
}
function DonutChart({items,unit}){
  const total=items.reduce((s,i)=>s+i.v,0)||1;
  const cx=110,cy=100,R=72,r=44;
  let a=-Math.PI/2;
  const palette=[C.bl,C.tl,C.am,C.pp,C.gn,C.rd];
  const segs=items.map((it,i)=>{
    const frac=it.v/total,a2=a+frac*Math.PI*2;
    const large=frac>0.5?1:0;
    const p=(ang,rad)=>[cx+rad*Math.cos(ang),cy+rad*Math.sin(ang)];
    const q=p(a,R),q2=p(a2,R),q3=p(a2,r),q4=p(a,r);
    const d="M"+q[0]+","+q[1]+" A"+R+","+R+" 0 "+large+" 1 "+q2[0]+","+q2[1]+" L"+q3[0]+","+q3[1]+" A"+r+","+r+" 0 "+large+" 0 "+q4[0]+","+q4[1]+" Z";
    const col=it.c?_cres(it.c):palette[i%palette.length];
    const seg={d,col,it,pct:Math.round(frac*1000)/10};
    a=a2;return seg;
  });
  return(<div style={{display:"flex",gap:18,alignItems:"center",flexWrap:"wrap",padding:"6px 4px 10px"}}>
    <svg viewBox="0 0 220 200" style={{width:220,flexShrink:0}}>
      {segs.map((s,i)=>(<path key={i} d={s.d} fill={s.col} stroke={C.cd} strokeWidth="1.5"/>))}
      <text x={cx} y={cy-2} fontSize="15" fontWeight="700" fill={C.tx} textAnchor="middle">{total>=1000?Math.round(total).toLocaleString("en-IN"):Math.round(total*100)/100}</text>
      <text x={cx} y={cy+14} fontSize="9.5" fill={C.mu} textAnchor="middle">{unit||""}</text>
    </svg>
    <div style={{display:"flex",flexDirection:"column",gap:6,minWidth:200,flex:1}}>
      {segs.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5}}>
        <span style={{width:11,height:11,borderRadius:3,background:s.col,display:"inline-block",flexShrink:0}}/>
        <span style={{flex:1,color:C.tx}}>{s.it.l}</span>
        <span style={{fontWeight:700,color:C.tx}}>{s.it.v>=1000?s.it.v.toLocaleString("en-IN"):s.it.v}</span>
        <span style={{color:C.mu,width:46,textAlign:"right"}}>{s.pct}%</span>
      </div>))}
    </div>
  </div>);
}
function MultiLineChart({series,target}){
  const w=620,h=210,padL=44,padR=14,padT=14,padB=40;
  const n=Math.max(...series.map(s=>s.sp.length));
  const labels=Array.from({length:n},(_,i)=>i===n-1?"Now":"W-"+(n-1-i));
  const all=series.reduce((acc,s)=>acc.concat(s.sp),[]).concat(target!=null?[target]:[]);
  const min=Math.min(...all),max=Math.max(...all);
  const rng=max-min||1,yMin=min-rng*0.15,yMax=max+rng*0.18,yR=yMax-yMin;
  const cw=w-padL-padR,ch=h-padT-padB;
  const x=i=>padL+i*(cw/Math.max(n-1,1));
  const y=v=>padT+ch-((v-yMin)/yR)*ch;
  return(<div>
    <svg viewBox={"0 0 "+w+" "+h} style={{width:"100%",height:"auto"}}>
      {[0,0.5,1].map((p,i)=>(<line key={i} x1={padL} y1={padT+ch*p} x2={padL+cw} y2={padT+ch*p} stroke={C.bd} strokeWidth="0.6" strokeDasharray={i===1?"":"2 3"}/>))}
      {[0,0.5,1].map((p,i)=>{const v=yMax-yR*p;return <text key={i} x={padL-6} y={padT+ch*p+3} fontSize="9" fill={C.mu} textAnchor="end">{Math.abs(v)<10?v.toFixed(1):Math.round(v)}</text>;})}
      {target!=null&&<g><line x1={padL} y1={y(target)} x2={padL+cw} y2={y(target)} stroke={C.am} strokeWidth="1.5" strokeDasharray="5 4"/><text x={padL+cw-4} y={y(target)-5} fontSize="9" fill={C.am} fontWeight="700" textAnchor="end">{"Target "+target}</text></g>}
      {series.map((s,si)=>{const col=_cres(s.c);const pts=s.sp.map((v,i)=>x(i)+","+y(v)).join(" ");return(<g key={si}>
        <polyline points={pts} fill="none" stroke={col} strokeWidth="2.2" strokeLinejoin="round"/>
        {s.sp.map((v,i)=>(<circle key={i} cx={x(i)} cy={y(v)} r="3" fill={col} stroke="#fff" strokeWidth="1.2"/>))}
      </g>);})}
      {labels.map((l,i)=>(<text key={i} x={x(i)} y={h-padB+16} fontSize="9" fill={C.mu} textAnchor="middle">{l}</text>))}
    </svg>
    <div style={{display:"flex",gap:14,justifyContent:"center",fontSize:11.5,color:C.mu,paddingBottom:6,flexWrap:"wrap"}}>
      {series.map((s,i)=>(<span key={i} style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:14,height:2.5,background:_cres(s.c),display:"inline-block"}}/>{s.l}</span>))}
    </div>
  </div>);
}
function CatChartBlock({kpi,chartType}){
  const cd=kpi.chartData||{};
  return(<div>
    <div style={{fontSize:12,color:C.mu,fontWeight:600,textTransform:"uppercase",marginBottom:6}}>{cd.title||kpi.n}</div>
    {chartType==="hbar"&&<HBarChart items={cd.items||[]} unit={cd.unit} target={cd.target} hb={cd.hb}/>}
    {chartType==="donut"&&<DonutChart items={cd.items||[]} unit={cd.unit}/>}
    {chartType==="multiline"&&<MultiLineChart series={cd.series||[]} target={cd.target}/>}
  </div>);
}
function TrendIcon({size}){const s=size||13;return(<svg width={s} height={s*0.85} viewBox="0 0 13 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="1,8.5 4,5.5 7,7 10,3 12,4"/></svg>);}

/* ─── COMPONENTS ─── */
function Spark({data,color,w=70,h=20}){const mn=Math.min(...data),mx=Math.max(...data),rn=mx-mn||1;const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-2-((v-mn)/rn)*(h-4)}`).join(" ");return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={color||C.tl} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.8}/></svg>;}

/* TechTrendPanel — analytical MP/CP trend. inv=true => lower is better. */
function TechTrendPanel({kpi,onClose,initialRange}){
  const [range,setRange]=useState(initialRange||"Monthly");
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);
  if(!kpi)return null;
  const inv=!!kpi.inv;
  const unit=kpi.u||"";
  const pN=s=>{if(s==null)return NaN;const t=String(s).replace(/[,%<>≤≥]/g,"").replace(/[^0-9.\- ]/g," ").trim().split(/\s+/)[0];return parseFloat(t);};
  const target=pN(kpi.target);const hasT=!isNaN(target);
  const sp=(kpi.sp&&kpi.sp.length?kpi.sp.map(Number):[pN(kpi.v)]).filter(n=>!isNaN(n));
  const current=isNaN(pN(kpi.v))?sp[sp.length-1]:pN(kpi.v);
  const baseline=sp[0];
  const dec=Math.abs(current)<2?3:Math.abs(current)<20?2:0;
  const fmt2=v=>{const r=Math.round(v*Math.pow(10,dec))/Math.pow(10,dec);return r.toLocaleString("en-IN");};
  const su=unit&&unit.length<6?" "+unit:"";
  const isPct=/%/.test(unit);
  let lo=-Infinity,hi=Infinity;
  if(isPct)hi=100;
  if(inv||isPct||/PPM|nos|no's|claim|incident|injur|score/i.test(unit))lo=Math.max(lo,0);
  const clamp=v=>Math.min(hi,Math.max(lo,v));
  let seed=0;for(const ch of (kpi.n||"x"))seed+=ch.charCodeAt(0);
  const rnd=i=>{const x=Math.sin(seed*12.9898+i*78.233)*43758.5453;return x-Math.floor(x);};
  function build(){
    const step=sp.length>=2?(sp[sp.length-1]-sp[sp.length-2]):0;
    const spreadEst=(Math.max(...sp)-Math.min(...sp))||Math.abs(current)*0.04||1;
    if(range==="Daily"){
      const n=30,drift=step/30,amp=Math.max(spreadEst*0.55,Math.abs(current)*0.01)||1,a=[];
      for(let i=0;i<n;i++){
        const base=current-drift*(n-1-i);
        const noise=((rnd(i)+rnd(i*2+7)+rnd(i*3+13))/3-0.5)*amp;
        a.push({l:i===n-1?"Today":(i%5===0?(n-1-i)+"d":""),v:i===n-1?current:clamp(base+noise)});
      }
      return {a,sub:"Daily · last 30 days"};
    }
    if(range==="Yearly"){
      const yStep=(spreadEst>0?spreadEst*1.5:Math.abs(current)*0.04)||1;
      const dir=inv?1:-1;
      const a=[
        {l:"FY24",v:clamp(current+dir*yStep*3)},
        {l:"FY25",v:clamp(current+dir*yStep*2)},
        {l:"FY26",v:clamp(current+dir*yStep)},
        {l:"FY27*",v:current}
      ];
      return {a,sub:"Financial years · FY27 in progress (*)"};
    }
    const months=["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
    const startIdx=Math.max(0,months.length-sp.length);
    const a=sp.map((v,i)=>({l:months[startIdx+i]||("M-"+(sp.length-1-i)),v:clamp(v)}));
    return {a,sub:"Monthly · "+sp.length+"-month actuals"};
  }
  const {a,sub}=build();
  const all=a;
  const meets=hasT?(inv?current<=target:current>=target):null;
  const movingRight=inv?(current<baseline):(current>baseline);
  const verdict=meets?{t:"On Track",c:C.gn}:(meets===false?(movingRight?{t:"Watch",c:C.am}:{t:"Off Track",c:C.rd}):(movingRight?{t:"Improving",c:C.bl}:{t:"Flat",c:C.mu}));
  const deltaBase=current-baseline;
  const betterByBase=inv?deltaBase<0:deltaBase>0;
  const gapToTarget=hasT?(inv?(current-target):(target-current)):NaN;
  const W=680,H=300,padL=54,padR=20,padT=26,padB=48;
  const pw=W-padL-padR,ph=H-padT-padB;
  const vals=all.map(p=>p.v).concat(hasT?[target]:[],[baseline]).filter(n=>!isNaN(n));
  let mn=Math.min(...vals),mx=Math.max(...vals);
  const spread=(mx-mn)||Math.abs(mx)||1;mn-=spread*0.16;mx+=spread*0.16;const yR=mx-mn;
  const X=i=>padL+(all.length<=1?pw/2:i*(pw/(all.length-1)));
  const Y=v=>padT+ph-((v-mn)/yR)*ph;
  const yT=hasT?Y(target):0,yB=Y(baseline);
  const nowI=a.length-1;
  const stCol=verdict.c;
  const gradId="ttg"+seed;
  function smooth(pts){
    if(pts.length<2)return pts.length?("M"+pts[0][0]+","+pts[0][1]):"";
    let d="M"+pts[0][0]+","+pts[0][1];
    for(let i=0;i<pts.length-1;i++){
      const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||pts[i+1];
      const c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6;
      const c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
      d+=" C"+c1x+","+c1y+" "+c2x+","+c2y+" "+p2[0]+","+p2[1];
    }
    return d;
  }
  const aPts=a.map((p,i)=>[X(i),Y(p.v)]);
  const aPath=smooth(aPts);
  const aArea=aPath+" L"+X(nowI)+","+(padT+ph)+" L"+X(0)+","+(padT+ph)+" Z";
  const goodTop=inv?yT:padT, goodH=inv?(padT+ph-yT):(yT-padT);
  const badTop=inv?padT:yT, badH=inv?(yT-padT):(padT+ph-yT);
  const tile=(label,val,sub2,col)=>(<div style={{flex:1,minWidth:118,background:C.c2,border:"1px solid "+C.bd,borderRadius:8,padding:"9px 11px"}}>
    <div style={{fontSize:10.5,color:C.mu,fontWeight:600,textTransform:"uppercase",letterSpacing:".3px"}}>{label}</div>
    <div style={{fontSize:18,fontWeight:700,color:col||C.tx,marginTop:2}}>{val}</div>
    {sub2&&<div style={{fontSize:10.5,color:C.mu,marginTop:1}}>{sub2}</div>}
  </div>);
  return(<div onClick={onClose} className="no-print" style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.cd,borderRadius:12,maxWidth:800,width:"100%",maxHeight:"92vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.25)",border:"1px solid "+C.bd}}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid "+C.bd,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:11.5,color:C.mu,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>Trend</div>
          <div style={{fontSize:19,fontWeight:700,color:C.tx,marginTop:2,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>{kpi.n}
            <span style={{fontSize:12,fontWeight:800,padding:"2px 10px",borderRadius:999,background:stCol+"18",color:stCol,textTransform:"uppercase",letterSpacing:".4px"}}>{verdict.t}</span>
            {hasT&&gapToTarget>0&&<span style={{fontSize:11.5,fontWeight:700,padding:"2px 9px",borderRadius:999,background:C.am+"15",color:C.am}}>{"gap "+fmt2(Math.abs(gapToTarget))+su+" to target"}</span>}
            {hasT&&gapToTarget<=0&&<span style={{fontSize:11.5,fontWeight:700,padding:"2px 9px",borderRadius:999,background:C.gn+"15",color:C.gn}}>{"target met"}</span>}
          </div>
        </div>
        <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:"1px solid "+C.bd,background:C.c2,color:C.mu,fontSize:19,cursor:"pointer",lineHeight:1}}>{"✕"}</button>
      </div>
      <div style={{padding:"12px 18px 4px",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:C.mu,fontWeight:700,textTransform:"uppercase",letterSpacing:".3px"}}>View</span>
        {["Daily","Monthly","Yearly"].map(o=>{const act=range===o;return(<button key={o} onClick={()=>setRange(o)} style={{padding:"4px 14px",borderRadius:999,border:"1px solid "+(act?C.bl:C.bd),background:act?C.bl+"15":C.c2,color:act?C.bl:C.tx,fontSize:12,fontWeight:act?700:500,cursor:"pointer"}}>{o}</button>);})}
        <span style={{marginLeft:"auto",fontSize:11.5,color:C.mu}}>{sub}</span>
      </div>
      <div style={{padding:"6px 18px 0"}}>
        <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto"}}>
          <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stCol} stopOpacity="0.20"/>
            <stop offset="100%" stopColor={stCol} stopOpacity="0"/>
          </linearGradient></defs>
          {hasT&&<rect x={padL} y={goodTop} width={pw} height={Math.max(goodH,0)} fill={C.gn} opacity="0.06"/>}
          {hasT&&<rect x={padL} y={badTop} width={pw} height={Math.max(badH,0)} fill={C.rd} opacity="0.05"/>}
          {[0,0.25,0.5,0.75,1].map((p,i)=>{const v=mx-yR*p;return(<g key={i}><line x1={padL} y1={padT+ph*p} x2={padL+pw} y2={padT+ph*p} stroke={C.bd} strokeWidth="0.6" strokeDasharray={p===1?"":"2 3"} opacity="0.6"/><text x={padL-7} y={padT+ph*p+3} fontSize="9" fill={C.mu} textAnchor="end">{fmt2(v)}</text></g>);})}
          <line x1={padL} y1={yB} x2={padL+pw} y2={yB} stroke={C.mu} strokeWidth="1.2" strokeDasharray="1 3" opacity="0.8"/>
          <text x={padL+pw} y={yB-4} fontSize="9.5" fill={C.mu} textAnchor="end">{"Baseline "+fmt2(baseline)}</text>
          {hasT&&<g><line x1={padL} y1={yT} x2={padL+pw} y2={yT} stroke={C.am} strokeWidth="1.8" strokeDasharray="6 3"/>
          <text x={padL+4} y={yT-5} fontSize="10" fill={C.am} fontWeight="700">{"Target "+fmt2(target)+su}</text></g>}
          <path d={aArea} fill={"url(#"+gradId+")"}/>
          <path d={aPath} fill="none" stroke={stCol} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round"/>
          {a.map((p,i)=>((range==="Daily"&&i!==nowI)?null:<circle key={i} cx={X(i)} cy={Y(p.v)} r={i===nowI?4.5:3} fill={i===nowI?stCol:C.cd} stroke={stCol} strokeWidth="1.8"/>))}
          {all.map((p,i)=>(p.l?<text key={i} x={X(i)} y={padT+ph+16} fontSize="8.5" fill={C.md} textAnchor="middle">{p.l}</text>:null))}
          <text x={X(nowI)} y={padT-9} fontSize="9" fill={stCol} fontWeight="700" textAnchor="middle">Now</text>
        </svg>
        <div style={{display:"flex",gap:14,justifyContent:"center",fontSize:11,color:C.mu,padding:"2px 0 8px",flexWrap:"wrap"}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:14,height:2.6,background:stCol,display:"inline-block"}}/>Actual</span>
          {hasT&&<span style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:14,height:0,borderTop:"2px dashed "+C.am,display:"inline-block"}}/>Target</span>}
          <span style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:14,height:0,borderTop:"2px dotted "+C.mu,display:"inline-block"}}/>Baseline</span>
          {hasT&&<span style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:11,height:11,background:C.gn,opacity:.4,borderRadius:2,display:"inline-block"}}/>Good zone</span>}
        </div>
      </div>
      <div style={{padding:"6px 18px 16px",display:"flex",gap:8,flexWrap:"wrap"}}>
        {tile("Current",fmt2(current)+su,null,stCol)}
        {hasT&&tile("Target",fmt2(target)+su,inv?"lower is better":"higher is better",C.am)}
        {tile("vs Baseline",(betterByBase?"▲ ":"▼ ")+fmt2(Math.abs(deltaBase))+su,"from "+fmt2(baseline),betterByBase?C.gn:C.rd)}
      </div>
    </div>
  </div>);
}
function TrendPanel({kpi,onClose,tyreType,plant}){
  const [range,setRange]=useState("Today");
  const _rt0=_rangeFromPreset("Today");
  const [trFrom,setTrFrom]=useState(_rt0.from);
  const [trTo,setTrTo]=useState(_rt0.to);
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);
  if(!kpi)return null;
  const inv=/Scrap|Reject|Loss|Absent|First|Downtime|NCM|Defect|Reduced|Stoppage|Repeat|Hold|Breakdown/i.test(kpi.n);
  const chartType=pickChartType(kpi);
  const catType=chartType==="hbar"||chartType==="donut"||chartType==="multiline";
  const _vNum=parseFloat(String(kpi.v).replace(/,/g,""));
  const effV=tAdjust(_vNum,kpi.n,tyreType,plant);
  const _tNum=kpi.target!=null?parseFloat(String(kpi.target).replace(/[^0-9.\-]/g,"")):NaN;
  const rawTarget=!isNaN(_tNum)?_tNum:(inv?(isNaN(effV)?_vNum:effV)*0.85:(isNaN(effV)?_vNum:effV)*1.05);
  const effTarget=tAdjust(rawTarget,kpi.n,tyreType,plant);
  const cur=isNaN(effV)?_vNum:effV;
  const tgt=isNaN(effTarget)?rawTarget:effTarget;
  const effRange=range||_autoPreset(trFrom,trTo);
  const data=catType?null:_genTrendSeries(kpi,effRange,cur);
  const stCol=kpi.status==="Red"?C.rd:kpi.status==="Yellow"?C.am:kpi.status==="Green"?C.gn:C.bl;
  if(!catType&&!data)return(<div onClick={onClose} className="no-print" style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.cd,borderRadius:12,padding:20,maxWidth:400}}>Trend not available for this KPI (non-numeric).
    <button onClick={onClose} style={{marginTop:12,padding:"6px 14px",border:"1px solid "+C.bd,background:C.c2,borderRadius:6,cursor:"pointer"}}>Close</button></div>
  </div>);
  const ins=catType?{bestIdx:-1,worstIdx:-1}:_genInsight(data.series,tgt,cur,inv,kpi.n);
  return(<div onClick={onClose} className="no-print" style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fadeIn .15s ease"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.cd,borderRadius:12,maxWidth:740,width:"100%",maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.25)",border:"1px solid "+C.bd}}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid "+C.bd,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <div style={{fontSize:12,color:C.mu,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>KPI Trend Analysis</div>
          <div style={{fontSize:19,fontWeight:700,color:C.tx,marginTop:2}}>{kpi.n}{tyreType&&tyreType!=="All"&&!isBanmorePlant(plant)&&<span style={{fontSize:13,marginLeft:8,padding:"2px 7px",borderRadius:4,background:(tyreType==="PCR"?C.bl:C.tl)+"18",color:tyreType==="PCR"?C.bl:C.tl,fontWeight:700}}>{tyreType}</span>}</div>
        </div>
        <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:"1px solid "+C.bd,background:C.c2,color:C.mu,fontSize:19,cursor:"pointer",lineHeight:1}}>{"✕"}</button>
      </div>
      {!catType&&<div style={{padding:"14px 18px",display:"flex",gap:10,alignItems:"center",borderBottom:"1px solid "+C.bd,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:C.mu,fontWeight:600,textTransform:"uppercase",marginRight:4}}>Time Range</span>
        <TimeRangeSelect preset={range} setPreset={setRange} from={trFrom} to={trTo} setFrom={setTrFrom} setTo={setTrTo}/>
      </div>}
      <div style={{padding:"14px 18px"}}>
        <div style={{background:C.c2,borderRadius:8,border:"1px solid "+C.bd,padding:"10px 12px 4px"}}>
          {catType?<CatChartBlock kpi={kpi} chartType={chartType}/>:<>
          <div style={{fontSize:12,color:C.mu,fontWeight:600,textTransform:"uppercase",marginBottom:4,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span>{chartType==="progress"?"Progress to Target":"Actual vs Target — "+effRange}</span>
            {chartType==="line"&&<>
              <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11}}><span style={{width:14,height:2,background:stCol,display:"inline-block"}}/>Actual</span>
              <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11}}><span style={{width:14,height:0,borderTop:"1.5px dashed "+C.am,display:"inline-block"}}/>Target</span>
            </>}
            {chartType==="bar"&&<>
              <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11}}><span style={{width:10,height:10,background:stCol,display:"inline-block",borderRadius:2}}/>Period value</span>
              <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11}}><span style={{width:14,height:0,borderTop:"1.5px dashed "+C.am,display:"inline-block"}}/>Target</span>
            </>}
          </div>
          {chartType==="bar"
            ?<TrendBar labels={data.labels} series={data.series} target={tgt} color={stCol} bestIdx={ins.bestIdx} worstIdx={ins.worstIdx}/>
            :chartType==="progress"
              ?<TrendProgress current={cur} target={tgt} unit={kpi.u} color={stCol} series={data.series} labels={data.labels}/>
              :<TrendChart labels={data.labels} series={data.series} target={tgt} color={stCol} bestIdx={ins.bestIdx} worstIdx={ins.worstIdx}/>}
          </>}
        </div>
      </div>
    </div>
  </div>);
}

function LiveProcessTrendPanel({kpi,onClose,dateFrom,dateTo,shift}){
  const initialPreset=dateFrom===dateTo?"day":dateFrom===QUALITY_MONTH_FROM&&dateTo===QUALITY_MONTH_TO?"month":dateFrom==="2026-01-01"&&dateTo==="2026-12-31"?"year":"";
  const [rangePreset,setRangePreset]=useState(initialPreset);
  const [trendFrom,setTrendFrom]=useState(dateFrom||QUALITY_DATA_DATE);
  const [trendTo,setTrendTo]=useState(dateTo||QUALITY_DATA_DATE);
  const [points,setPoints]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);
  const applyTrendPreset=preset=>{
    setRangePreset(preset);
    if(preset==="day"){setTrendFrom(QUALITY_DATA_DATE);setTrendTo(QUALITY_DATA_DATE);}
    else if(preset==="month"){setTrendFrom(QUALITY_MONTH_FROM);setTrendTo(QUALITY_MONTH_TO);}
    else if(preset==="year"){setTrendFrom("2026-01-01");setTrendTo("2026-12-31");}
  };
  const onTrendFromChange=e=>{setRangePreset("");setTrendFrom(e.target.value);};
  const onTrendToChange=e=>{setRangePreset("");setTrendTo(e.target.value);};
  useEffect(()=>{
    if(!kpi?.trendKpiName)return;
    let cancelled=false;
    setLoading(true);setError(null);setPoints([]);
    getProcessKpiHistory({kpiName:kpi.trendKpiName,dateFrom:trendFrom,dateTo:trendTo,shift})
      .then(res=>{if(!cancelled)setPoints(Array.isArray(res?.points)?res.points.filter(p=>p.value!=null):[]);})
      .catch(err=>{if(!cancelled)setError(err);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[kpi?.trendKpiName,trendFrom,trendTo,shift]);
  if(!kpi)return null;
  const labels=points.map(p=>String(p.date||"").slice(5));
  const series=points.map(p=>Number(p.value));
  const targetNum=kpi.target!=null?parseFloat(String(kpi.target).replace(/[^0-9.\-]/g,"")):NaN;
  const current=series.length?series[series.length-1]:parseFloat(String(kpi.v).replace(/,/g,""));
  const target=!isNaN(targetNum)?targetNum:current;
  const inv=/Violation|Scrap|Reject|Loss|Absent|First|Downtime|NCM|Defect|Reduced|Stoppage|Repeat|Hold|Breakdown/i.test(kpi.n);
  const stCol=kpi.id==="mqv"?C.rd:kpi.id==="audit"?C.bl:C.ac;
  const ins=series.length?_genInsight(series,target,current,inv,kpi.n):{bestIdx:-1,worstIdx:-1};
  return(<div onClick={onClose} className="no-print" style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fadeIn .15s ease"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.cd,borderRadius:12,maxWidth:740,width:"100%",maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.25)",border:"1px solid "+C.bd}}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid "+C.bd,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <div style={{fontSize:12,color:C.mu,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>KPI Trend Analysis</div>
          <div style={{fontSize:19,fontWeight:700,color:C.tx,marginTop:2}}>{kpi.n}</div>
          <div style={{fontSize:12,color:C.mu,marginTop:2}}>{trendFrom} to {trendTo} · {shift==="All"?"DAY":`SHIFT ${shift}`}</div>
        </div>
        <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:"1px solid "+C.bd,background:C.c2,color:C.mu,fontSize:19,cursor:"pointer",lineHeight:1}}>{"✕"}</button>
      </div>
      <div style={{padding:"12px 18px",borderBottom:"1px solid "+C.bd,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:1,background:C.bg,borderRadius:10,padding:2}}>
          {[["day","Day"],["month","Month"],["year","Year"]].map(([id,label])=>{const active=rangePreset===id;return(
            <button key={id} onClick={()=>applyTrendPreset(id)} style={{padding:"4px 12px",borderRadius:8,border:"none",background:active?C.cd:"transparent",color:active?C.tx:C.mu,fontSize:12,fontWeight:active?700:500,cursor:"pointer"}}>{label}</button>
          );})}
        </div>
        <div title="Trend date range" style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",border:"1px solid "+C.bd,borderRadius:8,background:C.cd}}>
          <input type="date" value={trendFrom} onChange={onTrendFromChange} style={{border:"none",outline:"none",background:"transparent",fontSize:12,fontFamily:"inherit",color:C.tx,padding:"2px 0",width:116}}/>
          <span style={{color:C.bd,fontSize:12}}>{"–"}</span>
          <input type="date" value={trendTo} onChange={onTrendToChange} style={{border:"none",outline:"none",background:"transparent",fontSize:12,fontFamily:"inherit",color:C.tx,padding:"2px 0",width:116}}/>
        </div>
      </div>
      <div style={{padding:"14px 18px"}}>
        <div style={{background:C.c2,borderRadius:8,border:"1px solid "+C.bd,padding:"10px 12px 4px"}}>
          <div style={{fontSize:12,color:C.mu,fontWeight:600,textTransform:"uppercase",marginBottom:4,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span>Actual vs Target — fetched from API</span>
            <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11}}><span style={{width:14,height:2,background:stCol,display:"inline-block"}}/>Actual</span>
            {!isNaN(targetNum)&&<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11}}><span style={{width:14,height:0,borderTop:"1.5px dashed "+C.am,display:"inline-block"}}/>Target</span>}
          </div>
          {loading&&<div style={{padding:24,textAlign:"center",fontSize:13,color:C.mu}}>Fetching trend points...</div>}
          {error&&<div style={{padding:24,textAlign:"center",fontSize:13,color:C.rd}}>Trend fetch failed: {error.message||"Request failed"}</div>}
          {!loading&&!error&&!series.length&&<div style={{padding:24,textAlign:"center",fontSize:13,color:C.mu}}>No trend points returned for this date range.</div>}
          {!loading&&!error&&series.length>0&&<TrendChart labels={labels} series={series} target={target} color={stCol} bestIdx={ins.bestIdx} worstIdx={ins.worstIdx}/>}
        </div>
      </div>
    </div>
  </div>);
}

/* ─── DOWNLOAD HELPERS ─── */
function _safeName(s){return (s||"export").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,60)||"export";}
function _dl(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},0);}
function _tableToCSV(tbl){return Array.from(tbl.querySelectorAll("tr")).map(tr=>Array.from(tr.querySelectorAll("th,td")).map(c=>{const t=(c.innerText||"").trim().replace(/\s+/g," ");return /[",\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;}).join(",")).join("\n");}
function _svgToPNG(svg,scale,onDone){try{const bbox=svg.getBoundingClientRect();const w=Math.max(bbox.width,1),h=Math.max(bbox.height,1);const clone=svg.cloneNode(true);clone.setAttribute("xmlns","http://www.w3.org/2000/svg");if(!clone.getAttribute("width"))clone.setAttribute("width",w);if(!clone.getAttribute("height"))clone.setAttribute("height",h);if(!clone.getAttribute("viewBox"))clone.setAttribute("viewBox","0 0 "+w+" "+h);const xml=new XMLSerializer().serializeToString(clone);const canvas=document.createElement("canvas");canvas.width=w*scale;canvas.height=h*scale;const ctx=canvas.getContext("2d");ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);const img=new Image();img.onload=()=>{ctx.drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(b=>onDone(b));};img.onerror=()=>onDone(null);img.src="data:image/svg+xml;base64,"+btoa(unescape(encodeURIComponent(xml)));}catch(e){onDone(null);}}
function _printPage(){window.print();}

/* ─── EXPORT (PRINT) BUTTON FOR HEADERS ─── */
function ExportButton(){return(<Tooltip title="Download as PDF" arrow><span className="no-print" style={{display:"inline-flex"}}><IconButton size="small" onClick={_printPage} aria-label="Download as PDF" sx={{width:34,height:34,borderRadius:"16px",border:1,borderColor:"primary.main",backgroundColor:"primary.main",color:"primary.contrastText",boxShadow:"0 1px 3px rgba(0,0,0,.12)","&:hover":{backgroundColor:"primary.main",borderColor:"primary.main"}}}><FileDownloadOutlinedIcon sx={{fontSize:20}}/></IconButton></span></Tooltip>);}

function PcrOnlyBadge(){return(<Tooltip title="Banmore plant produces PCR only" arrow><span style={{fontSize:11,fontWeight:700,letterSpacing:.6,color:C.tl,border:"1px solid "+C.tl,background:C.c2,padding:"4px 8px",borderRadius:8,whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",height:22}}>PCR ONLY</span></Tooltip>);}

/* ─── USER MENU (avatar dropdown + sub-modals) ─── */
const USER_PROFILES={
  "PH":{name:"Rajesh Sharma",role:"Plant Head",email:"rajesh.sharma@jktyre.in",phone:"+91 98230 12345",joined:"Jan 2018"},
  "QH":{name:"Anjali Verma",role:"Quality Head",email:"anjali.verma@jktyre.in",phone:"+91 98230 67890",joined:"Mar 2020"},
  "EH":{name:"Vikram Mehta",role:"Engineering Head",email:"vikram.mehta@jktyre.in",phone:"+91 98230 33456",joined:"Aug 2016"}
};
function UserModal({title,icon,onClose,children}){
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);
  return(<div onClick={onClose} className="no-print" style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fadeIn .15s ease"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.cd,borderRadius:12,maxWidth:480,width:"100%",maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.25)",border:"1px solid "+C.bd}}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid "+C.bd,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:21}}>{icon}</span>
          <div style={{fontSize:19,fontWeight:700,color:C.tx}}>{title}</div>
        </div>
        <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:"1px solid "+C.bd,background:C.c2,color:C.mu,fontSize:19,cursor:"pointer",lineHeight:1}}>{"✕"}</button>
      </div>
      <div style={{padding:"16px 18px"}}>{children}</div>
    </div>
  </div>);
}
function ProfileModal({user,plant,onClose}){
  const rows=[
    {l:"Name",v:user.name},
    {l:"Role",v:user.role},
    {l:"Plant",v:plant?plant.name:"—"},
    {l:"Email",v:user.email},
    {l:"Phone",v:user.phone},
    {l:"Joined",v:user.joined},
    {l:"Employee ID",v:"JK-"+(user.role==="Plant Head"?"PH":user.role==="Quality Head"?"QH":"EH")+"-04217"}
  ];
  return(<UserModal title="My Profile" icon={"\u{1F464}"} onClose={onClose}>
    <div style={{display:"flex",gap:14,alignItems:"center",paddingBottom:14,borderBottom:"1px solid "+C.bd,marginBottom:14}}>
      <div style={{width:60,height:60,borderRadius:"50%",background:user.bgC,border:"1px solid "+user.bdC,display:"flex",alignItems:"center",justifyContent:"center",fontSize:23,fontWeight:700,color:user.fgC}}>{user.initials}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:19,fontWeight:700,color:C.tx}}>{user.name}</div>
        <div style={{fontSize:14,color:C.mu,marginTop:2}}>{user.role}{plant?" · "+plant.name:""}</div>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"120px 1fr",rowGap:8,columnGap:10,fontSize:15}}>
      {rows.map((r,i)=>(<Fragment key={i}><div style={{color:C.mu,fontWeight:600,textTransform:"uppercase",fontSize:12,letterSpacing:".4px",alignSelf:"center"}}>{r.l}</div><div style={{color:C.tx,fontWeight:500}}>{r.v}</div></Fragment>))}
    </div>
    <button style={{marginTop:16,padding:"7px 14px",border:"1px solid "+C.ac,borderRadius:6,background:C.aL,color:C.ac,fontSize:14,fontWeight:600,cursor:"pointer"}}>Edit Profile</button>
  </UserModal>);
}
function PasswordModal({onClose}){
  const [cur,setCur]=useState("");const [nw,setNw]=useState("");const [cf,setCf]=useState("");const [msg,setMsg]=useState(null);
  const submit=()=>{if(!cur||!nw||!cf){setMsg({t:"All fields required",ok:false});return;}if(nw!==cf){setMsg({t:"New passwords don't match",ok:false});return;}if(nw.length<8){setMsg({t:"Password must be at least 8 characters",ok:false});return;}setMsg({t:"Password updated successfully",ok:true});setCur("");setNw("");setCf("");};
  const fld=(lab,val,setVal)=>(<div style={{marginBottom:10}}>
    <div style={{fontSize:12,color:C.mu,fontWeight:600,textTransform:"uppercase",marginBottom:4,letterSpacing:".4px"}}>{lab}</div>
    <input type="password" value={val} onChange={e=>setVal(e.target.value)} style={{width:"100%",padding:"8px 10px",border:"1px solid "+C.bd,borderRadius:6,fontSize:15,boxSizing:"border-box",background:C.c2,color:C.tx,outline:"none"}}/>
  </div>);
  return(<UserModal title="Change Password" icon={"\u{1F512}"} onClose={onClose}>
    {fld("Current Password",cur,setCur)}
    {fld("New Password",nw,setNw)}
    {fld("Confirm New Password",cf,setCf)}
    <div style={{fontSize:13,color:C.mu,marginTop:-4,marginBottom:12,lineHeight:1.4}}>Minimum 8 characters. Use a mix of letters, numbers, and symbols.</div>
    {msg&&<div style={{padding:"8px 10px",borderRadius:6,marginBottom:10,fontSize:14,background:(msg.ok?C.gn:C.rd)+"15",color:msg.ok?C.gn:C.rd,border:"1px solid "+(msg.ok?C.gn:C.rd)+"33",fontWeight:600}}>{msg.ok?"✓ ":"⚠ "}{msg.t}</div>}
    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
      <button onClick={onClose} style={{padding:"7px 14px",border:"1px solid "+C.bd,borderRadius:6,background:C.c2,color:C.md,fontSize:14,fontWeight:600,cursor:"pointer"}}>Cancel</button>
      <button onClick={submit} style={{padding:"7px 14px",border:"1px solid "+C.ac,borderRadius:6,background:C.ac,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>Update Password</button>
    </div>
  </UserModal>);
}
function HelpModal({onClose}){
  const items=[
    {ic:"▸",t:"Click any KPI card to drill down to root-cause level"},
    {ic:"▸",t:"Click the trend icon on a KPI to see Daily / Monthly / Yearly trends"},
    {ic:"▸",t:"Use the PCR / TBR filter in the header to slice metrics by tyre type"},
    {ic:"▸",t:"Use Export PDF in the header to save the current page"},
    {ic:"▸",t:"Every card has a download icon (CSV for tables, PNG for charts)"},
    {ic:"▸",t:"Click section tabs (Mixing / TBM / Curing / Stock) to drill down by section"},
    {ic:"▸",t:"Banmore plant is PCR-only — filter is locked accordingly"}
  ];
  return(<UserModal title="Help" icon={"?"} onClose={onClose}>
    <div style={{fontSize:14,color:C.tx,marginBottom:12,lineHeight:1.5}}>Quick guide to using the dashboard. For more help contact your system administrator.</div>
    <div style={{background:C.c2,borderRadius:8,border:"1px solid "+C.bd,padding:"10px 12px"}}>
      {items.map((it,i)=>(<div key={i} style={{display:"flex",gap:8,padding:"5px 0",fontSize:14,color:C.tx,lineHeight:1.5}}>
        <span style={{color:C.ac,fontWeight:700,flexShrink:0}}>{it.ic}</span><span>{it.t}</span>
      </div>))}
    </div>
    <div style={{marginTop:14,padding:"10px 12px",background:C.aL,borderRadius:6,border:"1px solid "+C.aB,fontSize:14,color:C.tx,lineHeight:1.5}}>
      <div style={{fontWeight:700,color:C.ac,marginBottom:4}}>Need more help?</div>
      Contact IT Helpdesk at <span style={{fontWeight:600}}>ext. 4242</span> or email <span style={{fontWeight:600}}>helpdesk@jktyre.in</span>
    </div>
  </UserModal>);
}
function AboutModal({onClose}){
  return(<UserModal title="About" icon={"i"} onClose={onClose}>
    <div style={{textAlign:"center",padding:"6px 0 18px"}}>
      <div style={{fontSize:27,fontWeight:700,letterSpacing:".8px",color:C.tx,textTransform:"uppercase"}}>ONE FACTORY ONE DASHBOARD</div>
      <div style={{fontSize:14,color:C.mu,marginTop:6,letterSpacing:".4px",textTransform:"uppercase"}}>Manufacturing Operations Platform</div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"110px 1fr",rowGap:8,columnGap:10,fontSize:15,padding:"14px 0",borderTop:"1px solid "+C.bd,borderBottom:"1px solid "+C.bd}}>
      {[["Version","v2.4.1"],["Build","2026.05.15"],["Module","Plant Operations"],["Licensed to","JK Tyre & Industries Ltd."],["Support contact","support@jktyre.in"]].map((r,i)=>(<Fragment key={i}><div style={{color:C.mu,fontWeight:600,textTransform:"uppercase",fontSize:12,letterSpacing:".4px",alignSelf:"center"}}>{r[0]}</div><div style={{color:C.tx,fontWeight:500}}>{r[1]}</div></Fragment>))}
    </div>
    <div style={{textAlign:"center",fontSize:13,color:C.mu,marginTop:14,lineHeight:1.5}}>
      © 2026 JK Tyre & Industries Ltd.<br/>All rights reserved.
    </div>
  </UserModal>);
}
function UserMenu({plant,role,onLogout}){
  const [open,setOpen]=useState(false);
  const [modal,setModal]=useState(null);
  const [theme,setTheme]=useState("Light");
  const [themeOpen,setThemeOpen]=useState(false);
  const initials=role||"PH";
  const prof=USER_PROFILES[initials]||USER_PROFILES["PH"];
  const bgC=initials==="PH"?C.aL:initials==="QH"?C.tl+"18":C.pp+"18";
  const bdC=initials==="PH"?C.aB:initials==="QH"?C.tl+"40":C.pp+"40";
  const fgC=initials==="PH"?C.ac:initials==="QH"?C.tl:C.pp;
  const user={...prof,initials,bgC,bdC,fgC};
  const itemStyle={display:"flex",alignItems:"center",gap:10,padding:"9px 14px",border:"none",background:"transparent",width:"100%",textAlign:"left",fontSize:15,color:C.tx,cursor:"pointer",fontWeight:500};
  const item=(icon,label,onClick,extra)=>(<button onClick={onClick} style={itemStyle} onMouseOver={e=>e.currentTarget.style.background=C.c2} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
    <span style={{fontSize:16,width:18,textAlign:"center"}}>{icon}</span><span style={{flex:1}}>{label}</span>{extra}
  </button>);
  const close=()=>{setOpen(false);setThemeOpen(false);};
  return(<>
    <div className="no-print" style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} title={user.name+" · "+user.role} style={{width:34,height:34,borderRadius:"50%",background:bgC,border:"1px solid "+bdC,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:fgC,cursor:"pointer",padding:0}}>{initials}</button>
      {open&&<>
        <div onClick={close} style={{position:"fixed",inset:0,zIndex:300}}/>
        <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.cd,border:"1px solid "+C.bd,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.12)",zIndex:301,minWidth:260,overflow:"hidden",animation:"fadeIn .15s ease"}}>
          <div style={{padding:"12px 14px",borderBottom:"1px solid "+C.bd,display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:bgC,border:"1px solid "+bdC,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:fgC,flexShrink:0}}>{initials}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:700,color:C.tx,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.name}</div>
              <div style={{fontSize:13,color:C.mu,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.role}{plant?" · "+plant.name:""}</div>
            </div>
          </div>
          <div style={{padding:"4px 0"}}>
            {item("\u{1F464}","My Profile",()=>{setModal("profile");close();})}
            {item("\u{1F512}","Change Password",()=>{setModal("password");close();})}
            <div style={{position:"relative"}}>
              {item("\u{1F3A8}","Theme",()=>setThemeOpen(o=>!o),<span style={{fontSize:14,color:C.mu,display:"flex",alignItems:"center",gap:4}}>{theme}<span style={{fontSize:12}}>{"›"}</span></span>)}
              {themeOpen&&<div style={{position:"absolute",right:8,top:"100%",background:C.cd,border:"1px solid "+C.bd,borderRadius:8,boxShadow:"0 4px 12px rgba(0,0,0,.12)",zIndex:302,minWidth:130,padding:"4px 0"}}>
                {["Light","Dark","System"].map(t=>(<button key={t} onClick={()=>{setTheme(t);setThemeOpen(false);}} style={{...itemStyle,padding:"7px 12px",fontSize:14}} onMouseOver={e=>e.currentTarget.style.background=C.c2} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{width:14,color:t===theme?C.ac:"transparent"}}>{"✓"}</span>{t}{t!=="Light"&&<span style={{fontSize:11,color:C.mu,marginLeft:"auto"}}>soon</span>}
                </button>))}
              </div>}
            </div>
            {item("?","Help",()=>{setModal("help");close();})}
            {item("i","About",()=>{setModal("about");close();})}
          </div>
          <div style={{borderTop:"1px solid "+C.bd,padding:"4px 0"}}>
            <button onClick={()=>{close();if(onLogout)onLogout();}} style={{...itemStyle,color:C.rd,fontWeight:600}} onMouseOver={e=>e.currentTarget.style.background=C.rd+"10"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
              <span style={{fontSize:16,width:18,textAlign:"center"}}>{"⏻"}</span><span style={{flex:1}}>Logout</span>
            </button>
          </div>
        </div>
      </>}
    </div>
    {modal==="profile"&&<ProfileModal user={user} plant={plant} onClose={()=>setModal(null)}/>}
    {modal==="password"&&<PasswordModal onClose={()=>setModal(null)}/>}
    {modal==="help"&&<HelpModal onClose={()=>setModal(null)}/>}
    {modal==="about"&&<AboutModal onClose={()=>setModal(null)}/>}
  </>);
}

/* ─── PRINT STYLESHEET ─── */
function PrintStyles(){return(<style>{`@media print{
  @page{size:A3 landscape;margin:10mm;}
  html,body{background:#fff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .no-print,.no-print *{display:none !important;}
  [style*="position: sticky"],[style*="position:sticky"]{position:static !important;top:auto !important;}
  [style*="position: fixed"],[style*="position:fixed"]{position:static !important;}
  [style*="overflow-x: auto"],[style*="overflowX"]{overflow:visible !important;}
  [style*="overflow-y: auto"],[style*="overflow:auto"]{overflow:visible !important;max-height:none !important;}
  [style*="min-height: 100vh"],[style*="minHeight"]{min-height:0 !important;}
  button{cursor:default !important;}
  table{page-break-inside:avoid;}
}`}</style>);}

function Card({title,children,accent,style:s,hideExport}){
  const ref=useRef(null);
  const [menu,setMenu]=useState(false);
  const [caps,setCaps]=useState({tbl:false,svg:false});
  useEffect(()=>{if(ref.current){setCaps({tbl:!!ref.current.querySelector("table"),svg:!!ref.current.querySelector("svg")});}},[children]);
  const fname=_safeName(title);
  const onCSV=e=>{e&&e.stopPropagation();const t=ref.current&&ref.current.querySelector("table");if(t)_dl(new Blob([_tableToCSV(t)],{type:"text/csv;charset=utf-8"}),fname+".csv");setMenu(false);};
  const onPNG=e=>{e&&e.stopPropagation();const sv=ref.current&&ref.current.querySelector("svg");if(sv)_svgToPNG(sv,2,b=>{if(b)_dl(b,fname+".png");});setMenu(false);};
  const onClick=e=>{e.stopPropagation();const only=caps.tbl&&!caps.svg?"csv":!caps.tbl&&caps.svg?"png":null;if(only==="csv")return onCSV();if(only==="png")return onPNG();if(caps.tbl||caps.svg)setMenu(m=>!m);};
  const showBtn=!hideExport&&(caps.tbl||caps.svg);
  return(<div style={{background:C.cd,borderRadius:C.r,border:"1px solid "+C.bd,padding:"12px 14px",boxShadow:C.sh,minWidth:0,overflow:"hidden",borderTop:accent?"2px solid "+accent:undefined,position:"relative",...s}}>
    {(title||showBtn)&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,gap:8}}>
      {title?<div style={{fontSize:14,fontWeight:600,color:C.md,textTransform:"uppercase",letterSpacing:".4px",flex:1,minWidth:0}}>{title}</div>:<div style={{flex:1}}/>}
      {showBtn&&<div className="no-print" style={{position:"relative",flexShrink:0}}>
        <button onClick={onClick} title="Download" style={{width:22,height:22,borderRadius:4,border:"1px solid "+C.bd,background:C.c2,color:C.mu,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,padding:0}}>{"⤓"}</button>
        {menu&&caps.tbl&&caps.svg&&<>
          <div onClick={()=>setMenu(false)} style={{position:"fixed",inset:0,zIndex:200}}/>
          <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:C.cd,border:"1px solid "+C.bd,borderRadius:6,boxShadow:"0 4px 12px rgba(0,0,0,.12)",zIndex:201,minWidth:140,overflow:"hidden"}}>
            <button onClick={onCSV} style={{display:"block",width:"100%",padding:"7px 12px",border:"none",background:"transparent",textAlign:"left",fontSize:13,color:C.tx,cursor:"pointer",borderBottom:"1px solid "+C.bd}}>{"⤓"} CSV (Table)</button>
            <button onClick={onPNG} style={{display:"block",width:"100%",padding:"7px 12px",border:"none",background:"transparent",textAlign:"left",fontSize:13,color:C.tx,cursor:"pointer"}}>{"⤓"} PNG (Chart)</button>
          </div>
        </>}
      </div>}
    </div>}
    <div ref={ref}>{children}</div>
  </div>);
}

function DTable({cols,rows}){
  const [sc,setSc]=useState(null),[sd,setSd]=useState("desc");
  const ck=cols.join("|");
  useEffect(()=>{setSc(null);setSd("desc");},[ck]);
  const num=cell=>{let s=cell;if(s&&typeof s==="object"&&s.props)return null;s=String(s==null?"":s);const n=parseFloat(s.replace(/[^0-9.\-]/g,""));return /[0-9]/.test(s)&&!isNaN(n)?n:null;};
  const txt=cell=>{let s=cell;if(s&&typeof s==="object"&&s.props)s="";return String(s==null?"":s).toLowerCase();};
  let disp=rows;
  if(sc!=null){disp=[...rows].sort((a,b)=>{const na=num(a[sc]),nb=num(b[sc]);let c2;if(na!=null&&nb!=null)c2=na-nb;else{const ta=txt(a[sc]),tb=txt(b[sc]);c2=ta<tb?-1:ta>tb?1:0;}return sd==="asc"?c2:-c2;});}
  const onH=i=>{if(sc===i)setSd(d=>d==="asc"?"desc":"asc");else{setSc(i);setSd("desc");}};
  return(<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}><thead><tr>{cols.map((c,i)=>{const a=sc===i;return(<th key={i} onClick={()=>onH(i)} title="Click to sort" style={{textAlign:i===0?"left":"right",padding:"5px 8px",color:a?C.ac:C.mu,fontWeight:a?700:600,borderBottom:"1px solid "+C.bd,fontSize:13,cursor:"pointer",userSelect:"none",whiteSpace:"nowrap"}}>{c}<span style={{marginLeft:4,fontSize:9,opacity:a?1:.3}}>{a?(sd==="asc"?"▲":"▼"):"⇅"}</span></th>);})}</tr></thead><tbody>{disp.map((row,ri)=>(<tr key={ri} style={{background:ri%2===0?"transparent":C.c2}}>{row.map((cell,ci)=>{const isS=typeof cell==="string"&&["OK","High","Low","Alert","Below","Monitor","Escalate","Open","Closed","Scrapped","Electrical","Mechanical","Instrumentation"].includes(cell);const stC=isS?(["OK","Closed"].includes(cell)?C.gn:["High","Low","Scrapped","Escalate","Below","Open"].includes(cell)?C.rd:["Electrical","Mechanical","Instrumentation"].includes(cell)?C.bl:C.am):null;return(<td key={ci} style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:ci===0?"left":"right",color:stC||C.tx,fontWeight:stC?600:400}}>{isS?<span style={{padding:"2px 6px",borderRadius:999,fontSize:12,fontWeight:700,background:(stC||C.am)+"18",color:stC||C.am}}>{cell}</span>:cell}</td>);})}</tr>))}</tbody></table></div>);
}

/* ─── STATUS PILL ─── */
function StatusPill({status}){
  const map={
    Green:{bg:C.gn+"18",fg:C.gn,t:"Green"},Yellow:{bg:C.am+"18",fg:C.am,t:"Yellow"},Red:{bg:C.rd+"18",fg:C.rd,t:"Red"},Grey:{bg:"#9CA3AF18",fg:"#6B7280",t:"Manual"},
    Open:{bg:C.am+"18",fg:C.am,t:"Open"},Closed:{bg:C.gn+"18",fg:C.gn,t:"Closed"},Overdue:{bg:C.rd+"18",fg:C.rd,t:"Overdue"},Pending:{bg:C.am+"18",fg:C.am,t:"Pending"},
    Released:{bg:C.gn+"18",fg:C.gn,t:"Released"},Hold:{bg:C.rd+"18",fg:C.rd,t:"Hold"},Accepted:{bg:C.gn+"18",fg:C.gn,t:"Accepted"},Rejected:{bg:C.rd+"18",fg:C.rd,t:"Rejected"},
    Manual:{bg:"#9CA3AF18",fg:"#6B7280",t:"Manual"}
  };
  const s=map[status]||{bg:C.bd,fg:C.mu,t:status};
  return <span style={{padding:"2px 8px",borderRadius:999,fontSize:12,fontWeight:700,background:s.bg,color:s.fg,whiteSpace:"nowrap"}}>{s.t}</span>;
}

/* ─── BREADCRUMB ─── */
function Breadcrumb({path,onNav}){
  return(<div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:C.mu,marginBottom:8,flexWrap:"wrap"}}>
    {path.map((p,i)=>(<span key={i} style={{display:"flex",alignItems:"center",gap:6}}>
      <span onClick={()=>onNav&&onNav(i)} style={{cursor:onNav&&i<path.length-1?"pointer":"default",color:i===path.length-1?C.tx:C.mu,fontWeight:i===path.length-1?700:400,textDecoration:onNav&&i<path.length-1?"underline":"none"}}>{p}</span>
      {i<path.length-1&&<span style={{color:C.bd}}>{"›"}</span>}
    </span>))}
  </div>);
}

/* ─── MINI CONTROL CHART (SPC) ─── */
function ControlChart({data,ucl,lcl,target,w=240,h=80}){
  const mn=Math.min(...data,lcl)-0.05,mx=Math.max(...data,ucl)+0.05,rn=mx-mn||1;
  const yScale=v=>h-((v-mn)/rn)*(h-10)-5;
  const pts=data.map((v,i)=>`${10+(i/(data.length-1))*(w-20)},${yScale(v)}`).join(" ");
  return(<svg width={w} height={h} style={{background:C.c2,borderRadius:4,border:"1px solid "+C.bd}}>
    <line x1="10" x2={w-10} y1={yScale(ucl)} y2={yScale(ucl)} stroke={C.rd} strokeWidth="1" strokeDasharray="3,2"/>
    <line x1="10" x2={w-10} y1={yScale(lcl)} y2={yScale(lcl)} stroke={C.rd} strokeWidth="1" strokeDasharray="3,2"/>
    <line x1="10" x2={w-10} y1={yScale(target)} y2={yScale(target)} stroke={C.gn} strokeWidth="1" strokeDasharray="2,2"/>
    <text x={w-8} y={yScale(ucl)-2} fontSize="7" fill={C.rd} textAnchor="end">UCL {ucl}</text>
    <text x={w-8} y={yScale(lcl)+8} fontSize="7" fill={C.rd} textAnchor="end">LCL {lcl}</text>
    <polyline points={pts} fill="none" stroke={C.bl} strokeWidth="1.5"/>
    {data.map((v,i)=>{const oob=v>ucl||v<lcl;return <circle key={i} cx={10+(i/(data.length-1))*(w-20)} cy={yScale(v)} r="2.5" fill={oob?C.rd:C.bl}/>;})}
  </svg>);
}

function QKpiCard({kpi,isOpen,onToggle,onTrend,tyreType,plant}){
  const stCol=kpi.status==="Red"?C.rd:kpi.status==="Yellow"?C.am:kpi.status==="Green"?C.gn:"#9CA3AF";
  const v=tAdjust(kpi.v,kpi.n,tyreType,plant);
  const canTrend=!kpi.na&&kpi.trendApi&&typeof onTrend==="function";
  const trendClick=e=>{e.stopPropagation();if(onTrend)onTrend(kpi);};
  return(<div onClick={onToggle} style={{background:C.cd,borderRadius:C.r,border:"1px solid "+(isOpen?C.ac+"88":C.bd),boxShadow:isOpen?"0 0 0 1px "+C.ac+"40, "+C.sh:C.sh,cursor:kpi.drill?"pointer":"default",overflow:"hidden",transition:"border-color .2s",borderLeft:"3px solid "+stCol}}>
    <div style={{padding:"10px 12px"}}>
      <div style={{fontSize:11,color:C.mu,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
        <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{kpi.n}{kpi.manual&&<span style={{marginLeft:4,fontSize:11,padding:"1px 4px",background:"#9CA3AF22",color:"#6B7280",borderRadius:3}}>MANUAL</span>}</span>
        <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
          {canTrend&&<button onClick={trendClick} title="View Trend (Daily / Monthly / Yearly)" style={{width:20,height:20,borderRadius:4,border:"1px solid "+C.bd,background:C.c2,color:C.mu,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}><TrendIcon size={11}/></button>}
          {kpi.drill&&<span title="Click card to drill down" style={{color:isOpen?C.ac:C.mu,transform:isOpen?"rotate(180deg)":"",transition:"transform .2s",fontSize:13}}>{"▼"}</span>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:3}}>
          <span style={{fontSize:22,fontWeight:700,color:C.tx}}>{v}</span>
          {kpi.u&&<span style={{fontSize:12,color:C.mu}}>{kpi.u}</span>}
        </div>
        {kpi.sp&&<Spark data={kpi.sp} color={stCol}/>}
      </div>
      <div style={{marginTop:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        {kpi.target&&<span style={{fontSize:12,color:C.mu}}>Target: {kpi.target}</span>}
        {kpi.status&&<StatusPill status={kpi.status}/>}
      </div>
    </div>
  </div>);
}

const PROCESS_KPIS=[
  {id:"pqr",n:"PQR / Process Audit Rating",v:"82",u:"%",target:"90%",status:"Yellow",sp:[88,85,82,80,82],drill:"pqr"},
  {id:"audit",n:"Audit Compliance",v:"88",u:"%",target:"95%",status:"Yellow",sp:[92,90,89,88,88],drill:"audit"},
  {id:"mqv",n:"MQV (Major Quality Violation)",v:"15",u:"nos",target:"<5",status:"Red",sp:[5,4,6,12,15],drill:"mqv"},
  {id:"ndev",n:"Audit Deviation",v:"34",u:"nos",target:"trend",status:"Yellow",sp:[28,30,32,33,34],drill:"ndev"},
  {id:"cpc",n:"Critical Param. Compliance",v:"92",u:"%",target:"100%",status:"Yellow",sp:[95,93,92,91,92],drill:"cpc"},
  {id:"ftq",n:"FTQ",v:"95.1",u:"%",target:"99%",status:"Red",sp:[96.2,95.9,95.6,95.3,95.1],drill:"ftq"},
  {id:"spr",n:"SPR (Straight Pass Ratio)",v:"98.2",u:"%",target:"99%",status:"Yellow",sp:[98.5,98.3,98.2,98,98.2],drill:"spr"}
];

const LIVE_PROCESS_KPI_IDS=new Set(Object.keys(PROCESS_KPI_NAME));
const toNaKpi=kpi=>({...kpi,v:"NA",u:"",target:null,status:null,sp:null,drill:null,manual:false,live:false,na:true});
const toPendingLiveKpi=kpi=>({...kpi,v:"—",status:null,sp:null,live:false,na:false,trendApi:true,trendKpiName:PROCESS_KPI_NAME[kpi.id]});

const LIVE_PROCESS_DRILLS={
  pqr:{
    title:"Process-wise Audit Rating",
    accent:C.ac,
    path:["Process","PQR Rating"],
    sectionKpis:["Plant_quality_rating_s","Total_Violations_s"],
    machineKpis:["Plant_quality_rating_m","Total_Violations_m"],
    columns:["Process","Rating %","Violations","Status"],
    row:r=>[
      r.section,
      r.Plant_quality_rating_s==null?"—":r.Plant_quality_rating_s,
      r.Total_Violations_s??0,
      <StatusPill status={(r.Plant_quality_rating_s??0)<80?"Red":(r.Plant_quality_rating_s??0)<88?"Yellow":"Green"}/>,
    ],
    machineColumns:["Machine","Rating %","Violations","Status"],
    machineRow:r=>[
      r.machine,
      r.Plant_quality_rating_m==null?"—":r.Plant_quality_rating_m,
      r.Total_Violations_m??0,
      <StatusPill status={(r.Plant_quality_rating_m??0)<80?"Red":(r.Plant_quality_rating_m??0)<88?"Yellow":"Green"}/>,
    ],
  },
  audit:{
    title:"Audit Compliance — Section-wise",
    accent:C.bl,
    path:["Process","Audit Compliance"],
    sectionKpis:["Plan_Compliance_s"],
    machineKpis:["Plan_Compliance_m"],
    columns:["Process","Compliance %","Status"],
    row:r=>[
      r.section,
      r.Plan_Compliance_s==null?"—":r.Plan_Compliance_s,
      <StatusPill status={(r.Plan_Compliance_s??0)<80?"Red":(r.Plan_Compliance_s??0)<95?"Yellow":"Green"}/>,
    ],
    machineColumns:["Machine","Compliance %","Status"],
    machineRow:r=>[
      r.machine,
      r.Plan_Compliance_m==null?"—":r.Plan_Compliance_m,
      <StatusPill status={(r.Plan_Compliance_m??0)<80?"Red":(r.Plan_Compliance_m??0)<95?"Yellow":"Green"}/>,
    ],
  },
  mqv:{
    title:"MQV — Violation Breakdown",
    accent:C.rd,
    path:["Process","MQV"],
    sectionKpis:["Total_Violations_s","Open_Violations_s","Closed_Violation_s","Violation_Closure_Rate_s"],
    machineKpis:["Total_Violations_m","Open_Violations_m","Closed_Violation_m","Violation_Closure_Rate_m"],
    columns:["Process","Total","Open","Closed","Closure %"],
    row:r=>[
      r.section,
      r.Total_Violations_s??0,
      r.Open_Violations_s??0,
      r.Closed_Violation_s??0,
      r.Violation_Closure_Rate_s==null?"—":r.Violation_Closure_Rate_s,
    ],
    machineColumns:["Machine","Total","Open","Closed","Closure %"],
    machineRow:r=>[
      r.machine,
      r.Total_Violations_m??0,
      r.Open_Violations_m??0,
      r.Closed_Violation_m??0,
      r.Violation_Closure_Rate_m==null?"—":r.Violation_Closure_Rate_m,
    ],
  },
};

function LiveProcessDrillPanel({kpi,date,shift}){
  const cfg=LIVE_PROCESS_DRILLS[kpi?.drill];
  const [sectionRows,setSectionRows]=useState([]);
  const [machineRows,setMachineRows]=useState([]);
  const [selectedSection,setSelectedSection]=useState("");
  const [loading,setLoading]=useState(true);
  const [machineLoading,setMachineLoading]=useState(false);
  const [error,setError]=useState(null);
  useEffect(()=>{
    if(!cfg)return;
    let cancelled=false;
    setLoading(true);setError(null);setSelectedSection("");setMachineRows([]);
    getProcessKpiChildren({kpiNames:cfg.sectionKpis,date,shift})
      .then(res=>{if(!cancelled)setSectionRows(Array.isArray(res?.rows)?res.rows:[]);})
      .catch(err=>{if(!cancelled)setError(err);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[cfg,date,shift]);
  useEffect(()=>{
    if(!cfg||!selectedSection){setMachineRows([]);return;}
    let cancelled=false;
    setMachineLoading(true);
    getProcessKpiChildren({kpiNames:cfg.machineKpis,date,shift,section:selectedSection})
      .then(res=>{if(!cancelled)setMachineRows(Array.isArray(res?.rows)?res.rows:[]);})
      .catch(err=>{if(!cancelled)setError(err);})
      .finally(()=>{if(!cancelled)setMachineLoading(false);});
    return()=>{cancelled=true;};
  },[cfg,date,shift,selectedSection]);
  if(!cfg)return null;
  if(error)return <Card title={cfg.title} accent={cfg.accent}><div style={{padding:14,color:C.rd,fontSize:13}}>Drill fetch failed: {error.message||"Request failed"}</div></Card>;
  const rowStyle=(active,i)=>({background:active?C.aL:(i%2===0?"transparent":C.c2),cursor:"pointer"});
  return(<div style={{display:"grid",gap:10}}>
    <Card title={cfg.title} accent={cfg.accent}>
      <Breadcrumb path={cfg.path}/>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
        <a href="http://192.168.225.62:3000/process-audit-logbook" target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:6,border:"1px solid "+cfg.accent,background:cfg.accent+"12",color:cfg.accent,fontSize:12.5,fontWeight:700,textDecoration:"none"}}>{"↗"} Open Process Audit Logbook</a>
      </div>
      {loading?<div style={{padding:18,textAlign:"center",fontSize:13,color:C.mu}}>Fetching drill rows...</div>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
        <thead><tr>{cfg.columns.map((h,i)=><th key={h} style={{textAlign:i===0?"left":"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>{h}</th>)}</tr></thead>
        <tbody>{sectionRows.map((r,i)=>{const active=selectedSection===r.section;return(<tr key={r.section||i} onClick={()=>setSelectedSection(active?"":r.section)} style={rowStyle(active,i)}>
          {cfg.row(r).map((cell,ci)=><td key={ci} style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:ci===0?"left":"right",fontWeight:active&&ci===0?700:400,color:active&&ci===0?cfg.accent:C.tx}}>{cell}</td>)}
        </tr>);})}</tbody>
      </table></div>}
      {!loading&&!sectionRows.length&&<div style={{padding:12,textAlign:"center",color:C.mu,fontSize:13}}>No rows for this date / shift.</div>}
      <div style={{fontSize:12,color:C.mu,marginTop:6}}>Click a process to view its machine-level rows.</div>
    </Card>
    {selectedSection&&<Card title={`${selectedSection} — Machine Level`} accent={cfg.accent}>
      <Breadcrumb path={[...cfg.path,selectedSection,"Machines"]}/>
      {machineLoading?<div style={{padding:18,textAlign:"center",fontSize:13,color:C.mu}}>Fetching machine rows...</div>:<DTable cols={cfg.machineColumns} rows={machineRows.map(cfg.machineRow)}/>}
      {!machineLoading&&!machineRows.length&&<div style={{padding:12,textAlign:"center",color:C.mu,fontSize:13}}>No machine-level rows for {selectedSection}.</div>}
    </Card>}
  </div>);
}

function ProcessDrillPanel({kpi,sub,setSub,onOpenSPC,date,shift}){
  if(!kpi) return null;
  if(LIVE_PROCESS_DRILLS[kpi.drill]){
    return <LiveProcessDrillPanel kpi={kpi} date={date} shift={shift}/>;
  }
  return <Card title={`${kpi.n} — Drilldown`} accent={C.mu}>
    <div style={{padding:14,color:C.mu,fontSize:13}}>Drilldown is not available because this KPI is not API-backed.</div>
  </Card>;

  if(kpi.drill==="pqr"){
    const procs=[
      {p:"RMS (Raw Material Store)",sch:4,comp:4,rt:88,vio:2,st:"Yellow"},
      {p:"Autochemical / Weighing",sch:4,comp:4,rt:92,vio:1,st:"Green"},
      {p:"Mixing (Banbury)",sch:5,comp:5,rt:90,vio:2,st:"Green"},
      {p:"Stock Preparation",sch:4,comp:4,rt:85,vio:3,st:"Yellow"},
      {p:"Building (TBM)",sch:4,comp:3,rt:82,vio:4,st:"Yellow"},
      {p:"Curing",sch:5,comp:5,rt:70,vio:8,st:"Red"},
      {p:"Uniformity / Finishing",sch:4,comp:4,rt:86,vio:3,st:"Yellow"},
      {p:"Final Inspection / PDI",sch:3,comp:3,rt:91,vio:1,st:"Green"}
    ];
    const checklist=[
      {pt:"Dirty sidewall — visual",mc:"Press-12",aud:"R.Kumar",ae:"S.Singh",sh:"B",sev:"Major",nc:"NC-2451",capa:"Open"},
      {pt:"Cure time deviation > ±5sec",mc:"Press-08",aud:"R.Kumar",ae:"M.Verma",sh:"B",sev:"Major",nc:"NC-2452",capa:"Open"},
      {pt:"Mould temperature drift",mc:"Press-12",aud:"V.Patel",ae:"S.Singh",sh:"C",sev:"Minor",nc:"NC-2453",capa:"Closed"},
      {pt:"Bladder pressure low",mc:"Press-15",aud:"V.Patel",ae:"R.Yadav",sh:"A",sev:"Major",nc:"NC-2454",capa:"Open"},
      {pt:"Tyre handling SOP not followed",mc:"Press-08",aud:"R.Kumar",ae:"M.Verma",sh:"B",sev:"Minor",nc:"NC-2455",capa:"Closed"}
    ];
    const selProc=sub.split(":")[0];
    return(<div style={{display:"grid",gap:10}}>
      <Card title="Process-wise Audit Rating" accent={C.ac}>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <a href="http://192.168.225.62:3000/process-audit-logbook" target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:6,border:"1px solid "+C.ac,background:C.ac+"12",color:C.ac,fontSize:12.5,fontWeight:700,textDecoration:"none"}}>{"↗"} Open Process Audit Logbook</a>
        </div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Process</th><th style={{textAlign:"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Scheduled</th><th style={{textAlign:"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Completed</th><th style={{textAlign:"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Rating</th><th style={{textAlign:"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Violations</th><th style={{textAlign:"center",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Status</th></tr></thead>
          <tbody>{procs.map((r,i)=>(<tr key={i} onClick={()=>setSub(selProc===r.p?"":r.p)} style={{background:selProc===r.p?C.aL:(i%2===0?"transparent":C.c2),cursor:"pointer"}}>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontWeight:selProc===r.p?700:400,color:selProc===r.p?C.ac:C.tx}}>{r.p}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.sch}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.comp}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:700,color:r.rt<80?C.rd:r.rt<88?C.am:C.gn}}>{r.rt}%</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.vio}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"center"}}><StatusPill status={r.st}/></td>
          </tr>))}</tbody>
        </table></div>
        <div style={{fontSize:12,color:C.mu,marginTop:6}}>{"Ratings fetched from the Process Audit Logbook (actual recorded audit ratings per area). "}{"▸"} Click any process row to view its audited checkpoints.</div>
      </Card>
      {selProc&&<Card title={"Audit Checklist — "+selProc} accent={C.rd}>
        <Breadcrumb path={["Process","PQR Rating",selProc,"Failed Checkpoints"]}/>
        <DTable cols={["Failed Checkpoint","Machine","Auditor","Auditee","Shift","Severity","NC #","CAPA"]} rows={checklist.filter(()=>selProc==="Curing"||selProc==="Building").map(c=>[c.pt,c.mc,c.aud,c.ae,c.sh,c.sev,c.nc,<StatusPill status={c.capa}/>])}/>
        {selProc!=="Curing"&&selProc!=="Building"&&<div style={{padding:12,textAlign:"center",color:C.mu,fontSize:14}}>No failed checkpoints for this process. Rating is satisfactory.</div>}
      </Card>}
    </div>);
  }

  if(kpi.drill==="audit"){
    const procs=[
      {p:"Mixing",sch:5,comp:5,pn:0,cmp:"100%",aud:"R.Kumar"},
      {p:"Stock",sch:4,comp:4,pn:0,cmp:"100%",aud:"V.Patel"},
      {p:"Curing",sch:5,comp:4,pn:1,cmp:"80%",aud:"R.Kumar"},
      {p:"Building",sch:4,comp:3,pn:1,cmp:"75%",aud:"V.Patel"},
      {p:"Uniformity",sch:3,comp:2,pn:1,cmp:"66.7%",aud:"S.Mehta"}
    ];
    return(<div style={{display:"grid",gap:10}}>
      <Card title="Audit Compliance — Process-wise Schedule vs Actual" accent={C.bl}>
        <Breadcrumb path={["Process","Audit Compliance"]}/>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <a href="http://192.168.225.62:3000/process-audit-logbook" target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:6,border:"1px solid "+C.bl,background:C.bl+"12",color:C.bl,fontSize:12.5,fontWeight:700,textDecoration:"none"}}>{"↗"} Open Process Audit Logbook</a>
        </div>
        <DTable cols={["Process","Scheduled","Completed","Pending","Compliance %","Auditor"]} rows={procs.map(r=>[r.p,r.sch,r.comp,r.pn,r.cmp,r.aud])}/>
      </Card>
    </div>);
  }

  if(kpi.drill==="mqv"){
    const procs=[
      {p:"Curing",mqv:8,top:"Dirty sidewall",op:3,cl:5},
      {p:"Mixing",mqv:4,top:"Parameter out of range",op:2,cl:2},
      {p:"Building",mqv:3,top:"Visual issue",op:1,cl:2}
    ];
    const capa=[
      {id:"NC-2451",p:"Curing",vio:"Dirty sidewall",rc:"Mould cleaning frequency low",ww:"5-Why pending",ca:"Increase cleaning to 2x/shift",pa:"Add SOP + visual check",own:"S.Singh",dd:"15-Apr",st:"Open"},
      {id:"NC-2454",p:"Curing",vio:"Bladder pressure low",rc:"Pressure regulator drift",ww:"Completed",ca:"Replace regulator",pa:"Calibration plan",own:"R.Yadav",dd:"12-Apr",st:"Open"},
      {id:"NC-2378",p:"Mixing",vio:"Dump temp >45°C",rc:"Cooling water temp high",ww:"Completed",ca:"Chiller maintenance",pa:"Daily temp log",own:"M.Sharma",dd:"08-Apr",st:"Closed"}
    ];
    return(<div style={{display:"grid",gap:10}}>
      <Card title="MQV — Daily Trend & Spike Analysis" accent={C.rd}>
        <Breadcrumb path={["Process","MQV","Daily Spike"]}/>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <a href="http://192.168.225.62:3000/process-audit-logbook" target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:6,border:"1px solid "+C.rd,background:C.rd+"12",color:C.rd,fontSize:12.5,fontWeight:700,textDecoration:"none"}}>{"↗"} Open Process Audit Logbook</a>
        </div>
        <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:8}}>
          <div><div style={{fontSize:12,color:C.mu}}>Today</div><div style={{fontSize:25,fontWeight:700,color:C.rd}}>15</div></div>
          <div><div style={{fontSize:12,color:C.mu}}>Normal Avg</div><div style={{fontSize:25,fontWeight:700,color:C.tx}}>5</div></div>
          <div><div style={{fontSize:12,color:C.mu}}>Spike</div><div style={{fontSize:25,fontWeight:700,color:C.rd}}>+200%</div></div>
          <div style={{flex:1}}><Spark data={[5,4,6,12,15]} color={C.rd} w={140} h={32}/></div>
        </div>
        <DTable cols={["Process","MQV Count","Top Violation","CAPA Open","CAPA Closed"]} rows={procs.map(p=>[p.p,p.mqv,p.top,p.op,p.cl])}/>
      </Card>
      <Card title="Open CAPA Details — Curing Process" accent={C.am}>
        <DTable cols={["NC #","Violation","Root Cause","5-Why","Corrective Action","Owner","Due","Status"]} rows={capa.map(c=>[c.id,c.vio,c.rc,c.ww,c.ca,c.own,c.dd,<StatusPill status={c.st}/>])}/>
      </Card>
    </div>);
  }

  if(kpi.drill==="spc"){
    const projs=[
      {mc:"Quintoplex",sz:"145/13",pm:"Width",cp:1.10,cpk:1.05,st:"Red"},
      {mc:"Extruder-2",sz:"165/14",pm:"Tread Weight",cp:1.18,cpk:1.12,st:"Red"},
      {mc:"Banbury-2",sz:"All",pm:"Mooney Visc.",cp:1.15,cpk:1.08,st:"Red"},
      {mc:"Press-12",sz:"175/15",pm:"Cure Time",cp:1.25,cpk:1.22,st:"Yellow"},
      {mc:"UF-01",sz:"145/13",pm:"RFV",cp:1.28,cpk:1.24,st:"Yellow"}
    ];
    const selMc=sub;
    const ctlData=[8.45,8.52,8.48,8.41,8.55,8.62,8.38,8.58,8.65,8.42,8.51,8.48];
    return(<div style={{display:"grid",gap:10}}>
      <Card title="SPC Health Board" accent={C.ac}>
        <Breadcrumb path={["Process","SPC Health"]}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
          <div style={{padding:"10px 12px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd,textAlign:"center"}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase",letterSpacing:".4px"}}>Total Projects</div><div style={{fontSize:25,fontWeight:700,color:C.tx}}>60</div></div>
          <div style={{padding:"10px 12px",background:C.gn+"12",borderRadius:6,border:"1px solid "+C.gn+"33",textAlign:"center"}}><div style={{fontSize:11,color:C.gn,textTransform:"uppercase",letterSpacing:".4px",fontWeight:700}}>Green (Cp/Cpk ≥1.3)</div><div style={{fontSize:25,fontWeight:700,color:C.gn}}>50</div></div>
          <div style={{padding:"10px 12px",background:C.am+"12",borderRadius:6,border:"1px solid "+C.am+"33",textAlign:"center"}}><div style={{fontSize:11,color:C.am,textTransform:"uppercase",letterSpacing:".4px",fontWeight:700}}>Yellow (~1.22)</div><div style={{fontSize:25,fontWeight:700,color:C.am}}>5</div></div>
          <div style={{padding:"10px 12px",background:C.rd+"12",borderRadius:6,border:"1px solid "+C.rd+"33",textAlign:"center"}}><div style={{fontSize:11,color:C.rd,textTransform:"uppercase",letterSpacing:".4px",fontWeight:700}}>Red (≤1.16)</div><div style={{fontSize:25,fontWeight:700,color:C.rd}}>5</div></div>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:C.md,marginBottom:6}}>Red Projects (Click to view Control Chart)</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Machine</th><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Size</th><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Parameter</th><th style={{textAlign:"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Cp</th><th style={{textAlign:"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Cpk</th><th style={{textAlign:"center",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Status</th></tr></thead>
          <tbody>{projs.map((r,i)=>(<tr key={i} onClick={()=>setSub(selMc===r.mc?"":r.mc)} style={{background:selMc===r.mc?C.aL:(i%2===0?"transparent":C.c2),cursor:"pointer"}}>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontWeight:selMc===r.mc?700:400,color:selMc===r.mc?C.ac:C.tx}}>{r.mc}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{r.sz}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{r.pm}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:700,color:r.cp<1.16?C.rd:r.cp<1.3?C.am:C.gn}}>{r.cp}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:700,color:r.cpk<1.16?C.rd:r.cpk<1.3?C.am:C.gn}}>{r.cpk}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"center"}}><StatusPill status={r.st}/></td>
          </tr>))}</tbody>
        </table></div>
      </Card>
      {selMc&&<Card title={"Control Chart — "+selMc} accent={C.bl}>
        <Breadcrumb path={["Process","SPC","Red Projects",selMc]}/>
        <div style={{display:"flex",gap:16,alignItems:"center"}}>
          <ControlChart data={ctlData} ucl={8.6} lcl={8.4} target={8.5} w={320} h={100}/>
          <div style={{fontSize:13,color:C.md,lineHeight:1.6}}>
            <div><span style={{color:C.mu}}>Last 12 readings shown</span></div>
            <div style={{marginTop:6}}><span style={{display:"inline-block",width:10,height:2,background:C.rd,marginRight:4}}/>UCL / LCL limits</div>
            <div><span style={{display:"inline-block",width:10,height:2,background:C.gn,marginRight:4}}/>Target line</div>
            <div><span style={{display:"inline-block",width:8,height:8,borderRadius:4,background:C.rd,marginRight:4,verticalAlign:"middle"}}/>Out-of-control point</div>
            <div style={{marginTop:6,padding:"6px 8px",background:C.rd+"12",borderRadius:4,color:C.rd,fontSize:12}}>2 OOC points detected. Action required.</div>
            {onOpenSPC&&<button onClick={()=>onOpenSPC(selMc)} style={{marginTop:10,padding:"7px 14px",borderRadius:6,border:"1px solid "+C.pp,background:C.pp+"12",color:C.pp,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>{"∿"} Open in SPC tab {"→"}</button>}
          </div>
        </div>
      </Card>}
    </div>);
  }

  if(kpi.drill==="ndev"){
    const nd=[
      {pr:"Mixing (Banbury)",pm:"Dump Temperature",dev:"+3.8°C (within action band)",cnt:9,disp:"Flag — notify process",st:"Yellow"},
      {pr:"Stock",pm:"Tread Weight",dev:"+1.2% (< reject limit)",cnt:7,disp:"Flag — monitor",st:"Yellow"},
      {pr:"Curing",pm:"Cure Time",dev:"±4 sec (< ±5 spec)",cnt:8,disp:"Observation",st:"Green"},
      {pr:"Curing",pm:"Mould Temperature",dev:"±2°C drift",cnt:5,disp:"Observation",st:"Green"},
      {pr:"Mixing (Banbury)",pm:"Specific Gravity",dev:"±0.01",cnt:5,disp:"Observation",st:"Green"}
    ];
    return(<div style={{display:"grid",gap:10}}>
      <Card title="Audit Deviation — minor process variation (non-MQV)" accent={C.am}>
        <Breadcrumb path={["Process","Audit Deviation"]}/>
        <div style={{padding:"8px 12px",background:C.bl+"0E",border:"1px solid "+C.bl+"33",borderRadius:6,fontSize:12.5,color:C.md,marginBottom:10}}>{"Tracked separately from MQV. These are deviations within the action/observation band — handled by flag & notify, not batch hold or escalation. Only deviations with confirmed product impact are promoted to an MQV."}</div>
        <DTable cols={["Process","Parameter","Deviation","Count","Status"]} rows={nd.map(r=>{const dc=r.st==="Green"?C.gn:C.am;return [r.pr,r.pm,r.dev,r.cnt,<span style={{padding:"2px 8px",borderRadius:999,fontSize:11,fontWeight:700,background:dc+"18",color:dc}}>{r.disp}</span>];})}/>
        <div style={{fontSize:12,color:C.mu,marginTop:6}}>{"Total "+nd.reduce((a,r)=>a+r.cnt,0)+" normal deviations this period — for trend awareness. See the MQV card for major violations requiring analysis & CAPA."}</div>
      </Card>
    </div>);
  }

  if(kpi.drill==="cpc"){
    const params=[
      {pr:"Mixing",pm:"Dump Temperature",ac:"50°C",lm:"45°C",mc:"Banbury-2",bt:"B-2851",st:"Red"},
      {pr:"Mixing",pm:"Mooney Viscosity",ac:"65",lm:"60-70",mc:"Banbury-1",bt:"B-2852",st:"Green"},
      {pr:"Mixing",pm:"Specific Gravity",ac:"1.18",lm:"1.15-1.20",mc:"Banbury-3",bt:"B-2853",st:"Green"},
      {pr:"Curing",pm:"Cure Time Dev.",ac:"±7sec",lm:"±5sec",mc:"Press-08",bt:"Lot-441",st:"Red"},
      {pr:"Curing",pm:"Mould Temp.",ac:"178°C",lm:"175-185",mc:"Press-12",bt:"Lot-442",st:"Green"},
      {pr:"Stock",pm:"Tread Weight",ac:"2.85kg",lm:"2.80-2.90",mc:"Extruder-2",bt:"Roll-156",st:"Yellow"}
    ];
    const selPm=sub;
    const batchData={
      "Dump Temperature":[
        {bt:"B-2851",mc:"Banbury-2",ac:"50.2°C",lm:"45°C",dev:"+5.2",sh:"B",st:"Flagged"},
        {bt:"B-2848",mc:"Banbury-2",ac:"49.5°C",lm:"45°C",dev:"+4.5",sh:"A",st:"Flagged"},
        {bt:"B-2845",mc:"Banbury-2",ac:"48.8°C",lm:"45°C",dev:"+3.8",sh:"A",st:"Released"},
        {bt:"B-2842",mc:"Banbury-2",ac:"47.2°C",lm:"45°C",dev:"+2.2",sh:"C",st:"Released"}
      ],
      "Cure Time Dev.":[
        {bt:"Lot-441",mc:"Press-08",ac:"+7sec",lm:"±5sec",dev:"+2",sh:"B",st:"Flagged"},
        {bt:"Lot-440",mc:"Press-08",ac:"+6.5sec",lm:"±5sec",dev:"+1.5",sh:"B",st:"Under Review"},
        {bt:"Lot-438",mc:"Press-08",ac:"+5.8sec",lm:"±5sec",dev:"+0.8",sh:"A",st:"Released"}
      ],
      "Tread Weight":[
        {bt:"Roll-156",mc:"Extruder-2",ac:"2.85kg",lm:"2.80-2.90",dev:"OK edge",sh:"B",st:"Released"},
        {bt:"Roll-154",mc:"Extruder-2",ac:"2.91kg",lm:"2.80-2.90",dev:"+0.01",sh:"A",st:"Under Review"}
      ]
    };
    return(<div style={{display:"grid",gap:10}}>
      <Card title="Critical Process Parameter Compliance" accent={C.am}>
        <Breadcrumb path={["Process","Critical Parameter Compliance"]}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}><span style={{fontSize:12,color:C.mu}}>{"Audited via random sampling — values sourced from the Process Audit Logbook."}</span><a href="http://192.168.225.62:3000/process-audit-logbook" target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:6,border:"1px solid "+C.am,background:C.am+"12",color:C.am,fontSize:12.5,fontWeight:700,textDecoration:"none"}}>{"↗"} Open Process Audit Logbook</a></div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr>{["Process","Parameter","Actual","Limit","Machine","Batch","Status"].map((h,i)=>(<th key={i} style={{textAlign:i<2?"left":i===6?"center":"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>{h}</th>))}</tr></thead>
          <tbody>{params.map((r,i)=>(<tr key={i} onClick={()=>r.st!=="Green"&&setSub(selPm===r.pm?"":r.pm)} style={{background:selPm===r.pm?C.aL:(i%2===0?"transparent":C.c2),cursor:r.st!=="Green"?"pointer":"default"}}>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontWeight:selPm===r.pm?700:400,color:selPm===r.pm?C.ac:C.tx}}>{r.pr}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{r.pm}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:700,color:r.st==="Red"?C.rd:r.st==="Yellow"?C.am:C.gn}}>{r.ac}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:C.mu}}>{r.lm}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.mc}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.bt}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"center"}}><StatusPill status={r.st}/></td>
          </tr>))}</tbody>
        </table></div>
        <div style={{fontSize:12,color:C.am,marginTop:6}}>{"▸"} Click a red/yellow parameter to view its randomly-sampled batch readings and flag status</div>
      </Card>
      {selPm&&batchData[selPm]&&<Card title={"Batch-level OOL Values — "+selPm} accent={C.rd}>
        <Breadcrumb path={["Process","Critical Parameter",selPm,"Batches"]}/>
        <DTable cols={["Batch","Machine","Actual","Limit","Deviation","Shift","Status"]} rows={batchData[selPm].map(b=>{const dc=b.st==="Released"?C.gn:b.st==="Under Review"?C.bl:C.am;return [b.bt,b.mc,b.ac,b.lm,b.dev,b.sh,<span style={{padding:"2px 8px",borderRadius:999,fontSize:11,fontWeight:700,background:dc+"18",color:dc}}>{b.st}</span>];})}/>
        <div style={{marginTop:8,padding:"6px 10px",background:C.am+"12",borderRadius:4,fontSize:12.5,color:C.am}}>{batchData[selPm].filter(b=>b.st!=="Released").length+" parameter deviation(s) flagged — process owner notified. Per SOP, Quality does not hold batches on a parameter deviation alone; disposition is flag & review, escalating to MQV only if product impact is confirmed."}</div>
      </Card>}
    </div>);
  }

  if(kpi.drill==="ftq"){
    const RECIPES=[
      {k:"ULTIMA NEO|145/13",r:"ULTIMA NEO",size:"145/13",seg:"PCR",prod:2000,camo:28,scrap:84,buff:18},
      {k:"ULTIMA|165/14",r:"ULTIMA",size:"165/14",seg:"PCR",prod:1500,camo:15,scrap:42,buff:12},
      {k:"ULTIMA SPORT|175/15",r:"ULTIMA SPORT",size:"175/15",seg:"PCR",prod:1800,camo:12,scrap:27,buff:9},
      {k:"ULTIMA SPORT|185/15",r:"ULTIMA SPORT",size:"185/15",seg:"PCR",prod:1200,camo:14,scrap:37,buff:10},
      {k:"XM2|10.00R20",r:"XM2",size:"10.00R20",seg:"TBR",prod:900,camo:10,scrap:36,buff:8},
      {k:"JUC|11.00R20",r:"JUC",size:"11.00R20",seg:"TBR",prod:700,camo:6,scrap:20,buff:5}
    ];
    const MC_BY_RECIPE={
      "ULTIMA NEO|145/13":[
        {mc:"Press-08",camo:15,scrap:46,buff:9,rsn:"Under-cure",tm:"02:30 AM"},
        {mc:"Press-12",camo:8,scrap:24,buff:6,rsn:"Blow",tm:"03:45 AM"},
        {mc:"Press-15",camo:5,scrap:14,buff:3,rsn:"Sidewall mark",tm:"14:30 PM"}],
      "ULTIMA|165/14":[
        {mc:"Press-08",camo:5,scrap:18,buff:5,rsn:"Under-cure",tm:"06:15 AM"},
        {mc:"Press-12",camo:6,scrap:14,buff:4,rsn:"Cosmetic",tm:"08:20 AM"},
        {mc:"Press-15",camo:4,scrap:10,buff:3,rsn:"Mould residue",tm:"05:45 AM"}],
      "ULTIMA SPORT|175/15":[
        {mc:"Press-12",camo:5,scrap:12,buff:4,rsn:"Blow",tm:"12:00 PM"},
        {mc:"Press-15",camo:4,scrap:9,buff:3,rsn:"Mould wear",tm:"09:30 AM"},
        {mc:"Press-19",camo:3,scrap:6,buff:2,rsn:"Cosmetic",tm:"13:00 PM"}],
      "ULTIMA SPORT|185/15":[
        {mc:"Press-12",camo:6,scrap:18,buff:5,rsn:"Blow",tm:"04:20 AM"},
        {mc:"Press-15",camo:5,scrap:11,buff:3,rsn:"Mould wear",tm:"10:15 AM"},
        {mc:"Press-19",camo:3,scrap:8,buff:2,rsn:"Cosmetic",tm:"15:40 PM"}],
      "XM2|10.00R20":[
        {mc:"Press-21",camo:7,scrap:22,buff:5,rsn:"Under-cure",tm:"03:00 AM"},
        {mc:"Press-22",camo:3,scrap:14,buff:3,rsn:"Blow",tm:"11:00 AM"}],
      "JUC|11.00R20":[
        {mc:"Press-22",camo:4,scrap:13,buff:3,rsn:"Bare",tm:"04:00 AM"},
        {mc:"Press-21",camo:2,scrap:7,buff:2,rsn:"Cosmetic",tm:"13:00 PM"}]
    };
    const MACHINES=[
      {mc:"Press-08",prod:1500,camo:20,scrap:64,buff:14,rsn:"Under-cure"},
      {mc:"Press-12",prod:1800,camo:25,scrap:68,buff:19,rsn:"Blow"},
      {mc:"Press-15",prod:1600,camo:18,scrap:44,buff:12,rsn:"Mould wear"},
      {mc:"Press-19",prod:900,camo:6,scrap:14,buff:4,rsn:"Cosmetic"},
      {mc:"Press-21",prod:1300,camo:9,scrap:29,buff:7,rsn:"Under-cure"},
      {mc:"Press-22",prod:1000,camo:7,scrap:27,buff:6,rsn:"Blow"}
    ];
    const ftqOf=r=>+(((r.prod-r.camo-r.scrap-r.buff)/r.prod)*100).toFixed(1);
    const stOf=v=>v<95?"Red":v<98?"Yellow":"Green";
    const ftqView=sub.startsWith("MC|")?"machine":"recipe";
    const setFtqView=v=>setSub(v==="machine"?"MC|":"");
    const selR=sub.startsWith("MC|")?"":sub;
    const fc=v=>v<97?C.rd:v<99?C.am:C.gn;
    return(<div style={{display:"grid",gap:10}}>
      <Card title="FTQ (Curing only) — PCR & TBR" accent={C.tl}>
        <Breadcrumb path={["Process","FTQ"]}/>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
          <span style={{fontSize:11.5,color:C.mu,fontWeight:700,textTransform:"uppercase"}}>View by</span>
          {[["recipe","Recipe / SKU"],["machine","Machine"]].map(o=>{const a=ftqView===o[0];return(
            <button key={o[0]} onClick={()=>setFtqView(o[0])} style={{padding:"5px 14px",borderRadius:999,border:"1px solid "+(a?C.tl:C.bd),background:a?C.tl+"15":C.c2,color:a?C.tl:C.tx,fontSize:12.5,fontWeight:a?700:500,cursor:"pointer"}}>{o[1]}</button>);})}
          <span style={{fontSize:11.5,color:C.mu,marginLeft:4}}>{ftqView==="recipe"?"Click a recipe for its machine-wise scrap":"Machine-wise FTQ across all recipes"}</span>
        </div>
        {ftqView==="recipe"
          ? <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13.5}}>
              <thead><tr>{["Recipe / SKU","Size","Segment","Production Qty","Camouflage","Scrap","Buff","FTQ %","Status"].map((h,i)=>(<th key={i} style={{textAlign:i>=3&&i<=7?"right":i===8?"center":"left",padding:"6px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:12.5}}>{h}</th>))}</tr></thead>
              <tbody>{RECIPES.map((r,i)=>{const a=selR===r.k;const fq=ftqOf(r);return(
                <tr key={i} onClick={()=>setSub(a?"":r.k)} style={{background:a?C.aL:(i%2===0?"transparent":C.c2),cursor:"pointer"}}>
                  <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,fontWeight:a?700:600,color:a?C.ac:C.bl}}>{r.r}<span style={{fontSize:11,color:C.am,marginLeft:5}}>{"▸"}</span></td>
                  <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,color:C.mu}}>{r.size}</td>
                  <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,color:C.mu}}>{r.seg}</td>
                  <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.prod.toLocaleString("en-IN")}</td>
                  <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:C.am,fontWeight:600}}>{r.camo}</td>
                  <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:C.rd,fontWeight:700}}>{r.scrap}</td>
                  <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:C.pp,fontWeight:600}}>{r.buff}</td>
                  <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:800,color:fc(fq)}}>{fq.toFixed(1)+"%"}</td>
                  <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,textAlign:"center"}}><StatusPill status={stOf(fq)}/></td>
                </tr>);})}</tbody>
            </table></div>
          : <DTable cols={["Machine","Production Qty","Camouflage","Scrap","Buff","FTQ %","Top Reason","Status"]} rows={MACHINES.map(m=>{const fq=ftqOf(m);return[
              m.mc,m.prod.toLocaleString("en-IN"),
              <span style={{color:C.am,fontWeight:600}}>{m.camo}</span>,
              <span style={{color:C.rd,fontWeight:700}}>{m.scrap}</span>,
              <span style={{color:C.pp,fontWeight:600}}>{m.buff}</span>,
              <span style={{fontWeight:800,color:fc(fq)}}>{fq.toFixed(1)+"%"}</span>,
              m.rsn,<StatusPill status={stOf(fq)}/>];})}/>}
      </Card>
      {ftqView==="recipe"&&selR&&MC_BY_RECIPE[selR]&&<Card title={"Machine-wise — "+selR.replace("|"," ")} accent={C.am}>
        <Breadcrumb path={["Process","FTQ",selR.replace("|"," ")]}/>
        <DTable cols={["Machine Name","Camouflage","Scrap","Buff","Reason","Time"]} rows={MC_BY_RECIPE[selR].map(m=>[
          m.mc,
          <span style={{color:C.am,fontWeight:600}}>{m.camo}</span>,
          <span style={{color:C.rd,fontWeight:700}}>{m.scrap}</span>,
          <span style={{color:C.pp,fontWeight:600}}>{m.buff}</span>,
          m.rsn,m.tm])}/>
        <div style={{fontSize:12,color:C.mu,marginTop:6}}>{"FTQ = (Produced − Camouflage − Scrap − Buff) ÷ Produced"}</div>
      </Card>}
    </div>);
  }

  if(kpi.drill==="spr"){
    const procs=[
      {p:"Mixing",ftq:99.0,rw:0.5,dp:0.3,spr:99.8,pn:"2 batches"},
      {p:"Stock",ftq:98.2,rw:0.8,dp:0.5,spr:99.5,pn:"5 rolls"},
      {p:"Building",ftq:97.5,rw:1.2,dp:0.6,spr:99.3,pn:"12 GTs"},
      {p:"Curing",ftq:97.0,rw:1.0,dp:0.8,spr:98.8,pn:"8 tyres"},
      {p:"Uniformity",ftq:98.0,rw:0.5,dp:0.4,spr:98.9,pn:"3 tyres"}
    ];
    const reasons={
      Building:[
        {rs:"Splice tension low — reworked",mc:"TBM-2",qty:8,act:"Re-spliced",st:"Released"},
        {rs:"Bead set issue — reworked",mc:"TBM-3",qty:4,act:"Re-positioned",st:"Released"},
        {rs:"GT weight high — disposition pending",mc:"TBM-2",qty:6,act:"Awaiting QA review",st:"Pending"},
        {rs:"Ply wrinkle — disposition reject",mc:"TBM-1",qty:3,act:"Sent to scrap",st:"Rejected"}
      ],
      Curing:[
        {rs:"Under-cure — re-cured",mc:"Press-08",qty:5,act:"Re-cure cycle",st:"Released"},
        {rs:"Sidewall mark — disposition pending",mc:"Press-12",qty:3,act:"Customer review",st:"Pending"},
        {rs:"Blow defect — scrap",mc:"Press-08",qty:2,act:"Scrapped",st:"Rejected"}
      ],
      Mixing:[
        {rs:"Viscosity NC — re-mixed",mc:"Banbury-1",qty:1,act:"Re-mix cycle",st:"Released"},
        {rs:"Dump temp high — hold",mc:"Banbury-2",qty:2,act:"Disposition review",st:"Pending"}
      ],
      Stock:[
        {rs:"Width OOS — reworked",mc:"Extruder-1",qty:3,act:"Re-extruded",st:"Released"},
        {rs:"Gauge OOS — disposition",mc:"Extruder-2",qty:2,act:"Pending",st:"Pending"}
      ],
      Uniformity:[
        {rs:"RFV high — reworked",mc:"UF-01",qty:2,act:"Buffed & retested",st:"Released"},
        {rs:"LFV — disposition",mc:"UF-03",qty:1,act:"Awaiting decision",st:"Pending"}
      ]
    };
    const selProc=sub;
    return(<div style={{display:"grid",gap:10}}>
      <Card title="SPR — Process-wise Breakdown" accent={C.bl}>
        <Breadcrumb path={["Process","SPR"]}/>
        <div style={{padding:"8px 10px",background:C.bl+"10",borderRadius:6,marginBottom:10,fontSize:13,color:C.md}}>
          <strong>SPR = FTQ + Accepted Rework / Disposition Material</strong> {"— "} Final acceptable output
        </div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr>{["Process","FTQ %","Rework Accepted","Disposition Released","SPR %","Pending"].map((h,i)=>(<th key={i} style={{textAlign:i===0?"left":i===5?"left":"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>{h}</th>))}</tr></thead>
          <tbody>{procs.map((r,i)=>(<tr key={i} onClick={()=>setSub(selProc===r.p?"":r.p)} style={{background:selProc===r.p?C.aL:(i%2===0?"transparent":C.c2),cursor:"pointer"}}>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontWeight:selProc===r.p?700:400,color:selProc===r.p?C.ac:C.tx}}>{r.p}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.ftq}%</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.rw}%</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.dp}%</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:700,color:r.spr<99?C.am:C.gn}}>{r.spr}%</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,color:C.am}}>{r.pn}</td>
          </tr>))}</tbody>
        </table></div>
        <div style={{fontSize:12,color:C.am,marginTop:6}}>{"▸"} Click process to view rework/disposition reasons & released vs pending material</div>
      </Card>
      {selProc&&reasons[selProc]&&<Card title={"Rework / Disposition Detail — "+selProc} accent={C.am}>
        <Breadcrumb path={["Process","SPR",selProc,"Reasons"]}/>
        <DTable cols={["Reason","Machine","Qty","Action Taken","Status"]} rows={reasons[selProc].map(r=>[r.rs,r.mc,r.qty,r.act,<StatusPill status={r.st}/>])}/>
      </Card>}
    </div>);
  }

  if(kpi.drill==="capa"){
    return(<Card title="Open CAPA / NC Items" accent={C.rd}>
      <Breadcrumb path={["Process","Open CAPA"]}/>
      <DTable cols={["NC #","Process","Violation","Owner","Due Date","Age (days)","Status"]} rows={[
        ["NC-2451","Curing","Dirty sidewall","S.Singh","15-Apr",6,<StatusPill status="Open"/>],
        ["NC-2452","Curing","Cure time deviation","M.Verma","10-Apr",11,<StatusPill status="Overdue"/>],
        ["NC-2454","Curing","Bladder pressure low","R.Yadav","12-Apr",9,<StatusPill status="Overdue"/>],
        ["NC-2461","Mixing","Dump temp high","M.Sharma","18-Apr",3,<StatusPill status="Open"/>],
        ["NC-2465","Building","Splice open","K.Reddy","20-Apr",1,<StatusPill status="Open"/>],
        ["NC-2470","Stock","Width OOS","P.Joshi","16-Apr",5,<StatusPill status="Open"/>]
      ]}/>
      <div style={{marginTop:8,display:"flex",gap:6}}>
        <div style={{padding:"4px 10px",background:C.rd+"12",borderRadius:4,fontSize:13,color:C.rd,fontWeight:600}}>2 Overdue</div>
        <div style={{padding:"4px 10px",background:C.am+"12",borderRadius:4,fontSize:13,color:C.am,fontWeight:600}}>16 Open</div>
      </div>
    </Card>);
  }

  return null;
}

const PRODUCT_KPIS=[
  {id:"dy",n:"Dispatch Yield",v:"92.8",u:"%",target:"95%",status:"Yellow",sp:[94,93.5,93,92.8,92.8],drill:"dy"},
  {id:"oe",n:"OE Yield",v:"88.5",u:"%",target:"92%",status:"Red",sp:[91,90,89,88.5,88.5],drill:"oe"},
  {id:"uy",n:"Uniformity Yield",v:"90.0",u:"%",target:"95%",status:"Red",sp:[93,92,91,90,90],drill:"uy"},
  {id:"dvm",n:"DBM Yield",v:"94.5",u:"%",target:"96%",status:"Yellow",sp:[95.5,95,94.8,94.5,94.5],drill:"dvm"},
  {id:"sl",n:"2nd Line Inspection Yield",v:"96.2",u:"%",target:"98%",status:"Yellow",sp:[97,96.8,96.5,96.2,96.2],drill:"sl"},
  {id:"bay",n:"Bay Area Inspection",v:"99.1",u:"%",target:"99.5%",status:"Yellow",drill:"bay"},
  {id:"insp",n:"Inspector Rating",v:"88",u:"/100",target:"≥95",status:"Yellow",sp:[92,91,90,89,88],drill:"insp"},
  {id:"gtw",n:"GT Weight Variation",v:"87.5",u:"%",target:"95%",status:"Red",sp:[92,90,89,88,87.5],drill:"gtw"},
  {id:"eg",n:"E-Grade Count",v:"42",u:"nos",target:"<20",status:"Red",sp:[25,28,35,40,42],drill:"eg"},
  {id:"sc",n:"Scrap %",v:"2.0",u:"%",target:"<1%",status:"Red",sp:[1.2,1.5,1.8,2,2],drill:"sc"},
  {id:"cta",n:"CTA Compliance",v:"46.5",u:"%",target:"100%",status:"Red",drill:"cta"}
];

/* ── CSV DOWNLOAD ── */
function _csvDl(filename,cols,rows){
  const esc=v=>{const s=String(v==null?"":v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const csv=[cols.map(esc).join(","),...rows.map(r=>r.map(esc).join(","))].join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();
  document.body.removeChild(a);URL.revokeObjectURL(url);
}
function _DlBtn({label,onClick,col}){
  return(<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 13px",borderRadius:6,border:"1px solid "+(col||C.gn),background:(col||C.gn)+"12",color:col||C.gn,fontSize:12.5,fontWeight:700,cursor:"pointer"}}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    {label}
  </button>);
}

/* ── BARCODE TRACEABILITY ── */
const TR_MC={
  mix:["Banbury-1","Banbury-2"],
  stock:["Calender-1","Extruder-2","Quintoplex"],
  bldPCR:["VMI Maxx1","VMI Maxx2","VMI Exxium"],
  bldTBR:["TBM-1","TBM-2","TBM-3"],
  curePCR:["Press-08","Press-12","Press-15","Press-19"],
  cureTBR:["Press-21","Press-22","Press-24"]
};
const TR_REASON=["Under-cure","Blow","Bare","Sidewall mark","Mould residue","Cosmetic"];
function _trSeed(s){let h=7;for(const ch of s)h=(h*31+ch.charCodeAt(0))>>>0;return h||1;}
function _traceRows(sku,size,seg,total,rej,stageName){
  let s=_trSeed(sku+size+stageName);
  const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;};
  const bld=seg==="TBR"?TR_MC.bldTBR:TR_MC.bldPCR;
  const cure=seg==="TBR"?TR_MC.cureTBR:TR_MC.curePCR;
  const tag=size.replace(/[^0-9A-Za-z]/g,"");
  const shifts=["A","B","C"];
  const fail=new Set();
  while(fail.size<Math.min(rej,total)){fail.add(Math.floor(rnd()*total));}
  const rows=[];
  for(let i=0;i<total;i++){
    const bad=fail.has(i);
    const scrap=bad&&rnd()<0.65;
    const mm=Math.floor(rnd()*1e6)%1e6;
    rows.push({
      bc:"BTP-"+tag+"-"+String(10001+i),
      sku,size,seg,
      date:String(1+(i%28)).padStart(2,"0")+"-Jun",
      shift:shifts[i%3],
      mix:TR_MC.mix[i%TR_MC.mix.length],
      batch:"CMP-"+(seg==="TBR"?"T":"P")+String(4100+(i%40)),
      stock:TR_MC.stock[i%TR_MC.stock.length],
      bld:bld[i%bld.length],
      gtw:(seg==="TBR"?(38+((mm%140)/100)):(8.3+((mm%40)/100))).toFixed(2),
      cure:cure[i%cure.length],
      cureTime:(seg==="TBR"?(38+(mm%14)/10):(13.6+(mm%12)/10)).toFixed(1),
      stage:stageName,
      result:bad?(scrap?"Scrap":"Rework"):"Pass",
      reason:bad?TR_REASON[mm%TR_REASON.length]:"",
      disp:bad?(scrap?"Scrapped":"Sent for rework"):"Passed"
    });
  }
  return rows;
}
function _inspBc(items){
  const out=[];let k=0;
  items.forEach(it=>{for(let i=0;i<it.n;i++){k++;
    out.push({bc:"BTP-"+it.size.replace(/[^0-9A-Za-z]/g,"")+"-"+String(30001+k),
      sku:it.sku,size:it.size,defect:it.defect,
      sev:(k%3===0)?"Major":"Minor",shift:["A","B","C"][k%3],ins:"Ins-0"+(1+(k%4)),
      date:String(1+(k%28)).padStart(2,"0")+"-Jun",
      disp:(k%3===0)?"Scrapped":"Sent for rework"});}});
  return out;
}
function _BcCard({title,rows,file}){
  const dl=()=>_csvDl(file,["Barcode","SKU","Size","Defect","Severity","Inspection Date","Shift","Inspector","Disposition"],
    rows.map(t=>[t.bc,t.sku,t.size,t.defect,t.sev,t.date,t.shift,t.ins,t.disp]));
  return(<Card title={title} accent={C.mu}>
    <div style={{marginBottom:8}}>{_DlBtn({label:"Download barcode details",onClick:dl,col:C.gn})}</div>
    <DTable cols={["Barcode","Tyre","Defect","Severity","Shift","Inspector","Disposition"]} rows={rows.slice(0,10).map(t=>[t.bc,t.sku+" "+t.size,t.defect,t.sev,t.shift,t.ins,t.disp])}/>
    {rows.length>10&&<div style={{fontSize:11.5,color:C.mu,marginTop:6}}>{"10 of "+rows.length}</div>}
  </Card>);
}

function ProductDrillPanel({kpi,sub,setSub,tyreType,plant}){
  if(!kpi) return null;

  if(kpi.drill==="uy"){
    const machines=[
      {mc:"UF-01",ex:3000,ac:2500,gap:500,rsn:"Breakdown"},
      {mc:"UF-02",ex:3000,ac:2800,gap:200,rsn:"Cycle time high"},
      {mc:"UF-03",ex:3000,ac:2900,gap:100,rsn:"Availability loss"},
      {mc:"UF-04",ex:3000,ac:2950,gap:50,rsn:"Minor stoppage"},
      {mc:"UF-05",ex:3000,ac:2890,gap:110,rsn:"Calibration delay"},
      {mc:"UF-06",ex:3000,ac:2960,gap:40,rsn:"Operator break"}
    ];
    const oeeDetail={
      "UF-01":{oee:78.5,a:82,p:96,q:99.5,dt:[
        {tp:"Breakdown",sub:"Hydraulic seal leak",dur:"95 min",sh:"B"},
        {tp:"Breakdown",sub:"Sensor failure",dur:"45 min",sh:"B"},
        {tp:"Setup",sub:"Size change 145/13 to 165/14",dur:"38 min",sh:"A"},
        {tp:"Minor Stop",sub:"Bead handling jam",dur:"22 min",sh:"C"}
      ]},
      "UF-02":{oee:88.5,a:92,p:96,q:99.5,dt:[
        {tp:"Cycle Time",sub:"Reduced speed - bearing noise",dur:"60 min",sh:"A"},
        {tp:"Setup",sub:"Tool change",dur:"25 min",sh:"B"}
      ]},
      "UF-05":{oee:90.2,a:94,p:96.5,q:99.6,dt:[
        {tp:"Calibration",sub:"RFV calibration cycle",dur:"40 min",sh:"A"},
        {tp:"Minor Stop",sub:"Operator break delay",dur:"15 min",sh:"C"}
      ]}
    };
    const selMc=sub;
    return(<div style={{display:"grid",gap:10}}>
      <Card title="Uniformity Yield — Curing vs Uniformity Output" accent={C.rd}>
        <Breadcrumb path={["Product","Uniformity Yield"]}/>
        <div style={{display:"flex",gap:14,marginBottom:10}}>
          <div style={{flex:1,padding:"10px 12px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>First Line Inspection</div><div style={{fontSize:23,fontWeight:700,color:C.bl}}>20,000</div></div>
          <div style={{flex:1,padding:"10px 12px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Uniformity Output</div><div style={{fontSize:23,fontWeight:700,color:C.tl}}>18,000</div></div>
          <div style={{flex:1,padding:"10px 12px",background:C.rd+"12",borderRadius:6,border:"1px solid "+C.rd+"33"}}><div style={{fontSize:11,color:C.rd,textTransform:"uppercase",fontWeight:700}}>Gap</div><div style={{fontSize:23,fontWeight:700,color:C.rd}}>2,000</div></div>
        </div>
        <DTable cols={["Machine","Expected","Actual","Gap","Reason"]}
          rows={machines.map(r=>{const canDrill=oeeDetail[r.mc];return [
            canDrill?<span onClick={()=>setSub(selMc===r.mc?"":r.mc)} style={{cursor:"pointer",fontWeight:selMc===r.mc?700:600,color:selMc===r.mc?C.ac:C.bl}}>{r.mc}<span style={{fontSize:12,color:C.am,marginLeft:6}}>{"▸"}</span></span>:r.mc,
            r.ex,r.ac,
            <span style={{fontWeight:700,color:r.gap>200?C.rd:r.gap>100?C.am:C.gn}}>{r.gap}</span>,
            r.rsn];})}/>
        <div style={{fontSize:12,color:C.am,marginTop:6}}>{"▸"} Click a machine name to view OEE breakdown and downtime detail. Click any column header to sort.</div>
      </Card>
      {selMc&&oeeDetail[selMc]&&<Card title={"OEE & Downtime Detail — "+selMc} accent={C.am}>
        <Breadcrumb path={["Product","Uniformity",selMc,"OEE / Downtime"]}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd,textAlign:"center"}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>OEE</div><div style={{fontSize:21,fontWeight:700,color:rc(oeeDetail[selMc].oee)}}>{oeeDetail[selMc].oee}%</div></div>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd,textAlign:"center"}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Availability</div><div style={{fontSize:21,fontWeight:700,color:rc(oeeDetail[selMc].a)}}>{oeeDetail[selMc].a}%</div></div>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd,textAlign:"center"}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Performance</div><div style={{fontSize:21,fontWeight:700,color:rc(oeeDetail[selMc].p)}}>{oeeDetail[selMc].p}%</div></div>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd,textAlign:"center"}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Quality</div><div style={{fontSize:21,fontWeight:700,color:rc(oeeDetail[selMc].q)}}>{oeeDetail[selMc].q}%</div></div>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:C.md,marginBottom:6}}>Downtime Log</div>
        <DTable cols={["Type","Sub-cause","Duration","Shift"]} rows={oeeDetail[selMc].dt.map(d=>[d.tp,d.sub,d.dur,d.sh])}/>
      </Card>}
      <Card title="Uniformity Yield — SKU / Size-wise (quality yield, not machine efficiency)" accent={C.tl}>
        <div style={{fontSize:12,color:C.mu,marginBottom:8}}>{"Yield = tyres passing uniformity ÷ tyres checked, per SKU/size. Separate from the machine OEE/efficiency view above — this is the quality-pass rate the customer sees."}</div>
        <DTable cols={["SKU","Size","Segment","Checked","Passed","Yield %","Top Reject Param"]} rows={[
          ["ULTIMA NEO","145/13","PCR",1180,1064,"90.2%","RFV"],
          ["ULTIMA","165/14","PCR",940,858,"91.3%","Conicity"],
          ["ULTIMA SPORT","175/15","PCR",1120,1035,"92.4%","LFV"],
          ["ULTIMA SPORT","185/15","PCR",760,681,"89.6%","RFV"],
          ["XM2","10.00R20","TBR",560,505,"90.2%","Run-out"],
          ["JUC","11.00R20","TBR",430,382,"88.8%","Conicity"]
        ]}/>
        <div style={{fontSize:12,color:C.mu,marginTop:6}}>{"RFV/LFV/Conicity/Run-out is the dominant reject parameter for that SKU."}</div>
      </Card>
      {_BcCard({title:"Uniformity rejections — barcode details",rows:_inspBc([
        {sku:"ULTIMA NEO",size:"145/13",defect:"RFV high",n:116},
        {sku:"ULTIMA",size:"165/14",defect:"Conicity out",n:82},
        {sku:"ULTIMA SPORT",size:"175/15",defect:"LFV high",n:85},
        {sku:"XM2",size:"10.00R20",defect:"Run-out",n:55}
      ]),file:"uniformity_barcodes.csv"})}
    </div>);
  }

  if(kpi.drill==="dvm"){
    return(<div style={{display:"grid",gap:10}}>
      <Card title="DBM Yield — Machine & Size-wise" accent={C.bl}>
      <Breadcrumb path={["Product","DBM Yield"]}/>
      <DTable cols={["Machine","Size","Tested","Pass","Fail","Yield %","Top Fail Param","Disposition"]} rows={[
        ["DVM-01","145/13",450,432,18,"96.0%","Imbalance",<StatusPill status="Released"/>],
        ["DVM-01","165/14",420,395,25,"94.0%","Run-out",<StatusPill status="Hold"/>],
        ["DVM-02","175/15",380,368,12,"96.8%","Imbalance",<StatusPill status="Released"/>],
        ["DVM-02","185/15",350,322,28,"92.0%","Conicity",<StatusPill status="Pending"/>],
        ["DVM-03","195/15",300,290,10,"96.7%","Imbalance",<StatusPill status="Released"/>]
      ]}/>
    </Card>
      {_BcCard({title:"DBM rejections — barcode details",rows:_inspBc([
        {sku:"ULTIMA NEO",size:"145/13",defect:"Balance out",n:28},
        {sku:"ULTIMA",size:"165/14",defect:"Weight variation",n:22},
        {sku:"ULTIMA SPORT",size:"175/15",defect:"Balance out",n:25}
      ]),file:"dbm_barcodes.csv"})}
    </div>);
  }

  if(kpi.drill==="dy"){
    const PCR_STAGES=["Curing – 1st Line Visual Inspection","Uniformity","Balancing","2nd Line Visual Inspection","PDI (Pre-Dispatch Inspection)"];
    const TBR_STAGES=["Curing – 1st Line Visual Inspection","X-Ray","Balancing & Run Out","Uniformity","Shearography","2nd Line Inspection","PDI (Pre-Dispatch Inspection)"];
    const DY_PCR=[
      {sku:"ULTIMA NEO",size:"145/13",qty:2100,oe:true,y:[98.1,97.1,99.0,98.5,99.2]},
      {sku:"ULTIMA",size:"165/14",qty:1600,oe:false,y:[97.5,96.2,98.0,98.6,100]},
      {sku:"ULTIMA SPORT",size:"175/15",qty:1900,oe:true,y:[98.4,97.3,98.9,99.2,99.2]},
      {sku:"ULTIMA SPORT",size:"185/15",qty:1300,oe:false,y:[97.3,96.4,98.4,98.8,100]}
    ];
    const DY_TBR=[
      {sku:"XM2",size:"10.00R20",qty:980,oe:true,y:[98.0,99.0,98.5,96.9,99.2,98.8,99.3]},
      {sku:"JUC",size:"11.00R20",qty:760,oe:false,y:[97.6,98.7,98.2,96.1,98.9,98.5,100]},
      {sku:"JUH",size:"12.00R20",qty:640,oe:true,y:[97.9,98.9,98.4,96.6,99.1,98.7,99.2]}
    ];
    const view=(!isBanmorePlant(plant)&&tyreType==="TBR")?"TBR":"PCR";
    const stages=view==="TBR"?TBR_STAGES:PCR_STAGES;
    const rows=view==="TBR"?DY_TBR:DY_PCR;
    const flow=r=>{let inp=r.qty;const st=r.y.map((y,i)=>{const passed=Math.round(inp*y/100);const o={stage:stages[i],inp,passed,rej:inp-passed,y};inp=passed;return o;});
      return {st,final:inp,fy:+(inp/r.qty*100).toFixed(1)};};
    const yc=v=>v>=98?C.gn:v>=96.5?C.am:C.rd;
    const tc=view==="TBR"?C.tl:C.bl;
    const parts=sub?sub.split("|"):[];
    const cur=parts.length===3?rows.find(r=>r.sku===parts[0]&&r.size===parts[1]):null;
    const sIdx=cur?Math.min(Number(parts[2])||0,stages.length-1):0;
    return(<div style={{display:"grid",gap:10}}>
      <Card title={"Dispatch Yield — SKU-wise ("+view+")"} accent={tc}>
        <Breadcrumb path={["Product","Dispatch Yield"]}/>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr>{["SKU","Size","Production Quantity",...stages,"Dispatch Yield"].map((h,i)=>(
            <th key={i} style={{textAlign:i<2?"left":"right",padding:"6px 7px",color:i>=3&&i<3+stages.length?C.md:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:11.5,whiteSpace:"nowrap",background:i>=3&&i<3+stages.length?tc+"0A":"transparent"}}>{h}</th>))}</tr></thead>
          <tbody>{rows.map((r,i)=>{const f=flow(r);return(
            <tr key={i} style={{background:i%2===0?"transparent":C.c2}}>
              <td style={{padding:"7px 7px",borderBottom:"1px solid "+C.bd,fontWeight:600,color:C.tx}}>{r.sku}
                {r.oe&&<span style={{marginLeft:5,padding:"1px 5px",borderRadius:3,background:C.am+"20",color:C.am,fontSize:9.5,fontWeight:800}}>{"OE"}</span>}</td>
              <td style={{padding:"7px 7px",borderBottom:"1px solid "+C.bd,color:C.mu}}>{r.size}</td>
              <td style={{padding:"7px 7px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:700}}>{r.qty.toLocaleString("en-IN")}</td>
              {f.st.map((s,j)=>{const key=r.sku+"|"+r.size+"|"+j;const a=sub===key;const pdiNA=(j===stages.length-1)&&!r.oe;
                if(pdiNA)return(<td key={j} style={{padding:"7px 7px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:C.mu}} title="PDI applies to OE tyres only">{"—"}</td>);
                return(
                <td key={j} onClick={()=>setSub(a?"":key)} title="Click for traceability"
                    style={{padding:"7px 7px",borderBottom:"1px solid "+C.bd,textAlign:"right",cursor:"pointer",background:a?C.aL:"transparent",outline:a?"1px solid "+C.ac:"none"}}>
                  <div style={{fontWeight:600,color:a?C.ac:C.bl,textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:2}}>{s.passed.toLocaleString("en-IN")}</div>
                  <div style={{fontSize:10.5,color:yc(s.y),fontWeight:600}}>{s.y.toFixed(1)+"%"}</div>
                </td>);})}
              <td style={{padding:"7px 7px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:800,color:yc(f.fy)}}>{f.fy.toFixed(1)+"%"}</td>
            </tr>);})}</tbody>
        </table></div>
        <div style={{fontSize:12,color:C.am,marginTop:6}}>{"Click any stage quantity for traceability. PDI applies to OE tyres only."}</div>
      </Card>
      {cur&&(()=>{
        const f=flow(cur);const st=f.st[sIdx];const stName=stages[sIdx];
        const scrap=Math.round(st.rej*0.65),rework=st.rej-scrap;
        const tr=_traceRows(cur.sku,cur.size,view,cur.qty,st.rej,stName);
        const bad=tr.filter(t=>t.result!=="Pass");
        const roll=(k)=>{const m={};tr.forEach(t=>{if(!m[t[k]])m[t[k]]={qty:0,scr:0,rw:0};m[t[k]].qty++;if(t.result==="Scrap")m[t[k]].scr++;if(t.result==="Rework")m[t[k]].rw++;});return m;};
        const bldM=roll("bld"),cureM=roll("cure"),mixM=roll("mix");
        const tile=(l,v,s,col)=>(<div style={{flex:1,minWidth:118,background:C.cd,border:"1px solid "+C.bd,borderRadius:8,padding:"9px 11px"}}>
          <div style={{fontSize:10.5,color:C.mu,fontWeight:600,textTransform:"uppercase",letterSpacing:".3px"}}>{l}</div>
          <div style={{fontSize:19,fontWeight:700,color:col||C.tx,marginTop:2}}>{v}</div>{s&&<div style={{fontSize:10.5,color:C.mu,marginTop:1}}>{s}</div>}</div>);
        const dl=()=>_csvDl("traceability_"+cur.sku.replace(/\s+/g,"_")+"_"+cur.size.replace(/[^0-9A-Za-z]/g,"")+".csv",
          ["Barcode","SKU","Size","Segment","Prod Date","Shift","Mixing Machine","Compound Batch","Stock Machine",(view==="TBR"?"TBM / Building Machine":"Building Machine"),"Green Tyre Wt (kg)","Curing Machine","Cure Time (min)","Stage","Stage Result","Defect Reason","Disposition"],
          tr.map(t=>[t.bc,t.sku,t.size,t.seg,t.date,t.shift,t.mix,t.batch,t.stock,t.bld,t.gtw,t.cure,t.cureTime,t.stage,t.result,t.reason,t.disp]));
        return(<Card title={"Traceability — "+cur.sku+" ("+cur.size+") · "+stName} accent={C.pp}>
          <Breadcrumb path={["Product","Dispatch Yield",cur.sku+" "+cur.size,stName]}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            {tile("Input Qty",st.inp.toLocaleString("en-IN"),"",C.tx)}
            {tile("Passed",st.passed.toLocaleString("en-IN"),st.y.toFixed(1)+"%",C.gn)}
            {tile("Scrap",scrap.toLocaleString("en-IN"),"",C.rd)}
            {tile("Rework",rework.toLocaleString("en-IN"),"",C.am)}
          </div>
          <div style={{marginBottom:12}}>
            {_DlBtn({label:"Download Traceability",onClick:dl,col:C.gn})}
          </div>
          <div style={{fontSize:12.5,fontWeight:700,color:C.tx,marginBottom:6}}>{"Machine journey"}</div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:12,fontSize:12}}>
            {[["Mixing",Object.keys(mixM).join(", ")],["Stock",Object.keys(roll("stock")).join(", ")],[(view==="TBR"?"TBM / Building":"Building"),Object.keys(bldM).join(", ")],["Curing",Object.keys(cureM).join(", ")]].map((s,i,arr)=>(
              <span key={i} style={{display:"inline-flex",alignItems:"center",gap:6}}>
                <span style={{padding:"5px 10px",borderRadius:6,background:C.c2,border:"1px solid "+C.bd}}>
                  <b style={{color:C.tx}}>{s[0]}</b><span style={{color:C.mu}}>{": "+s[1]}</span>
                </span>
                {i<arr.length-1&&<span style={{color:C.mu}}>{"→"}</span>}
              </span>))}
          </div>
          <div style={{fontSize:12.5,fontWeight:700,color:C.tx,marginBottom:6}}>{(view==="TBR"?"TBM / Building":"Building")+" machine-wise"}</div>
          <DTable cols={[(view==="TBR"?"TBM / Building Machine":"Building Machine"),"Tyres Built","Scrap","Rework"]} rows={Object.keys(bldM).map(k=>{const b=bldM[k];return[
            k,b.qty.toLocaleString("en-IN"),
            <span style={{color:b.scr?C.rd:C.mu,fontWeight:b.scr?700:400}}>{b.scr}</span>,
            <span style={{color:b.rw?C.am:C.mu,fontWeight:b.rw?700:400}}>{b.rw}</span>];})}/>
          <div style={{fontSize:12.5,fontWeight:700,color:C.tx,margin:"12px 0 6px"}}>{"Curing machine-wise"}</div>
          <DTable cols={["Curing Machine","Tyres Cured","Scrap","Rework"]} rows={Object.keys(cureM).map(k=>{const b=cureM[k];return[
            k,b.qty.toLocaleString("en-IN"),
            <span style={{color:b.scr?C.rd:C.mu,fontWeight:b.scr?700:400}}>{b.scr}</span>,
            <span style={{color:b.rw?C.am:C.mu,fontWeight:b.rw?700:400}}>{b.rw}</span>];})}/>
          <div style={{fontSize:12.5,fontWeight:700,color:C.tx,margin:"12px 0 6px"}}>{"Affected barcodes "}<span style={{fontWeight:400,color:C.mu,fontSize:11.5}}>{"(10 of "+bad.length+")"}</span></div>
          <DTable cols={["Barcode","Shift",(view==="TBR"?"TBM":"Building"),"Curing","Compound Batch","Result","Reason","Disposition"]} rows={bad.slice(0,10).map(t=>[
            t.bc,t.shift,t.bld,t.cure,t.batch,
            <span style={{fontWeight:700,color:t.result==="Scrap"?C.rd:C.am}}>{t.result}</span>,
            t.reason,t.disp])}/>
        </Card>);})()}
    </div>);
  }

  if(kpi.drill==="oe"){
    return(<div style={{display:"grid",gap:10}}>
      <Card title="OE Yield — SKU & Size-wise" accent={C.am}>
      <Breadcrumb path={["Product","OE Yield"]}/>
      <div style={{padding:"8px 12px",background:C.bl+"0E",border:"1px solid "+C.bl+"33",borderRadius:6,fontSize:12.5,color:C.md,marginBottom:10}}>{"Tracked SKU & size-wise (not customer-wise) — one SKU/size is often supplied to multiple OE customers, so yield belongs to the SKU/size, not a single customer."}</div>
      <DTable cols={["SKU","Size","Segment","Produced","OE Passed","OE Yield %"]} rows={[
        ["ULTIMA NEO","145/13","PCR",2000,1840,"92.0%"],
        ["ULTIMA","165/14","PCR",1500,1335,"89.0%"],
        ["ULTIMA SPORT","175/15","PCR",1800,1620,"90.0%"],
        ["ULTIMA SPORT","185/15","PCR",1200,1068,"89.0%"],
        ["ULTIMA","195/15","PCR",1000,910,"91.0%"],
        ["XM2","10.00R20","TBR",900,810,"90.0%"],
        ["JUC","11.00R20","TBR",700,616,"88.0%"],
        ["JUH","12.00R20","TBR",600,534,"89.0%"]
      ]}/>
      <div style={{fontSize:12,color:C.mu,marginTop:6}}>{"OE Yield = tyres meeting OE spec ÷ produced, per SKU/size. Sortable by any column."}</div>
      </Card>
      <Card title="OE SKU Yield — PCR (all OE SKUs vs 92% target)" accent={C.bl}>
        <HBarChart items={[{l:"ULTIMA NEO 145/13",v:92},{l:"ULTIMA 165/14",v:89},{l:"ULTIMA SPORT 175/15",v:90},{l:"ULTIMA SPORT 185/15",v:89},{l:"ULTIMA 195/15",v:91}]} unit="%" target={92}/>
      </Card>
      <Card title="OE SKU Yield — TBR (all OE SKUs vs 92% target)" accent={C.tl}>
        <HBarChart items={[{l:"XM2 10.00R20",v:90},{l:"JUC 11.00R20",v:88},{l:"JUH 12.00R20",v:89}]} unit="%" target={92}/>
      </Card>
    </div>);
  }

  if(kpi.drill==="eg"){
    return(<Card title="E-Grade Tyres — Machine, Size & Failed Parameter" accent={C.rd}>
      <Breadcrumb path={["Product","E-Grade"]}/>
      <DTable cols={["Machine","Size","Count","Failed Param","Actual Value","Limit","Disposition"]} rows={[
        ["UF-01","145/13",12,"RFV","14.2","≤12.0",<StatusPill status="Pending"/>],
        ["UF-03","165/14",8,"LFV","11.8","≤10.0",<StatusPill status="Released"/>],
        ["UF-02","175/15",7,"Conicity","8.5","≤7.0",<StatusPill status="Hold"/>],
        ["UF-04","185/15",6,"RFV","13.1","≤12.0",<StatusPill status="Pending"/>],
        ["UF-05","195/15",5,"Run-out","1.8","≤1.5",<StatusPill status="Hold"/>],
        ["UF-01","165/14",4,"LFV","11.5","≤10.0",<StatusPill status="Released"/>]
      ]}/>
    </Card>);
  }

  if(kpi.drill==="sl"){
    const SL_DEFECTS=["Sidewall mark","Tread cosmetic","Bead area damage","Visual defect","Run-out mark"];
    const SL_DATA=[
      {sku:"ULTIMA NEO",size:"145/13",seg:"PCR",insp:1950,d:{"Sidewall mark":9,"Tread cosmetic":0,"Bead area damage":6,"Visual defect":0,"Run-out mark":0}},
      {sku:"ULTIMA",size:"165/14",seg:"PCR",insp:1471,d:{"Sidewall mark":5,"Tread cosmetic":4,"Bead area damage":0,"Visual defect":0,"Run-out mark":0}},
      {sku:"ULTIMA SPORT",size:"175/15",seg:"PCR",insp:1800,d:{"Sidewall mark":6,"Tread cosmetic":5,"Bead area damage":0,"Visual defect":4,"Run-out mark":0}},
      {sku:"ULTIMA SPORT",size:"185/15",seg:"PCR",insp:1199,d:{"Sidewall mark":4,"Tread cosmetic":0,"Bead area damage":4,"Visual defect":3,"Run-out mark":0}},
      {sku:"XM2",size:"10.00R20",seg:"TBR",insp:900,d:{"Sidewall mark":0,"Tread cosmetic":3,"Bead area damage":0,"Visual defect":0,"Run-out mark":3}},
      {sku:"JUC",size:"11.00R20",seg:"TBR",insp:683,d:{"Sidewall mark":0,"Tread cosmetic":0,"Bead area damage":0,"Visual defect":0,"Run-out mark":2}}
    ];
    const slView=sub==="defect"?"defect":"size";
    const tot=r=>SL_DEFECTS.reduce((a,k)=>a+(r.d[k]||0),0);
    const grandDef=SL_DATA.reduce((a,r)=>a+tot(r),0);
    const grandInsp=SL_DATA.reduce((a,r)=>a+r.insp,0);
    const SEV={"Sidewall mark":"Minor","Tread cosmetic":"Minor","Bead area damage":"Major","Visual defect":"Minor","Run-out mark":"Major"};
    const INSPECTORS=["Ins-01","Ins-02","Ins-03","Ins-04"];
    const bcRows=(()=>{const out=[];let n=0;
      SL_DATA.forEach(r=>{SL_DEFECTS.forEach(dfx=>{const q=r.d[dfx]||0;
        for(let i=0;i<q;i++){n++;
          out.push({bc:"BTP-"+r.size.replace(/[^0-9A-Za-z]/g,"")+"-"+String(20001+n),sku:r.sku,size:r.size,seg:r.seg,
            defect:dfx,qty:1,sev:SEV[dfx],shift:["A","B","C"][n%3],ins:INSPECTORS[n%4],
            date:String(1+(n%28)).padStart(2,"0")+"-Jun",disp:SEV[dfx]==="Major"?"Scrapped":"Sent for rework"});}
      });});return out;})();
    const byDefect={};SL_DEFECTS.forEach(k=>{byDefect[k]={qty:0,skus:new Set(),sizes:new Set()};});
    SL_DATA.forEach(r=>SL_DEFECTS.forEach(k=>{const q=r.d[k]||0;if(q){byDefect[k].qty+=q;byDefect[k].skus.add(r.sku);byDefect[k].sizes.add(r.size);}}));
    const dc=v=>v===0?C.mu:v>=6?C.rd:v>=3?C.am:C.md;
    const dlSize=()=>_csvDl("second_line_defects_size-wise.csv",
      ["Barcode","SKU","Size","Segment","Defect","Defect Qty","Severity","Inspection Date","Shift","Inspector","Disposition"],
      [...bcRows].sort((a,b)=>a.size.localeCompare(b.size)||a.defect.localeCompare(b.defect))
        .map(t=>[t.bc,t.sku,t.size,t.seg,t.defect,t.qty,t.sev,t.date,t.shift,t.ins,t.disp]));
    const dlDefect=()=>_csvDl("second_line_defects_defect-wise.csv",
      ["Barcode","Defect","Defect Qty","SKU","Size","Segment","Severity","Inspection Date","Shift","Inspector","Disposition"],
      [...bcRows].sort((a,b)=>a.defect.localeCompare(b.defect)||a.size.localeCompare(b.size))
        .map(t=>[t.bc,t.defect,t.qty,t.sku,t.size,t.seg,t.sev,t.date,t.shift,t.ins,t.disp]));
    return(<div style={{display:"grid",gap:10}}>
      <Card title="Second Line Inspection" accent={C.rd}>
        <Breadcrumb path={["Product","Second Line Inspection",slView==="size"?"Size-wise":"Defect-wise"]}/>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
          <span style={{fontSize:11.5,color:C.mu,fontWeight:700,textTransform:"uppercase"}}>View by</span>
          {[["size","Size-wise"],["defect","Defect-wise"]].map(o=>{const a=slView===o[0];return(
            <button key={o[0]} onClick={()=>setSub(o[0])} style={{padding:"5px 15px",borderRadius:999,border:"1px solid "+(a?C.rd:C.bd),background:a?C.rd+"15":C.c2,color:a?C.rd:C.tx,fontSize:12.5,fontWeight:a?700:500,cursor:"pointer"}}>{o[1]}</button>);})}
          <span style={{marginLeft:"auto"}}>
            {_DlBtn({label:"Download barcode details",onClick:slView==="size"?dlSize:dlDefect,col:C.gn})}
          </span>
        </div>
        {slView==="size"
          ? (<><div style={{fontSize:12,color:C.mu,marginBottom:8}}>{grandDef+" defects · "+grandInsp.toLocaleString("en-IN")+" inspected"}</div>
              <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr>{["Tyre Size","Inspected",...SL_DEFECTS,"Total Defects","Defect %"].map((h,i)=>(
                  <th key={i} style={{textAlign:i<1?"left":"right",padding:"6px 7px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:11.5,whiteSpace:"nowrap"}}>{h}</th>))}</tr></thead>
                <tbody>{SL_DATA.map((r,i)=>{const t=tot(r);return(
                  <tr key={i} style={{background:i%2===0?"transparent":C.c2}}>
                    <td style={{padding:"7px 7px",borderBottom:"1px solid "+C.bd,fontWeight:700,color:C.tx}}>{r.sku+" "+r.size}</td>
                    <td style={{padding:"7px 7px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.insp.toLocaleString("en-IN")}</td>
                    {SL_DEFECTS.map((k,j)=>{const v=r.d[k]||0;return(<td key={j} style={{padding:"7px 7px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:dc(v),fontWeight:v?700:400}}>{v||"—"}</td>);})}
                    <td style={{padding:"7px 7px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:800,color:C.rd}}>{t}</td>
                    <td style={{padding:"7px 7px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:C.mu}}>{(t/r.insp*100).toFixed(2)+"%"}</td>
                  </tr>);})}
                  <tr style={{borderTop:"2px solid "+C.bd}}>
                    <td style={{padding:"7px 7px",fontWeight:800,color:C.tx}}>{"Total"}</td>
                    <td style={{padding:"7px 7px",textAlign:"right",fontWeight:700}}>{grandInsp.toLocaleString("en-IN")}</td>
                    {SL_DEFECTS.map((k,j)=>(<td key={j} style={{padding:"7px 7px",textAlign:"right",fontWeight:700,color:C.rd}}>{byDefect[k].qty}</td>))}
                    <td style={{padding:"7px 7px",textAlign:"right",fontWeight:800,color:C.rd}}>{grandDef}</td>
                    <td style={{padding:"7px 7px",textAlign:"right",fontWeight:700,color:C.mu}}>{(grandDef/grandInsp*100).toFixed(2)+"%"}</td>
                  </tr>
                </tbody>
              </table></div></>)
          : (<><div style={{fontSize:12,color:C.mu,marginBottom:8}}>{"A high “# SKUs” means the defect is systemic rather than SKU-specific."}</div>
              <DTable cols={["Defect","Total Qty","Severity","# SKUs Affected","SKU / Size Details"]} rows={SL_DEFECTS.map(k=>{const b=byDefect[k];return[
                k,
                <span style={{fontWeight:800,color:b.qty>=10?C.rd:b.qty>=5?C.am:C.md}}>{b.qty}</span>,
                SEV[k],
                b.skus.size,
                SL_DATA.filter(r=>(r.d[k]||0)>0).map(r=>r.sku+" "+r.size+" ("+r.d[k]+")").join(", ")||"—"];})}/>
              </>)}
      </Card>
    </div>);
  }

  if(kpi.drill==="sc"){
    const defects=[
      {d:"Blow",cnt:120,sz:"145/13",ps:"Building"},
      {d:"Under Cure",cnt:90,sz:"165/14",ps:"Curing"},
      {d:"Compound Issue",cnt:50,sz:"175/15",ps:"Mixing"},
      {d:"Splice Open",cnt:45,sz:"185/15",ps:"Building"},
      {d:"Sidewall Crack",cnt:32,sz:"195/15",ps:"Curing"}
    ];
    const selDef=sub;
    return(<div style={{display:"grid",gap:10}}>
      <Card title="Scrap — Defect-wise Pareto" accent={C.rd}>
        <Breadcrumb path={["Product","Scrap"]}/>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Defect</th><th style={{textAlign:"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Scrap Count</th><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Top Size</th><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Suspected Process</th></tr></thead>
          <tbody>{defects.map((r,i)=>(<tr key={i} onClick={()=>setSub(selDef===r.d?"":r.d)} style={{background:selDef===r.d?C.aL:(i%2===0?"transparent":C.c2),cursor:"pointer"}}>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontWeight:selDef===r.d?700:400,color:selDef===r.d?C.ac:C.tx}}>{r.d}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:700}}>{r.cnt}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{r.sz}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{r.ps}</td>
          </tr>))}</tbody>
        </table></div>
        <div style={{fontSize:12,color:C.am,marginTop:6}}>{"▸"} Click defect to see size, machine & root cause</div>
      </Card>
      {selDef&&<Card title={"Drill: "+selDef+" — Size & Machine Source"} accent={C.am}>
        <Breadcrumb path={["Product","Scrap",selDef,"Size & Machine"]}/>
        <DTable cols={["Size","Count","TBM / Machine","Root Cause","Action Status"]} rows={[
          [defects.find(d=>d.d===selDef).sz,Math.round(defects.find(d=>d.d===selDef).cnt*0.6),"TBM-2","Splice tension low",<StatusPill status="Open"/>],
          ["165/14",Math.round(defects.find(d=>d.d===selDef).cnt*0.25),"TBM-3","Bladder wear",<StatusPill status="Closed"/>],
          ["175/15",Math.round(defects.find(d=>d.d===selDef).cnt*0.15),"TBM-1","Cure time deviation",<StatusPill status="Open"/>]
        ]}/>
      </Card>}
    </div>);
  }

  if(kpi.drill==="gtw"){
    const sizes=[
      {sz:"145/13",tot:1000,wn:800,ot:200,cmp:"80.0%",w2:"92.0%",w3:"97.5%",tbm:"TBM-2",lot:"Lot-A4451",st:"Red"},
      {sz:"165/14",tot:1200,wn:1140,ot:60,cmp:"95.0%",w2:"98.5%",w3:"99.6%",tbm:"TBM-3",lot:"Lot-A4452",st:"Green"},
      {sz:"175/15",tot:900,wn:855,ot:45,cmp:"95.0%",w2:"98.7%",w3:"99.8%",tbm:"TBM-1",lot:"Lot-A4453",st:"Green"},
      {sz:"185/15",tot:800,wn:720,ot:80,cmp:"90.0%",w2:"96.5%",w3:"99.0%",tbm:"TBM-2",lot:"Lot-A4454",st:"Yellow"},
      {sz:"195/15",tot:600,wn:570,ot:30,cmp:"95.0%",w2:"98.8%",w3:"99.7%",tbm:"TBM-4",lot:"Lot-A4455",st:"Green"}
    ];
    const lotData={
      "Lot-A4451":{
        comp:[
          {cm:"Tread",sup:"Extruder-2",wt:"2.92kg",sp:"2.85±2%",dev:"+2.5%",sp_link:"Cp 1.18 / Cpk 1.12 — Red"},
          {cm:"Sidewall",sup:"Extruder-1",wt:"0.85kg",sp:"0.84±2%",dev:"+1.2%",sp_link:"Cp 1.32 — Green"},
          {cm:"Inner Liner",sup:"Calender-1",wt:"0.62kg",sp:"0.62±2%",dev:"OK",sp_link:"Cp 1.45 — Green"},
          {cm:"Belt",sup:"Cutter LTBC",wt:"0.48kg",sp:"0.48±2%",dev:"OK",sp_link:"Cp 1.38 — Green"},
          {cm:"Bead",sup:"Bead Wind",wt:"0.32kg",sp:"0.32±2%",dev:"OK",sp_link:"Cp 1.50 — Green"}
        ],
        spcLink:"Tread weight on Extruder-2 has Cp 1.18 / Cpk 1.12 (Red SPC project). Direct link to GT weight variation."
      }
    };
    const selSz=sub;
    return(<div style={{display:"grid",gap:10}}>
      <Card title="GT Weight Variation — ±1% / ±2% / ±3% Compliance" accent={C.rd}>
        <Breadcrumb path={["Product","GT Weight Variation"]}/>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr>{["Size","Total","Within ±1%","Within ±2%","Within ±3%","TBM","Lot/Barcode","Status"].map((h,i)=>(<th key={i} style={{textAlign:i===0?"left":i===5?"left":i===6?"left":i===7?"center":"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>{h}</th>))}</tr></thead>
          <tbody>{sizes.map((r,i)=>(<tr key={i} onClick={()=>r.st!=="Green"&&setSub(selSz===r.sz?"":r.sz)} style={{background:selSz===r.sz?C.aL:(i%2===0?"transparent":C.c2),cursor:r.st!=="Green"?"pointer":"default"}}>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontWeight:selSz===r.sz?700:400,color:selSz===r.sz?C.ac:C.tx}}>{r.sz}{r.st!=="Green"&&<span style={{fontSize:12,color:C.am,marginLeft:6}}>{"▸"}</span>}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.tot}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:700,color:r.st==="Red"?C.rd:r.st==="Yellow"?C.am:C.gn}}>{r.cmp}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:C.tx}}>{r.w2}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:C.mu}}>{r.w3}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{r.tbm}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontFamily:"monospace",fontSize:13}}>{r.lot}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"center"}}><StatusPill status={r.st}/></td>
          </tr>))}</tbody>
        </table></div>
        <div style={{fontSize:12,color:C.mu,marginTop:6}}>{"±1% is the target band; ±2% and ±3% show progressive (cumulative) compliance. "}{"▸"} Click a size for component traceability and SPC link.</div>
      </Card>
      {selSz&&lotData[sizes.find(s=>s.sz===selSz).lot]&&<Card title={"Component Traceability — Size "+selSz+" / "+sizes.find(s=>s.sz===selSz).lot} accent={C.bl}>
        <Breadcrumb path={["Product","GT Weight",selSz,sizes.find(s=>s.sz===selSz).lot,"Components"]}/>
        <DTable cols={["Component","Source","Actual Weight","Spec","Deviation","SPC Link"]} rows={lotData[sizes.find(s=>s.sz===selSz).lot].comp.map(c=>[c.cm,c.sup,c.wt,c.sp,<span style={{color:c.dev.includes("+")?C.rd:C.gn,fontWeight:600}}>{c.dev}</span>,<span style={{fontSize:13,color:c.sp_link.includes("Red")?C.rd:C.gn}}>{c.sp_link}</span>])}/>
        <div style={{marginTop:8,padding:"8px 10px",background:C.rd+"12",borderRadius:6,fontSize:13,color:C.rd}}>
          <strong>Root cause linkage:</strong> {lotData[sizes.find(s=>s.sz===selSz).lot].spcLink}
        </div>
      </Card>}
    </div>);
  }

  if(kpi.drill==="insp"){
    const INS=[
      {id:"Ins-01",name:"R. Verma",shift:"A",chk:3200,found:34,missed:2,acc:94.4,rate:92},
      {id:"Ins-02",name:"S. Kumar",shift:"B",chk:3100,found:29,missed:5,acc:85.3,rate:84},
      {id:"Ins-03",name:"A. Singh",shift:"C",chk:2400,found:21,missed:3,acc:87.5,rate:87},
      {id:"Ins-04",name:"P. Yadav",shift:"A",chk:2900,found:26,missed:6,acc:81.3,rate:79}
    ];
    const rcx=v=>v>=90?C.gn:v>=85?C.am:C.rd;
    const bc=_inspBc([
      {sku:"ULTIMA NEO",size:"145/13",defect:"Missed sidewall mark",n:4},
      {sku:"ULTIMA",size:"165/14",defect:"Missed bead damage",n:3},
      {sku:"ULTIMA SPORT",size:"175/15",defect:"Missed tread cosmetic",n:5},
      {sku:"XM2",size:"10.00R20",defect:"Missed run-out",n:4}
    ]);
    return(<div style={{display:"grid",gap:10}}>
      <Card title="Inspector Rating" accent={C.bl}>
        <Breadcrumb path={["Product","Inspector Rating"]}/>
        <DTable cols={["Inspector","Name","Shift","Tyres Checked","Defects Found","Escapes (Missed)","Accuracy %","Rating"]} rows={INS.map(r=>[
          r.id,r.name,r.shift,r.chk.toLocaleString("en-IN"),r.found,
          <span style={{color:r.missed?C.rd:C.gn,fontWeight:700}}>{r.missed}</span>,
          <span style={{color:rcx(r.acc),fontWeight:600}}>{r.acc.toFixed(1)+"%"}</span>,
          <span style={{fontWeight:800,color:rcx(r.rate)}}>{r.rate+"/100"}</span>])}/>
        <div style={{fontSize:12,color:C.mu,marginTop:6}}>{"Rating from inspection accuracy — defects correctly caught vs escapes found downstream / at the customer."}</div>
      </Card>
      {_BcCard({title:"Escaped defects — barcode details",rows:bc,file:"inspector_escapes_barcodes.csv"})}
    </div>);
  }

  if(kpi.drill==="bay"){
    const bc=_inspBc([
      {sku:"ULTIMA NEO",size:"145/13",defect:"Sidewall mark",n:22},
      {sku:"ULTIMA",size:"165/14",defect:"Bead area damage",n:18},
      {sku:"ULTIMA SPORT",size:"175/15",defect:"Visual defect",n:20},
      {sku:"XM2",size:"10.00R20",defect:"Sidewall mark",n:18}
    ]);
    return(<div style={{display:"grid",gap:10}}>
      <Card title="Bay Area Inspection" accent={C.bl}>
        <Breadcrumb path={["Product","Bay Area"]}/>
        <DTable cols={["Shift","Manpower","Tyres Checked","Rejections","Defects Found","Dispatched"]} rows={[
          ["A",6,3200,28,"Sidewall, Visual",3172],
          ["B",6,3100,32,"Sidewall, Bead",3068],
          ["C",4,2400,18,"Visual",2382]
        ]}/>
      </Card>
      {_BcCard({title:"Bay Area rejections — barcode details",rows:bc,file:"bay_area_barcodes.csv"})}
    </div>);
  }

  if(kpi.drill==="cta"){
    const ratings=[
      {rt:"A (Excellent)",cnt:15,pct:"75.0%"},
      {rt:"B (Good)",cnt:3,pct:"15.0%"},
      {rt:"C (Acceptable)",cnt:1,pct:"5.0%"},
      {rt:"D (Poor) — Action Required",cnt:1,pct:"5.0%"}
    ];
    const selRt=sub;
    return(<div style={{display:"grid",gap:10}}>
      <Card title="CTA — Cut Tyre Analysis" accent={C.am}>
        <Breadcrumb path={["Product","CTA"]}/>
        <div style={{display:"flex",gap:14,marginBottom:10}}>
          <div style={{flex:1,padding:"10px 12px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Target / Month</div><div style={{fontSize:23,fontWeight:700}}>43</div></div>
          <div style={{flex:1,padding:"10px 12px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Actual</div><div style={{fontSize:23,fontWeight:700,color:C.am}}>20</div></div>
          <div style={{flex:1,padding:"10px 12px",background:C.rd+"12",borderRadius:6,border:"1px solid "+C.rd+"33"}}><div style={{fontSize:11,color:C.rd,textTransform:"uppercase",fontWeight:700}}>Compliance</div><div style={{fontSize:23,fontWeight:700,color:C.rd}}>46.5%</div></div>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:C.md,marginBottom:6}}>Rating Distribution</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr>{["Rating","Count","%"].map((h,i)=>(<th key={i} style={{textAlign:i===0?"left":"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>{h}</th>))}</tr></thead>
          <tbody>{ratings.map((r,i)=>{const isD=r.rt.startsWith("D");return(<tr key={i} onClick={()=>isD&&setSub(selRt==="D"?"":"D")} style={{background:selRt==="D"&&isD?C.aL:(i%2===0?"transparent":C.c2),cursor:isD?"pointer":"default"}}>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontWeight:isD?700:400,color:isD?C.rd:C.tx}}>{r.rt}{isD&&<span style={{fontSize:12,color:C.am,marginLeft:6}}>{"▸"}</span>}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:700,color:isD?C.rd:C.tx}}>{r.cnt}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.pct}</td>
          </tr>);})}</tbody>
        </table></div>
        <div style={{fontSize:12,color:C.am,marginTop:6}}>{"▸"} Click D-rating row to view failed parameter, barcode, and genealogy</div>
      </Card>
      {selRt==="D"&&<Card title="D-Rating Detail — Failed Parameter & Genealogy" accent={C.rd}>
        <Breadcrumb path={["Product","CTA","D Rating","Genealogy"]}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Tyre Size</div><div style={{fontSize:17,fontWeight:700}}>165/14</div></div>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Failed Parameter</div><div style={{fontSize:17,fontWeight:700,color:C.rd}}>Belt Edge Sep.</div></div>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Barcode</div><div style={{fontSize:14,fontWeight:700,fontFamily:"monospace"}}>BC-7842166</div></div>
          <div style={{padding:"8px 10px",background:C.rd+"12",borderRadius:6,border:"1px solid "+C.rd+"33"}}><div style={{fontSize:11,color:C.rd,textTransform:"uppercase",fontWeight:700}}>Action</div><div style={{fontSize:17,fontWeight:700,color:C.rd}}>CAPA Open</div></div>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:C.md,marginBottom:6}}>Manufacturing Genealogy</div>
        <DTable cols={["Stage","Machine","Date / Time","Key Parameter","Value","Result"]} rows={[
          ["Mixing","Banbury-2","04-Apr 02:30","Mooney Visc.","65","OK"],
          ["Stock","Cutter LTBC","04-Apr 06:15","Belt edge gauge","Below spec","Flag"],
          ["Building","TBM-3","04-Apr 10:00","Belt placement","OK","OK"],
          ["Curing","Press-08","04-Apr 11:30","Cure pressure","Low","Flag"],
          ["Uniformity","UF-02","04-Apr 13:00","RFV","Within","OK"]
        ]}/>
        <div style={{marginTop:8,padding:"8px 10px",background:C.rd+"12",borderRadius:6,fontSize:13,color:C.rd}}>
          <strong>Root cause linkage:</strong> Belt edge gauge low at Cutter LTBC + low cure pressure at Press-08. Combination led to belt edge separation in CTA.
        </div>
      </Card>}
    </div>);
  }

  return null;
}

const COMPLAINT_KPIS=[
  {id:"tot",n:"Total Complaints",v:"10",u:"nos",target:"<5",status:"Red",sp:[4,6,7,9,10],drill:"tot"},
  {id:"opn",n:"Open Complaints",v:"3",u:"nos",target:"0",status:"Red",sp:[1,2,3,3,3],drill:"opn"},
  {id:"cls",n:"Closed Complaints",v:"7",u:"nos",status:"Green",sp:[3,4,4,6,7],drill:"cls"},
  {id:"qty",n:"Complaint Quantity",v:"170",u:"tyres",target:"<50",status:"Red",sp:[80,100,120,150,170],drill:"qty"},
  {id:"oem",n:"OEM-wise Complaints",v:"3",u:"OEMs",status:"Yellow",drill:"oem"},
  {id:"score",n:"Customer Score",v:"92",u:"/100",target:"≥95",status:"Yellow",sp:[95,94,93,92,92],drill:"score",manual:true},
  {id:"zkd",n:"ZKD",v:"6",u:"nos",target:"0",status:"Red",sp:[2,3,4,5,6],drill:"zkd"},
  {id:"hold",n:"Lot Hold",v:"6",u:"cases · 1,190 tyres held",target:"0",status:"Red",sp:[3,4,5,5,6],drill:"hold"}
];

const LOT_HOLDS=[
  {lot:"LOT-A4451",cust:"Maruti Suzuki",sku:"ULTIMA NEO",size:"145/13",qty:300,prodDate:"02-Jun",holdDate:"08-Jun",inspDate:"10-Jun",closeDate:"12-Jun",aging:4,
   cat:"Appearance",defect:"Sidewall bulge",insp:300,rel:288,rej:12,st:"Partially Released",owner:"Richa Jha",
   items:[{bc:"BTP-4451-018",def:"Sidewall bulge",sev:"Major",disp:"Scrapped"},{bc:"BTP-4451-042",def:"Sidewall bulge",sev:"Major",disp:"Scrapped"},{bc:"BTP-4451-077",def:"Sidewall mark",sev:"Minor",disp:"Scrapped"}]},
  {lot:"LOT-A4463",cust:"Tata Motors",sku:"ULTIMA SPORT",size:"175/15",qty:240,prodDate:"05-Jun",holdDate:"11-Jun",inspDate:"13-Jun",closeDate:"",aging:9,
   cat:"Dimensional",defect:"Bead seat variation",insp:180,rel:0,rej:0,st:"Under Inspection",owner:"Samson Mathew",
   items:[{bc:"BTP-4463-006",def:"Bead seat high",sev:"Major",disp:"Under review"},{bc:"BTP-4463-031",def:"Bead seat high",sev:"Major",disp:"Under review"}]},
  {lot:"LOT-A4470",cust:"Maruti Suzuki",sku:"ULTIMA",size:"165/14",qty:180,prodDate:"07-Jun",holdDate:"14-Jun",inspDate:"",closeDate:"",aging:6,
   cat:"Uniformity",defect:"RFV high",insp:0,rel:0,rej:0,st:"On Hold",owner:"Richa Jha",
   items:[{bc:"BTP-4470-Pending",def:"RFV high (customer report)",sev:"Major",disp:"Awaiting inspection"}]},
  {lot:"LOT-A4482",cust:"Hyundai",sku:"ULTIMA SPORT",size:"185/15",qty:200,prodDate:"01-Jun",holdDate:"06-Jun",inspDate:"07-Jun",closeDate:"09-Jun",aging:3,
   cat:"Appearance",defect:"Tread cosmetic",insp:200,rel:200,rej:0,st:"Fully Released",owner:"Daksh Gaur",
   items:[{bc:"—",def:"No defect confirmed on inspection",sev:"—",disp:"Released"}]},
  {lot:"LOT-A4495",cust:"Tata Motors",sku:"XM2",size:"10.00R20",qty:120,prodDate:"03-Jun",holdDate:"09-Jun",inspDate:"10-Jun",closeDate:"13-Jun",aging:4,
   cat:"Construction",defect:"Belt edge separation",insp:120,rel:0,rej:120,st:"Rejected / Returned",owner:"Samson Mathew",
   items:[{bc:"BTP-4495-lot",def:"Belt edge separation — systemic",sev:"Critical",disp:"Full lot returned"}]},
  {lot:"LOT-A4501",cust:"Ashok Leyland",sku:"JUC",size:"11.00R20",qty:150,prodDate:"06-Jun",holdDate:"12-Jun",inspDate:"14-Jun",closeDate:"",aging:8,
   cat:"Uniformity",defect:"Conicity out",insp:90,rel:0,rej:0,st:"Under Inspection",owner:"Richa Jha",
   items:[{bc:"BTP-4501-022",def:"Conicity out of band",sev:"Major",disp:"Under review"}]}
];
const LH_STATUS_COL={"On Hold":C.rd,"Under Inspection":C.am,"Partially Released":C.bl,"Fully Released":C.gn,"Rejected / Returned":C.rd};

function LotHoldPanel({sub,setSub}){
  return(<Card title="Lot Hold — Cases" accent={C.rd}>
    <Breadcrumb path={["Customer Complaint","Lot Hold"]}/>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13.5}}>
      <thead><tr>{["Lot Number","Customer","Tire Size","Hold Date","Quantity Held","Defect / Hold Reason","Released","Rejected","Status"].map((h,i)=>(<th key={i} style={{textAlign:(i===4||i===6||i===7)?"right":"left",padding:"6px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:12.5,whiteSpace:"nowrap"}}>{h}</th>))}</tr></thead>
      <tbody>{LOT_HOLDS.map((l,i)=>(
        <tr key={i} style={{background:i%2===0?"transparent":C.c2}}>
          <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,fontFamily:"monospace",fontWeight:700,color:C.bl}}>{l.lot}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd}}>{l.cust}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd}}>{l.size}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd}}>{l.holdDate}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:600}}>{l.qty}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd}}>{l.defect}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:l.rel?C.gn:C.mu,fontWeight:l.rel?700:400}}>{l.rel||"—"}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:l.rej?C.rd:C.mu,fontWeight:l.rej?700:400}}>{l.rej||"—"}</td>
          <td style={{padding:"7px 8px",borderBottom:"1px solid "+C.bd}}><span style={{padding:"2px 8px",borderRadius:999,fontSize:11,fontWeight:700,background:LH_STATUS_COL[l.st]+"18",color:LH_STATUS_COL[l.st],whiteSpace:"nowrap"}}>{l.st}</span></td>
        </tr>))}</tbody>
    </table></div>
  </Card>);
}

function ComplaintDrillPanel({kpi,sub,setSub}){
  if(kpi.drill==="zkd"){
    const zkds=[
      {id:"ZKD-01",sz:"145/13",df:"Sidewall issue",lc:"Gurgaon",bc:"BC-7842145",dt:"02-Apr"},
      {id:"ZKD-02",sz:"165/14",df:"Tread issue",lc:"Manesar",bc:"BC-7842166",dt:"05-Apr"},
      {id:"ZKD-03",sz:"175/15",df:"Bead area crack",lc:"Pune",bc:"BC-7842178",dt:"08-Apr"},
      {id:"ZKD-04",sz:"185/15",df:"Visual defect",lc:"Chennai",bc:"BC-7842185",dt:"10-Apr"},
      {id:"ZKD-05",sz:"195/15",df:"Uniformity",lc:"Mumbai",bc:"BC-7842195",dt:"12-Apr"},
      {id:"ZKD-06",sz:"165/14",df:"Sidewall issue",lc:"Hyderabad",bc:"BC-7842168",dt:"14-Apr"}
    ];
    const selZ=sub;
    return(<div style={{display:"grid",gap:10}}>
      <Card title="ZKD — Zero Kilometer Defect" accent={C.rd}>
        <Breadcrumb path={["Customer Complaint","ZKD"]}/>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>ZKD ID</th><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Size</th><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Defect</th><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Location</th><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Barcode</th><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Date</th></tr></thead>
          <tbody>{zkds.map((r,i)=>(<tr key={i} onClick={()=>setSub(selZ===r.id?"":r.id)} style={{background:selZ===r.id?C.aL:(i%2===0?"transparent":C.c2),cursor:"pointer"}}>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontWeight:selZ===r.id?700:400,color:selZ===r.id?C.ac:C.tx}}>{r.id}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{r.sz}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{r.df}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{r.lc}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontFamily:"monospace",fontSize:13}}>{r.bc}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{r.dt}</td>
          </tr>))}</tbody>
        </table></div>
        <div style={{fontSize:12,color:C.am,marginTop:6}}>{"▸"} Click ZKD ID to view manufacturing genealogy</div>
      </Card>
      {selZ&&<Card title={"Manufacturing Genealogy — "+selZ} accent={C.bl}>
        <Breadcrumb path={["Product","ZKD",selZ,"Genealogy"]}/>
        <div style={{padding:"8px 10px",background:C.bl+"10",borderRadius:6,marginBottom:10,fontSize:13}}>
          Barcode: <span style={{fontFamily:"monospace",fontWeight:700}}>{zkds.find(z=>z.id===selZ).bc}</span> {"— "} Tracing back through manufacturing stages
        </div>
        <DTable cols={["Stage","Machine","Date / Time","Key Parameter","Value","Result"]} rows={[
          ["Mixing","Banbury-2","08-Apr 02:30","Mooney Visc.","65","OK"],
          ["Stock","Extruder-2","08-Apr 06:15","Tread Weight","2.92kg","High"],
          ["Building","TBM-2","08-Apr 10:00","GT Weight","High","Flag"],
          ["Curing","Press-12","08-Apr 11:30","Cure Time","Within","OK"],
          ["First Line","Inspector C","08-Apr 12:15","Visual / Trim Check","Pass","OK"],
          ["Uniformity","UF-01","08-Apr 13:00","RFV","11.8","OK"],
          ["Second Line","Inspector A","08-Apr 14:30","Final Visual Check","Pass","OK"]
        ]}/>
        <div style={{marginTop:8,padding:"6px 10px",background:C.rd+"12",borderRadius:4,fontSize:13,color:C.rd}}>{"⚠"} Root cause likely: Stock stage (tread weight high) → Building (GT weight flag)</div>
      </Card>}
    </div>);
  }

  if(!kpi) return null;

  const complaints=[
    {id:"CC-001",cust:"MSIL",loc:"Gurgaon",def:"Sidewall defect",qty:20,hold:"Yes",seg:"Yes",bc:"BC-7842145",st:"Open"},
    {id:"CC-002",cust:"MSIL",loc:"Manesar",def:"Tread issue",qty:30,hold:"No",seg:"No",bc:"BC-7842166",st:"Closed"},
    {id:"CC-003",cust:"MSIL",loc:"Gurgaon",def:"Bead area",qty:15,hold:"No",seg:"No",bc:"BC-7842178",st:"Closed"},
    {id:"CC-004",cust:"MSIL",loc:"Manesar",def:"Visual",qty:15,hold:"No",seg:"No",bc:"BC-7842185",st:"Closed"},
    {id:"CC-005",cust:"Tata Motors",loc:"Pune",def:"Uniformity",qty:25,hold:"No",seg:"No",bc:"BC-7842195",st:"Closed"},
    {id:"CC-006",cust:"Tata Motors",loc:"Lucknow",def:"Sidewall defect",qty:15,hold:"Yes",seg:"Yes",bc:"BC-7842168",st:"Open"},
    {id:"CC-007",cust:"Tata Motors",loc:"Pune",def:"Tread cosmetic",qty:10,hold:"No",seg:"No",bc:"BC-7842172",st:"Closed"},
    {id:"CC-008",cust:"M&M",loc:"Nashik",def:"Bead area",qty:18,hold:"No",seg:"No",bc:"BC-7842181",st:"Open"},
    {id:"CC-009",cust:"M&M",loc:"Chakan",def:"Visual",qty:12,hold:"No",seg:"No",bc:"BC-7842188",st:"Closed"},
    {id:"CC-010",cust:"M&M",loc:"Nashik",def:"Compound issue",qty:10,hold:"No",seg:"No",bc:"BC-7842192",st:"Closed"}
  ];

  if(kpi.drill==="tot"||kpi.drill==="oem"){
    const oems=[
      {c:"MSIL",cnt:4,op:1,cl:3,qty:80},
      {c:"Tata Motors",cnt:3,op:1,cl:2,qty:50},
      {c:"M&M",cnt:3,op:1,cl:2,qty:40}
    ];
    const selC=sub;
    return(<div style={{display:"grid",gap:10}}>
      <Card title="Customer / OEM-wise Complaints" accent={C.rd}>
        <Breadcrumb path={["Customer Complaint","OEM-wise"]}/>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr><th style={{textAlign:"left",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Customer/OEM</th><th style={{textAlign:"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Complaints</th><th style={{textAlign:"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Open</th><th style={{textAlign:"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Closed</th><th style={{textAlign:"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>Qty Affected</th></tr></thead>
          <tbody>{oems.map((r,i)=>(<tr key={i} onClick={()=>setSub(selC===r.c?"":r.c)} style={{background:selC===r.c?C.aL:(i%2===0?"transparent":C.c2),cursor:"pointer"}}>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontWeight:selC===r.c?700:400,color:selC===r.c?C.ac:C.tx}}>{r.c}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:700}}>{r.cnt}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:C.am,fontWeight:600}}>{r.op}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",color:C.gn,fontWeight:600}}>{r.cl}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{r.qty}</td>
          </tr>))}</tbody>
        </table></div>
        <div style={{fontSize:12,color:C.am,marginTop:6}}>{"▸"} Click customer to view complaint details</div>
      </Card>
      {selC&&<Card title={"Complaint Details — "+selC} accent={C.am}>
        <Breadcrumb path={["Customer Complaint",selC,"Detail"]}/>
        <DTable cols={["ID","Location","Defect","Qty","Lot Hold","Segregation","Barcode","Status"]} rows={complaints.filter(c=>c.cust===selC).map(c=>[c.id,c.loc,c.def,c.qty,c.hold,c.seg,<span style={{fontFamily:"monospace",fontSize:13}}>{c.bc}</span>,<StatusPill status={c.st}/>])}/>
      </Card>}
      {selC&&complaints.filter(c=>c.cust===selC&&c.st==="Open")[0]&&<Card title="Manufacturing Genealogy (Open Complaint)" accent={C.bl}>
        <Breadcrumb path={["Customer Complaint",selC,"Genealogy"]}/>
        <div style={{padding:"8px 10px",background:C.bl+"10",borderRadius:6,marginBottom:10,fontSize:13}}>
          Tracing complaint <strong>{complaints.filter(c=>c.cust===selC&&c.st==="Open")[0].id}</strong> via barcode <span style={{fontFamily:"monospace"}}>{complaints.filter(c=>c.cust===selC&&c.st==="Open")[0].bc}</span>
        </div>
        <DTable cols={["Stage","Machine","Date / Time","Key Parameter","Result"]} rows={[
          ["Building","TBM-2","10:00 AM","GT Weight","High"],
          ["Curing","Press-12","11:30 AM","Cure Time","OK"],
          ["Uniformity","UF-01","1:00 PM","RFV","OK"],
          ["Second Line","Inspector A","2:30 PM","Visual Check","OK"]
        ]}/>
      </Card>}
    </div>);
  }

  if(kpi.drill==="opn"){
    const opens=complaints.filter(c=>c.st==="Open");
    const selId=sub;
    const selC=opens.find(c=>c.id===selId);
    return(<div style={{display:"grid",gap:10}}>
      <Card title="Open Complaints" accent={C.rd}>
        <Breadcrumb path={["Customer Complaint","Open"]}/>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr>{["ID","Customer","Location","Defect","Qty","Age (days)","Status"].map((h,i)=>(<th key={i} style={{textAlign:i===0?"left":i===1?"left":i===2?"left":i===3?"left":i===6?"center":"right",padding:"5px 8px",color:C.mu,fontWeight:600,borderBottom:"1px solid "+C.bd,fontSize:13}}>{h}</th>))}</tr></thead>
          <tbody>{opens.map((c,i)=>{const age=[8,12,5][i]||7;return(<tr key={i} onClick={()=>setSub(selId===c.id?"":c.id)} style={{background:selId===c.id?C.aL:(i%2===0?"transparent":C.c2),cursor:"pointer"}}>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,fontWeight:selId===c.id?700:400,color:selId===c.id?C.ac:C.tx}}>{c.id}{<span style={{fontSize:12,color:C.am,marginLeft:6}}>{"▸"}</span>}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{c.cust}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{c.loc}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd}}>{c.def}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right"}}>{c.qty}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"right",fontWeight:700,color:age>10?C.rd:age>7?C.am:C.tx}}>{age}</td>
            <td style={{padding:"6px 8px",borderBottom:"1px solid "+C.bd,textAlign:"center"}}><StatusPill status={c.st}/></td>
          </tr>);})}</tbody>
        </table></div>
        <div style={{fontSize:12,color:C.am,marginTop:6}}>{"▸"} Click complaint ID to view full detail and barcode genealogy</div>
      </Card>
      {selC&&<Card title={"Complaint Detail — "+selC.id} accent={C.am}>
        <Breadcrumb path={["Customer Complaint","Open",selC.id,"Detail"]}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:10}}>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Complaint ID</div><div style={{fontSize:16,fontWeight:700}}>{selC.id}</div></div>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Customer / OEM</div><div style={{fontSize:16,fontWeight:700}}>{selC.cust}</div></div>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Location</div><div style={{fontSize:16,fontWeight:700}}>{selC.loc}</div></div>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Defect</div><div style={{fontSize:16,fontWeight:700,color:C.rd}}>{selC.def}</div></div>
          <div style={{padding:"8px 10px",background:C.c2,borderRadius:6,border:"1px solid "+C.bd}}><div style={{fontSize:11,color:C.mu,textTransform:"uppercase"}}>Quantity</div><div style={{fontSize:16,fontWeight:700}}>{selC.qty} tyres</div></div>
          <div style={{padding:"8px 10px",background:selC.hold==="Yes"?C.rd+"12":C.c2,borderRadius:6,border:"1px solid "+(selC.hold==="Yes"?C.rd+"33":C.bd)}}><div style={{fontSize:11,color:selC.hold==="Yes"?C.rd:C.mu,textTransform:"uppercase",fontWeight:selC.hold==="Yes"?700:400}}>Lot Hold</div><div style={{fontSize:16,fontWeight:700,color:selC.hold==="Yes"?C.rd:C.tx}}>{selC.hold}</div></div>
          <div style={{padding:"8px 10px",background:selC.seg==="Yes"?C.rd+"12":C.c2,borderRadius:6,border:"1px solid "+(selC.seg==="Yes"?C.rd+"33":C.bd)}}><div style={{fontSize:11,color:selC.seg==="Yes"?C.rd:C.mu,textTransform:"uppercase",fontWeight:selC.seg==="Yes"?700:400}}>Segregation</div><div style={{fontSize:16,fontWeight:700,color:selC.seg==="Yes"?C.rd:C.tx}}>{selC.seg}</div></div>
          <div style={{padding:"8px 10px",background:C.bl+"10",borderRadius:6,border:"1px solid "+C.bl+"33"}}><div style={{fontSize:11,color:C.bl,textTransform:"uppercase",fontWeight:700}}>Barcode</div><div style={{fontSize:14,fontWeight:700,fontFamily:"monospace",color:C.bl}}>{selC.bc}</div></div>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:C.md,marginBottom:6}}>Manufacturing Genealogy (via barcode)</div>
        <DTable cols={["Stage","Machine","Date / Time","Key Parameter","Result"]} rows={[
          ["Mixing","Banbury-2","02:30 AM","Mooney Visc.","OK"],
          ["Stock","Extruder-2","06:15 AM","Tread Weight","Slightly High"],
          ["Building","TBM-2","10:00 AM","GT Weight","Flag"],
          ["Curing","Press-12","11:30 AM","Cure Time","OK"],
          ["Uniformity","UF-01","1:00 PM","RFV","OK"],
          ["Second Line","Inspector A","2:30 PM","Visual Check","OK"]
        ]}/>
      </Card>}
    </div>);
  }

  if(kpi.drill==="cls"){
    return(<Card title="Closed Complaints" accent={C.gn}>
      <Breadcrumb path={["Customer Complaint","Closed"]}/>
      <DTable cols={["ID","Customer","Location","Defect","Qty","Closure Days","Status"]} rows={complaints.filter(c=>c.st==="Closed").map((c,i)=>[c.id,c.cust,c.loc,c.def,c.qty,[9,14,7,11,6][i]||10,<StatusPill status={c.st}/>])}/>
    </Card>);
  }

  if(kpi.drill==="qty"){
    return(<Card title="Complaint Quantity — Defect-wise" accent={C.rd}>
      <Breadcrumb path={["Customer Complaint","Quantity"]}/>
      <DTable cols={["Defect","Cases","Total Qty","Avg Qty/Case","Top Customer"]} rows={[
        ["Sidewall defect",2,35,17.5,"MSIL / Tata"],
        ["Tread issue",2,40,20,"MSIL"],
        ["Bead area",2,33,16.5,"MSIL / M&M"],
        ["Visual",2,27,13.5,"MSIL / M&M"],
        ["Uniformity",1,25,25,"Tata Motors"],
        ["Compound issue",1,10,10,"M&M"]
      ]}/>
    </Card>);
  }

  if(kpi.drill==="score"){
    return(<Card title="Customer Score / Rating" accent={C.am}>
      <Breadcrumb path={["Customer Complaint","Score"]}/>
      <div style={{padding:"6px 10px",background:"#9CA3AF18",borderRadius:6,marginBottom:10,fontSize:13,color:"#6B7280"}}>{"ⓘ"} Source: Manual / Email-based. Future integration required for live score.</div>
      <DTable cols={["Customer","Format","Current","Previous","Trend","Status"]} rows={[
        ["MSIL","Out of 100",92,95,"↓ -3 pts",<StatusPill status="Yellow"/>],
        ["Tata Motors","Out of 1000",850,870,"↓ -20 pts",<StatusPill status="Yellow"/>],
        ["M&M","Grade A/B/C","A","A","Stable",<StatusPill status="Green"/>],
        ["Hyundai","Out of 100",88,90,"↓ -2 pts",<StatusPill status="Yellow"/>]
      ]}/>
    </Card>);
  }

  if(kpi.drill==="hold"){
    return <LotHoldPanel sub={sub} setSub={setSub}/>;
  }

  return null;
}

/* ============================ SPC ENGINE ============================ */
const SPC_CONST={2:{A2:1.880,D3:0,D4:3.267,d2:1.128},3:{A2:1.023,D3:0,D4:2.574,d2:1.693},4:{A2:0.729,D3:0,D4:2.282,d2:2.059},5:{A2:0.577,D3:0,D4:2.114,d2:2.326}};
function _erf(x){const t=1/(1+0.3275911*Math.abs(x));const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return x>=0?y:-y;}
function _normCdf(z){return 0.5*(1+_erf(z/Math.SQRT2));}

const SPC_PARAMS=[
  {key:"quin_width",mc:"Quintoplex",rc:"ULTIMA NEO",sz:"145/13",pm:"Tread Width",unit:"mm",target:145,usl:147,lsl:143,mean:145.05,sigma:0.42,pattern:"shift",shiftAt:14,shiftBy:1.15,n:5,groups:20,covN:315,shifts:["A","B","C"]},
  {key:"ext2_wt",mc:"Extruder-2",rc:"ULTIMA",sz:"165/14",pm:"Tread Weight",unit:"kg/m",target:4.20,usl:4.40,lsl:4.00,mean:4.225,sigma:0.088,pattern:"demo",demoOffsets:[0,0,0,0,0,0,0,0,0.06,0.10,0.15,0.20,0.26,0.32,0.20,0.19,0.18,0.20,0.17,0.19],n:5,groups:20,covN:340,shifts:["A","B","C"]},
  {key:"ban2_mooney",mc:"Banbury-2",rc:"All recipes",sz:"All",pm:"Mooney Viscosity",unit:"MU",target:58,usl:64,lsl:52,mean:58.2,sigma:1.35,pattern:"trend",trendBy:0.30,n:5,groups:20,covN:300,shifts:["A","B","C"]},
  {key:"maxx1_gtw",mc:"VMI Maxx1",rc:"ULTIMA SPORT",sz:"185/65R15",pm:"Green Tyre Weight",unit:"kg",target:8.50,usl:8.70,lsl:8.30,mean:8.50,sigma:0.030,pattern:"ok",n:5,groups:20,covN:325,shifts:["A","B","C"]},
  {key:"press12_cure",mc:"Press-12",rc:"ULTIMA SPORT",sz:"175/15",pm:"Cure Time",unit:"min",target:14.0,usl:14.6,lsl:13.4,mean:14.0,sigma:0.14,pattern:"ok",n:5,groups:20,covN:175,shifts:["A","B"]},
  {key:"uf01_rfv",mc:"UF-01",rc:"ULTIMA NEO",sz:"145/13",pm:"RFV",unit:"N",target:45,usl:55,lsl:35,mean:45.4,sigma:2.6,pattern:"ok",n:5,groups:20,covN:295,shifts:["A","B","C"]},
  {key:"cal1_gauge",mc:"Calender-1",rc:"All recipes",sz:"All",pm:"Innerliner Gauge",unit:"mm",target:1.20,usl:1.30,lsl:1.10,mean:1.20,sigma:0.017,pattern:"ok",n:5,groups:20,covN:360,shifts:["A","B","C"]},
  {key:"exx_splice",mc:"VMI Exxium",rc:"ULTIMA SPORT",sz:"185/65R15",pm:"Ply Splice Overlap",unit:"mm",target:3.0,usl:4.0,lsl:2.0,mean:3.0,sigma:0.30,pattern:"hug",n:5,groups:20,covN:310,shifts:["A","B","C"]}
];

function _spcSeed(str){let s=0;for(const ch of str)s=(s*31+ch.charCodeAt(0))>>>0;return s||1;}
function _spcCompute(p){
  const K=SPC_CONST[p.n]||SPC_CONST[5];
  let seed=_spcSeed(p.key);
  const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
  const gauss=()=>{let u=0,v=0;while(u===0)u=rnd();while(v===0)v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  const subs=[],allX=[];
  for(let g=0;g<p.groups;g++){
    let mu=p.mean;
    if(p.pattern==="shift"&&g>=p.shiftAt)mu+=p.shiftBy;
    if(p.pattern==="trend")mu+=p.trendBy*g;
    if(p.pattern==="demo"&&p.demoOffsets)mu+=p.demoOffsets[g]||0;
    const row=[];
    for(let j=0;j<p.n;j++){
      let sg=p.sigma;
      if(p.pattern==="hug")sg=p.sigma*0.42;
      row.push(mu+gauss()*sg);allX.push(row[row.length-1]);
    }
    subs.push(row);
  }
  const xbar=subs.map(r=>r.reduce((a,b)=>a+b,0)/r.length);
  const R=subs.map(r=>Math.max(...r)-Math.min(...r));
  const Xbb=xbar.reduce((a,b)=>a+b,0)/xbar.length;
  const Rbar=R.reduce((a,b)=>a+b,0)/R.length;
  const uclX=Xbb+K.A2*Rbar,lclX=Xbb-K.A2*Rbar;
  const uclR=K.D4*Rbar,lclR=K.D3*Rbar;
  const sigWithin=Rbar/K.d2;
  const meanAll=allX.reduce((a,b)=>a+b,0)/allX.length;
  const sigOverall=Math.sqrt(allX.reduce((a,b)=>a+(b-meanAll)*(b-meanAll),0)/(allX.length-1));
  const cp=(p.usl-p.lsl)/(6*sigWithin);
  const cpk=Math.min(p.usl-Xbb,Xbb-p.lsl)/(3*sigWithin);
  const pp=(p.usl-p.lsl)/(6*sigOverall);
  const ppk=Math.min(p.usl-meanAll,meanAll-p.lsl)/(3*sigOverall);
  const ppm=((1-_normCdf((p.usl-meanAll)/sigOverall))+_normCdf((p.lsl-meanAll)/sigOverall))*1e6;
  const sigmaLevel=cpk*3;
  const cs=(uclX-Xbb)/3;
  const z=xbar.map(v=>(v-Xbb)/cs);
  const rules=_spcNelson(z);
  const flagged=[...new Set(rules.flatMap(r=>r.pts))].sort((a,b)=>a-b);
  const covOK=p.covN>=300&&p.shifts.length>=3;
  const hist=_spcHist(allX,p.lsl,p.usl,meanAll,sigOverall);
  const inControl=rules.filter(r=>r.hit).length===0;
  const status=!inControl?"Red":(cpk<1.0?"Red":cpk<1.33?"Yellow":"Green");
  return {subs,xbar,R,Xbb,Rbar,uclX,lclX,uclR,lclR,cs,sigWithin,sigOverall,meanAll,cp,cpk,pp,ppk,ppm,sigmaLevel,rules,flagged,covOK,hist,inControl,status};
}
function _spcNelson(z){
  const n=z.length,sign=v=>v>0?1:v<0?-1:0;
  const mk=(id,name,mean,pts)=>({id,name,mean,hit:pts.length>0,pts});
  let r1=[];for(let i=0;i<n;i++)if(Math.abs(z[i])>3)r1.push(i);
  let r2=[];{let run=1;for(let i=1;i<n;i++){if(sign(z[i])!==0&&sign(z[i])===sign(z[i-1]))run++;else run=1;if(run>=9)for(let k=i-8;k<=i;k++)if(!r2.includes(k))r2.push(k);}}
  let r3=[];{let inc=1,dec=1;for(let i=1;i<n;i++){if(z[i]>z[i-1]){inc++;dec=1;}else if(z[i]<z[i-1]){dec++;inc=1;}else{inc=1;dec=1;}if(inc>=6||dec>=6)for(let k=i-5;k<=i;k++)if(!r3.includes(k))r3.push(k);}}
  let r4=[];{let run=1;for(let i=2;i<n;i++){const d=z[i]-z[i-1],dp=z[i-1]-z[i-2];if(d*dp<0)run++;else run=1;if(run>=13)for(let k=i-13;k<=i;k++)if(k>=0&&!r4.includes(k))r4.push(k);}}
  let r5=[];for(let i=2;i<n;i++){[1,-1].forEach(s=>{const w=[i-2,i-1,i],c=w.filter(k=>s>0?z[k]>2:z[k]<-2).length;if(c>=2)w.forEach(k=>{if((s>0?z[k]>2:z[k]<-2)&&!r5.includes(k))r5.push(k);});});}
  let r6=[];for(let i=4;i<n;i++){[1,-1].forEach(s=>{const w=[i-4,i-3,i-2,i-1,i],c=w.filter(k=>s>0?z[k]>1:z[k]<-1).length;if(c>=4)w.forEach(k=>{if((s>0?z[k]>1:z[k]<-1)&&!r6.includes(k))r6.push(k);});});}
  let r7=[];{let run=0;for(let i=0;i<n;i++){if(Math.abs(z[i])<1)run++;else run=0;if(run>=15)for(let k=i-14;k<=i;k++)if(!r7.includes(k))r7.push(k);}}
  let r8=[];{let run=0;for(let i=0;i<n;i++){if(Math.abs(z[i])>1)run++;else run=0;if(run>=8)for(let k=i-7;k<=i;k++)if(!r8.includes(k))r8.push(k);}}
  return [
    mk(1,"1 point beyond 3σ","Special cause — sudden shift / outlier",r1),
    mk(2,"9 points same side of centre","Sustained mean shift",r2),
    mk(3,"6 points steadily rising / falling","Trend — tool wear or drift",r3),
    mk(4,"14 points alternating up / down","Over-adjustment or two data streams",r4),
    mk(5,"2 of 3 beyond 2σ (same side)","Early shift warning",r5),
    mk(6,"4 of 5 beyond 1σ (same side)","Small sustained shift",r6),
    mk(7,"15 points within 1σ","Too little variation — check gauge / data",r7),
    mk(8,"8 points beyond 1σ (both sides)","Mixture / stratification",r8)
  ];
}
function _spcHist(vals,lsl,usl,mu,sig){
  const lo=Math.min(lsl,mu-4*sig,Math.min(...vals)),hi=Math.max(usl,mu+4*sig,Math.max(...vals));
  const nb=13,w=(hi-lo)/nb;
  const bins=Array.from({length:nb},(_,i)=>({x0:lo+i*w,x1:lo+(i+1)*w,c:0}));
  vals.forEach(v=>{let idx=Math.floor((v-lo)/w);if(idx<0)idx=0;if(idx>=nb)idx=nb-1;bins[idx].c++;});
  return {lo,hi,w,bins,nb,mu,sig,lsl,usl,total:vals.length};
}
function _spcFmt(v){const a=Math.abs(v);const d=a<2?3:a<20?2:a<200?1:0;return (Math.round(v*Math.pow(10,d))/Math.pow(10,d)).toLocaleString("en-IN");}

function _SpcTile({label,val,sub,col,onTrend,onClick,active}){return(<div onClick={onClick} title={onClick?"Click to filter":undefined} style={{flex:1,minWidth:118,background:active?(col||C.ac)+"12":C.cd,border:"1px solid "+(active?(col||C.ac):C.bd),outline:active?"1px solid "+(col||C.ac):"none",borderRadius:8,padding:"9px 11px",position:"relative",cursor:onClick?"pointer":"default"}}>{onTrend&&<button onClick={onTrend} title="Daily trend (this month)" style={{position:"absolute",top:7,right:7,width:20,height:20,borderRadius:4,border:"1px solid "+C.bd,background:C.c2,color:C.mu,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}><TrendIcon size={11}/></button>}<div style={{fontSize:10.5,color:C.mu,fontWeight:600,textTransform:"uppercase",letterSpacing:".3px"}}>{label}</div><div style={{fontSize:19,fontWeight:700,color:col||C.tx,marginTop:2}}>{val}</div>{sub&&<div style={{fontSize:10.5,color:C.mu,marginTop:1}}>{sub}</div>}</div>);}

function _SpcMini({s}){
  const W=280,H=64,padL=6,padR=6,padT=6,padB=6;
  const pw=W-padL-padR,ph=H-padT-padB;
  const lo=Math.min(s.lclX,Math.min(...s.xbar)),hi=Math.max(s.uclX,Math.max(...s.xbar)),pad=(hi-lo)*0.15||1;
  const X=i=>padL+(i/(s.xbar.length-1))*pw,Y=v=>padT+ph-((v-(lo-pad))/((hi+pad)-(lo-pad)))*ph;
  const fl=new Set(s.flagged);
  return(<svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",marginTop:6}}>
    <line x1={padL} y1={Y(s.uclX)} x2={W-padR} y2={Y(s.uclX)} stroke={C.rd} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.7"/>
    <line x1={padL} y1={Y(s.lclX)} x2={W-padR} y2={Y(s.lclX)} stroke={C.rd} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.7"/>
    <line x1={padL} y1={Y(s.Xbb)} x2={W-padR} y2={Y(s.Xbb)} stroke={C.gn} strokeWidth="0.8" opacity="0.7"/>
    <polyline points={s.xbar.map((v,i)=>X(i)+","+Y(v)).join(" ")} fill="none" stroke={C.bl} strokeWidth="1.4"/>
    {s.xbar.map((v,i)=>{const bad=fl.has(i);return(<circle key={i} cx={X(i)} cy={Y(v)} r={bad?2.6:1.6} fill={bad?C.rd:C.bl}/>);})}
  </svg>);
}

function SPCOverview({onSelect}){
  const [fMachine,setFMachine]=useState("All");
  const [fSize,setFSize]=useState("All");
  const [expand,setExpand]=useState(null);
  const all=SPC_PARAMS.map(p=>({p,s:_spcCompute(p)}));
  const machines=["All",...[...new Set(SPC_PARAMS.map(p=>p.mc))]];
  const sizes=["All",...[...new Set(SPC_PARAMS.map(p=>p.sz))]];
  const rank={Red:0,Yellow:1,Green:2};
  const rows=all.filter(({p})=>(fMachine==="All"||p.mc===fMachine)&&(fSize==="All"||p.sz===fSize))
    .sort((a,b)=>(rank[a.s.status]-rank[b.s.status])||(a.s.cpk-b.s.cpk));
  const nOOC=rows.filter(r=>!r.s.inControl).length;
  const nIncap=rows.filter(r=>r.s.cpk<1.33).length;
  const nOK=rows.filter(r=>r.s.status==="Green").length;
  const filtered=fMachine!=="All"||fSize!=="All";
  const sel={padding:"5px 10px",borderRadius:6,border:"1px solid "+C.bd,background:C.cd,color:C.tx,fontSize:12.5,fontWeight:600,cursor:"pointer"};
  const CATS={
    all:{label:"All processes under SPC",list:rows,col:C.tx},
    ooc:{label:"Out of control — special cause present",list:rows.filter(r=>!r.s.inControl),col:C.rd},
    incap:{label:"Not capable — Cpk < 1.33",list:rows.filter(r=>r.s.cpk<1.33),col:C.am},
    ok:{label:"Stable & capable — in control, Cpk ≥ 1.33",list:rows.filter(r=>r.s.status==="Green"),col:C.gn}
  };
  const cat=expand?CATS[expand]:null;
  const catRows=cat?cat.list:rows;
  const cc=v=>v<1.0?C.rd:v<1.33?C.am:C.gn;
  const tog=k=>()=>setExpand(expand===k?null:k);
  return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {_SpcTile({label:filtered?"Processes (filtered)":"Processes",val:rows.length,sub:"under SPC",col:C.tx,onClick:tog("all"),active:expand==="all"})}
      {_SpcTile({label:"Out of control",val:nOOC,sub:"special cause present",col:nOOC?C.rd:C.gn,onClick:tog("ooc"),active:expand==="ooc"})}
      {_SpcTile({label:"Not capable",val:nIncap,sub:"Cpk < 1.33",col:nIncap?C.am:C.gn,onClick:tog("incap"),active:expand==="incap"})}
      {_SpcTile({label:"Stable & capable",val:nOK,sub:"in control, Cpk ≥ 1.33",col:C.gn,onClick:tog("ok"),active:expand==="ok"})}
    </div>
    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",padding:"8px 10px",background:C.c2,borderRadius:8,border:"1px solid "+C.bd}}>
      <span style={{fontSize:11,color:C.mu,fontWeight:700,textTransform:"uppercase",letterSpacing:".3px"}}>Filter</span>
      <label style={{fontSize:12,color:C.mu,display:"flex",alignItems:"center",gap:5}}>{"Machine "}
        <select value={fMachine} onChange={e=>setFMachine(e.target.value)} style={sel}>{machines.map(m=>(<option key={m} value={m}>{m}</option>))}</select></label>
      <label style={{fontSize:12,color:C.mu,display:"flex",alignItems:"center",gap:5}}>{"Size / Item "}
        <select value={fSize} onChange={e=>setFSize(e.target.value)} style={sel}>{sizes.map(z=>(<option key={z} value={z}>{z}</option>))}</select></label>
      {cat&&<span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:999,background:cat.col+"15",border:"1px solid "+cat.col+"44",color:cat.col,fontSize:11.5,fontWeight:700}}>{cat.label}<span onClick={()=>setExpand(null)} title="Clear category" style={{cursor:"pointer",fontSize:13,lineHeight:1}}>{"✕"}</span></span>}
      {(filtered||cat)&&<button onClick={()=>{setFMachine("All");setFSize("All");setExpand(null);}} style={{...sel,color:C.pp,fontWeight:700}}>{"Clear"}</button>}
      <span style={{marginLeft:"auto",fontSize:11.5,color:C.mu}}>{"Showing "+catRows.length+" of "+all.length+" charts"}</span>
    </div>
    <div style={{fontSize:12,color:C.mu}}>{"Each card is one control chart — a single machine × recipe × parameter with its own limits. Click a tile above to show only that category. Sorted worst-first — click a card for its control chart, capability and rule analysis."}</div>
    {catRows.length===0
      ? <div style={{padding:"28px 16px",textAlign:"center",color:C.mu,fontSize:13,background:C.cd,border:"1px dashed "+C.bd,borderRadius:10}}>{cat?"No processes in this category.":"No control charts for this machine × size combination."}</div>
      : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
      {catRows.map(({p,s})=>{const col=s.status==="Red"?C.rd:s.status==="Yellow"?C.am:C.gn;return(
        <div key={p.key} onClick={()=>onSelect(p.key)} style={{cursor:"pointer",background:C.cd,border:"1px solid "+C.bd,borderLeft:"3px solid "+col,borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
            <div><div style={{fontSize:14,fontWeight:700,color:C.tx}}>{p.pm}</div><div style={{fontSize:11.5,color:C.mu}}>{p.mc+" · "+(p.rc&&p.rc!=="All recipes"?p.rc+" ":"")+p.sz}</div></div>
            <StatusPill status={s.status}/>
          </div>
          {_SpcMini({s})}
          <div style={{display:"flex",gap:10,marginTop:6,fontSize:11.5,alignItems:"center"}}>
            <span style={{color:C.mu}}>{"Cp "}<b style={{color:s.cp<1.0?C.rd:s.cp<1.33?C.am:C.gn}}>{s.cp.toFixed(2)}</b></span>
            <span style={{color:C.mu}}>{"Cpk "}<b style={{color:s.cpk<1.0?C.rd:s.cpk<1.33?C.am:C.gn}}>{s.cpk.toFixed(2)}</b></span>
            {s.inControl?<span style={{color:C.gn,fontWeight:600}}>In control</span>:<span style={{color:C.rd,fontWeight:700}}>Out of control</span>}
          </div>
        </div>);})}
    </div>}
  </div>);
}

function _XbarChart({s,p}){
  const W=720,H=250,padL=50,padR=70,padT=16,padB=26;
  const pw=W-padL-padR,ph=H-padT-padB;
  const fl=new Set(s.flagged);
  const lo0=Math.min(s.lclX,Math.min(...s.xbar)),hi0=Math.max(s.uclX,Math.max(...s.xbar)),pad=(hi0-lo0)*0.14||1,lo=lo0-pad,hi=hi0+pad;
  const X=i=>padL+(i/(s.xbar.length-1))*pw,Y=v=>padT+ph-((v-lo)/(hi-lo))*ph;
  const CL=s.Xbb,cs=s.cs;const zy=k=>Y(CL+k*cs);
  const inRange=v=>v>=lo&&v<=hi;
  return(<svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto"}}>
    <rect x={padL} y={zy(1)} width={pw} height={Math.max(zy(-1)-zy(1),0)} fill={C.gn} opacity="0.05"/>
    <rect x={padL} y={zy(2)} width={pw} height={Math.max(zy(1)-zy(2),0)} fill={C.am} opacity="0.05"/>
    <rect x={padL} y={zy(-1)} width={pw} height={Math.max(zy(-2)-zy(-1),0)} fill={C.am} opacity="0.05"/>
    <rect x={padL} y={zy(3)} width={pw} height={Math.max(zy(2)-zy(3),0)} fill={C.rd} opacity="0.05"/>
    <rect x={padL} y={zy(-2)} width={pw} height={Math.max(zy(-3)-zy(-2),0)} fill={C.rd} opacity="0.05"/>
    {[-2,-1,1,2].map((k,i)=>(<line key={i} x1={padL} y1={zy(k)} x2={padL+pw} y2={zy(k)} stroke={C.bd} strokeWidth="0.6" strokeDasharray="1 3"/>))}
    <line x1={padL} y1={Y(s.uclX)} x2={padL+pw} y2={Y(s.uclX)} stroke={C.rd} strokeWidth="1.3" strokeDasharray="6 3"/>
    <line x1={padL} y1={Y(s.lclX)} x2={padL+pw} y2={Y(s.lclX)} stroke={C.rd} strokeWidth="1.3" strokeDasharray="6 3"/>
    <line x1={padL} y1={Y(CL)} x2={padL+pw} y2={Y(CL)} stroke={C.gn} strokeWidth="1.4"/>
    {inRange(p.target)&&<line x1={padL} y1={Y(p.target)} x2={padL+pw} y2={Y(p.target)} stroke={C.bl} strokeWidth="1" strokeDasharray="2 3" opacity="0.7"/>}
    <text x={padL+pw+4} y={Y(s.uclX)+3} fontSize="9.5" fill={C.rd}>{"UCL "+_spcFmt(s.uclX)}</text>
    <text x={padL+pw+4} y={Y(CL)+3} fontSize="9.5" fill={C.gn}>{"CL "+_spcFmt(CL)}</text>
    <text x={padL+pw+4} y={Y(s.lclX)+3} fontSize="9.5" fill={C.rd}>{"LCL "+_spcFmt(s.lclX)}</text>
    {[-3,-2,-1,1,2,3].map((k,i)=>(<text key={i} x={padL-6} y={zy(k)+3} fontSize="8" fill={C.mu} textAnchor="end">{(k>0?"+":"")+k+"σ"}</text>))}
    <polyline points={s.xbar.map((v,i)=>X(i)+","+Y(v)).join(" ")} fill="none" stroke={C.bl} strokeWidth="2" strokeLinejoin="round"/>
    {s.xbar.map((v,i)=>{const bad=fl.has(i);return(<circle key={i} cx={X(i)} cy={Y(v)} r={bad?4.5:3} fill={bad?C.rd:C.bl} stroke={bad?"#fff":"none"} strokeWidth={bad?1.4:0}/>);})}
    {s.xbar.map((v,i)=>(i%2===0?<text key={i} x={X(i)} y={H-8} fontSize="8.5" fill={C.mu} textAnchor="middle">{i+1}</text>:null))}
  </svg>);
}
function _RChart({s}){
  const W=720,H=170,padL=50,padR=70,padT=14,padB=24;
  const pw=W-padL-padR,ph=H-padT-padB;
  const hi=Math.max(s.uclR,Math.max(...s.R))*1.12||1;
  const X=i=>padL+(i/(s.R.length-1))*pw,Y=v=>padT+ph-(v/hi)*ph;
  return(<svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto"}}>
    <line x1={padL} y1={Y(s.uclR)} x2={padL+pw} y2={Y(s.uclR)} stroke={C.rd} strokeWidth="1.3" strokeDasharray="6 3"/>
    <line x1={padL} y1={Y(s.Rbar)} x2={padL+pw} y2={Y(s.Rbar)} stroke={C.gn} strokeWidth="1.4"/>
    {s.lclR>0&&<line x1={padL} y1={Y(s.lclR)} x2={padL+pw} y2={Y(s.lclR)} stroke={C.rd} strokeWidth="1.3" strokeDasharray="6 3"/>}
    <text x={padL+pw+4} y={Y(s.uclR)+3} fontSize="9.5" fill={C.rd}>{"UCL "+_spcFmt(s.uclR)}</text>
    <text x={padL+pw+4} y={Y(s.Rbar)+3} fontSize="9.5" fill={C.gn}>{"R̄ "+_spcFmt(s.Rbar)}</text>
    <polyline points={s.R.map((v,i)=>X(i)+","+Y(v)).join(" ")} fill="none" stroke={C.pp} strokeWidth="2" strokeLinejoin="round"/>
    {s.R.map((v,i)=>{const bad=v>s.uclR||v<s.lclR;return(<circle key={i} cx={X(i)} cy={Y(v)} r={bad?4.5:3} fill={bad?C.rd:C.pp} stroke={bad?"#fff":"none"} strokeWidth={bad?1.4:0}/>);})}
    {s.R.map((v,i)=>(i%2===0?<text key={i} x={X(i)} y={H-8} fontSize="8.5" fill={C.mu} textAnchor="middle">{i+1}</text>:null))}
  </svg>);
}
function _CapHist({s,p}){
  const h=s.hist;const W=720,H=250,padL=42,padR=16,padT=20,padB=40;
  const pw=W-padL-padR,ph=H-padT-padB;
  const total=h.total,w=h.w;
  const expAt=x=>total*w*Math.exp(-(x-h.mu)*(x-h.mu)/(2*h.sig*h.sig))/(h.sig*Math.sqrt(2*Math.PI));
  const maxC=Math.max(...h.bins.map(b=>b.c),expAt(h.mu));
  const X=v=>padL+((v-h.lo)/(h.hi-h.lo))*pw,Y=c=>padT+ph-(c/maxC)*ph;
  const curve=[];for(let i=0;i<=60;i++){const x=h.lo+(h.hi-h.lo)*i/60;curve.push(X(x)+","+Y(expAt(x)));}
  return(<svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto"}}>
    {h.bins.map((b,i)=>{const oos=b.x1<=h.lsl||b.x0>=h.usl;const x=X(b.x0),bw=X(b.x1)-X(b.x0);return(<rect key={i} x={x+0.5} y={Y(b.c)} width={Math.max(bw-1,1)} height={padT+ph-Y(b.c)} fill={oos?C.rd:C.bl} opacity={oos?0.8:0.5}/>);})}
    <polyline points={curve.join(" ")} fill="none" stroke={C.tx} strokeWidth="1.6"/>
    <line x1={X(h.lsl)} y1={padT} x2={X(h.lsl)} y2={padT+ph} stroke={C.rd} strokeWidth="1.6"/>
    <line x1={X(h.usl)} y1={padT} x2={X(h.usl)} y2={padT+ph} stroke={C.rd} strokeWidth="1.6"/>
    <line x1={X(p.target)} y1={padT} x2={X(p.target)} y2={padT+ph} stroke={C.gn} strokeWidth="1.4" strokeDasharray="4 3"/>
    <text x={X(h.lsl)} y={padT-6} fontSize="9.5" fill={C.rd} textAnchor="middle">{"LSL "+_spcFmt(h.lsl)}</text>
    <text x={X(h.usl)} y={padT-6} fontSize="9.5" fill={C.rd} textAnchor="middle">{"USL "+_spcFmt(h.usl)}</text>
    <text x={X(p.target)} y={H-6} fontSize="9" fill={C.gn} textAnchor="middle">{"Target "+_spcFmt(p.target)}</text>
    <text x={X(s.meanAll)} y={H-6} fontSize="9" fill={C.bl} textAnchor="middle">{"x̄ "+_spcFmt(s.meanAll)}</text>
  </svg>);
}
function _capSp(seed,cur){let s=seed||1;const r=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;};const a=[];let v=cur*0.9;for(let i=0;i<6;i++){v+=(cur-v)*0.32+(r()-0.5)*cur*0.05;a.push(Math.max(0,+v.toFixed(3)));}a[a.length-1]=+cur.toFixed(3);return a;}
const NELSON=[
  {id:1,short:"1 point beyond 3σ",marker:"stop",sev:"Out of Control",desc:"One point falls outside the 3σ control limits — a strong signal of a special cause (sudden shift or outlier)."},
  {id:2,short:"9 points same side of centre",marker:"box",sev:"Shift Detected",desc:"Nine points in a row on one side of the centre line. Indicates a sustained shift in the process mean."},
  {id:3,short:"6 points steadily rising / falling",marker:"box",sev:"Trend",desc:"Six points in a row continuously increasing or decreasing — a trend, typically tool wear or gradual drift."},
  {id:4,short:"14 points alternating up / down",marker:"box",sev:"Oscillation",desc:"Fourteen points alternating up and down — suggests over-adjustment (tampering) or two data streams mixed."},
  {id:5,short:"2 of 3 beyond 2σ (same side)",marker:"tri",sev:"Warning",desc:"Two of three consecutive points beyond 2σ on the same side — an early warning of a developing shift."},
  {id:6,short:"4 of 5 beyond 1σ (same side)",marker:"tri",sev:"Warning",desc:"Four of five consecutive points beyond 1σ on the same side — a small but sustained shift."},
  {id:7,short:"15 points within 1σ",marker:"box",sev:"Stratification",desc:"Fifteen points in a row within 1σ of centre — unusually low variation, often a measurement / data problem."},
  {id:8,short:"8 points beyond 1σ (both sides)",marker:"tri",sev:"Oscillation",desc:"Eight points in a row beyond 1σ on both sides, avoiding the centre — indicates mixture or stratification."}
];
function _ruleDemoData(id){
  switch(id){
    case 1:return {pts:[50,45,54,48,52,47,53,49,51,96,50,48,52,46,54],hi:[9]};
    case 2:return {pts:[50,58,61,60,64,59,66,62,63,60,58,62],hi:[1,2,3,4,5,6,7,8,9,10,11]};
    case 3:return {pts:[30,33,38,43,48,53,58,63,60],hi:[2,3,4,5,6,7]};
    case 4:return {pts:[40,60,42,58,44,56,43,57,41,59,42,58,44,56],hi:[0,1,2,3,4,5,6,7,8,9,10,11,12,13]};
    case 5:return {pts:[50,48,52,80,50,82,49,51,50],hi:[3,5]};
    case 6:return {pts:[50,68,66,71,64,50,52,49],hi:[1,2,3,4]};
    case 7:return {pts:[50,52,48,51,49,53,47,50,52,48,51,49,53,47,50],hi:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]};
    case 8:return {pts:[70,32,68,34,72,30,66,36,70,33],hi:[0,1,2,3,4,5,6,7,8,9]};
    default:return {pts:[50,50,50],hi:[]};
  }
}
function _RuleMiniChart({id,w,h}){
  const d=_ruleDemoData(id);const padX=6,padY=8;const pw=w-padX*2,ph=h-padY*2;
  const X=i=>padX+(d.pts.length<=1?pw/2:i*(pw/(d.pts.length-1)));
  const Y=v=>padY+ph-(v/100)*ph;
  const hi=new Set(d.hi);
  return(<svg viewBox={"0 0 "+w+" "+h} style={{width:w,height:h}}>
    <line x1={padX} y1={Y(83)} x2={w-padX} y2={Y(83)} stroke={C.rd} strokeWidth="0.8"/>
    <line x1={padX} y1={Y(50)} x2={w-padX} y2={Y(50)} stroke={C.mu} strokeWidth="0.7"/>
    <line x1={padX} y1={Y(17)} x2={w-padX} y2={Y(17)} stroke={C.rd} strokeWidth="0.8"/>
    <polyline points={d.pts.map((v,i)=>X(i)+","+Y(v)).join(" ")} fill="none" stroke={C.bl} strokeWidth="1.2"/>
    {d.pts.map((v,i)=>{const b=hi.has(i);return(<circle key={i} cx={X(i)} cy={Y(v)} r={b?2.6:1.5} fill={b?C.rd:C.bl}/>);})}
  </svg>);
}

function DraggableWindow({title,accent,onClose,initial,width,z,children}){
  const [pos,setPos]=useState(initial);
  const onDown=e=>{
    const sx=e.clientX,sy=e.clientY,ox=pos.x,oy=pos.y;
    const mv=ev=>setPos({x:ox+(ev.clientX-sx),y:oy+(ev.clientY-sy)});
    const up=()=>{window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);};
    window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);
    e.preventDefault();
  };
  return(<div style={{position:"absolute",left:pos.x,top:pos.y,width:width,zIndex:z||20,background:C.cd,border:"1px solid "+C.bd,borderRadius:8,boxShadow:"0 12px 34px rgba(0,0,0,.22)",overflow:"hidden"}}>
    <div onMouseDown={onDown} style={{cursor:"move",background:accent,color:"#fff",padding:"7px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12.5,fontWeight:700,userSelect:"none"}}>
      <span>{title}</span>
      <span onMouseDown={e=>e.stopPropagation()} onClick={onClose} title="Close" style={{cursor:"pointer",fontSize:15,lineHeight:1,padding:"0 2px",opacity:.9}}>{"✕"}</span>
    </div>
    <div style={{maxHeight:360,overflow:"auto"}}>{children}</div>
  </div>);
}

function SpcRuleWorkstation({s,p}){
  const [enabled,setEnabled]=useState(NELSON.map(()=>true));
  const [selRule,setSelRule]=useState(1);
  const [hover,setHover]=useState(null);
  const [showConfig,setShowConfig]=useState(false);
  const [showFeed,setShowFeed]=useState(false);
  const ruleHit={};s.rules.forEach(r=>{ruleHit[r.id]=r.pts;});
  const clock=i=>{const m=6*60+i*36;return String(Math.floor(m/60)%24).padStart(2,"0")+":"+String(m%60).padStart(2,"0");};
  const alerts=s.rules.filter(r=>r.hit&&enabled[r.id-1]).map(r=>({id:r.id,sev:NELSON[r.id-1].sev,marker:NELSON[r.id-1].marker,pts:r.pts,time:clock(r.pts[r.pts.length-1])}));
  const W=760,H=364,padL=48,padR=72,padT=62,padB=32;
  const pw=W-padL-padR,ph=H-padT-padB;
  const xb=s.xbar,n=xb.length;
  const lo0=Math.min(s.lclX,Math.min(...xb)),hi0=Math.max(s.uclX,Math.max(...xb)),pad=(hi0-lo0)*0.16||1,lo=lo0-pad,hi=hi0+pad;
  const X=i=>padL+(n<=1?pw/2:i*(pw/(n-1)));
  const Y=v=>padT+ph-((v-lo)/(hi-lo))*ph;
  const oct=(cx,cy,r)=>{let a="";for(let k=0;k<8;k++){const ang=Math.PI/8+k*(Math.PI/4);a+=(cx+r*Math.cos(ang)).toFixed(1)+","+(cy+r*Math.sin(ang)).toFixed(1)+" ";}return a.trim();};
  const ptMark={};
  NELSON.forEach(r=>{if(r.marker!=="box"&&enabled[r.id-1]&&ruleHit[r.id]&&ruleHit[r.id].length){let peak=ruleHit[r.id][0];ruleHit[r.id].forEach(i=>{if(Math.abs(xb[i]-s.Xbb)>Math.abs(xb[peak]-s.Xbb))peak=i;});if(!ptMark[peak])ptMark[peak]={type:r.marker,ids:[]};if(r.marker==="stop")ptMark[peak].type="stop";ptMark[peak].ids.push(r.id);}});
  const boxes=NELSON.filter(r=>r.marker==="box"&&enabled[r.id-1]&&ruleHit[r.id]&&ruleHit[r.id].length).map(r=>({id:r.id,a:Math.min(...ruleHit[r.id]),b:Math.max(...ruleHit[r.id])}));
  const iconBtn=(on)=>({width:30,height:28,borderRadius:6,border:"1px solid "+(on?C.pp:C.bd),background:on?C.pp+"18":C.cd,color:on?C.pp:C.mu,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,position:"relative"});
  const ConfigBody=(<div style={{padding:10}}>
    {NELSON.map((r,i)=>{const on=enabled[i];const sel=selRule===r.id;return(
      <div key={r.id} onClick={()=>setSelRule(r.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 6px",borderRadius:6,cursor:"pointer",background:sel?C.bl+"14":"transparent",marginBottom:2}}>
        <input type="checkbox" checked={on} onChange={e=>{e.stopPropagation();setEnabled(a=>a.map((v,j)=>j===i?!v:v));}} onClick={e=>e.stopPropagation()} style={{cursor:"pointer"}}/>
        <span style={{flex:1,fontSize:11.5,fontWeight:sel?700:500,color:on?C.tx:C.mu}}>{"R"+r.id+" — "+r.short}</span>
        <span style={{border:"1px solid "+C.bd,borderRadius:4,background:C.c2,padding:1}}>{_RuleMiniChart({id:r.id,w:64,h:24})}</span>
      </div>);})}
    <div style={{borderTop:"1px solid "+C.bd,marginTop:8,paddingTop:8}}>
      <div style={{fontSize:12.5,fontWeight:700,color:C.tx,marginBottom:3}}>{"Rule Demonstration"}</div>
      <div style={{fontSize:12.5,fontWeight:700,color:C.bl,marginBottom:3}}>{"Rule "+selRule+": "+NELSON[selRule-1].short}</div>
      <div style={{fontSize:11.5,color:C.md,lineHeight:1.55,marginBottom:6}}>{NELSON[selRule-1].desc}</div>
      <div style={{background:C.c2,border:"1px solid "+C.bd,borderRadius:6,padding:5,display:"inline-block"}}>{_RuleMiniChart({id:selRule,w:230,h:110})}</div>
      <div style={{fontSize:10.5,color:C.mu,marginTop:5}}>{"Red points show the pattern. Uncheck a rule to stop it flagging & alerting."}</div>
    </div>
  </div>);
  const FeedBody=(<div style={{padding:10}}>
    {alerts.length===0
      ? <div style={{padding:"6px 2px",fontSize:12,color:C.gn,fontWeight:600}}>{"✓ No active alerts — all enabled rules pass."}</div>
      : <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {alerts.map((a,i)=>{const col=a.marker==="tri"?C.am:C.rd;const ptStr=a.pts.length>1?(a.pts[0]+1)+"–"+(a.pts[a.pts.length-1]+1):(a.pts[0]+1);return(
          <div key={i} style={{display:"flex",gap:9,alignItems:"center",padding:"7px 9px",border:"1px solid "+col+"44",borderLeft:"3px solid "+col,borderRadius:6,background:col+"0C"}}>
            <span style={{minWidth:24,height:24,borderRadius:"50%",background:col,color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{"R"+a.id}</span>
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:C.tx}}>{a.sev+" (Pt "+ptStr+")"}</div><div style={{fontSize:11,color:C.mu}}>{a.time}</div></div>
          </div>);})}
      </div>}
    <div style={{fontSize:10.5,color:C.mu,marginTop:8}}>{"Live — alerts appear as enabled rules are breached above."}</div>
  </div>);
  return(<Card title={"Interactive Process Control — X̄ Chart with Nelson Rules ("+p.unit+")"} accent={C.pp}>
    <div style={{position:"relative",minHeight:410,background:C.c2,borderRadius:8,border:"1px solid "+C.bd,padding:"8px 6px",overflow:"hidden"}}>
      <div style={{position:"absolute",top:8,right:10,display:"flex",gap:6,zIndex:15}}>
        <button onClick={()=>setShowConfig(v=>!v)} title="Nelson Rules Configuration & Demo" style={iconBtn(showConfig)}>{"⚙"}</button>
        <button onClick={()=>setShowFeed(v=>!v)} title="Nelson Rule Alert Feed" style={iconBtn(showFeed)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
          {alerts.length>0&&<span style={{position:"absolute",top:-5,right:-5,minWidth:15,height:15,borderRadius:"50%",background:C.rd,color:"#fff",fontSize:9.5,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 2px"}}>{alerts.length}</span>}
        </button>
      </div>
      <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto"}}>
        {boxes.map((bx,i)=>{const x0=X(bx.a)-Math.max((X(1)-X(0))/2,7),x1=X(bx.b)+Math.max((X(1)-X(0))/2,7);const bw=Math.max(x1-x0,4);return(<g key={i}>
          <rect x={x0} y={padT} width={bw} height={ph} fill="#e01b1b" opacity="0.10" stroke="#e01b1b" strokeWidth="2"/>
          <rect x={x0-1} y={padT-21} width={30} height={18} rx="3" fill="#e01b1b"/><text x={x0+14} y={padT-8} fontSize="11" fontWeight="800" fill="#fff" textAnchor="middle">{"R"+bx.id}</text>
          <text x={x1-7} y={padT+15} fontSize="10" fontWeight="700" fill="#c01515" textAnchor="end">{"Point #"+(bx.a+1)+"–"+(bx.b+1)}</text>
        </g>);})}
        {(()=>{const zy=k=>Y(s.Xbb+k*s.cs);return(<g>
          <rect x={padL} y={zy(1)} width={pw} height={Math.max(zy(-1)-zy(1),0)} fill={C.gn} opacity="0.06"/>
          <rect x={padL} y={zy(2)} width={pw} height={Math.max(zy(1)-zy(2),0)} fill={C.am} opacity="0.05"/>
          <rect x={padL} y={zy(-1)} width={pw} height={Math.max(zy(-2)-zy(-1),0)} fill={C.am} opacity="0.05"/>
          <rect x={padL} y={zy(3)} width={pw} height={Math.max(zy(2)-zy(3),0)} fill={C.rd} opacity="0.05"/>
          <rect x={padL} y={zy(-2)} width={pw} height={Math.max(zy(-3)-zy(-2),0)} fill={C.rd} opacity="0.05"/>
          {[1,2,-1,-2].map((k,i)=>(<line key={i} x1={padL} y1={zy(k)} x2={padL+pw} y2={zy(k)} stroke={C.mu} strokeWidth="0.8" strokeDasharray="2 3" opacity="0.7"/>))}
          {[[3,"+3σ"],[2,"+2σ"],[1,"+1σ"],[-1,"−1σ"],[-2,"−2σ"],[-3,"−3σ"]].map((t,i)=>(<text key={i} x={padL-4} y={zy(t[0])+3} fontSize="8.5" fill={C.mu} textAnchor="end">{t[1]}</text>))}
        </g>);})()}
        <line x1={padL} y1={Y(s.uclX)} x2={padL+pw} y2={Y(s.uclX)} stroke={C.rd} strokeWidth="1.4"/>
        <line x1={padL} y1={Y(s.Xbb)} x2={padL+pw} y2={Y(s.Xbb)} stroke={C.md} strokeWidth="1.4"/>
        <line x1={padL} y1={Y(s.lclX)} x2={padL+pw} y2={Y(s.lclX)} stroke={C.rd} strokeWidth="1.4"/>
        <text x={padL+pw+5} y={Y(s.uclX)+3} fontSize="10" fill={C.rd} fontWeight="600">{"UCL "+_spcFmt(s.uclX)}</text>
        <text x={padL+pw+5} y={Y(s.Xbb)+3} fontSize="10" fill={C.md} fontWeight="600">{"CL "+_spcFmt(s.Xbb)}</text>
        <text x={padL+pw+5} y={Y(s.lclX)+3} fontSize="10" fill={C.rd} fontWeight="600">{"LCL "+_spcFmt(s.lclX)}</text>
        <polyline points={xb.map((v,i)=>X(i)+","+Y(v)).join(" ")} fill="none" stroke={C.bl} strokeWidth="1.8"/>
        {xb.map((v,i)=>(<circle key={i} cx={X(i)} cy={Y(v)} r="3" fill={ptMark[i]?C.rd:C.bl}/>))}
        {xb.map((v,i)=>(i%2===0?<text key={i} x={X(i)} y={H-8} fontSize="8.5" fill={C.mu} textAnchor="middle">{i+1}</text>:null))}
        {Object.keys(ptMark).map(k=>{const i=+k;const m=ptMark[i];const cx=X(i),cy=Y(xb[i]);const my=cy-32;const lbl="R"+m.ids.join("/");return(<g key={i}>
          <line x1={cx} y1={my+ (m.type==="stop"?13:10)} x2={cx} y2={cy-3} stroke={m.type==="stop"?"#e01b1b":"#c99700"} strokeWidth="1.4"/>
          <text x={cx} y={my-16} fontSize="10.5" fill={C.tx} fontWeight="700" textAnchor="middle">{"Point #"+(i+1)}</text>
          {m.type==="stop"
            ? <g><polygon points={oct(cx,my,13)} fill="#e01b1b" stroke="#fff" strokeWidth="2.2"/><text x={cx} y={my+4} fontSize="11" fontWeight="800" fill="#fff" textAnchor="middle">{lbl}</text></g>
            : <g><polygon points={(cx)+","+(my-14)+" "+(cx-14)+","+(my+11)+" "+(cx+14)+","+(my+11)} fill="#f5c518" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round"/><text x={cx} y={my+8} fontSize="10.5" fontWeight="800" fill="#3a2f00" textAnchor="middle">{lbl}</text></g>}
        </g>);})}
        {xb.map((v,i)=>(<circle key={"h"+i} cx={X(i)} cy={Y(v)} r="9" fill="transparent" style={{cursor:"pointer"}} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}/>))}
        {hover!=null&&(()=>{const cx=X(hover),cy=Y(xb[hover]);const tx=Math.min(Math.max(cx-46,padL),padL+pw-92);return(<g><rect x={tx} y={cy-40} width={92} height={30} rx="4" fill="#fff" stroke={C.bd} strokeWidth="1"/><text x={tx+8} y={cy-27} fontSize="9.5" fill={C.mu}>{"X̄ #"+(hover+1)}</text><text x={tx+8} y={cy-15} fontSize="10" fontWeight="700" fill={C.tx}>{"Value: "+_spcFmt(xb[hover])}</text></g>);})()}
      </svg>
      {showConfig&&<DraggableWindow title="Nelson Rules Configuration & Demo" accent={C.bl} onClose={()=>setShowConfig(false)} initial={{x:6,y:44}} width={340} z={22}>{ConfigBody}</DraggableWindow>}
      {showFeed&&<DraggableWindow title="Nelson Rule Alert Feed" accent={C.rd} onClose={()=>setShowFeed(false)} initial={{x:360,y:214}} width={252} z={21}>{FeedBody}</DraggableWindow>}
    </div>
    <div style={{display:"flex",gap:14,justifyContent:"center",fontSize:11,color:C.mu,padding:"8px 0 0",flexWrap:"wrap"}}>
      <span style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:12,height:12,background:C.rd,clipPath:"polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)",display:"inline-block"}}/>Out-of-control (R1)</span>
      <span style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderBottom:"11px solid "+C.am,display:"inline-block"}}/>Warning (R5/6/8)</span>
      <span style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:12,height:10,background:C.rd,opacity:.12,border:"1px solid "+C.rd,borderRadius:2,display:"inline-block"}}/>Run / trend (R2/3/4/7)</span>
      <span style={{color:C.mu}}>{"⚙ rules  ·  🔔 alerts  ·  drag a window by its title bar"}</span>
    </div>
  </Card>);
}

function SPCDetail({p,onBack}){
  const s=_spcCompute(p);
  const capCol=v=>v<1.0?C.rd:v<1.33?C.am:C.gn;
  return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <button onClick={onBack} style={{padding:"5px 12px",borderRadius:6,border:"1px solid "+C.bd,background:C.c2,color:C.pp,fontSize:12,fontWeight:600,cursor:"pointer"}}>{"‹ All processes"}</button>
      <div><div style={{fontSize:16,fontWeight:700,color:C.tx}}>{p.pm}</div><div style={{fontSize:12,color:C.mu}}>{p.mc+" · "+(p.rc&&p.rc!=="All recipes"?p.rc+" ":"")+p.sz+" · subgroups of "+p.n}</div></div>
      <span style={{marginLeft:"auto"}}><StatusPill status={s.status}/></span>
    </div>
    <div style={{padding:"9px 12px",borderRadius:8,border:"1px solid "+(s.covOK?C.gn:C.am)+"55",background:(s.covOK?C.gn:C.am)+"0E",fontSize:12.5,color:C.md}}>
      {s.covOK
        ? "✓ Capability study valid — N="+p.covN+" across shifts "+p.shifts.join("/")+" (≥300, all 3 shifts). Cp/Cpk are trustworthy."
        : "⚠ Capability provisional — N="+p.covN+", shifts "+p.shifts.join("/")+". Below the N≥300 / 3-shift gate; treat Cp/Cpk as indicative until coverage is met."}
    </div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {_SpcTile({label:"Cp",val:s.cp.toFixed(2),sub:"potential (within)",col:capCol(s.cp)})}
      {_SpcTile({label:"Cpk",val:s.cpk.toFixed(2),sub:"actual (centred)",col:capCol(s.cpk)})}
      {_SpcTile({label:"Pp",val:s.pp.toFixed(2),sub:"overall",col:capCol(s.pp)})}
      {_SpcTile({label:"Ppk",val:s.ppk.toFixed(2),sub:"overall (centred)",col:capCol(s.ppk)})}
      {_SpcTile({label:"Sigma level",val:s.sigmaLevel.toFixed(1)+"σ",sub:"process",col:capCol(s.cpk)})}
    </div>
    <SpcRuleWorkstation s={s} p={p}/>
    <Card title={"R Chart — subgroup range ("+p.unit+")"} accent={C.pp}>
      <div style={{background:C.c2,borderRadius:8,border:"1px solid "+C.bd,padding:"8px 6px"}}>{_RChart({s})}</div>
      <div style={{fontSize:11.5,color:C.mu,marginTop:6}}>{"Tracks within-subgroup spread (UCL=D₄R̄). The R chart must be in control before the X̄ chart is trusted — it separates a spread problem from a centring problem."}</div>
    </Card>
    <Card title="Process Capability — distribution vs specification" accent={C.pp}>
      <div style={{background:C.c2,borderRadius:8,border:"1px solid "+C.bd,padding:"8px 6px"}}>{_CapHist({s,p})}</div>
      <div style={{fontSize:11.5,color:C.mu,marginTop:6}}>{"Spread of individual readings against USL/LSL with the fitted normal curve. Red bars/tails fall outside spec. Cp compares spec width to process width; Cpk penalises off-centring."}</div>
    </Card>
  </div>);
}

function LiveSpcMini({chart}){
  const values=Array.isArray(chart?.values)?chart.values:[];
  if(!values.length)return <div style={{height:58,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.mu}}>No chart data</div>;
  const W=280,H=64,padL=6,padR=6,padT=6,padB=6;
  const pw=W-padL-padR,ph=H-padT-padB;
  const lo=Math.min(chart.lcl??Infinity,...values),hi=Math.max(chart.ucl??-Infinity,...values),pad=(hi-lo)*0.15||1;
  const X=i=>padL+(values.length<=1?pw/2:i*(pw/(values.length-1)));
  const Y=v=>padT+ph-((v-(lo-pad))/((hi+pad)-(lo-pad)))*ph;
  return(<svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",marginTop:6}}>
    {chart.ucl!=null&&<line x1={padL} y1={Y(chart.ucl)} x2={W-padR} y2={Y(chart.ucl)} stroke={C.rd} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.7"/>}
    {chart.lcl!=null&&<line x1={padL} y1={Y(chart.lcl)} x2={W-padR} y2={Y(chart.lcl)} stroke={C.rd} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.7"/>}
    {chart.cl!=null&&<line x1={padL} y1={Y(chart.cl)} x2={W-padR} y2={Y(chart.cl)} stroke={C.gn} strokeWidth="0.8" opacity="0.7"/>}
    <polyline points={values.map((v,i)=>X(i)+","+Y(v)).join(" ")} fill="none" stroke={C.bl} strokeWidth="1.4"/>
    {values.map((v,i)=><circle key={i} cx={X(i)} cy={Y(v)} r="1.8" fill={C.bl}/>)}
  </svg>);
}

function LiveSpcChart({title,chart,accent}){
  const points=Array.isArray(chart?.points)?chart.points:[];
  const values=points.map(p=>p.value).filter(v=>typeof v==="number");
  if(!values.length)return <Card title={title} accent={accent}><div style={{padding:18,textAlign:"center",color:C.mu,fontSize:13}}>No chart data for this selection.</div></Card>;
  const W=720,H=230,padL=48,padR=70,padT=18,padB=28;
  const pw=W-padL-padR,ph=H-padT-padB;
  const lo0=Math.min(chart.lcl??Infinity,...values),hi0=Math.max(chart.ucl??-Infinity,...values),pad=(hi0-lo0)*0.14||1,lo=lo0-pad,hi=hi0+pad;
  const X=i=>padL+(values.length<=1?pw/2:i*(pw/(values.length-1)));
  const Y=v=>padT+ph-((v-lo)/(hi-lo))*ph;
  const flagged=new Set(points.filter(p=>p.rules?.length).map(p=>p.index));
  return(<Card title={title} accent={accent}>
    <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",display:"block"}}>
      {chart.ucl!=null&&<line x1={padL} y1={Y(chart.ucl)} x2={padL+pw} y2={Y(chart.ucl)} stroke={C.rd} strokeWidth="1.3" strokeDasharray="6 3"/>}
      {chart.cl!=null&&<line x1={padL} y1={Y(chart.cl)} x2={padL+pw} y2={Y(chart.cl)} stroke={C.gn} strokeWidth="1.3"/>}
      {chart.lcl!=null&&<line x1={padL} y1={Y(chart.lcl)} x2={padL+pw} y2={Y(chart.lcl)} stroke={C.rd} strokeWidth="1.3" strokeDasharray="6 3"/>}
      <polyline points={values.map((v,i)=>X(i)+","+Y(v)).join(" ")} fill="none" stroke={C.bl} strokeWidth="2"/>
      {points.map((p,i)=><circle key={p.index} cx={X(i)} cy={Y(p.value)} r={flagged.has(p.index)?4.4:3} fill={flagged.has(p.index)?C.rd:C.bl} stroke="#fff" strokeWidth={flagged.has(p.index)?1.3:0}/>)}
      {points.map((p,i)=>(i%2===0?<text key={"t"+p.index} x={X(i)} y={H-8} fontSize="8.5" fill={C.mu} textAnchor="middle">{p.index}</text>:null))}
      {chart.ucl!=null&&<text x={padL+pw+5} y={Y(chart.ucl)+3} fontSize="10" fill={C.rd}>{"UCL "+_spcFmt(chart.ucl)}</text>}
      {chart.cl!=null&&<text x={padL+pw+5} y={Y(chart.cl)+3} fontSize="10" fill={C.gn}>{"CL "+_spcFmt(chart.cl)}</text>}
      {chart.lcl!=null&&<text x={padL+pw+5} y={Y(chart.lcl)+3} fontSize="10" fill={C.rd}>{"LCL "+_spcFmt(chart.lcl)}</text>}
    </svg>
    <div style={{fontSize:11.5,color:C.mu,marginTop:6}}>{points.filter(p=>p.rules?.length).length} points with active Nelson-rule markers.</div>
  </Card>);
}

function LiveHistogram({histogram}){
  const bins=Array.isArray(histogram?.bins)?histogram.bins:[];
  if(!bins.length)return null;
  const max=Math.max(...bins.map(b=>b.count||0),1);
  return(<Card title="Process Capability — distribution vs specification" accent={C.pp}>
    <div style={{height:180,display:"flex",alignItems:"flex-end",gap:4,padding:"10px 8px",background:C.c2,border:"1px solid "+C.bd,borderRadius:8}}>
      {bins.map((b,i)=><div key={i} title={`${_spcFmt(b.from)} - ${_spcFmt(b.to)}: ${b.count}`} style={{flex:1,height:Math.max(2,((b.count||0)/max)*150),background:b.out_of_spec?C.rd:C.bl,opacity:b.out_of_spec?0.9:0.55,borderRadius:"3px 3px 0 0"}}/>)}
    </div>
    <div style={{fontSize:11.5,color:C.mu,marginTop:6}}>Sample size {histogram.sample_size ?? "—"} · Mean {histogram.mean!=null?_spcFmt(histogram.mean):"—"} · Std {histogram.std!=null?_spcFmt(histogram.std):"—"}</div>
  </Card>);
}

function LiveSPCOverview({date,shift,onSelect}){
  const [machine,setMachine]=useState("All");
  const [recipe,setRecipe]=useState("All");
  const [headline,setHeadline]=useState("All");
  const [summary,setSummary]=useState(null);
  const [options,setOptions]=useState({machines:[],recipes:[]});
  const [widgets,setWidgets]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError(null);
    Promise.all([
      getSpcSummary({date,machine}),
      getSpcFilterOptions({date}),
      getSpcWidgets({date,machine,recipe,headlineStatus:headline})
    ]).then(([sum,opt,board])=>{
      if(cancelled)return;
      setSummary(sum||null);
      setOptions(opt||{machines:[],recipes:[]});
      setWidgets(Array.isArray(board?.widgets)?board.widgets:[]);
    }).catch(err=>{if(!cancelled)setError(err);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[date,shift,machine,recipe,headline]);
  const tiles=[
    ["Processes",summary?.total_parameters??0,C.tx,"All"],
    ["Out of specification",summary?.out_of_specification??0,C.rd,"Critical"],
    ["Not capable",summary?.not_capable??0,C.am,"Warning"],
    ["Capable",summary?.capable??0,C.gn,"Healthy"],
    ["Insufficient",summary?.insufficient_data??0,C.mu,"Insufficient Data"],
  ];
  const sel={padding:"5px 10px",borderRadius:6,border:"1px solid "+C.bd,background:C.cd,color:C.tx,fontSize:12.5,fontWeight:600,cursor:"pointer",maxWidth:260};
  if(error)return <div style={{padding:"22px 16px",background:C.cd,border:"1px solid "+C.bd,borderRadius:8,color:C.rd}}>SPC fetch failed: {error.message||"Request failed"}</div>;
  return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {tiles.map(([label,val,col,key])=><_SpcTile key={label} label={label} val={loading?"...":val} sub={key==="All"?"under SPC":""} col={col} onClick={()=>setHeadline(headline===key?"All":key)} active={headline===key}/>)}
    </div>
    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",padding:"8px 10px",background:C.c2,borderRadius:8,border:"1px solid "+C.bd}}>
      <span style={{fontSize:11,color:C.mu,fontWeight:700,textTransform:"uppercase",letterSpacing:".3px"}}>Filter</span>
      <label style={{fontSize:12,color:C.mu,display:"flex",alignItems:"center",gap:5}}>Machine
        <select value={machine} onChange={e=>setMachine(e.target.value)} style={sel}><option>All</option>{(options.machines||[]).map(m=><option key={m} value={m}>{m}</option>)}</select>
      </label>
      <label style={{fontSize:12,color:C.mu,display:"flex",alignItems:"center",gap:5}}>Recipe
        <select value={recipe} onChange={e=>setRecipe(e.target.value)} style={sel}><option>All</option>{(options.recipes||[]).map(r=><option key={r} value={r}>{r}</option>)}</select>
      </label>
      {(machine!=="All"||recipe!=="All"||headline!=="All")&&<button onClick={()=>{setMachine("All");setRecipe("All");setHeadline("All");}} style={{...sel,color:C.pp,fontWeight:700}}>Clear</button>}
      <span style={{marginLeft:"auto",fontSize:11.5,color:C.mu}}>{loading?"Fetching SPC...":`Showing ${widgets.length} charts`}</span>
    </div>
    {!loading&&widgets.length===0?<div style={{padding:"28px 16px",textAlign:"center",color:C.mu,fontSize:13,background:C.cd,border:"1px dashed "+C.bd,borderRadius:10}}>No SPC rows for this selection.</div>:null}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
      {widgets.map((w,i)=>{const col=w.headline_status==="Critical"?C.rd:w.headline_status==="Warning"?C.am:w.headline_status==="Healthy"?C.gn:C.mu;return(
        <div key={`${w.machine}|${w.recipe}|${w.parameter}|${i}`} onClick={()=>onSelect({machine:w.machine,recipe:w.recipe,parameter:w.parameter})} style={{cursor:"pointer",background:C.cd,border:"1px solid "+C.bd,borderLeft:"3px solid "+col,borderRadius:8,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
            <div style={{minWidth:0}}><div style={{fontSize:14,fontWeight:700,color:C.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.parameter}</div><div style={{fontSize:11.5,color:C.mu,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.machine+" · "+w.recipe}</div></div>
            <StatusPill status={w.headline_status==="Critical"?"Red":w.headline_status==="Warning"?"Yellow":w.headline_status==="Healthy"?"Green":"Insufficient"}/>
          </div>
          {w.control_chart?<LiveSpcMini chart={w.control_chart}/>:<div style={{height:58,display:"flex",alignItems:"center",fontSize:12,color:C.mu}}>Insufficient sample size {w.insufficient?.sample_size??"—"}</div>}
          <div style={{display:"flex",gap:10,marginTop:6,fontSize:11.5,alignItems:"center"}}>
            <span style={{color:C.mu}}>Cp <b style={{color:col}}>{w.cp??"—"}</b></span>
            <span style={{color:C.mu}}>Cpk <b style={{color:col}}>{w.cpk??"—"}</b></span>
          </div>
        </div>);})}
    </div>
  </div>);
}

function LiveSPCDetail({selection,date,shift,onBack}){
  const [detail,setDetail]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError(null);
    getSpcDetail({date,shift,...selection})
      .then(res=>{if(!cancelled)setDetail(res);})
      .catch(err=>{if(!cancelled)setError(err);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[date,shift,selection?.machine,selection?.recipe,selection?.parameter]);
  if(error)return <div style={{padding:"22px 16px",background:C.cd,border:"1px solid "+C.bd,borderRadius:8,color:C.rd}}>SPC detail fetch failed: {error.message||"Request failed"}</div>;
  const cap=detail?.capability||{};
  const capCol=v=>v==null?C.mu:v<1?C.rd:v<1.33?C.am:C.gn;
  return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <button onClick={onBack} style={{padding:"5px 12px",borderRadius:6,border:"1px solid "+C.bd,background:C.c2,color:C.pp,fontSize:12,fontWeight:600,cursor:"pointer"}}>{"‹ All processes"}</button>
      <div><div style={{fontSize:16,fontWeight:700,color:C.tx}}>{selection.parameter}</div><div style={{fontSize:12,color:C.mu}}>{selection.machine+" · "+selection.recipe}</div></div>
      <span style={{marginLeft:"auto"}}>{loading?"Fetching...":<StatusPill status={cap.headline_status==="Critical"?"Red":cap.headline_status==="Warning"?"Yellow":cap.headline_status==="Healthy"?"Green":"Insufficient"}/>}</span>
    </div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {["cp","cpk","pp","ppk"].map(k=>{const cell=cap[k]||{};return <_SpcTile key={k} label={k.toUpperCase()} val={loading?"...":cell.value??"—"} sub={cell.status||""} col={capCol(cell.value)}/>;})}
      <_SpcTile label="Sample" val={loading?"...":cap.sample_size??"—"} sub="observations" col={C.tx}/>
    </div>
    {detail?.insufficient?<Card title="Insufficient Data" accent={C.am}><div style={{fontSize:13,color:C.md}}>Sample size {detail.insufficient.sample_size ?? "—"} is below the capability gate for live SPC charts.</div></Card>:null}
    {detail?.x_chart&&<LiveSpcChart title="Interactive Process Control — X Chart with Nelson Rules" chart={detail.x_chart} accent={C.pp}/>}
    {detail?.r_chart&&<LiveSpcChart title="R Chart — subgroup range" chart={detail.r_chart} accent={C.pp}/>}
    {detail?.histogram&&<LiveHistogram histogram={detail.histogram}/>}
  </div>);
}

function SPCTab({spcSel,setSpcSel,date,shift}){
  return spcSel
    ? <LiveSPCDetail selection={spcSel} date={date} shift={shift} onBack={()=>setSpcSel(null)}/>
    : <LiveSPCOverview date={date} shift={shift} onSelect={setSpcSel}/>;
}

export default function QualityDashboard({plant,onBack}){
  const [tab,setTab]=useState("process");
  const [openKpi,setOpenKpi]=useState(null);
  const [sub,setSub]=useState("");
  const [tf,setTf]=useState("today");
  const [shift,setShift]=useState("All");
  const [tfFrom,setTfFrom]=useState(QUALITY_DATA_DATE);
  const [tfTo,setTfTo]=useState(QUALITY_DATA_DATE);
  const [tyreType,setTyreType]=useState(isBanmorePlant(plant)?"PCR":"All");
  const [trendKpi,setTrendKpi]=useState(null);
  const [spcSel,setSpcSel]=useState(null);
  // Live Process values from the Excel-backed backend (FRD §1). null until the
  // first fetch; {} on error keeps cards neutral instead of showing mock data.
  const [liveProcess,setLiveProcess]=useState(null);

  useEffect(()=>{
    if(tab!=="process")return;
    let cancelled=false;
    getProcessKpiValues({date:tfTo,shift})
      .then(res=>{if(cancelled)return;const vals=(res&&res.values)||{};const out={};
        for(const [id,name] of Object.entries(PROCESS_KPI_NAME)){out[id]={value:vals[name]===undefined?null:vals[name]};}
        setLiveProcess(out);})
      .catch(()=>{if(!cancelled)setLiveProcess({});});
    return()=>{cancelled=true;};
  },[tab,tfTo,shift]);

  // Merge live overall values onto supported Process cards. KPI cards without
  // an API-backed value render as NA so the quality dashboard never shows dummy
  // KPI data as production data.
  const processCards=PROCESS_KPIS.map(k=>{
    if(!LIVE_PROCESS_KPI_IDS.has(k.id))return toNaKpi(k);
    const live=liveProcess&&liveProcess[k.id];
    if(!live)return toPendingLiveKpi(k);
    return {...k,v:live.value==null?"—":String(live.value),status:null,sp:null,live:true,na:false,trendApi:true,trendKpiName:PROCESS_KPI_NAME[k.id]};
  });
  const productCards=PRODUCT_KPIS.map(toNaKpi);
  const complaintCards=COMPLAINT_KPIS.map(toNaKpi);
  const kpis=tab==="spc"?[]:tab==="process"?processCards:tab==="product"?productCards:complaintCards;
  const openObj=openKpi?kpis.find(k=>k.id===openKpi):null;
  const tabAccent=tab==="process"?C.bl:tab==="product"?C.tl:C.rd;

  const toggle=id=>{setOpenKpi(openKpi===id?null:id);setSub("");};
  const onHeaderPresetChange=preset=>{
    setTf(preset);
    if(preset==="today"){setTfFrom(QUALITY_DATA_DATE);setTfTo(QUALITY_DATA_DATE);}
    else if(preset==="month"){setTfFrom(QUALITY_MONTH_FROM);setTfTo(QUALITY_MONTH_TO);setShift("All");}
    else if(preset==="year"){setTfFrom("2026-01-01");setTfTo("2026-12-31");setShift("All");}
  };
  const onHeaderFromChange=value=>{setTf(null);setTfFrom(value);setShift("All");};
  const onHeaderToChange=value=>{setTf(null);setTfTo(value);setShift("All");};
  const onHeaderShiftChange=value=>setShift(value==="all"?"All":String(value).toUpperCase());

  return(<div style={{minHeight:"100vh",background:C.bg,fontFamily:"'IBM Plex Sans',system-ui,sans-serif",color:C.tx,fontSize:16}}>
    <PrintStyles/>
    <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
    {/* Header */}
    <div style={{background:C.cd,borderBottom:"1px solid "+C.bd,padding:"0 20px",height:64,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <button onClick={onBack} style={{width:32,height:32,borderRadius:8,border:"1px solid "+C.bd,background:C.c2,color:C.mu,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"←"}</button>
        <img src={LOGO} alt="JK Tyre" style={{height:28,width:"auto",objectFit:"contain",display:"block"}}/>
        <div style={{width:1,height:40,background:C.bd}}/>
        <div>
          <div style={{fontSize:18,fontWeight:700}}>One Factory</div>
          <div style={{fontSize:11,color:C.mu,textTransform:"uppercase",letterSpacing:"1px",marginTop:1}}>Quality Head Dashboard</div>
        </div>
        <span style={{fontSize:13,color:C.tl,fontWeight:700,background:C.tl+"18",padding:"3px 10px",borderRadius:8,marginLeft:4}}>{plant?plant.name.split(" ")[0].toUpperCase():"BTP"}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <ProductionTimeRangeSelect preset={tf} onPresetChange={onHeaderPresetChange} from={tfFrom} to={tfTo} onFromChange={onHeaderFromChange} onToChange={onHeaderToChange} shift={shift==="All"?"all":shift.toLowerCase()} onShiftChange={onHeaderShiftChange}/>
        <PcrOnlyBadge/>
        <ExportButton/>
        <SharedUserMenu user={QUALITY_USER} size={32}/>
      </div>
    </div>

    {/* Tab Navigation */}
    <div style={{background:C.cd,borderBottom:"1px solid "+C.bd,padding:"0 16px",display:"flex",alignItems:"center",position:"sticky",top:64,zIndex:99}}>
      {[{id:"process",n:"Process",i:"⚙"},{id:"product",n:"Product",i:"◆"},{id:"complaint",n:"Customer Complaint",i:"⚠"},{id:"spc",n:"SPC",i:"∿"}].map(t=>{const a=tab===t.id;const tc=t.id==="process"?C.bl:t.id==="product"?C.tl:t.id==="complaint"?C.rd:C.pp;return(<button key={t.id} onClick={()=>{setTab(t.id);setOpenKpi(null);setSub("");}} style={{padding:"12px 18px",border:"none",borderBottom:a?"2px solid "+tc:"2px solid transparent",background:"transparent",fontSize:14,fontWeight:a?700:500,color:a?tc:C.mu,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
        {t.n}
      </button>);})}
      <div style={{flex:1}}/>
    </div>

    {/* Main content */}
    <div style={{padding:"16px 20px 40px",display:"flex",flexDirection:"column",gap:14}}>
      {/* KPI Grid */}
      <TyreTypeBanner tt={tyreType} plant={plant}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8}}>
        {kpis.map(k=>(<QKpiCard key={k.id} kpi={k} isOpen={openKpi===k.id} onToggle={()=>k.drill&&toggle(k.id)} onTrend={setTrendKpi} tyreType={tyreType} plant={plant}/>))}
      </div>

      {/* SPC tab */}
      {tab==="spc"&&<SPCTab spcSel={spcSel} setSpcSel={setSpcSel} date={tfTo} shift={shift}/>}

      {/* Drill panel */}
      {openObj&&<div style={{animation:"fadeIn .2s ease"}}>
        {tab==="process"&&<ProcessDrillPanel kpi={openObj} sub={sub} setSub={setSub} date={tfTo} shift={shift} onOpenSPC={(mc)=>{setTab("spc");setSpcSel(mc);setOpenKpi(null);setSub("");}}/>}
        {tab==="product"&&<ProductDrillPanel kpi={openObj} sub={sub} setSub={setSub} tyreType={tyreType} plant={plant}/>}
        {tab==="complaint"&&<ComplaintDrillPanel kpi={openObj} sub={sub} setSub={setSub}/>}
      </div>}
    </div>
    {trendKpi&&trendKpi.trendApi&&<LiveProcessTrendPanel kpi={trendKpi} onClose={()=>setTrendKpi(null)} dateFrom={tfFrom} dateTo={tfTo} shift={shift}/>}
  </div>);
}
