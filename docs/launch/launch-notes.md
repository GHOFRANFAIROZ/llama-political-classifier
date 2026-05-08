# Launch Notes - Source of Truth

## Official services
- Official Firebase project: `hate-speech-monitor-7c0ba`
- Official Render backend: `my-classifier-v2`

## Current validated setup
- Local frontend can successfully validate against the deployed backend.
- Org onboarding flow is validated.
- Admin review flow is validated.
- Org user workspace flow is validated.
- Dashboard, Reports, Trends, Search, and Wordcloud are validated.

## Important operational rules
- Use `org_id`, not `slug`, for org-scoped collections and scripts.
- Keep local and deployed environments clearly separated.
- Do not delete old services/configs before full verification.
- Rule: Keep -> Verify -> Then delete.

## Current launch scope
This launch scope currently includes:
- Web onboarding
- Admin review / org request approval
- Org workspace access
- Dashboard
- Reports
- Trends
- Search
- Wordcloud

## Not included in current launch completion
These are intentionally deferred and are not blockers for current web readiness:
- Full Arabic UI rollout
- Fine-tuning
- Advanced moderation workflows
- Full extension productization
- Deep NLP cleanup beyond acceptable pre-launch quality

## Known resolved issues
The following issues were identified and fixed during validation:
- Firebase / backend environment mismatch
- Local frontend vs Render backend mismatch
- `org_id` vs `slug` confusion
- Stats proxy mapping bug
- Reports org proxy missing route
- Seed schema mismatch
- Organization display name formatting issue

## Current product state
The core web product is now in a strong pre-launch state for:
- organization onboarding
- admin approval
- org user access
- org analytics workspace

The next major product phase after web readiness is:
- Extension MVP