# Builds tools/bc, tools/ab and tools/mb from template.html + prov_*.js.
import os, re
SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(SRC)
T = open(f"{SRC}/template.html").read()
L = open(f"{SRC}/bc_offer_html.txt").read().split("\n")
WAGE, TEER, AREA, REGIONAL, DRY, DRCDN, CURRENT, DESIG, HA, TIER, RCIPSEL, DESWRAP = L[:12]

def current(label):
    return re.sub(r'<label for="current">[^<]*</label>', f'<label for="current">{label}</label>', CURRENT)

def rcip_select(opts):
    o = '<option value="">Not in an RCIP community</option>' + "".join(f'<option value="{k}">{v}</option>' for k, v in opts)
    return re.sub(r'<select id="rcip">.*?</select>', f'<select id="rcip">{o}</select>', RCIPSEL)

def sel(id_, label, opts, sub="", full=False):
    o = "".join(f'<option value="{v}"{" selected" if s else ""}>{t}</option>' for v, t, s in opts)
    return (f'          <div class="f{" full" if full else ""}"><label for="{id_}">{label}</label><select id="{id_}">{o}</select>'
            + (f'<span class="sub">{sub}</span>' if sub else "") + "</div>")

YN = lambda yes=False: [("no", "No", not yes), ("yes", "Yes", yes)]

P = {}
P["bc"] = dict(
    TITLE="BC Pathway Check", PROVNAME="British Columbia", SHORT="BC", PNP="BC PNP", PNP_THE="the BC PNP",
    PGCERT_SUB="Counts for BC PNP education points", OCC_FOR="BC PNP priorities",
    SEC5_TITLE="Job offer in British Columbia", SEC5_HINT="Needed for BC PNP and RCIP",
    PROV_FIELDS="",
    OFFER_FIELDS="\n".join([WAGE, TEER, AREA, REGIONAL, DRY, DRCDN, CURRENT, DESIG, HA, TIER, RCIPSEL, DESWRAP]),
    RESULT_ITEMS="<li>BC PNP Skills Immigration (SIRS) score and priority group</li><li>RCIP eligibility in BC's three communities</li>",
    DISCLAIMER="This tool gives a tentative estimate for general information only. It is not immigration advice and doesn't guarantee an invitation, nomination or visa. Scores depend on documents that IRCC and the BC PNP verify. Express Entry scoring follows IRCC's Comprehensive Ranking System, including the changes announced for November 3, 2026; the full revised grid had not been published by IRCC at the time of writing, so the high-wage parts are estimates. BC PNP scoring follows the Skills Immigration Program Guide (Part 8). Proof-of-funds amounts are IRCC's July 2025 figures; IRCC updates them yearly. Draw data: Express Entry to October 16, 2026; BC PNP to October 8, 2026. For advice on a specific case, consult a licensed immigration consultant (CICC) or lawyer.",
    META="Free BC immigration self-assessment: tentative Express Entry CRS, Federal Skilled Worker, BC PNP SIRS and RCIP community scores, plus every 2026 draw. Not legal advice.",
    PAGE="bc-tool")

