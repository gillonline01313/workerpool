/* ======================= PROVINCE: ALBERTA ======================= */
const PROVINCE="AB";
/* AAIP Expression of Interest rounds, 2026: [date, stream / pathway, minimum EOI score, invitations]. Latest first. */
const PNP_DRAWS = [
 ["2026-10-20","AEE Priority Sectors: General",60,"386"],
 ["2026-10-07","AEE Priority Sectors: Aviation",56,"22"],["2026-10-02","Alberta Opportunity Stream",54,"123"],["2026-09-29","AEE Priority Sectors: General",64,"200"],
 ["2026-09-24","Rural Renewal Stream",51,"131"],["2026-09-23","Alberta Opportunity Stream",58,"113"],["2026-09-22","AEE Accelerated Tech",59,"100"],
 ["2026-09-21","AEE Law Enforcement",49,"<10"],["2026-09-18","AEE Priority Sectors: Health Care",62,"100"],["2026-09-15","AEE Priority Sectors: Agriculture",60,"18"],
 ["2026-09-10","AEE Priority Sectors: Manufacturing",60,"48"],["2026-09-09","Dedicated Health Care: Express Entry",60,"51"],["2026-09-03","AEE Accelerated Tech",60,"96"],
 ["2026-09-01","Alberta Opportunity Stream",56,"575"],["2026-08-19","Dedicated Health Care: non-Express Entry",60,"24"],["2026-08-14","Alberta Opportunity Stream",58,"743"],
 ["2026-08-12","Dedicated Health Care: Express Entry",60,"57"],["2026-08-11","Rural Renewal Stream",51,"127"],["2026-08-07","AEE Priority Sectors: Agriculture",55,"38"],
 ["2026-08-06","AEE Accelerated Tech",60,"95"],["2026-08-04","AEE Priority Sectors: Health Care",66,"50"],["2026-07-21","AEE Priority Sectors: Construction",65,"53"],
 ["2026-07-16","AEE Priority Sectors: Agriculture",56,"29"],["2026-07-15","Alberta Opportunity Stream",53,"833"],["2026-07-14","Dedicated Health Care: non-Express Entry",52,"51"],
 ["2026-07-10","AEE Law Enforcement",52,"<10"],["2026-07-08","AEE Accelerated Tech",55,"149"],["2026-07-07","Rural Renewal Stream",55,"42"],
 ["2026-07-03","Dedicated Health Care: Express Entry",55,"92"],["2026-06-29","Dedicated Health Care: non-Express Entry",63,"75"],["2026-06-24","AEE Priority Sectors: Aviation and skilled trades",47,"35"],
 ["2026-06-22","Dedicated Health Care: Express Entry",64,"46"],["2026-06-19","AEE Accelerated Tech",59,"100"],["2026-06-18","Tourism and Hospitality Stream",71,"61"],
 ["2026-06-17","Alberta Opportunity Stream",58,"720"],["2026-06-15","AEE Priority Sectors: Manufacturing",50,"56"],["2026-06-12","AEE Priority Sectors: Agriculture",52,"37"],
 ["2026-06-11","AEE Priority Sectors: Health Care",63,"50"],["2026-06-10","Rural Renewal Stream",51,"54"],["2026-06-09","Dedicated Health Care: non-Express Entry",45,"35"],
 ["2026-06-08","Dedicated Health Care: Express Entry",60,"49"],["2026-06-05","Alberta Opportunity Stream",50,"462"],["2026-06-02","AEE Priority Sectors: Manufacturing",53,"49"],
 ["2026-05-29","AEE Accelerated Tech",55,"200"],["2026-05-27","Alberta Opportunity Stream",51,"993"],["2026-05-25","Rural Renewal Stream",50,"83"],
 ["2026-05-22","AEE Priority Sectors: Agriculture",48,"76"],["2026-05-21","AEE Priority Sectors: Manufacturing",56,"99"],["2026-05-20","AEE Priority Sectors: Construction and skilled trades",61,"50"],
 ["2026-05-13","Dedicated Health Care: Express Entry",57,"61"],["2026-05-07","AEE Accelerated Tech",57,"146"],["2026-05-06","Alberta Opportunity Stream",54,"832"],
 ["2026-05-01","Rural Renewal Stream",50,"12"],["2026-04-27","Tourism and Hospitality Stream",71,"98"],["2026-04-23","AEE Law Enforcement",58,"<10"],
 ["2026-04-16","Dedicated Health Care: non-Express Entry",46,"37"],["2026-04-15","AEE Priority Sectors: Health Care",55,"50"],["2026-04-14","AEE Priority Sectors: Construction and skilled trades",60,"50"],
 ["2026-04-13","Dedicated Health Care: Express Entry",59,"62"],["2026-04-10","Alberta Opportunity Stream",65,"447"],["2026-04-09","Rural Renewal Stream",50,"74"],
 ["2026-04-08","AEE Accelerated Tech",59,"146"],["2026-03-27","AEE Law Enforcement",46,"<10"],["2026-03-26","Rural Renewal Stream",50,"60"],
 ["2026-03-24","Dedicated Health Care: non-Express Entry",54,"102"],["2026-03-19","AEE Priority Sectors: Construction",59,"109"],["2026-03-17","AEE Priority Sectors: Manufacturing",50,"27"],
 ["2026-03-16","AEE Priority Sectors: Health Care",63,"50"],["2026-03-13","Rural Renewal Stream",51,"349"],["2026-03-12","Dedicated Health Care: non-Express Entry",47,"47"],
 ["2026-03-06","AEE Accelerated Tech",56,"139"],["2026-03-05","Alberta Opportunity Stream",61,"832"],["2026-02-26","Rural Renewal Stream",55,"30"],
 ["2026-02-24","Tourism and Hospitality Stream",73,"68"],["2026-02-20","Alberta Opportunity Stream",56,"831"],["2026-02-19","AEE Priority Sectors: Construction",61,"50"],
 ["2026-02-17","AEE Priority Sectors: Agriculture",49,"<10"],["2026-02-12","AEE Priority Sectors: Manufacturing",50,"32"],["2026-02-11","AEE Accelerated Tech",59,"147"],
 ["2026-02-10","Rural Renewal Stream",54,"212"],["2026-02-06","AEE Law Enforcement",50,"<10"],["2026-02-02","Alberta Opportunity Stream",57,"915"],
 ["2026-01-29","AEE Accelerated Tech",63,"148"],["2026-01-27","Dedicated Health Care: non-Express Entry",45,"43"],["2026-01-26","Dedicated Health Care: Express Entry",61,"63"]];
