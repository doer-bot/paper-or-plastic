#!/usr/bin/env node

const ICAL_FEEDS = {
  container: "https://calendar.google.com/calendar/ical/uokfjeogcqe0daugrn58mvkgo0%40group.calendar.google.com/public/basic.ics",
  paper: "https://calendar.google.com/calendar/ical/d5mdlvop2qp45vmstm6gs5p1kg%40group.calendar.google.com/public/basic.ics",
  main: "https://calendar.google.com/calendar/ical/millvalleyrefuse%40gmail.com/public/basic.ics",
};

const FALLBACK_REFERENCE_DATE = "2025-08-10";
const FALLBACK_REFERENCE_TYPE = "paper";

function parseICalDate(value) {
  if (!value) return null;
  const clean = value.replace(/[^0-9]/g, "");
  if (clean.length === 8) {
    return new Date(
      parseInt(clean.substring(0, 4)),
      parseInt(clean.substring(4, 6)) - 1,
      parseInt(clean.substring(6, 8)),
      12, 0, 0
    );
  }
  return null;
}

function parseRRule(rruleStr) {
  const parts = {};
  rruleStr.split(";").forEach((part) => {
    const [key, val] = part.split("=");
    parts[key] = val;
  });
  return parts;
}

function parseICalEvents(icalText) {
  const events = [];
  const lines = icalText.replace(/\r\n /g, "").replace(/\r\n\t/g, "").split(/\r?\n/);
  let inEvent = false;
  let event = {};

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      event = {};
    } else if (line === "END:VEVENT") {
      inEvent = false;
      events.push(event);
    } else if (inEvent) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const keyPart = line.substring(0, colonIdx);
      const value = line.substring(colonIdx + 1);
      const key = keyPart.split(";")[0];

      if (key === "DTSTART") event.dtstart = value;
      if (key === "DTEND") event.dtend = value;
      if (key === "RRULE") event.rrule = value;
      if (key === "SUMMARY") event.summary = value;
      if (key === "DESCRIPTION") event.description = (event.description || "") + value;
      if (key === "EXDATE") {
        if (!event.exdates) event.exdates = [];
        value.split(",").forEach((v) => {
          const trimmed = v.trim();
          if (trimmed) event.exdates.push(trimmed);
        });
      }
    }
  }
  return events;
}

function getSunday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function generateWeeksFromRecurrence(startDate, intervalWeeks, monthsAhead) {
  const weeks = [];
  const now = new Date();
  const lookBack = new Date(now);
  lookBack.setMonth(lookBack.getMonth() - 6);
  const lookAhead = new Date(now);
  lookAhead.setMonth(lookAhead.getMonth() + monthsAhead);

  const current = new Date(startDate);
  while (current <= lookAhead) {
    if (current >= lookBack) {
      weeks.push(new Date(current));
    }
    current.setDate(current.getDate() + intervalWeeks * 7);
  }
  return weeks;
}

function parseHolidays(mainEvents) {
  const holidays = [];

  for (const event of mainEvents) {
    const date = parseICalDate(event.dtstart);
    if (!date) continue;

    const isNoService =
      (event.summary || "").toLowerCase().includes("no collection") ||
      (event.description || "").toLowerCase().includes("no collection service") ||
      (event.summary || "").toLowerCase().includes("collection service holiday");

    if (isNoService) {
      const isRecurring = !!event.rrule;
      const rrule = event.rrule ? parseRRule(event.rrule) : null;

      holidays.push({
        date: formatDate(date),
        summary: event.summary || "",
        isYearlyRecurring: isRecurring && rrule?.FREQ === "YEARLY",
        month: date.getMonth() + 1,
        day: date.getDate(),
      });
    }
  }

  return holidays;
}

