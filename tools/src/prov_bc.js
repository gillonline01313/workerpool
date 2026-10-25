/* ======================= PROVINCE: BRITISH COLUMBIA ======================= */
const PROVINCE="BC";
const PNP_DRAWS = [ // [date, priority group, min score or null (wage-based), invitations as text]
 ["2026-10-08","Care: Childcare",99,"86"],["2026-10-08","Care: Health",76,"82"],["2026-10-08","Care: Veterinary care",86,"<5"],["2026-10-08","Build: Construction trades",94,"115"],
 ["2026-09-24","Innovate: High economic impact (wage-based)",null,"426"],["2026-09-24","Innovate: High economic impact (points)",131,"288"],
 ["2026-09-17","Rural/remote health support initiative",60,"33"],
 ["2026-09-10","Care: Childcare",99,"182"],["2026-09-10","Care: Health",76,"143"],["2026-09-10","Care: Veterinary care",90,"<5"],["2026-09-10","Build: Construction trades",94,"104"],
 ["2026-08-20","Innovate: High economic impact (wage-based)",null,"337"],["2026-08-20","Innovate: High economic impact (points)",132,"265"],
 ["2026-08-06","Care: Childcare",102,"183"],["2026-08-06","Care: Health",84,"124"],["2026-08-06","Care: Education",68,"<5"],["2026-08-06","Care: Veterinary care",72,"6"],["2026-08-06","Build: Construction trades",88,"187"],
 ["2026-07-23","Rural/remote health support initiative",50,"60"],
 ["2026-07-16","Innovate: High economic impact (wage-based)",null,"223"],["2026-07-16","Innovate: High economic impact (points)",132,"346"],
 ["2026-07-09","Care: Childcare",108,"91"],["2026-07-09","Care: Health",96,"116"],["2026-07-09","Care: Veterinary care",88,"<5"],["2026-07-09","Build: Construction trades",97,"136"],
 ["2026-06-18","Innovate: High economic impact (wage-based)",null,"130"],["2026-06-18","Innovate: High economic impact (points)",136,"149"],
 ["2026-06-02","Care: Childcare",111,"91"],["2026-06-02","Care: Health",100,"117"],["2026-06-02","Care: Veterinary care",92,"6"],["2026-06-02","Build: Construction trades",101,"128"],
 ["2026-05-14","Innovate: High economic impact (wage-based)",null,"225"],["2026-05-14","Innovate: High economic impact (points)",135,"212"],
 ["2026-05-06","Care: Childcare",115,"86"],["2026-05-06","Care: Health",108,"117"],["2026-05-06","Care: Veterinary care",100,"9"],["2026-05-06","Build: Construction trades",108,"121"],
 ["2026-04-22","Innovate: High economic impact (wage-based)",null,"252"],["2026-04-22","Innovate: High economic impact (points)",138,"232"],
 ["2026-02-11","Innovate: High economic impact (wage-based)",null,"195"],["2026-02-11","Innovate: High economic impact (points)",135,"265"],
 ["2026-02-04","Innovate: High economic impact (wage-based)",null,"206"],["2026-02-04","Innovate: High economic impact (points)",138,"223"]];
const ENT_DRAWS = [["2026-09-22","Base",119,"10"],["2026-09-22","Regional",119,"<5"],["2026-08-25","Base",116,"11"],["2026-08-25","Regional",116,"5"],["2026-07-28","Base",117,"10"],
 ["2026-06-30","Base",118,"14"],["2026-06-30","Regional",113,"<5"],["2026-06-02","Base",117,"15"],["2026-06-02","Regional",117,"<5"],["2026-05-05","Base",115,"8"],["2026-05-05","Regional",115,"<5"],
 ["2026-04-14","Base",115,"14"],["2026-03-10","Base",117,"7"],["2026-03-10","Regional",129,"<5"],["2026-02-10","Base",121,"13"],["2026-02-10","Regional",105,"<5"],["2026-01-13","Base",115,"7"]];
const PNP_TABS=[
  {key:"pnp",label:"BC PNP Skills",data:PNP_DRAWS,group:"Priority group",scored:true,nullLabel:"Wage-based",
    note:you=>`Skills Immigration rounds to October 8, 2026. There were no general rounds in 2026; all invitations targeted priority groups. Highlighted rows have a minimum score at or below the candidate's SIRS${you!=null?` (${you})`:""}. Wage-based rounds invite by job offer wage, not points.`},
  {key:"ent",label:"BC PNP Entrepreneur",data:ENT_DRAWS,group:"Stream",scored:false,
    note:()=>"Entrepreneur Immigration rounds to September 22, 2026. Entrepreneur scores use a separate system and aren't estimated by this tool."}];