P["ab"] = dict(
    TITLE="Alberta Pathway Check", PROVNAME="Alberta", SHORT="Alberta", PNP="AAIP", PNP_THE="the Alberta Advantage Immigration Program (AAIP)",
    PGCERT_SUB="Counts as a post-secondary credential", OCC_FOR="AAIP priority sectors",
    SEC5_TITLE="Alberta connection and job offer", SEC5_HINT="Needed for AAIP and RCIP",
    PROV_FIELDS='<div class="grid">\n' + "\n".join([
        sel("abExpWhere", "Where is the candidate's Canadian work experience (6+ months)?", [("none", "No Canadian work experience", False), ("ab", "In Alberta", True), ("canada", "In Canada, outside Alberta", False)]),
        sel("abFamily", "Parent, child or sibling in Alberta (citizen or PR)?", YN()),
        sel("abCertReg", "Alberta certification or licence for a regulated occupation?", YN(), "e.g. Alberta journeyperson certificate, nursing licence"),
    ]) + "\n        </div>\n        ",
    OFFER_FIELDS="\n".join([WAGE, TEER,
        sel("abLoc", "Work location", [("cma", "Calgary or Edmonton area (CMA)", False), ("outside", "Elsewhere in Alberta", True)], full=True),
        sel("abSector", "Sector of the job (for Alberta Express Entry priority sectors)", [("none", "Not a priority sector / unsure", False), ("health", "Health care", False), ("tech", "Technology (Accelerated Tech Pathway)", True), ("agri", "Agriculture", False), ("construction", "Construction or skilled trades", False), ("aviation", "Aviation", False), ("manufacturing", "Manufacturing", False)], full=True),
        sel("abEndorse", "Endorsement or designated employer", [("none", "None", True), ("rrs", "Rural Renewal community endorsement", False), ("tourism", "Tourism and hospitality employer (approved)", False), ("law", "Alberta police service (law enforcement)", False)], "Each adds 6 EOI points and opens its own stream", full=True),
        DRY, DRCDN, current("Currently working full-time in Alberta for this employer?"), TIER,
        rcip_select([("cl", "Claresholm (including Granum and Stavely)")]), DESWRAP]),
    RESULT_ITEMS="<li>AAIP Worker EOI score (out of 100) and the streams the candidate may fit</li><li>RCIP eligibility in Claresholm</li>",
    DISCLAIMER="This tool gives a tentative estimate for general information only. It is not immigration advice and doesn't guarantee an invitation, nomination or visa. Scores depend on documents that IRCC and the Government of Alberta verify. Express Entry scoring follows IRCC's Comprehensive Ranking System, including the changes announced for November 3, 2026; the full revised grid had not been published by IRCC at the time of writing, so the high-wage parts are estimates. AAIP scoring follows the Alberta Worker Expression of Interest points grid; stream requirements are simplified. Claresholm doesn't publish its RCIP points grid, so community points are estimates. Proof-of-funds amounts are IRCC's July 2025 figures. Draw data: Express Entry to October 16, 2026; AAIP to October 20, 2026. For advice on a specific case, consult a licensed immigration consultant (CICC) or lawyer.",
    META="Free Alberta immigration self-assessment: tentative Express Entry CRS, Federal Skilled Worker, AAIP Worker EOI and Claresholm RCIP scores, plus every 2026 draw. Not legal advice.",
    PAGE="ab-tool")

P["mb"] = dict(
    TITLE="Manitoba Pathway Check", PROVNAME="Manitoba", SHORT="Manitoba", PNP="MPNP", PNP_THE="the Manitoba Provincial Nominee Program (MPNP)",
    PGCERT_SUB="Counts as a post-secondary credential", OCC_FOR="MPNP occupation-targeted draws",
    SEC5_TITLE="Manitoba connection and job offer", SEC5_HINT="Needed for MPNP and RCIP",
    PROV_FIELDS='<div class="grid">\n' + "\n".join([
        sel("mbRel", "Family or friends in Manitoba", [("none", "None", True), ("close", "Close relative (parent, sibling, child, aunt/uncle, grandparent, niece/nephew, first cousin)", False), ("friend", "Close friend or distant relative", False)], full=True),
        sel("mbPastWork", "Worked in Manitoba before for 6+ months?", YN()),
        sel("mbStudy", "Post-secondary study completed in Manitoba", [("0", "None", True), ("1", "1 year", False), ("2", "2 years or more", False)]),
        sel("mbIta", "Invited by Manitoba through a strategic recruitment initiative?", YN(), "e.g. an exploratory visit or employer mission"),
        sel("mbOutside", "Plans to live outside Winnipeg?", YN()),
        sel("mbLicence", "Occupation fully recognized by a Manitoba licensing body?", YN()),
        sel("mbOtherWork", "Worked 1+ year in another Canadian province?", YN(), "Lowers the MPNP score unless the candidate also has Manitoba work"),
        sel("mbOtherStudy", "Studied 1+ year in another Canadian province?", YN()),
    ]) + "\n        </div>\n        ",
    OFFER_FIELDS="\n".join([WAGE, TEER, DRY, DRCDN, current("Working full-time for this Manitoba employer for 6+ months now?"), TIER,
        rcip_select([("br", "Brandon"), ("al", "Altona / Rhineland"), ("st", "Steinbach")]), DESWRAP]),
    RESULT_ITEMS="<li>MPNP EOI ranking score (out of 1,000) and the streams the candidate may fit</li><li>RCIP eligibility in Brandon, Altona / Rhineland and Steinbach</li>",
    DISCLAIMER="This tool gives a tentative estimate for general information only. It is not immigration advice and doesn't guarantee an invitation, nomination or visa. Scores depend on documents that IRCC and the Manitoba Provincial Nominee Program verify. Express Entry scoring follows IRCC's Comprehensive Ranking System, including the changes announced for November 3, 2026; the full revised grid had not been published by IRCC at the time of writing, so the high-wage parts are estimates. MPNP scoring follows the Skilled Worker EOI ranking factors; stream requirements are simplified. Manitoba's RCIP communities don't publish points grids, so community points are estimates. Proof-of-funds amounts are IRCC's July 2025 figures. Draw data: Express Entry to October 16, 2026; MPNP to October 22, 2026. For advice on a specific case, consult a licensed immigration consultant (CICC) or lawyer.",
    META="Free Manitoba immigration self-assessment: tentative Express Entry CRS, Federal Skilled Worker, MPNP EOI and RCIP community scores, plus every 2026 draw. Not legal advice.",
    PAGE="mb-tool")