function getHolidayWeeks(holidays, monthsAhead) {
  const now = new Date();
  const lookBack = new Date(now);
  lookBack.setMonth(lookBack.getMonth() - 6);
  const lookAhead = new Date(now);
  lookAhead.setMonth(lookAhead.getMonth() + monthsAhead);
  const results = [];

  for (const holiday of holidays) {
    if (holiday.isYearlyRecurring) {
      for (let year = lookBack.getFullYear(); year <= lookAhead.getFullYear(); year++) {
        const d = new Date(year, holiday.month - 1, holiday.day, 12, 0, 0);
        const dayOfWeek = d.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          const sunday = getSunday(d);
          results.push({
            weekStart: formatDate(sunday),
            holidayDate: formatDate(d),
            holidayName: holiday.summary,
            dayOfWeek,
            message: `Pickups on ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayOfWeek]} or later are delayed one day this week.`,
          });
        }
      }
    } else {
      const d = new Date(holiday.date + "T12:00:00");
      if (d < lookBack || d > lookAhead) continue;
      const dayOfWeek = d.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const sunday = getSunday(d);
        results.push({
          weekStart: formatDate(sunday),
          holidayDate: holiday.date,
          holidayName: holiday.summary,
          dayOfWeek,
          message: `Pickups on ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayOfWeek]} or later are delayed one day this week.`,
        });
      }
    }
  }

  return results;
}

async function fetchIcal(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  return resp.text();
}

