# CLAUDE.md

## Git workflow
- Always push directly to main. Do not create feature branches or PRs unless explicitly asked.

## User context
- The user has no coding experience. When writing or modifying code, explain the rationale behind decisions — what the code does, why it's structured that way, and how the pieces connect. Teach alongside building.

## Session start routine
When the user says "ready for work", "start", or similar — follow these steps:
1. Pull latest from git (`git pull origin master`)
2. Read `docs/build-list.md` — know what's ready to build, what ideas exist, what's deferred
3. Read `README.md` — quick orientation on current project state
4. Check recent git log — see what was done recently
5. Report back: summarise what's next on the build list and ask what the user wants to tackle

## Session close routine
When the user says "wrap up", "close", "done for today", or similar — follow these steps:
1. Commit and push any uncommitted work
2. Update `docs/build-list.md` if anything was built, discovered, or deferred during the session
3. Update `README.md` if project state changed (new routes, major features, architectural changes)
4. Give a brief summary of what was done this session

## Key project files
- `README.md` — project overview, stack, structure, current state
- `docs/build-list.md` — working list of what to build next, ideas, and deferred items
- `docs/market-and-roadmap.md` — strategic direction and long-term planning
- `docs/feature-map.md` — detailed inventory of every page and action
- `docs/SYSTEM_UI_MAP.md` — UX principles for building new features
- `docs/cloning.md` — setup and deployment guide
