/* ======================= PROVINCE: MANITOBA ======================= */
const PROVINCE="MB";
/* MPNP Expression of Interest draws, 2026: [date, selection, lowest score or null, Letters of Advice to Apply]. Latest first.
   Occupation-specific, Francophone and strategic recruitment selections don't publish a minimum score. */
const PNP_DRAWS = [
 ["2026-10-22","SWM: Manitoba post-secondary graduates",816,"734"],["2026-10-22","SWM: Overall top-scoring",846,"513"],["2026-10-22","Strategic recruitment",null,"57"],
 ["2026-10-08","SWM: Occupation-specific (education, childcare)",null,"211"],["2026-10-08","SWM: Occupation-specific (health)",null,"46"],["2026-10-08","Strategic recruitment",null,"83"],
 ["2026-09-24","SWM: Top-scoring, natural and applied sciences",760,"417"],["2026-09-24","Francophone selection",null,"16"],["2026-09-24","SWM: Occupation-specific (health)",null,"1"],["2026-09-24","Strategic recruitment",null,"40"],
 ["2026-09-10","SWM: Manitoba post-secondary graduates",825,"508"],["2026-09-10","SWM: Occupation-specific (health)",null,"233"],["2026-09-10","Francophone selection",null,"11"],["2026-09-10","Strategic recruitment",null,"41"],
 ["2026-08-27","SWM: Top-scoring, trades (NOC major group 72)",731,"600"],["2026-08-27","SWM: Occupation-specific (health, bus drivers)",null,"62"],["2026-08-27","Francophone selection",null,"21"],["2026-08-27","Strategic recruitment",null,"58"],
 ["2026-08-13","Strategic recruitment",null,"53"],
 ["2026-07-30","SWM: Top-scoring, manufacturing",632,"605"],["2026-07-30","SWM: Occupation-specific (health)",null,"74"],["2026-07-30","Francophone selection",null,"17"],["2026-07-30","Strategic recruitment",null,"70"],
 ["2026-07-16","SWM: Manitoba post-secondary graduates",825,"1,874"],["2026-07-16","IES: Graduate Internship",null,"78"],["2026-07-16","SWM: Occupation-specific (health)",null,"24"],["2026-07-16","Francophone selection",null,"84"],["2026-07-16","Strategic recruitment",null,"86"],
 ["2026-07-02","Strategic recruitment",null,"77"],["2026-06-18","Strategic recruitment",null,"124"],["2026-06-04","Strategic recruitment",null,"104"],["2026-05-21","Strategic recruitment",null,"96"],
 ["2026-05-07","SWM: Occupation-specific (education)",null,"431"],["2026-05-07","Strategic recruitment",null,"475"],
 ["2026-04-23","Skilled Worker streams (mixed)",null,"308"],["2026-04-09","Skilled Worker streams (mixed)",null,"32"],["2026-03-26","Skilled Worker streams (mixed)",null,"14"],
 ["2026-03-12","Skilled Worker streams (mixed)",null,"46"],["2026-02-26","Skilled Worker streams (mixed)",null,"72"],["2026-02-12","Skilled Worker streams (mixed)",null,"29"],
 ["2026-01-29","Skilled Worker streams (mixed)",null,"47"],["2026-01-15","Skilled Worker streams (mixed)",null,"55"]];
const PNP_TABS=[
  {key:"pnp",label:"Manitoba MPNP",data:PNP_DRAWS,group:"Selection",scored:true,nullLabel:"Not published",
   note:you=>`MPNP draws #262 to #282, to October 22, 2026 (about 8,500 Letters of Advice to Apply). SWM means Skilled Worker in Manitoba. Occupation-specific, Francophone and strategic recruitment selections don't publish a minimum score, and the early-2026 draws are shown as totals. Highlighted rows have a lowest score at or below the candidate's EOI score${you!=null?` (${you})`:""}.`}];

/* Rural Community Immigration Pilot communities in Manitoba. None publishes a points grid. */
const RCIP = {
  br:{grid:"generic",name:"Brandon",nocs:[],
    gridNote:"Brandon doesn't publish its ranking grid, so this uses the common RCIP structure (minimum 50 of 125) as an estimate.",
    hint:"Brandon's job offer must pay at least the Job Bank median wage for the NOC in the region. Check Brandon's priority occupation list.",
    status:"Brandon is accepting applications. The job offer's wage must be at least the Job Bank median for the occupation.",open:true},
  al:{grid:"fcfs",name:"Altona / Rhineland",nocs:[],
    gridNote:"Altona / Rhineland doesn't rank candidates with points. Designated employers post jobs on the community's job board and eligible candidates are recommended first come, first served.",
    hint:"Altona / Rhineland recommends first come, first served, with no points grid.",
    status:"Altona / Rhineland: apply to designated employers through the community's RCIP job board.",open:true},
  st:{grid:"generic",name:"Steinbach",nocs:[],
    gridNote:"Steinbach doesn't publish its ranking grid, so this uses the common RCIP structure (minimum 50 of 125) as an estimate.",
    hint:"Steinbach opens monthly intake windows for designated employers, with up to 5 recommendations each.",
    status:"Steinbach opens monthly intake windows (up to 5 recommendations each). Applications come through designated employers; the community doesn't answer candidate enquiries.",open:true}};
