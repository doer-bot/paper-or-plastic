# Paper or Plastic Mill Valley

Instantly check if it's Paper Cart or Container Cart week in Mill Valley, CA.

**[paperorplasticmillvalley.com](https://paperorplasticmillvalley.com)**

## How It Works

Mill Valley Refuse uses a dual stream recycling system that alternates between Paper Cart and Container Cart weeks on a strict biweekly schedule. This site tells you which week it is right now, color-coded for instant recognition.

- **Brown/amber** = Paper Cart week (brown cart with blue lid)
- **Blue** = Container Cart week (blue cart)

## Architecture

Zero-cost, fully static GitHub Pages site:

- `index.html` — Single-page app that reads `schedule-data.json` and displays the current week type
- `schedule-data.json` — Generated monthly by GitHub Actions from MVRS's public Google Calendar iCal feeds
- `scripts/generate-schedule.js` — Node.js script that fetches 3 iCal feeds, parses recurrence rules, validates the alternating pattern, and outputs the schedule data
- `.github/workflows/update-schedule.yml` — Monthly cron job that regenerates the schedule and opens a GitHub issue if anomalies are detected

### Data Source

Mill Valley Refuse maintains 3 public Google Calendar iCal feeds:
- **Container Recycling** — biweekly recurring events since July 28, 2019
- **Paper Recycling** — biweekly recurring events since August 4, 2019
- **Main Calendar** — holiday schedules and service changes

The generator fetches all three, validates the alternating pattern, extracts holiday delay info, and produces a flat JSON file. If the iCal feeds are ever unavailable, the site falls back to a hardcoded alternating-week calculation.

## MCP Server

AI assistants can check the recycling schedule via the Model Context Protocol:

```json
{
  "mcpServers": {
    "paper-or-plastic": {
      "command": "npx",
      "args": ["-y", "paper-or-plastic-mcp"]
    }
  }
}
```

### Tools

| Tool | Description |
|------|-------------|
| `get_recycling_week` | Current week type with cart details and holiday info |
| `get_upcoming_schedule` | Next N weeks of the schedule |
| `check_specific_date` | Check any specific date |

## Deploying to GitHub Pages

When pushing to `dclaze/paper-or-plastic`, the contents of `github-pages/` become the repo root:

1. Configure GitHub Pages to deploy from the root of the main branch
2. The `.github/workflows/update-schedule.yml` file should be at the repo root level
3. Domain `paperorplasticmillvalley.com` is configured in GitHub Pages settings

## Running Locally

```bash
# Generate schedule data
node scripts/generate-schedule.js

# Serve the site
npx serve .
```

## Updating

The schedule auto-updates monthly via GitHub Actions. To manually trigger:

1. Go to Actions → "Update Recycling Schedule"
2. Click "Run workflow"

The generator will:
- Fetch fresh iCal data from MVRS
- Validate the alternating pattern
- Check for anomalies (exceptions, gaps, overlaps)
- Commit the updated `schedule-data.json`
- Open a GitHub issue if anything looks wrong

## License

MIT