HEAD = '''<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="@@META@@">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' rx='9' fill='%233f7a72'/%3E%3Ccircle cx='10' cy='12' r='2.4' fill='white'/%3E%3Ccircle cx='15' cy='12' r='2.4' fill='white' opacity='.75'/%3E%3Ccircle cx='20' cy='12' r='2.4' fill='white' opacity='.5'/%3E%3Cpath d='M7 19c2.6 2 5.4 2 8 0s5.4-2 8 0' fill='none' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E">
<title>@@SEOTITLE@@</title>
<link rel="canonical" href="https://workerpool.ca/tools/@@KEY@@/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="WorkerPool">
<meta property="og:locale" content="en_CA">
<meta property="og:title" content="@@SEOTITLE@@">
<meta property="og:description" content="@@META@@">
<meta property="og:url" content="https://workerpool.ca/tools/@@KEY@@/">
<meta property="og:image" content="https://workerpool.ca/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="@@SEOTITLE@@">
<meta name="twitter:description" content="@@META@@">
<meta name="twitter:image" content="https://workerpool.ca/assets/og.png">
@@LD@@'''

SEO = {
    "bc": "BC PNP &amp; Express Entry CRS Calculator 2026 – Free BC Pathway Check | WorkerPool",
    "ab": "AAIP &amp; Express Entry CRS Calculator 2026 – Free Alberta Pathway Check | WorkerPool",
    "mb": "MPNP &amp; Express Entry CRS Calculator 2026 – Free Manitoba Pathway Check | WorkerPool",
}
import json
def ld_for(key, cfg):
    url = f"https://workerpool.ca/tools/{key}/"
    g = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebApplication", "name": cfg["TITLE"], "url": url, "applicationCategory": "UtilitiesApplication",
         "operatingSystem": "Any", "inLanguage": "en-CA", "isAccessibleForFree": True, "description": cfg["META"],
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "CAD"},
         "publisher": {"@type": "Organization", "name": "WorkerPool", "url": "https://workerpool.ca/"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "WorkerPool", "item": "https://workerpool.ca/"},
            {"@type": "ListItem", "position": 2, "name": cfg["TITLE"], "item": url}]}]}
    return '<script type="application/ld+json">' + json.dumps(g, separators=(",", ":")) + "</script>"

for key, cfg in P.items():
    s = T.replace("@@PROVINCE_JS@@*/", "*/\n" + open(f"{SRC}/prov_{key}.js").read())
    # standalone artifact-style source (for previews)
    for k, v in cfg.items():
        s = s.replace(f"@@{k}@@", v)
    assert "@@" not in s, re.findall(r"@@\w+@@", s)
    pass
    pass
    # website page
    w = s.replace(f'<title>{cfg["TITLE"]}</title>\n<meta name="claude:viewport-fit-sides" content="cover">',
                  HEAD.replace("@@LD@@", ld_for(key, cfg)).replace("@@META@@", cfg["META"]).replace("@@SEOTITLE@@", SEO[key]).replace("@@KEY@@", key), 1)
    w = w.replace("body{background:var(--bg)", "body{margin:0;background:var(--bg)", 1)
    w = w.replace("</style>\n\n<div class=\"gate\"", "</style>\n</head>\n<body>\n<div class=\"gate\"", 1)
    w = w.rstrip() + f'\n<script>window.WPA_PAGE="{cfg["PAGE"]}";</script>\n<script src="/assets/wpa.js" defer></script>\n</body>\n</html>\n'
    assert w.startswith("<!doctype html>") and "<body>" in w and "margin:0;background" in w
    os.makedirs(f"{OUT}/{key}", exist_ok=True)
    open(f"{OUT}/{key}/index.html", "w").write(w)
    print(key, len(w))
