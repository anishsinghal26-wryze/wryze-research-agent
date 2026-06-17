-- ============================================================================
-- Wryze Founder OS V1 — Phase 2 seed: sample leads
-- File: supabase/seeds/0001_seed_leads.sql
-- ----------------------------------------------------------------------------
-- Inserts the 8 sample institutes from app/sales-pipeline/leadsData.js into the
-- public.leads table so the dashboard reads real Supabase rows.
--
-- IDEMPOTENT: each row is inserted only if a sample_seed lead with the same
-- institute_name does not already exist. Re-running does not create duplicates.
-- ============================================================================

insert into public.leads
  (lead_type, institute_name, contact_person, contact_email, contact_link,
   website, city, state, country, category, estimated_size,
   pipeline_stage, priority, fit_score, notes, source, metadata)
select
  v.lead_type::lead_type,
  v.institute_name, v.contact_person, v.contact_email, v.contact_link,
  v.website, v.city, v.state, v.country, v.category, v.estimated_size,
  v.pipeline_stage::pipeline_stage, v.priority::priority_level, v.fit_score,
  v.notes, 'sample_seed',
  jsonb_build_object('seed_key', v.seed_key, 'outreach_draft', '')
from (
  values
    ('b2b','Summit SAT Academy','Dana Reyes','dana@summitsatacademy.example.com','https://www.linkedin.com/in/example-dana','https://summitsatacademy.example.com','Austin','TX','USA','SAT prep','Small','New','High',100,'Found via local listing. Runs weekend SAT bootcamps.','summit-sat-academy'),
    ('b2b','BrightPath Tutoring','Marcus Lee','marcus@brightpathtutoring.example.com','https://brightpathtutoring.example.com/contact','https://brightpathtutoring.example.com','Columbus','OH','USA','Tutoring','Medium','Qualified','High',90,'Offers SAT/ACT plus general K-12 tutoring.','brightpath-tutoring'),
    ('b2b','Ivy Gate Admissions','Priya Nair','priya@ivygate.example.com','https://www.linkedin.com/in/example-priya','https://ivygate.example.com','Boston','MA','USA','Admissions consulting','Small','Contacted','High',85,'College admissions focus; SAT is part of their advising.','ivy-gate-admissions'),
    ('b2b','Pacific Prep Center','Alex Chen','alex@pacificprep.example.com','https://www.linkedin.com/company/example-pacificprep','https://pacificprep.example.com','San Diego','CA','USA','SAT prep','Medium','Follow-up','High',100,'Replied to first email, asked for a demo next month.','pacific-prep-center'),
    ('b2b','Maple Scholars','Sara Okafor','','https://maplescholars.example.com/contact','https://maplescholars.example.com','Toronto','ON','Canada','Tutoring','Small','New','Medium',62,'Canada-based. SAT is a smaller part of their offering.','maple-scholars'),
    ('b2b','National Test Masters','Jordan Smith','jordan@nationaltestmasters.example.com','https://www.linkedin.com/company/example-ntm','https://nationaltestmasters.example.com','Chicago','IL','USA','SAT prep','Large','Interested','High',83,'Large chain. Harder to reach a decision maker, but interested.','national-test-masters'),
    ('b2b','Cornerstone SAT Studio','Lena Park','lena@cornerstonesat.example.com','https://www.linkedin.com/in/example-lena','https://cornerstonesat.example.com','Raleigh','NC','USA','SAT prep','Small','New','High',100,'Boutique SAT studio. Very strong fit.','cornerstone-sat-studio'),
    ('b2b','Apex Admissions Group','Tom Alvarez','tom@apexadmissions.example.com','https://www.linkedin.com/company/example-apex','https://apexadmissions.example.com','Seattle','WA','USA','Admissions consulting','Medium','Closed','High',85,'Signed up last quarter. Reference customer.','apex-admissions-group')
) as v(lead_type, institute_name, contact_person, contact_email, contact_link,
       website, city, state, country, category, estimated_size,
       pipeline_stage, priority, fit_score, notes, seed_key)
where not exists (
  select 1 from public.leads l
  where l.source = 'sample_seed' and l.institute_name = v.institute_name
);

insert into public.events (event_type, lead_id, payload)
select 'lead_created', l.id,
       jsonb_build_object('source', 'sample_seed', 'institute_name', l.institute_name)
from public.leads l
where l.source = 'sample_seed'
  and not exists (
    select 1 from public.events e
    where e.event_type = 'lead_created' and e.lead_id = l.id
  );
