// The heart of Milestone 2. This runs the whole monitoring pipeline once:
//   1. fetch each trusted SAT source
//   2. compare it to the previous saved version
//   3. collect any meaningful changes
//   4. if there are changes, ask Claude for a founder brief
//   5. save everything (snapshots, changes, brief, run status) to Redis
// It is called by both the daily cron job and the manual "run now" route.
//
// Note on Tavily: monitoring official pages does NOT need web search — we fetch
// the exact source pages directly. So TAVILY_API_KEY is not used here. It is
// still used by the separate manual topic-search tool (/api/research).

import { satSources } from "./satSources";
import { fetchSourceText } from "./fetchSource";
import { detectChanges } from "./diffChanges";
import { generateBrief } from "./generateBrief";
import {
  getSnapshot,
  saveSnapshot,
  saveChanges,
  saveBrief,
  saveRunStatus,
} from "./storage";
// Phase 3: best-effort writes into Founder OS shared memory (Supabase).
// These helpers are defensive and never throw, but we ALSO wrap the call site
// in try/catch so a Supabase problem can never break the monitor or cron.
import {
  createTask,
  markRunning,
  markCompleted,
  recordResearchReport,
} from "./founderMemory";

export async function runMonitor() {
  const sourceStatuses = [];
  const changedSources = [];

  // Check each source. If one fails, we log it and keep going.
  for (const src of satSources) {
    try {
      const currentText = await fetchSourceText(src.url);

      // Too little text usually means the page needs JavaScript to render.
      if (!currentText || currentText.length < 100) {
        await saveSnapshot(src.id, currentText || "");
        sourceStatuses.push({
          id: src.id,
          name: src.name,
          ok: false,
          note: "Too little text extracted (page may require JavaScript).",
        });
        continue;
      }

      const previous = await getSnapshot(src.id);
      const result = detectChanges(previous, currentText);
      await saveSnapshot(src.id, currentText);

      if (result.firstRun) {
        sourceStatuses.push({
          id: src.id,
          name: src.name,
          ok: true,
          note: "Baseline saved (first run).",
        });
      } else if (result.meaningful) {
        sourceStatuses.push({
          id: src.id,
          name: src.name,
          ok: true,
          note: `Change detected (+${result.addedCount} / -${result.removedCount}).`,
        });
        changedSources.push({
          id: src.id,
          name: src.name,
          url: src.url,
          addedText: result.addedText,
        });
      } else {
        sourceStatuses.push({
          id: src.id,
          name: src.name,
          ok: true,
          note: "No major change.",
        });
      }
    } catch (err) {
      sourceStatuses.push({
        id: src.id,
        name: src.name,
        ok: false,
        note: `Fetch failed: ${err.message}`,
      });
    }
  }

  const now = new Date().toISOString();
  let status;

  if (changedSources.length > 0) {
    let brief;
    try {
      brief = await generateBrief(changedSources);
    } catch (err) {
      brief = {
        headline: "Changes detected, but brief generation failed",
        what_changed:
          "Meaningful changes were found, but the AI summary step failed.",
        why_it_matters: "",
        who_it_affects: "",
        wryze_content_idea: "",
        wryze_product_idea: "",
        confidence_notes: err.message,
      };
    }
    brief.generatedAt = now;
    brief.changedSources = changedSources.map((s) => ({ name: s.name, url: s.url }));

    await saveBrief(brief);
    await saveChanges(
      changedSources.map((s) => ({ name: s.name, url: s.url, addedText: s.addedText }))
    );


    // ---- Phase 3: best-effort write into Founder OS shared memory ----------
    // Runs only when a brief was generated. Wrapped so Supabase failure logs
    // but NEVER breaks monitor / cron / Redis.
    try {
      const task = await createTask({
        agent_type: "research",
        input: { mode: "monitor", source: "college_board_monitor" },
        lead_id: null,
      });

      const taskId = task ? task.task_id : null;
      const agentId = task ? task.agent_id : null;

      await markRunning(taskId, agentId);

      const reportId = await recordResearchReport({
        task_id: taskId,
        lead_id: null,
        topic: "College Board / SAT source monitor",
        headline: brief.headline || null,
        summary: brief.what_changed || null,
        structured: brief,
        sources: changedSources.map((s) => ({ name: s.name, url: s.url })),
        confidence_notes: brief.confidence_notes || null,
      });

      await markCompleted(
        taskId,
        { report_id: reportId, mode: "monitor", changed_count: changedSources.length },
        agentId
      );
    } catch (err) {
      console.error("[runMonitor] shared-memory write failed (non-fatal):", err?.message);
    }

    status = {
      time: now,
      ok: true,
      changedCount: changedSources.length,
      message: `Changes detected in ${changedSources.length} source(s). New brief generated.`,
      sourceStatuses,
    };
  } else {
    // Keep the last meaningful brief on screen, but record that this run found nothing.
    await saveChanges([]);
    status = {
      time: now,
      ok: true,
      changedCount: 0,
      message: "No important SAT updates detected.",
      sourceStatuses,
    };
  }

  await saveRunStatus(status);
  return status;
}
