// ============================================================================
// leadsData.js
// ----------------------------------------------------------------------------
// Mock data + scoring logic for the Sales Pipeline Agent (v1).
//
// This file contains NO React and NO browser code, so it is safe and easy to
// reuse later (e.g. when you add CSV import or a real database). For v1 it is
// the single source of truth for the dashboard's sample leads.
//
// Two things live here:
//   1. PIPELINE_STAGES, CATEGORIES, SIZES  -> the allowed option values
//   2. scoreLead()                          -> turns a lead into a 0-100 fit
//      score + a priority label (High / Medium / Low)
//   3. SAMPLE_LEADS                         -> the mock rows shown in the table
// ============================================================================

// The pipeline stages, in order. Used for the status dropdown and badges.
export const PIPELINE_STAGES = [
  "New",
  "Qualified",
  "Contacted",
  "Follow-up",
  "Interested",
  "Closed",
];

// The kinds of institutes we sell to.
export const CATEGORIES = [
  "SAT prep",
  "Tutoring",
  "Admissions consulting",
];

// Rough size buckets. We prefer small/medium for B2B outreach.
export const SIZES = ["Small", "Medium", "Large"];

// ----------------------------------------------------------------------------
// SCORING
// ----------------------------------------------------------------------------
// scoreLead() looks at four signals and returns a number from 0 to 100.
// Higher = better fit for Wryze.ai's SAT-focused B2B outreach.
//
//   1. US-based            -> up to 30 points  (your target market)
//   2. SAT relevance       -> up to 30 points  (closer to SAT = better)
//   3. Small/medium size   -> up to 25 points  (easier to sell to)
//   4. Signs of active biz -> up to 15 points  (has website + contact)
//
// You can tweak these numbers later without touching the rest of the app.
export function scoreLead(lead) {
  let score = 0;

  // 1) US-based --------------------------------------------------------------
  if (lead.country === "USA") {
    score += 30;
  } else if (lead.country === "Canada") {
    score += 10; // nearby market, partial credit
  }

  // 2) SAT relevance ---------------------------------------------------------
  if (lead.category === "SAT prep") {
    score += 30; // most relevant
  } else if (lead.category === "Tutoring") {
    score += 20; // likely teaches SAT among other things
  } else if (lead.category === "Admissions consulting") {
    score += 15; // adjacent, SAT comes up in their work
  }

  // 3) Small / medium size ---------------------------------------------------
  if (lead.estimatedSize === "Small") {
    score += 25;
  } else if (lead.estimatedSize === "Medium") {
    score += 25;
  } else if (lead.estimatedSize === "Large") {
    score += 8; // harder to reach a decision maker
  }

  // 4) Signs of an active business ------------------------------------------
  // We give credit for having a real website and a reachable contact.
  if (lead.website && lead.website.length > 0) score += 7;
  if (lead.contactEmail && lead.contactEmail.length > 0) score += 8;

  // Keep the score inside 0-100 just in case.
  return Math.max(0, Math.min(100, score));
}

