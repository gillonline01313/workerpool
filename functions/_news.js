// Shared "Hot & New" ticker helpers: starter items and ranking.
// Starter items show on the site until the news table exists, and the admin "Add starter items" button saves them.
const G = "/express-entry-2026/";
export const NEWS_SEED = [
  { title: "Express Entry: up to 150 new points for Canadian experience or a job offer from Nov 3", tag: "hot", pinned: 1,
    summary: "A new Labour Market Integration factor gives points for Canadian work experience or a qualifying job offer, whichever scores higher.", link: G },
  { title: "Job offer points are back: up to 100 CRS points, no LMIA needed", tag: "hot",
    summary: "From November 3, 2026 a job offer in an eligible high-wage occupation can earn 50, 70 or 100 points without an LMIA.", link: G + "#job-offer" },
  { title: "Is your NOC on the high-wage list? Check all 186 occupations", tag: "new",
    summary: "Search by NOC code or job title and see your level and the points it can earn.", link: G + "#noc-check" },
  { title: "Free calculator: estimate your new Labour Market Integration points", tag: "trending",
    summary: "Enter your Canadian experience and job offer to see which route gives you more points.", link: G + "#calculator" },
  { title: "Choosing your NOC: your duties decide, not your job title", tag: "new",
    summary: "How to match your NOC the right way and why choosing one for points can lead to refusal.", link: G + "#choose-noc" },
  { title: "Up to 70 extra points for 12 months in a high-wage occupation", tag: "new",
    summary: "Experience in a NOC paying at least 2x, 1.5x or 1.3x the average median wage earns 70, 40 or 20 extra points.", link: G + "#experience" },
  { title: "Invitation rounds pause for up to two weeks while profiles are recalculated", tag: "update",
    summary: "IRCC will recalculate every profile when the changes take effect, then restart draws.", link: G + "#what-changed" },
  { title: "Have a job offer without an LMIA? How to enter it in your profile", tag: "update",
    summary: "The online form isn't updated yet, so IRCC gives placeholder LMIA details to use.", link: G + "#profile-tip" },
];

// Live items first by pin, then by a trending score (clicks weighted toward recent posts).
export function rankNews(rows) {
  const now = Date.now();
  const score = (r) => ((r.clicks || 0) + 3) / Math.pow((now - Date.parse(r.created || now)) / 864e5 + 2, 1.2);
  const sorted = rows.slice().sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || score(b) - score(a));
  // Auto "trending" flag: the two most-clicked items with at least 10 clicks.
  const top = rows.filter((r) => (r.clicks || 0) >= 10).sort((a, b) => b.clicks - a.clicks).slice(0, 2).map((r) => r.id);
  return sorted.map((r) => ({ id: r.id, title: r.title, summary: r.summary || "", tag: r.tag || "new", link: r.link || "",
    pinned: !!r.pinned, created: r.created, trending: top.includes(r.id) }));
}
