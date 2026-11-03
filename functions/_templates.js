// Ready-made emails for the admin Email tab. Pick one, read it over, adjust, send.
// {name} = the person's first name. {sender} = the care team member's first name chosen in "Signed by".
// The full signature (name, "Care Team, WorkerPool", website) is added under each message automatically.
// Keep wording personal and plain: no promises of jobs or visas, and no immigration advice
// (that comes only from licensed consultants and lawyers).

export const CARE_TEAM = ["Simran Kaur", "Harleen Sandhu", "Rahul Mehta", "Maria Santos", "Emily Carter", "Daniel Nguyen", "Priya Nair"];

export const TEMPLATES = [
  { id: "welcome", group: "Accounts", label: "Welcome: thanks for signing up",
    subject: "Your WorkerPool account",
    body: `Hi {name},

I'm {sender} from the WorkerPool care team. I saw your new account come in today and wanted to say hello personally.

When you have a few minutes, the next step is filling out your profile: your work history, language scores and what you're looking for. It takes about 10 minutes and you can stop and pick it up again later. Once it's in, someone from our team reads it and gives you a call.

If anything on the form is confusing, just reply to this email and I'll help.

Warm regards,` },

  { id: "unfinished", group: "Accounts", label: "Nudge: profile started but not finished",
    subject: "Did you get stuck on your profile?",
    body: `Hi {name},

I was going through new profiles this morning and noticed yours was started but not finished. That happens a lot, so no worries at all.

Your answers are saved, so you can sign in at workerpool.ca and carry on from where you stopped. If a question didn't make sense, or you weren't sure what to put, reply here and tell me which part. I'm happy to walk you through it.

Talk soon,` },

  { id: "received", group: "Candidates", label: "Profile received and reviewed",
    subject: "I've gone through your profile",
    body: `Hi {name},

Thank you for completing your WorkerPool profile. I've had a look through it and everything came through fine on our end.

Someone from our team will call you in the next few days to go over it with you and talk about next steps. If there's a better time of day to reach you, or a different number we should use, just reply and let me know.

Kind regards,` },

  { id: "missing", group: "Candidates", label: "Missing information in profile",
    subject: "A couple of details missing from your profile",
    body: `Hi {name},

I was reviewing your profile and a few details are missing that employers usually ask about:

-
-

Could you sign in at workerpool.ca and add these, or simply reply to this email with them? Once your profile is complete, it's much easier for us to put it in front of the right employers.

Thanks so much,` },

  { id: "no-answer", group: "Candidates", label: "Tried calling, no answer",
    subject: "Tried to reach you by phone",
    body: `Hi {name},

I tried calling you today about your WorkerPool profile but couldn't get through, so I thought I'd send a quick email instead.

Could you reply with a good time to call, and the best number to reach you on? If WhatsApp is easier for you, let me know that too.

Best,` },

  { id: "match", group: "Employer Match", label: "Employer Match: you're in",
    subject: "You're in Employer Match",
    body: `Hi {name},

Good news: I've added your profile to Employer Match.

Over the next two months we'll share your profile with Canadian employers who are hiring for roles like yours, at least five of them. If an employer is interested, they'll contact you directly, so keep an eye on your email and phone (and check your spam folder now and then).

Hiring decisions are always up to the employer, but a complete, up-to-date profile really helps. If anything changes, like a new job, new language scores or a move, just reply and I'll update it.

All the best,` },

  { id: "match-update", group: "Employer Match", label: "Employer Match: progress update",
    subject: "Quick update on Employer Match",
    body: `Hi {name},

Just a quick update: your profile has been shared with employers through Employer Match, and we're continuing to send it out to new openings as they come up.

Has any employer been in touch with you yet? If so, I'd love to hear how it went. And if anything in your profile has changed, reply and let me know so I can keep it current.

Regards,` },

  { id: "consultant", group: "Immigration help", label: "Passing to a licensed consultant",
    subject: "Connecting you with a licensed consultant",
    body: `Hi {name},

Thanks for asking for help with your immigration options. As you agreed in your profile, I'm passing your details to a licensed immigration consultant we work with.

Just so you know, we don't give immigration advice ourselves. The consultant will contact you directly, look at your situation and explain your options, including any fees they charge before any work begins.

If you don't hear from them within a few business days, reply to this email and I'll follow up for you.

Warm regards,` },

  { id: "student", group: "Student Pool", label: "Student Pool: profile reviewed",
    subject: "Your Student Pool profile",
    body: `Hi {name},

Thanks for sending in your Student Pool profile. I've passed it to our education consultant, who's going through your marks, English test and study plans now.

You'll hear back with study options that fit your profile shortly. If you have a preferred province, college, program or intake in mind, reply and tell me so we can take it into account.

Best wishes,` },

  { id: "student-docs", group: "Student Pool", label: "Student Pool: documents needed",
    subject: "One more document for your Student Pool profile",
    body: `Hi {name},

Our education consultant started on your profile and needs one more thing before suggesting programs:

-

You can reply to this email with it attached (PDF or a clear photo is fine).

Thank you,` },

  { id: "b2b", group: "B2B", label: "B2B: information received",
    subject: "We've received your information",
    body: `Hi {name},

Thanks for sending your information through WorkerPool Data Entry. I've checked it over and it's with our processing team now.

If we need anything else, I'll reach out by email. Otherwise you'll hear from us once it's ready. Feel free to reply with any questions in the meantime.

Kind regards,` },

  { id: "employer", group: "Employers", label: "Employer interest: thanks",
    subject: "Thanks for your interest in WorkerPool",
    body: `Hi {name},

Thank you for registering your interest with WorkerPool. I'd love to learn a bit more about your hiring needs.

Could you reply with the roles you're hiring for, the location, and roughly when you'd like people to start? Or, if a quick call is easier, send me a good time and number and I'll call you.

Looking forward to hearing from you,` },

  { id: "forum", group: "Forum", label: "Forum: welcome",
    subject: "Welcome to the WorkerPool forum",
    body: `Hi {name},

Welcome to the WorkerPool forum! It's a friendly place to ask questions and share what's worked for you, whether that's work permits, PR, the provincial programs or finding a job in your city.

A good first step is introducing yourself or posting a question in the category that fits. Please keep personal documents and ID numbers off the forum.

See you there,` },

  { id: "checkin", group: "Anyone", label: "Checking in",
    subject: "Checking in",
    body: `Hi {name},

It's been a little while, so I wanted to check in and see how things are going.

Is there anything you need from us right now, or anything in your situation that's changed? Just hit reply. I read every message.

Take care,` },

  { id: "closing", group: "Anyone", label: "Can't help right now (gentle)",
    subject: "About your WorkerPool profile",
    body: `Hi {name},

Thank you for your patience while I went through your profile.

At the moment we don't have employers or partners that fit what you're looking for, so I didn't want to leave you waiting without an update. Your profile stays on file, and if something suitable comes up we'll get in touch.

If your situation changes, like new work experience or language scores, reply and let me know.

Wishing you all the best,` },
];