// Turn a numeric score into a priority label.
export function priorityFromScore(score) {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

// ----------------------------------------------------------------------------
// SAMPLE / MOCK LEADS
// ----------------------------------------------------------------------------
// These are made-up examples so you can see the dashboard working. The fit
// score and priority are calculated automatically from the fields above, so
// you only need to fill in the real-world facts.
//
// NOTE: websites/emails below are placeholders for demo purposes only.
const RAW_LEADS = [
  {
    id: 1,
    instituteName: "Summit SAT Academy",
    website: "https://summitsatacademy.example.com",
    city: "Austin",
    state: "TX",
    country: "USA",
    category: "SAT prep",
    estimatedSize: "Small",
    contactPerson: "Dana Reyes",
    contactEmail: "dana@summitsatacademy.example.com",
    contactLink: "https://www.linkedin.com/in/example-dana",
    status: "New",
    notes: "Found via local listing. Runs weekend SAT bootcamps.",
    outreachDraft: "",
  },
  {
    id: 2,
    instituteName: "BrightPath Tutoring",
    website: "https://brightpathtutoring.example.com",
    city: "Columbus",
    state: "OH",
    country: "USA",
    category: "Tutoring",
    estimatedSize: "Medium",
    contactPerson: "Marcus Lee",
    contactEmail: "marcus@brightpathtutoring.example.com",
    contactLink: "https://brightpathtutoring.example.com/contact",
    status: "Qualified",
    notes: "Offers SAT/ACT plus general K-12 tutoring.",
    outreachDraft: "",
  },
  {
    id: 3,
    instituteName: "Ivy Gate Admissions",
    website: "https://ivygate.example.com",
    city: "Boston",
    state: "MA",
    country: "USA",
    category: "Admissions consulting",
    estimatedSize: "Small",
    contactPerson: "Priya Nair",
    contactEmail: "priya@ivygate.example.com",
    contactLink: "https://www.linkedin.com/in/example-priya",
    status: "Contacted",
    notes: "College admissions focus; SAT is part of their advising.",
    outreachDraft: "",
  },
  {
    id: 4,
    instituteName: "Pacific Prep Center",
    website: "https://pacificprep.example.com",
    city: "San Diego",
    state: "CA",
    country: "USA",
    category: "SAT prep",
    estimatedSize: "Medium",
    contactPerson: "Alex Chen",
    contactEmail: "alex@pacificprep.example.com",
    contactLink: "https://www.linkedin.com/company/example-pacificprep",
    status: "Follow-up",
    notes: "Replied to first email, asked for a demo next month.",
    outreachDraft: "",
  },
  {
    id: 5,
    instituteName: "Maple Scholars",
    website: "https://maplescholars.example.com",
    city: "Toronto",
    state: "ON",
    country: "Canada",
    category: "Tutoring",
    estimatedSize: "Small",
    contactPerson: "Sara Okafor",
    contactEmail: "",
    contactLink: "https://maplescholars.example.com/contact",
    status: "New",
    notes: "Canada-based. SAT is a smaller part of their offering.",
    outreachDraft: "",
  },
  {
    id: 6,
    instituteName: "National Test Masters",
    website: "https://nationaltestmasters.example.com",
    city: "Chicago",
    state: "IL",
    country: "USA",
    category: "SAT prep",
    estimatedSize: "Large",
    contactPerson: "Jordan Smith",
    contactEmail: "jordan@nationaltestmasters.example.com",
    contactLink: "https://www.linkedin.com/company/example-ntm",
    status: "Interested",
    notes: "Large chain. Harder to reach a decision maker, but interested.",
    outreachDraft: "",
  },
  {
    id: 7,
    instituteName: "Cornerstone SAT Studio",
    website: "https://cornerstonesat.example.com",
    city: "Raleigh",
    state: "NC",
    country: "USA",
    category: "SAT prep",
    estimatedSize: "Small",
    contactPerson: "Lena Park",
    contactEmail: "lena@cornerstonesat.example.com",
    contactLink: "https://www.linkedin.com/in/example-lena",
    status: "New",
    notes: "Boutique SAT studio. Very strong fit.",
    outreachDraft: "",
  },
  {
    id: 8,
    instituteName: "Apex Admissions Group",
    website: "https://apexadmissions.example.com",
    city: "Seattle",
    state: "WA",
    country: "USA",
    category: "Admissions consulting",
    estimatedSize: "Medium",
    contactPerson: "Tom Alvarez",
    contactEmail: "tom@apexadmissions.example.com",
    contactLink: "https://www.linkedin.com/company/example-apex",
    status: "Closed",
    notes: "Signed up last quarter. Reference customer.",
    outreachDraft: "",
  },
];

// Attach the computed score + priority to every lead so the UI doesn't have
// to recalculate. (.map runs scoreLead once per lead.)
export const SAMPLE_LEADS = RAW_LEADS.map((lead) => {
  const satFitScore = scoreLead(lead);
  return {
    ...lead,
    satFitScore,
    priority: priorityFromScore(satFitScore),
  };
});
