/**
 * LLM Client for GL Rule Assist
 *
 * Uses @sap-ai-sdk/foundation-models to call GPT-4.1 on SAP AI Core.
 *
 * Locally: reads AICORE_SERVICE_KEY env var (paste the full service key JSON on one line).
 * In production (CF): reads from CF service binding via VCAP_SERVICES automatically.
 *
 * The SDK handles token exchange and endpoint resolution from the service binding.
 */

const { AzureOpenAiChatClient } = require('@sap-ai-sdk/foundation-models');

const MODEL_DEPLOYMENT = process.env.AICORE_DEPLOYMENT_ID || 'gpt-4.1';

async function suggestRule(description, existingRules) {
  const systemPrompt = `You are an SAP finance expert helping identify gaps in a GL account determination rule table.
Given a posting description and existing rules, either identify the closest existing rule or propose a new rule pattern.
Respond ONLY with valid JSON matching this schema:
{
  "action": "match" | "propose",
  "suggestedGL": "string",
  "suggestedPattern": "string (keywords separated by | )",
  "rationale": "string explaining the reasoning",
  "confidence": number between 0 and 1
}`;

  const rulesList = existingRules
    .map((r, i) => `${i + 1}. Pattern: "${r.pattern}" -> GL ${r.glAccount} (${r.description})`)
    .join('\n');

  const userPrompt = `Existing rules:\n${rulesList}\n\nIncoming posting description: "${description}"\n\nAnalyze and respond with JSON.`;

  try {
    console.log(`🤖 Calling GPT-4.1 for: "${description}"`);
    const client = new AzureOpenAiChatClient(MODEL_DEPLOYMENT);
    const response = await client.run({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1024,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });
    const raw = response.getContent();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleaned);
    console.log(`🤖 GPT-4.1 response: ${result.action} -> GL ${result.suggestedGL} (confidence: ${result.confidence})`);
    return result;
  } catch (err) {
    console.error('🤖 LLM call failed:', err.message);
    return {
      action: 'propose',
      suggestedGL: 'UNKNOWN',
      suggestedPattern: description.toLowerCase().split(' ').slice(0, 3).join('|'),
      rationale: `LLM unavailable, fallback used. Error: ${err.message}`,
      confidence: 0.3
    };
  }
}

module.exports = { suggestRule };
