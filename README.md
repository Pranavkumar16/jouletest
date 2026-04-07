# GL Rule Assist

A CAP service exposing GL account determination as a Joule custom skill for SAP Work Zone. Uses GPT-4.1 on SAP AI Core to detect missing rules in the GL determination table and propose new ones with AI reasoning. No UI — Joule is the front end.

## Architecture

```
Finance User
    │
    ▼
Joule (Work Zone)
    │
    ▼
BTP Destination (OAuth2ClientCredentials)
    │
    ▼
┌─────────────────────────────────┐
│  CAP Service (gl-rule-assist)   │
│                                 │
│  ┌──────────┐  ┌─────────────┐  │
│  │ Matcher  │  │ GPT-4.1 via │  │
│  │ (Jaccard)│  │  AI Core    │  │
│  └──────────┘  └─────────────┘  │
│                                 │
│  ┌──────────┐  ┌─────────────┐  │
│  │  Mailer  │  │ SQLite/HANA │  │
│  │(Ethereal)│  │             │  │
│  └──────────┘  └─────────────┘  │
└─────────────────────────────────┘
```

## Local Setup

1. `npm install`
2. Get AI Core service key from BTP Cockpit → Instances → AI Core → Service Keys, copy JSON
3. Copy `.env.example` to `.env`, paste service key as one line into `AICORE_SERVICE_KEY`
4. Verify deployment name matches `AICORE_DEPLOYMENT_ID` (check AI Core Launchpad → Deployments)
5. `cds watch`
6. Open `test/rest-client.http` in VS Code with REST Client extension, click "Send Request" on each scenario

## Demo Script (4 Scenes via REST Client)

### Scene 1: Happy Path
`determineGL` with "Office paper and printer ink from Staples" → returns matched rule, confidence 0.92, GL 6401000.

### Scene 2: Gap Detection
`determineGL` with "Zoom annual subscription renewal" → terminal shows 🤖 GPT-4.1 call, returns AI suggestion with new pattern and GL account.

### Scene 3: List Gaps
`listMissingRules` → returns all 5 unmatched postings with AI rationale. First call generates suggestions for all 5 unmatched seed postings (watch terminal for 🤖 logs).

### Scene 4: Approve and Re-test
`approveRule` for the Zoom suggestion (use ID from Scene 3), then `determineGL` with "Slack workspace subscription" — now matches the new SaaS rule.

## Phase 2: Deploy and Register as Joule Skill

1. `cf login -a <api-url>` — target the subaccount where Joule is enabled in Work Zone
2. Verify AI Core instance: `cf services` (note the instance name)
3. Update `mta.yaml` AI Core resource `service-name` to match your instance
4. `cf create-service xsuaa application gl-rule-assist-xsuaa -c xs-security.json`
5. `cds build --production && mbt build && cf deploy mta_archives/gl-rule-assist_1.0.0.mtar`
6. Note CAP app URL from `cf apps`
7. Test deployed endpoint with curl + bearer token to confirm it's reachable
8. Get XSUAA service key:
   ```
   cf create-service-key gl-rule-assist-xsuaa sk1
   cf service-key gl-rule-assist-xsuaa sk1
   ```
   Note clientid, clientsecret, url
9. Create BTP Destination `gl-rule-assist`:
   - URL = CAP app URL
   - Auth = OAuth2ClientCredentials
   - Client ID/Secret from service key
   - Token Service URL = service key url + `/oauth/token`
   - Additional properties:
     - `HTML5.DynamicDestination=true`
     - `WebIDEEnabled=true`
     - `HTML5.Timeout=60000`
   - Click **Check Connection** — must succeed
10. Generate OpenAPI: `npm run openapi`. Edit `servers` block to absolute CAP app URL. Verify every operation has unique `operationId` and rich `description`
11. In **Joule Studio** (Work Zone subaccount): New Custom Skill → Import OpenAPI → upload spec → select destination `gl-rule-assist`
12. For each operation, paste 8-10 utterances from `JOULE_UTTERANCES.md`
13. Assign role collection `GLRuleAssist_Joule` to your Joule technical user (subaccount → Security → Role Collections)
14. Test in Joule Builder preview — try each operation with 3 different phrasings
15. Publish skill — now invokable from Joule in Work Zone

## Joule Skill Reliability Checklist

Run through before declaring ready:

- [ ] Every operation has `@Core.Description` with 5+ trigger phrases
- [ ] Every parameter has `@Core.Description` with example
- [ ] Every response field has `@Common.Label`
- [ ] OpenAPI spec has unique `operationId` per operation
- [ ] OpenAPI `servers` block has absolute CF URL
- [ ] 8-10 utterances added per operation in Joule Studio
- [ ] Destination created with `HTML5.DynamicDestination=true`
- [ ] OAuth2ClientCredentials Check Connection succeeds
- [ ] Role collection assigned to Joule technical user
- [ ] Each operation tested individually in Joule Builder preview
- [ ] 3 different phrasings of each intent route correctly

## Debugging a Skill That Won't Fire

1. **Joule Builder trace mode** → type test phrase → see if your skill is even considered
2. **Not considered** → descriptions/utterances too generic, add more specific trigger phrases
3. **Wrong operation picked** → operation descriptions overlap, make `Do NOT use` sections more distinct
4. **Parameters wrong** → parameter descriptions missing or unclear, add example values
5. **401 error** → destination OAuth wrong, recheck token URL and client secret
6. **403 error** → role collection not assigned to Joule user
7. **Call succeeds but Joule reply is odd** → response too nested or missing `@Common.Label`
8. **Tail CF logs**: `cf logs gl-rule-assist-srv --recent`

## Operations Summary

| Operation | Type | Purpose |
|-----------|------|---------|
| `determineGL` | Function | Find GL account for a posting description |
| `explainLastPosting` | Function | Explain why the last posting matched or failed |
| `listMissingRules` | Function | Show AI-suggested rules for unmatched postings |
| `listAllRules` | Function | List all active GL determination rules |
| `sendDigest` | Action | Email pending suggestions to GL owner |
| `approveRule` | Action | Promote AI suggestion to active rule table |