const PNP_TABS=[
  {key:"pnp",label:"Alberta AAIP",data:PNP_DRAWS,group:"Stream or pathway",scored:true,
   note:you=>`Alberta Advantage Immigration Program rounds to October 20, 2026. AEE means Alberta Express Entry. All AAIP worker streams rank candidates on the same 100-point EOI grid. Highlighted rows have a minimum score at or below the candidate's EOI score${you!=null?` (${you})`:""}. Alberta's 2026 allocation is 6,603 nominations, and only about 1,060 were left in early October.`}];

/* Rural Community Immigration Pilot: Alberta's only community is Claresholm. */
const RCIP = {
  cl:{grid:"generic",name:"Claresholm",nocs:[],
    gridNote:"Claresholm requires at least 50 points but doesn't publish its grid, so this uses the common RCIP structure as an estimate.",
    hint:"Claresholm recommends jobs in health care, manufacturing and utilities, trades, sales and service, education and social services, and agriculture. Check its priority occupation list for the exact NOCs.",
    status:"Claresholm has 36 recommendations for 2026, about 3 a month, with no more than 6 in sales and service. The job must be within 25 km of Claresholm, which includes Granum and Stavely.",open:true}};
const RCIP_NONE="Alberta's only RCIP community is Claresholm (including Granum and Stavely, within 25 km). A job offer from a designated employer there opens this pathway; choose it in section 5.";

function readProv(){ const off=$("jobOffer").value==="yes"; return {
  abLoc:off?$("abLoc").value:"cma", abEndorse:off?$("abEndorse").value:"none", abSector:off?$("abSector").value:"none",
  abFamily:$("abFamily").value==="yes", abCertReg:$("abCertReg").value==="yes", abExpWhere:$("abExpWhere").value }; }
function provToggles(){}

