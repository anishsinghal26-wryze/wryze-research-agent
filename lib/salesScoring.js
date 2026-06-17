function clamp(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function priorityFromScore(score) {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

export function scoreB2B(lead) {
  const signals = {};
  let score = 0;

  if (lead.country === "USA") signals.us_based = 30;
  else if (lead.country === "Canada") signals.us_based = 10;
  else signals.us_based = 0;
  score += signals.us_based;

  if (lead.category === "SAT prep") signals.sat_relevance = 30;
  else if (lead.category === "Tutoring") signals.sat_relevance = 20;
  else if (lead.category === "Admissions consulting") signals.sat_relevance = 15;
  else signals.sat_relevance = 0;
  score += signals.sat_relevance;

  if (lead.estimated_size === "Small") signals.size = 25;
  else if (lead.estimated_size === "Medium") signals.size = 25;
  else if (lead.estimated_size === "Large") signals.size = 8;
  else signals.size = 0;
  score += signals.size;

  signals.has_website = lead.website && lead.website.length > 0 ? 7 : 0;
  signals.has_contact_email = lead.contact_email && lead.contact_email.length > 0 ? 8 : 0;
  score += signals.has_website + signals.has_contact_email;

  const fit_score = clamp(score);
  const priority = priorityFromScore(fit_score);
  const rationale =
    `B2B fit ${fit_score}: location ${signals.us_based}, SAT relevance ${signals.sat_relevance}, size ${signals.size}, website ${signals.has_website}, email ${signals.has_contact_email}.`;

  return { fit_score, priority, rationale, signals, rubric_version: "b2b-v1" };
}

export function scoreD2C(lead) {
  const md = (lead && lead.metadata) || {};
  const signals = {};
  let score = 0;

  if (md.sat_timeline === "lt_3mo") signals.sat_timeline = 30;
  else if (md.sat_timeline === "3_6mo") signals.sat_timeline = 20;
  else if (md.sat_timeline === "gt_6mo") signals.sat_timeline = 10;
  else signals.sat_timeline = 0;
  score += signals.sat_timeline;

  if (md.urgency === "high") signals.urgency = 25;
  else if (md.urgency === "medium") signals.urgency = 15;
  else if (md.urgency === "low") signals.urgency = 8;
  else signals.urgency = 0;
  score += signals.urgency;

  signals.contactability = 0;
  if (lead.contact_email && lead.contact_email.length > 0) signals.contactability += 12;
  if (lead.contact_link && lead.contact_link.length > 0) signals.contactability += 8;
  score += signals.contactability;

  if (md.payment_ready === true) signals.payment_readiness = 15;
  else if (md.parent_involved === true) signals.payment_readiness = 8;
  else signals.payment_readiness = 0;
  score += signals.payment_readiness;

  if (lead.country === "USA") signals.market_fit = 10;
  else if (lead.country === "Canada") signals.market_fit = 5;
  else signals.market_fit = 0;
  score += signals.market_fit;

  const fit_score = clamp(score);
  const priority = priorityFromScore(fit_score);
  const rationale =
    `D2C fit ${fit_score}: timeline ${signals.sat_timeline}, urgency ${signals.urgency}, contactability ${signals.contactability}, payment ${signals.payment_readiness}, market ${signals.market_fit}.`;

  return { fit_score, priority, rationale, signals, rubric_version: "d2c-v1" };
}

export function scoreLead(lead) {
  const type = (lead && lead.lead_type) || "b2b";
  return type === "d2c" ? scoreD2C(lead) : scoreB2B(lead);
}