const RCIP = {
  nos:{grid:"nos",cutoffs:[91,94],gridNote:"Based on North Okanagan Shuswap's published point factors; NOC category points are estimated from the occupation's sector.",hint:"North Okanagan Shuswap sets a minimum wage per NOC and gives up to 5 points for paying above it.",name:"North Okanagan Shuswap",status:"Accepting: last 2026 intake window Nov 8–15. Community ranks candidates; recent cut-offs 91–94 on its own points grid.",open:true},
  pl:{grid:"generic",gridNote:"Peace Liard doesn't publish its grid, so this uses the common RCIP structure as an estimate.",hint:"Peace Liard ranks with a scoring grid it shares only with applicants, so its score here is an estimate.",name:"Peace Liard",status:"Its second 2026 intake ran October 13–20 for designated employers without a recommendation yet this year. Watch for the 2027 intake dates.",open:false},
  wk:{grid:"wk",gridNote:"Based on West Kootenay's published 2026 scoring grid.",hint:"West Kootenay gives sector points plus NOC points, capped at 25.",name:"West Kootenay",status:"Closed for 2026 after its September intake. Next intake in 2027.",open:false}};
const NOCS={
 wk:[["11100","Financial auditors and accountants",10],["12200","Accounting technicians and bookkeepers",5],["13110","Administrative assistants",5],["31301","Registered nurses",5],["32101","Licensed practical nurses",5],["33102","Nurse aides, orderlies, patient service associates",5],["42201","Social and community service workers",5],["42202","Early childhood educators and assistants",5],["60020","Retail and wholesale trade managers",5],["60030","Restaurant and food service managers",5],["62200","Chefs",5],["63100","Insurance agents and brokers",5],["72400","Construction millwrights and industrial mechanics",5],["72410","Automotive service technicians and mechanics",5],["73300","Transport truck drivers",5],["94140","Process control and machine operators, food and beverage",5],["44101","Home support workers and caregivers",0],["63200","Cooks",0],["63202","Bakers",0],["64314","Hotel front desk clerks",0],["65200","Food and beverage servers",0],["73112","Painters and decorators",0],["75101","Material handlers",0],["75110","Construction trades helpers and labourers",0],["95109","Other labourers in processing and manufacturing",0],["14100","General office support workers (secondary)",0],["65201","Food counter attendants, kitchen helpers (secondary)",0],["65310","Light duty cleaners (secondary)",0],["72310","Carpenters (secondary)",0],["72401","Heavy-duty equipment mechanics (secondary)",0],["75119","Other trades helpers and labourers (secondary)",0]],
 nos:[["12200","Accounting technicians and bookkeepers",22],["13100","Administrative officers",24.64],["13111","Legal administrative assistants",22],["14200","Accounting and related clerks",22],["21321","Industrial and manufacturing engineers",32.92],["32124","Pharmacy technicians",22],["33100","Dental assistants",29],["33101","Medical laboratory assistants",23.99],["33102","Nurse aides, orderlies, patient service associates",23],["42201","Social and community service workers",22],["42202","Early childhood educators",22],["60030","Restaurant and food service managers",25],["62010","Retail sales supervisors",22],["62021","Executive housekeepers",25],["63100","Insurance agents and brokers",22],["63202","Bakers",22],["65310","Light duty cleaners",22],["72310","Carpenters",26],["72402","HVAC and refrigeration mechanics",30],["72410","Automotive service technicians and mechanics",22],["73300","Transport truck drivers",22],["75110","Construction trades helpers",22],["90010","Manufacturing managers",35.54],["94140","Process control and machine operators, food and beverage",22],["94212","Plastic products assemblers, finishers, inspectors",22]],
 pl:[["60031","Accommodation service managers"],["12200","Accounting technicians and bookkeepers"],["13110","Administrative assistants"],["13100","Administrative officers"],["72404","Aircraft mechanics and inspectors"],["72600","Air pilots, flight engineers and instructors"],["72410","Automotive service technicians and mechanics"],["65100","Cashiers"],["42201","Social and community service workers"],["22220","Computer network and web technicians"],["63200","Cooks"],["42202","Early childhood educators and assistants"],["62020","Food service supervisors"],["64314","Hotel front desk clerks"],["73201","Building maintenance workers and superintendents"],["14100","General office support workers"],["21222","Information systems specialists"],["65310","Light duty cleaners"],["33109","Other assisting occupations in health services"],["33103","Pharmacy technical assistants"],["60030","Restaurant and food service managers"],["60020","Retail and wholesale trade managers"],["62010","Retail sales supervisors"],["14401","Storekeepers and partspersons"],["73300","Transport truck drivers (local)"]]};
