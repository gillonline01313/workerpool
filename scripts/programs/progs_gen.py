import re,html,sys,os,json
CRED=re.compile(r"^(Ontario College (Graduate |Advanced )?(Certificate|Diploma)|Ontario College Advanced Diploma|(Honours )?Bachelor('s)? (of [A-Za-z ]+|Degree)?|Degree|Honours Degree|Bachelor's degree|Advanced Diploma|Diploma|Certificate|Post[- ](Degree|Diploma|Baccalaureate|Graduate) (Diploma|Certificate)|Graduate (Certificate|Diploma)|Master('s)?( of [A-Za-z ]+| Degree)?|Applied Degree|Associate Degree|Post-Secondary Certificate)$",re.I)
SKIP=re.compile(r"^(\d+(\.\d+)?[A-Z]?|[A-Z]{1,5}\d{2,5}[A-Z]?|\d{2}\.\d{2,4}|Program (title|code|name)|Credential:?|CIP( code)?:?|Campus:?|Length:?|Intake.*|View program|Learn more|Apply|Details|Program code:.*|Credential:.*|[-–—]|\*|Yes|No|N/A|Online|Full[- ]time|Part[- ]time)$",re.I)
def lines(path):
    t=open(path,encoding='utf-8',errors='ignore').read()
    if path.endswith('.html'):
        t=re.sub(r'(?is)<(script|style|noscript|svg|head)\b.*?</\1>','',t)
        t=re.sub(r'(?i)<(br|/p|/li|/tr|/h\d|/div|/td|/th|/a|/option|/span|/strong|/button|/dt|/dd)[^>]*>','\n',t)
        t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(t)
    L=[re.sub(r'\s+',' ',l).strip() for l in t.split('\n')]
    return [l for l in L if l]
def pairs(path):
    L=lines(path); out=[]
    for i,l in enumerate(L):
        if len(l)<70 and CRED.match(l):
            j=i-1
            while j>=0 and i-j<=6 and (SKIP.match(L[j]) or len(L[j])<3 or CRED.match(L[j])): j-=1
            if j>=0 and i-j<=6 and 3<len(L[j])<140: out.append((L[j],l))
    seen=set(); res=[]
    for n,c in out:
        if (n,c) not in seen: seen.add((n,c)); res.append((n,c))
    return res
if __name__=="__main__":
    d=sys.argv[1]
    for f in sorted(os.listdir(d)):
        if not f.endswith('.html'): continue
        p=pairs(os.path.join(d,f)); print(f.ljust(42), len(p), '|', ' ; '.join(f"{n} [{c}]" for n,c in p[:3])[:200])
