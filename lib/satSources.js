// The list of trusted, high-signal SAT sources we monitor.
// Start narrow with official College Board pages. To add a source later,
// just add another { id, name, url } object — keep the id short and unique.

export const satSources = [
  {
    id: "cb-newsroom",
    name: "College Board Newsroom",
    url: "https://newsroom.collegeboard.org",
  },
  {
    id: "sat-changes",
    name: "SAT — What's Changing",
    url: "https://satsuite.collegeboard.org/k12-educators/educator-experience/in-school/start/changes",
  },
  {
    id: "bluebook",
    name: "Bluebook Practice App",
    url: "https://satsuite.collegeboard.org/practice/practice-tests/bluebook",
  },
  {
    id: "study-plan",
    name: "Build Your Study Plan",
    url: "https://satsuite.collegeboard.org/practice/build-your-study-plan",
  },
  {
    id: "score-dates",
    name: "Score Release Dates",
    url: "https://satsuite.collegeboard.org/scores/score-release-dates",
  },
];