for(const k in RCIP) RCIP[k].nocs=NOCS[k];
const RCIP_NONE="BC's RCIP communities are North Okanagan Shuswap, Peace Liard and West Kootenay. A job offer from a designated employer there opens this pathway; choose the community in section 5.";
function readProv(){ return {area:+$("area").value, regional:$("regional").value==="yes", designation:$("designation").value==="yes", ha:$("ha").value==="yes"}; }
function sirs(p){
  const rows=[];
  const wage=Math.max(0,Math.min(55,Math.floor(p.wage)-15));
  let area={1:0,2:5,3:15}[p.area]; const reg=(p.area!==1 && p.regional)?10:0;
  const dr={0:0,0.5:1,1:4,2:8,3:12,4:16,5:20}[p.drYears] + (p.drCdn&&p.drYears>=1?10:0) + (p.current?10:0);
  let ed={none:0,hs:0,one:5,two:5,bach:15,twoplus:15,master:22,phd:27}[p.edu];
  if(p.pgcert && ed<15) ed=15;
  if(p.edu!=="none" && p.edu!=="hs"){ ed += p.eduWhere==="prov"?8:p.eduWhere==="canada"?6:0; }
  if(p.designation) ed+=5;
  ed=Math.min(40,ed);
  const best = [p.en,p.fr].filter(Boolean).reduce((a,c)=>Math.max(a,c.min),0);
  let lg = best>=9?30:best===8?25:best===7?20:best===6?15:best===5?10:best===4?5:0;
  if(p.en && p.fr && p.en.min>=4 && p.fr.min>=4) lg+=10;
  lg=Math.min(40,lg);
  const drC=Math.min(40,dr);
  rows.push(["Directly related work experience",drC],["Education",ed],["Language",lg],["Hourly wage",wage],["Area of employment",area+reg]);
  return {total:drC+ed+lg+wage+area+reg, rows, human:drC+ed+lg, econ:wage+area+reg};
}
function bcPriority(p){
  const map={health:"Care: Health",physician:"Care: Health",ece:"Care: Childcare",vet:"Care: Veterinary care",teacherFr:"Care: Education",trades:"Build: Construction trades"};
  if(map[p.occ]) return map[p.occ];
  if(p.occ==="stem"||p.occ==="seniormgr"||p.occ==="researcher") return "Innovate: High economic impact (points)";
  return null;
}
const pnpScore=sirs;
function pnpCard(p,c,eeOk){
  if(p.jobOffer){
    const s=sirs(p), pr=bcPriority(p);
    const sw = p.offerTeer<=3 && (+p.cdnYears + +p.forYears)>=2;
    const lastPr = pr ? PNP_DRAWS.find(d=>d[1]===pr) : null;
    const pills=[];
    if(p.ha) pills.push(pill("Health Authority stream: apply directly","good"));
    pills.push(sw?pill("Skilled Worker: meets basics","good"):pill("Skilled Worker: not yet","bad"));
    if(pr) pills.push(pill(pr,"neutral")); else pills.push(pill("No 2026 priority group","warn"));
    let cmp="";
    if(lastPr){ const ok=s.total>=lastPr[2]; cmp=`Latest ${esc(pr)} cut-off: <b>${lastPr[2]}</b> (${fmtD(lastPr[0])}). ${ok?`<b style="color:var(--good)">At or above</b> the latest cut-off.`:`About <b>${lastPr[2]-s.total}</b> points short.`}`; }
    else cmp="In 2026 the BC PNP has invited only Care, Build and Innovate priority groups (plus a rural health initiative). Candidates outside these groups can register, but no general rounds have been held this year.";
    const why=[]; if(p.offerTeer>3) why.push("Skilled Worker needs a TEER 0–3 job offer"); if((+p.cdnYears + +p.forYears)<2) why.push("Skilled Worker needs 2 years of skilled work experience");
    return {score:s.total,label:"BC PNP SIRS",extra:pr,html:`<div class="card"><div class="card-h"><div><span class="eyebrow">British Columbia · BC PNP Skills Immigration</span><h2>SIRS registration score</h2><div class="pills" style="margin-top:8px">${pills.join("")}</div></div><div class="score">${s.total}<small>of 200</small></div></div>
      ${lastPr?`<div class="meter"><i style="width:${Math.min(100,s.total/Math.max(lastPr[2],s.total)*100)}%"></i></div>`:""}
      <p class="cmp">${cmp}</p>
      ${why.length?`<ul class="reasons">${why.map(w=>`<li>${esc(w)}</li>`).join("")}</ul>`:""}
      ${eeOk?`<p class="cmp">Eligible for Express Entry, so the candidate could use the BC PNP Express Entry option. A nomination adds 600 CRS points: <b>${c.total} → ${c.total+600}</b>, well above every 2026 PNP round (latest ${drawStats("PNP").latest[4]}).</p>`:""}
      <details class="more"><summary>SIRS breakdown</summary>${table(s.rows,s.total,"Total SIRS")}<p class="note">Human capital ${s.human}/120 · Economic ${s.econ}/80</p></details></div>`};
  } else {
    return {score:null,label:"BC PNP SIRS",html:`<div class="card"><span class="eyebrow">British Columbia · BC PNP</span><h2>Needs a BC job offer</h2><p class="cmp">Skills Immigration streams need a full-time, ongoing job offer from a BC employer. Add one in section 5 to see a SIRS score.</p></div>`};
  }
}
