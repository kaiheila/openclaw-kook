# Errors

## [ERR-20260325-001] read-tool-empty-pages

**Logged**: 2026-03-25T00:00:00Z
**Priority**: low
**Status**: pending
**Area**: config

### Summary
Read tool call failed because an empty pages parameter was supplied.

### Error
```
Invalid pages parameter: "". Use formats like "1-5", "3", or "10-20". Pages are 1-indexed.
```

### Context
- Operation attempted: Read several local files with optional pages argument
- Incorrect input: passed `pages: ""` instead of omitting the field
- Environment: Claude Code tool call in openclaw-kook workspace

### Suggested Fix
Omit optional tool fields when unused; do not pass empty strings for Read.pages.

### Metadata
- Reproducible: yes
- Related Files: none

---