const RCIP_NONE="Manitoba's RCIP communities are Brandon, Altona / Rhineland and Steinbach. A job offer from a designated employer there opens this pathway; choose the community in section 5.";

function readProv(){ return {
  mbRel:$("mbRel").value, mbPastWork:$("mbPastWork").value==="yes", mbStudy:+$("mbStudy").value, mbIta:$("mbIta").value==="yes",
  mbOutside:$("mbOutside").value==="yes", mbLicence:$("mbLicence").value==="yes", mbOtherWork:$("mbOtherWork").value==="yes", mbOtherStudy:$("mbOtherStudy").value==="yes" }; }
function provToggles(){}

/* MPNP Skilled Worker EOI ranking (out of 1,000). */
function mpnp(p){
  const rows=[];
  // language (max 125): first official language by ability, plus second official language
  const langs=[p.en,p.fr].filter(Boolean).sort((x,y)=>y.min-x.min);
  const ab=c=>c>=8?25:c===7?22:c===6?20:c===5?17:c===4?12:0;
  const first=langs[0], second=langs[1];
  const l1=first?["L","R","W","S"].reduce((t,k)=>t+ab(first[k]),0):0;
  const l2=second&&second.min>=5?25:0;
  rows.push(["First official language (four abilities)",l1],["Second official language",l2]);
  // age (max 75)
  const a=p.age, age = a<18?0 : a===18?20 : a===19?30 : a===20?40 : a<=45?75 : a===46?40 : a===47?30 : a===48?20 : a===49?10 : 0;
  rows.push(["Age",age]);
  // work experience (max 175)
  const yrs=Math.min(4,(+p.cdnYears)+(+p.forYears));
  const we={0:0,1:40,2:50,3:60,4:75}[yrs]+(p.mbLicence?100:0);
  rows.push(["Work experience (last 5 years)",{0:0,1:40,2:50,3:60,4:75}[yrs]],["Occupation fully recognized by a Manitoba licensing body",p.mbLicence?100:0]);
  // education (max 125)
  let ed={none:0,hs:0,one:70,two:100,bach:110,twoplus:115,master:125,phd:125}[p.edu];
  if(p.cert) ed=Math.max(ed,70);
  rows.push(["Education",ed]);
  // adaptability (max 500): the single highest Manitoba connection, plus regional development
  const conn=[];
  if(p.jobOffer&&p.current) conn.push([500,"Working in Manitoba 6+ months with a long-term job offer"]);
  if(p.mbIta) conn.push([500,"Invited through a strategic recruitment initiative"]);
  if(p.mbRel==="close") conn.push([200,"Close relative in Manitoba"]);
  if(p.mbPastWork) conn.push([100,"Past work in Manitoba (6+ months)"]);
  if(p.mbStudy>=2) conn.push([100,"Manitoba post-secondary study (2+ years)"]); else if(p.mbStudy===1) conn.push([50,"Manitoba post-secondary study (1 year)"]);
  if(p.mbRel==="friend") conn.push([50,"Close friend or distant relative in Manitoba"]);
  conn.sort((x,y)=>y[0]-x[0]);
  const top=conn[0]||[0,"No Manitoba connection"];
  const reg=p.mbOutside?50:0;
  const adapt=Math.min(500,top[0]+reg);
  rows.push(["Manitoba connection: "+top[1],top[0]],["Destination outside Winnipeg",reg]);
  // risk assessment (max −200)
  const risk=(p.mbOtherWork?-100:0)+(p.mbOtherStudy?-100:0);
  if(risk) rows.push(["Risk: work or study in another province",risk]);
  const total=Math.max(0,l1+l2+age+we+ed+adapt+risk);
  return {total,rows,connected:conn.length>0};
}
const pnpScore=mpnp;