/* AAIP Worker EOI points grid (out of 100). */
function aaip(p){
  const rows=[];
  // education (max 22)
  const post=!["none","hs"].includes(p.edu);
  let ed={none:0,hs:0,one:4,two:4,bach:7,twoplus:7,master:10,phd:12}[p.edu];
  if(p.cert) ed=Math.max(ed,7);
  const edLoc = post||p.cert ? (p.eduWhere==="prov"?10:p.eduWhere==="canada"?6:0) : 0;
  rows.push(["Education level",ed],["Where the credential was earned",edLoc]);
  // language (max 13)
  const en=p.en?p.en.min:0, fr=p.fr?p.fr.min:0;
  const enP=en>=6?10:en===5?8:en===4?5:0, frP=fr>=6?8:fr===5?5:fr===4?3:0;
  const bi=(en>=4&&fr>=4)?3:0;
  const lang=Math.min(13,Math.max(enP,frP)+bi);
  rows.push([`Official language (English CLB ${en||"—"}, French NCLC ${fr||"—"})`,lang]);
  // work experience (max 21)
  const yrs=(+p.cdnYears)+(+p.forYears);
  const we = yrs>=1||p.drYears>=1 ? 11 : p.drYears>0 ? 7 : 0;
  const ce = (p.cdnYears>=1||p.current) ? (p.abExpWhere==="ab"?10:p.abExpWhere==="canada"?6:0) : 0;
  rows.push(["Work experience in the occupation",we],["Canadian work experience (6+ months)",ce]);
  // age (max 5)
  const a=p.age, age = a<18?0 : a<=20?3 : a<=34?5 : a<=49?4 : 3;
  rows.push(["Age",age]);
  // family, job offer, location, certification
  const fam=p.abFamily?8:0;
  const job=p.jobOffer?10:0, endorse=p.jobOffer&&p.abEndorse!=="none"?6:0;
  const loc=p.jobOffer&&p.abLoc==="outside"?5:0;
  const reg=p.abCertReg?10:0;
  rows.push(["Family member in Alberta",fam],["Alberta job offer",job],["Endorsement or designated employer",endorse],["Job outside Calgary and Edmonton",loc],["Alberta occupational certification or licence",reg]);
  const total=ed+edLoc+lang+we+ce+age+fam+job+endorse+loc+reg;
  return {total,rows};
}
const pnpScore=aaip;