async function main() {
  const monthsAhead = 18;
  let anomalies = [];
  let source = "google-calendar";

  console.log("Fetching MVRS Google Calendar feeds...");

  let containerStart, paperStart, containerInterval, paperInterval;
  let containerExdates = [], paperExdates = [];
  let holidayWeeks = [];

  try {
    const [containerIcal, paperIcal, mainIcal] = await Promise.all([
      fetchIcal(ICAL_FEEDS.container),
      fetchIcal(ICAL_FEEDS.paper),
      fetchIcal(ICAL_FEEDS.main),
    ]);

    const containerEvents = parseICalEvents(containerIcal);
    const paperEvents = parseICalEvents(paperIcal);
    const mainEvents = parseICalEvents(mainIcal);

    const containerRecurring = containerEvents.find((e) => e.rrule);
    const paperRecurring = paperEvents.find((e) => e.rrule);

    if (!containerRecurring || !paperRecurring) {
      throw new Error("Could not find recurring events in iCal feeds");
    }

    containerStart = parseICalDate(containerRecurring.dtstart);
    paperStart = parseICalDate(paperRecurring.dtstart);

    const containerRRule = parseRRule(containerRecurring.rrule);
    const paperRRule = parseRRule(paperRecurring.rrule);

    containerInterval = parseInt(containerRRule.INTERVAL || "2");
    paperInterval = parseInt(paperRRule.INTERVAL || "2");

    containerExdates = (containerRecurring.exdates || []).map((d) => parseICalDate(d)).filter(Boolean).map(formatDate);
    paperExdates = (paperRecurring.exdates || []).map((d) => parseICalDate(d)).filter(Boolean).map(formatDate);

    if (containerExdates.length > 0) {
      anomalies.push({
        type: "exdate",
        calendar: "container",
        dates: containerExdates,
        message: "Container calendar has exception dates - pattern may have been modified",
      });
    }
    if (paperExdates.length > 0) {
      anomalies.push({
        type: "exdate",
        calendar: "paper",
        dates: paperExdates,
        message: "Paper calendar has exception dates - pattern may have been modified",
      });
    }

    if (containerInterval !== 2 || paperInterval !== 2) {
      anomalies.push({
        type: "interval_change",
        message: `Unexpected interval: container=${containerInterval}, paper=${paperInterval}`,
      });
    }

    const holidays = parseHolidays(mainEvents);
    holidayWeeks = getHolidayWeeks(holidays, monthsAhead);

    console.log(`  Container start: ${formatDate(containerStart)}, interval: ${containerInterval} weeks`);
    console.log(`  Paper start: ${formatDate(paperStart)}, interval: ${paperInterval} weeks`);
    console.log(`  Holiday events found: ${holidays.length}`);
    console.log(`  Holiday weeks with delays: ${holidayWeeks.length}`);
    console.log(`  Anomalies: ${anomalies.length}`);
  } catch (err) {
    console.error(`Failed to fetch iCal feeds: ${err.message}`);
    console.log("Falling back to hardcoded alternating pattern...");
    source = "fallback";

    containerStart = new Date(2019, 6, 28, 12, 0, 0);
    paperStart = new Date(2019, 7, 4, 12, 0, 0);
    containerInterval = 2;
    paperInterval = 2;

    holidayWeeks = [
      {
        weekStart: formatDate(getSunday(new Date(new Date().getFullYear(), 11, 25))),
        holidayDate: `${new Date().getFullYear()}-12-25`,
        holidayName: "Christmas Day - No Collection Service",
        dayOfWeek: new Date(new Date().getFullYear(), 11, 25).getDay(),
        message: "Pickups on Thu or later are delayed one day this week.",
      },
      {
        weekStart: formatDate(getSunday(new Date(new Date().getFullYear() + 1, 0, 1))),
        holidayDate: `${new Date().getFullYear() + 1}-01-01`,
        holidayName: "New Year's Day - No Collection Service",
        dayOfWeek: new Date(new Date().getFullYear() + 1, 0, 1).getDay(),
        message: "Pickups on Thu or later are delayed one day this week.",
      },
    ];
  }

  const containerWeeks = generateWeeksFromRecurrence(containerStart, containerInterval, monthsAhead);
  const paperWeeks = generateWeeksFromRecurrence(paperStart, paperInterval, monthsAhead);

  const weekMap = {};

  for (const sunday of containerWeeks) {
    const key = formatDate(sunday);
    weekMap[key] = { weekStart: key, type: "container" };
  }
  for (const sunday of paperWeeks) {
    const key = formatDate(sunday);
    if (weekMap[key]) {
      anomalies.push({
        type: "overlap",
        date: key,
        message: `Both paper and container are scheduled for the week of ${key}`,
      });
    }
    weekMap[key] = { weekStart: key, type: "paper" };
  }

  const allWeeks = Object.values(weekMap).sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  for (let i = 1; i < allWeeks.length; i++) {
    const prev = new Date(allWeeks[i - 1].weekStart + "T12:00:00");
    const curr = new Date(allWeeks[i].weekStart + "T12:00:00");
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays !== 7) {
      anomalies.push({
        type: "gap",
        from: allWeeks[i - 1].weekStart,
        to: allWeeks[i].weekStart,
        gapDays: diffDays,
        message: `Gap of ${diffDays} days between ${allWeeks[i - 1].weekStart} and ${allWeeks[i].weekStart} (expected 7)`,
      });
    }

    if (allWeeks[i].type === allWeeks[i - 1].type) {
      anomalies.push({
        type: "same_consecutive",
        weeks: [allWeeks[i - 1].weekStart, allWeeks[i].weekStart],
        weekType: allWeeks[i].type,
        message: `Two consecutive ${allWeeks[i].type} weeks: ${allWeeks[i - 1].weekStart} and ${allWeeks[i].weekStart}`,
      });
    }
  }

  const scheduleData = {
    generated: new Date().toISOString(),
    source,
    calendarIds: {
      container: "uokfjeogcqe0daugrn58mvkgo0@group.calendar.google.com",
      paper: "d5mdlvop2qp45vmstm6gs5p1kg@group.calendar.google.com",
      main: "millvalleyrefuse@gmail.com",
    },
    recurrence: {
      containerStart: formatDate(containerStart),
      paperStart: formatDate(paperStart),
      intervalWeeks: 2,
    },
    weeks: allWeeks,
    holidayWeeks,
    anomalies,
    calendarYear: "2025-2026",
    dataSource: "Mill Valley Refuse 2025-2026 Dual Stream Recycling Calendar",
    feedUrls: {
      container: ICAL_FEEDS.container,
      paper: ICAL_FEEDS.paper,
      main: ICAL_FEEDS.main,
    },
  };

  const outputPath = process.argv[2] || "schedule-data.json";
  const fs = await import("fs");
  fs.writeFileSync(outputPath, JSON.stringify(scheduleData, null, 2));

  console.log(`\nGenerated ${outputPath}`);
  console.log(`  Total weeks: ${allWeeks.length}`);
  console.log(`  Holiday weeks: ${holidayWeeks.length}`);
  console.log(`  Anomalies: ${anomalies.length}`);

  if (anomalies.length > 0) {
    console.log("\n⚠️  ANOMALIES DETECTED:");
    anomalies.forEach((a) => console.log(`  - ${a.message}`));
    process.exit(1);
  }

  console.log("\n✅ No anomalies detected. Schedule is clean.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