function latestMB(match){ return PNP_DRAWS.find(d=>d[2]!=null&&match(d[1])); }
function pnpCard(p,c,eeOk){
  const m=mpnp(p);
  const first=Math.max(p.en?p.en.min:0,p.fr?p.fr.min:0);
  const streams=[];
  { const why=[];
    if(!p.jobOffer) why.push("needs a full-time, long-term Manitoba job offer");
    if(!(p.current&&p.inCanada==="wp")) why.push("must be working in Manitoba now (6+ months) on a valid work permit");
    if(first<4) why.push("needs at least CLB 4 (higher for some occupations)");
    streams.push({name:"Skilled Worker in Manitoba",ok:!why.length,why}); }
  { const why=[];
    if(!(m.connected&&(p.mbRel==="close"||p.mbPastWork||p.mbStudy>=1||p.mbIta))) why.push("needs a close relative, past work or study in Manitoba, or a strategic recruitment invitation");
    if(first<5) why.push("needs at least CLB 5");
    if((+p.cdnYears + +p.forYears)<2) why.push("needs 2 years of full-time work in the last 5 years");
    streams.push({name:"Skilled Worker Overseas",ok:!why.length,why}); }
  if(p.mbStudy>=1){ const why=[];
    if(!p.jobOffer) why.push("Career Employment Pathway needs a Manitoba job offer in an in-demand occupation");
    streams.push({name:"International Education Stream",ok:!why.length,why}); }
  const cmp=[];
  const overall=latestMB(s=>s==="SWM: Overall top-scoring");
  const grads=latestMB(s=>s==="SWM: Manitoba post-secondary graduates");
  const swm=streams[0].ok;
  if(overall) cmp.push(`<li><b>SWM overall top-scoring</b> · latest lowest score <b>${overall[2]}</b> on ${fmtD(overall[0])}${m.total>=overall[2]?` · <span style="color:var(--good);font-weight:600">your score is at or above it</span>`:` · about ${overall[2]-m.total} point${overall[2]-m.total===1?"":"s"} short`}</li>`);
  if(grads&&p.mbStudy>=1) cmp.push(`<li><b>SWM Manitoba graduates</b> · latest lowest score <b>${grads[2]}</b> on ${fmtD(grads[0])}${m.total>=grads[2]?` · <span style="color:var(--good);font-weight:600">your score is at or above it</span>`:` · about ${grads[2]-m.total} point${grads[2]-m.total===1?"":"s"} short`}</li>`);
  if(["health","physician","ece","teacherFr"].includes(p.occ)) cmp.push(`<li><b>Occupation-specific selections</b> · Manitoba often invites ${p.occ==="ece"||p.occ==="teacherFr"?"education and childcare":"health"} workers in Manitoba with no minimum score (latest on ${fmtD(PNP_DRAWS.find(d=>d[1].startsWith("SWM: Occupation-specific"))[0])}).</li>`);
  if(p.fr&&p.fr.min>=7) cmp.push(`<li><b>Francophone selection</b> · Manitoba holds regular French-speaker selections; no minimum score is published.</li>`);
  if(!swm) cmp.push(`<li><b>Skilled Worker Overseas</b> · in 2026 almost all overseas invitations came through strategic recruitment (exploratory visits and employer missions), not points.</li>`);
  const pills=streams.map(s=>pill(s.name+(s.ok?": meets basics":": not yet"),s.ok?"good":"bad"));
  const why=streams.filter(s=>!s.ok&&s.why.length).map(s=>`<li>${esc(s.name)}: ${esc(s.why.join("; "))}</li>`).join("");
  const nom = eeOk ? `<p class="cmp">With an Express Entry profile, an MPNP nomination through its Express Entry pathway adds 600 CRS points: <b>${c.total} → ${c.total+600}</b>, well above every 2026 PNP round (latest ${drawStats("PNP").latest[4]}).</p>` : "";
  return {score:m.total,label:"MPNP EOI",extra:streams.filter(s=>s.ok).map(s=>s.name).join(", ")||null,
    html:`<div class="card"><div class="card-h"><div><span class="eyebrow">Manitoba · Manitoba Provincial Nominee Program</span><h2>MPNP EOI ranking score</h2><div class="pills" style="margin-top:8px">${pills.join("")}</div></div><div class="score">${m.total}<small>of 1,000</small></div></div>
      ${overall?`<div class="meter"><i style="width:${Math.min(100,m.total/Math.max(overall[2],m.total)*100)}%"></i></div>`:""}
      <ul class="reasons">${cmp.join("")}</ul>
      ${why?`<ul class="reasons">${why}</ul>`:""}
      ${nom}
      <details class="more"><summary>EOI breakdown</summary>${table(m.rows,m.total,"Total EOI score")}<p class="note">Based on the MPNP Skilled Worker EOI ranking (max 1,000). Only the highest Manitoba connection counts. Manitoba can change the ranking and its draw targets at any time.</p></details></div>`};
}