const AB_SECTOR={health:"Health Care",tech:"Accelerated Tech",agri:"Agriculture",construction:"Construction",aviation:"Aviation",manufacturing:"Manufacturing"};
function latestAB(match){ return PNP_DRAWS.find(d=>match(d[1])); }
function pnpCard(p,c,eeOk){
  const a=aaip(p);
  const firstClb=Math.max(p.en?p.en.min:0,p.fr?p.fr.min:0);
  const needClb=p.offerTeer<=3?5:4;
  const health=p.occ==="health"||p.occ==="physician"||p.abSector==="health";
  const streams=[];
  // Alberta Opportunity Stream
  { const why=[];
    if(!p.jobOffer) why.push("needs a full-time Alberta job offer");
    if(!(p.inCanada==="wp"&&p.current)) why.push("must be working in Alberta now on a valid work permit");
    if(p.drYears<1) why.push("needs 12 months of experience in the occupation");
    if(firstClb<needClb) why.push(`needs CLB ${needClb} for a TEER ${p.offerTeer} job`);
    if(p.edu==="none") why.push("needs high school or higher");
    streams.push({name:"Alberta Opportunity Stream",ok:!why.length,why,draw:latestAB(s=>s==="Alberta Opportunity Stream")}); }
  // Alberta Express Entry
  { const why=[]; if(!eeOk) why.push("needs an active Express Entry profile (CEC, FSW or FST eligible)"); if(c.total<300) why.push("needs a CRS score of at least 300");
    const sec=AB_SECTOR[p.abSector];
    const tech=p.abSector==="tech";
    const linked=p.jobOffer||(p.current&&p.inCanada==="wp");
    let draw=latestAB(s=>s==="AEE Priority Sectors: General");
    let name="Alberta Express Entry";
    if(tech&&linked){ name="Alberta Express Entry: Accelerated Tech"; draw=latestAB(s=>s==="AEE Accelerated Tech"); }
    else if(p.abEndorse==="law"){ name="Alberta Express Entry: Law Enforcement"; draw=latestAB(s=>s==="AEE Law Enforcement"); }
    else if(sec&&linked){ name=`Alberta Express Entry: Priority Sectors (${sec})`; draw=latestAB(s=>s.startsWith("AEE Priority Sectors: "+sec))||draw; }
    streams.push({name,ok:!why.length,why,draw}); }
  // Dedicated Health Care Pathway
  if(health){ const why=[]; if(!eeOk&&!p.jobOffer) why.push("needs an Express Entry profile or an Alberta health care job offer");
    if(firstClb<(p.offerTeer<=3?5:4)) why.push("language below the usual minimum for the occupation");
    streams.push({name:"Dedicated Health Care Pathway",ok:!why.length,why,draw:latestAB(s=>s===(eeOk?"Dedicated Health Care: Express Entry":"Dedicated Health Care: non-Express Entry"))}); }
  // Rural Renewal Stream
  if(p.abEndorse==="rrs"){ const why=[];
    if(!p.jobOffer) why.push("needs a job offer from an employer in a designated Rural Renewal community");
    if(firstClb<needClb) why.push(`needs CLB ${needClb} for a TEER ${p.offerTeer} job`);
    if(p.drYears<1) why.push("needs 12 months of related work experience");
    streams.push({name:"Rural Renewal Stream",ok:!why.length,why,draw:latestAB(s=>s==="Rural Renewal Stream")}); }
  // Tourism and Hospitality Stream
  if(p.abEndorse==="tourism"){ const why=[];
    if(!(p.current&&p.inCanada==="wp")) why.push("must be working in Alberta for an approved tourism and hospitality employer (6+ months)");
    if(firstClb<4) why.push("needs CLB 4");
    streams.push({name:"Tourism and Hospitality Stream",ok:!why.length,why,draw:latestAB(s=>s==="Tourism and Hospitality Stream")}); }

  const elig=streams.filter(s=>s.ok);
  const best=elig.filter(s=>s.draw).sort((x,y)=>x.draw[2]-y.draw[2])[0];
  const pills=streams.map(s=>pill(s.name+(s.ok?": meets basics":": not yet"),s.ok?"good":"bad"));
  const lines=streams.map(s=>`<li><b>${esc(s.name)}</b>${s.draw?` · latest cut-off <b>${s.draw[2]}</b> on ${fmtD(s.draw[0])}${a.total>=s.draw[2]?` · <span style="color:var(--good);font-weight:600">your score is at or above it</span>`:` · about ${s.draw[2]-a.total} point${s.draw[2]-a.total===1?"":"s"} short`}`:""}${s.why.length?`<br><span class="note">${esc(s.why.join("; "))}</span>`:""}</li>`).join("");
  const nom = eeOk ? `<p class="cmp">An AAIP nomination through Alberta Express Entry adds 600 CRS points: <b>${c.total} → ${c.total+600}</b>, well above every 2026 PNP round (latest ${drawStats("PNP").latest[4]}).</p>` : "";
  return {score:a.total,label:"AAIP Worker EOI",extra:elig.map(s=>s.name).join(", ")||null,
    html:`<div class="card"><div class="card-h"><div><span class="eyebrow">Alberta · Alberta Advantage Immigration Program</span><h2>AAIP Worker EOI score</h2><div class="pills" style="margin-top:8px">${pills.join("")}</div></div><div class="score">${a.total}<small>of 100</small></div></div>
      ${best?`<div class="meter"><i style="width:${Math.min(100,a.total/Math.max(best.draw[2],a.total)*100)}%"></i></div>`:""}
      <p class="cmp">${elig.length?`The candidate meets the basic requirements for ${elig.length===1?"one stream":elig.length+" streams"}. Alberta invites the highest EOI scores in each stream or sector, so compare the score with each stream's latest cut-off.`:"The candidate doesn't meet the basic requirements of an AAIP worker stream yet. The reasons are listed under each stream."}</p>
      <ul class="reasons">${lines}</ul>
      ${nom}
      <details class="more"><summary>EOI breakdown</summary>${table(a.rows,a.total,"Total EOI score")}<p class="note">Based on the AAIP Worker EOI points grid (max 100). Alberta can change the grid and the streams' minimum requirements at any time.</p></details></div>`};
}
