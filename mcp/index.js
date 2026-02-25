#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getScheduleInfo, getUpcomingWeeks } from "./schedule.js";

const server = new McpServer({
  name: "paper-or-plastic",
  version: "1.0.0",
});

server.tool(
  "get_recycling_week",
  "Check if it's Paper Cart or Container Cart week in Mill Valley, CA. Returns the current week type, cart description, date range, and any holiday pickup delays.",
  {},
  async () => {
    const info = await getScheduleInfo();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(info, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_upcoming_schedule",
  "Get the upcoming recycling schedule for Mill Valley for the next several weeks, including any holiday pickup delays.",
  {
    weeks: z.number().min(1).max(12).default(4).describe("Number of weeks to look ahead (1-12, default 4)"),
  },
  async ({ weeks }) => {
    const info = await getUpcomingWeeks(weeks);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(info, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "check_specific_date",
  "Check what recycling type a specific date falls on in Mill Valley, including any holiday pickup delays.",
  {
    date: z.string().describe("Date to check in YYYY-MM-DD format"),
  },
  async ({ date }) => {
    const d = new Date(date + "T12:00:00");
    if (isNaN(d.getTime())) {
      return {
        content: [{ type: "text", text: "Invalid date format. Use YYYY-MM-DD." }],
      };
    }
    const info = await getScheduleInfo(d);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(info, null, 2),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
