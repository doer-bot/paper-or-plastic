const SCHEDULE_URL = "https://dclaze.github.io/paper-or-plastic/schedule-data.json";

const FALLBACK_PAPER_START = new Date(2019, 7, 4);

function getSunday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function getSaturday(date) {
  const sunday = getSunday(date);
  const sat = new Date(sunday);
  sat.setDate(sat.getDate() + 6);
  return sat;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getWeekTypeFallback(date) {
  const sunday = getSunday(date);
  const refSunday = getSunday(FALLBACK_PAPER_START);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeks = Math.round((sunday.getTime() - refSunday.getTime()) / msPerWeek);
  const isEven = ((weeks % 2) + 2) % 2 === 0;
  return isEven ? "paper" : "container";
}

let cachedData = null;

async function fetchScheduleData() {
  if (cachedData) return cachedData;
  try {
    const resp = await fetch(SCHEDULE_URL);
    if (resp.ok) {
      cachedData = await resp.json();
      return cachedData;
    }
  } catch (e) {}
  return null;
}

function getWeekTypeFromData(data, date) {
  const sunday = getSunday(date);
  const key = formatDateKey(sunday);
  if (data && data.weeks) {
    const week = data.weeks.find((w) => w.weekStart === key);
    if (week) return week.type;
  }
  return getWeekTypeFallback(date);
}

function getHolidayForWeek(data, date) {
  if (!data || !data.holidayWeeks) return null;
  const sunday = getSunday(date);
  const key = formatDateKey(sunday);
  return data.holidayWeeks.find((h) => h.weekStart === key) || null;
}

export async function getScheduleInfo(date = new Date()) {
  const data = await fetchScheduleData();
  const currentWeek = getWeekTypeFromData(data, date);
  const sunday = getSunday(date);
  const saturday = getSaturday(date);
  const nextSunday = new Date(sunday);
  nextSunday.setDate(nextSunday.getDate() + 7);
  const nextWeek = getWeekTypeFromData(data, nextSunday);
  const holiday = getHolidayForWeek(data, date);

  return {
    currentWeek,
    nextWeek,
    weekStart: formatDate(sunday),
    weekEnd: formatDate(saturday),
    cartLabel: currentWeek === "paper" ? "Paper Cart" : "Container Cart",
    cartDescription: currentWeek === "paper"
      ? "Brown cart with blue lid - clean paper and cardboard recyclables only"
      : "Brown cart with brown lid or all blue cart - clean bottles, cans, and plastic containers only",
    nextWeekLabel: nextWeek === "paper" ? "Paper Cart" : "Container Cart",
    calendarYear: data?.calendarYear || "2025-2026",
    dataSource: data ? "github-hosted" : "fallback-calculation",
    holiday: holiday ? { date: holiday.holidayDate, name: holiday.holidayName, message: holiday.message } : null,
  };
}

export async function getUpcomingWeeks(count = 4) {
  const data = await fetchScheduleData();
  const result = [];
  const today = new Date();
  const sunday = getSunday(today);

  for (let i = 0; i < count; i++) {
    const weekStart = new Date(sunday);
    weekStart.setDate(weekStart.getDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const type = getWeekTypeFromData(data, weekStart);
    const holiday = getHolidayForWeek(data, weekStart);
    result.push({
      weekStart: formatDate(weekStart),
      weekEnd: formatDate(weekEnd),
      type,
      label: type === "paper" ? "Paper Cart" : "Container Cart",
      holiday: holiday ? { date: holiday.holidayDate, message: holiday.message } : null,
    });
  }
  return result;
}
