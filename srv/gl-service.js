const cds = require('@sap/cds');
const { bestMatch } = require('./matcher');
const { suggestRule } = require('./llm-client');
const { sendDigestEmail } = require('./mailer');

const CONFIDENCE_THRESHOLD = 0.75;

module.exports = class GLAssistService extends cds.ApplicationService {

  async init() {
    const { GLRules, Postings, UnmatchedPostings } = cds.entities('com.ncs.glassist');

    this.on('determineGL', async (req) => {
      const { description, amount, vendor } = req.data;
      if (!description) return req.error(400, 'Description is required');

      const rules = await SELECT.from(GLRules).where({ active: true });
      const match = bestMatch(description, rules);

      if (match.rule && match.score >= CONFIDENCE_THRESHOLD) {
        console.log(`✓ Matched "${description}" -> GL ${match.rule.glAccount} (${match.score.toFixed(2)})`);

        // Record the posting
        const postingId = cds.utils.uuid();
        await INSERT.into(Postings).entries({
          ID: postingId,
          description,
          amount: amount || 0,
          vendor: vendor || '',
          postingDate: new Date().toISOString().split('T')[0],
          glAccount: match.rule.glAccount,
          matchedRule_ID: match.rule.ID,
          confidence: match.score,
          status: 'matched',
          createdAt: new Date().toISOString()
        });

        return {
          glAccount: match.rule.glAccount,
          confidence: match.score,
          matchedPattern: match.rule.pattern,
          status: 'matched',
          explanation: `Matched rule '${match.rule.description}' (GL ${match.rule.glAccount}) with ${(match.score * 100).toFixed(0)}% confidence.`,
          suggestedPattern: null,
          suggestedGL: null,
          suggestionRationale: null
        };
      }

      // Low confidence — call GPT-4.1
      console.log(`⚠ Low confidence (${match.score.toFixed(2)}) for "${description}" — calling AI...`);
      const aiSuggestion = await suggestRule(description, rules);

      // Record the unmatched posting
      const postingId = cds.utils.uuid();
      await INSERT.into(Postings).entries({
        ID: postingId,
        description,
        amount: amount || 0,
        vendor: vendor || '',
        postingDate: new Date().toISOString().split('T')[0],
        glAccount: '',
        matchedRule_ID: null,
        confidence: match.score,
        status: 'unmatched',
        createdAt: new Date().toISOString()
      });

      // Record the AI suggestion
      await INSERT.into(UnmatchedPostings).entries({
        ID: cds.utils.uuid(),
        posting_ID: postingId,
        suggestedPattern: aiSuggestion.suggestedPattern,
        suggestedGL: aiSuggestion.suggestedGL,
        rationale: aiSuggestion.rationale,
        similarCount: 1,
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      const bestExisting = match.rule
        ? ` Best existing match was '${match.rule.description}' at ${(match.score * 100).toFixed(0)}% confidence, which is below the 75% threshold.`
        : '';

      return {
        glAccount: aiSuggestion.suggestedGL,
        confidence: aiSuggestion.confidence,
        matchedPattern: match.rule ? match.rule.pattern : null,
        status: 'ai_suggested',
        explanation: `No strong match found.${bestExisting} AI suggests creating a new rule for '${aiSuggestion.suggestedPattern}' -> GL ${aiSuggestion.suggestedGL}.`,
        suggestedPattern: aiSuggestion.suggestedPattern,
        suggestedGL: aiSuggestion.suggestedGL,
        suggestionRationale: aiSuggestion.rationale
      };
    });

    this.on('explainLastPosting', async () => {
      const { GLRules, Postings, UnmatchedPostings } = cds.entities('com.ncs.glassist');
      const lastPosting = await SELECT.one.from(Postings).orderBy('createdAt desc');

      if (!lastPosting) {
        return 'No postings found. Try using determineGL first to create a posting.';
      }

      let explanation = `The most recent posting is "${lastPosting.description}" for ${lastPosting.vendor || 'unknown vendor'} (amount: ${lastPosting.amount}).`;

      if (lastPosting.status === 'matched') {
        const rule = await SELECT.one.from(GLRules).where({ ID: lastPosting.matchedRule_ID });
        explanation += ` It was matched to GL account ${lastPosting.glAccount} via rule '${rule ? rule.description : 'unknown'}' with ${(lastPosting.confidence * 100).toFixed(0)}% confidence. The matching pattern was '${rule ? rule.pattern : 'N/A'}'.`;
      } else {
        explanation += ` It could not be matched to any existing rule (best confidence was ${(lastPosting.confidence * 100).toFixed(0)}%, below the 75% threshold).`;
        const unmatched = await SELECT.one.from(UnmatchedPostings).where({ posting_ID: lastPosting.ID });
        if (unmatched) {
          explanation += ` AI suggested pattern '${unmatched.suggestedPattern}' -> GL ${unmatched.suggestedGL}. Reasoning: ${unmatched.rationale}`;
        } else {
          explanation += ` No AI suggestion has been generated yet. Try calling listMissingRules to trigger AI analysis.`;
        }
      }

      return explanation;
    });

    this.on('listMissingRules', async () => {
      const { GLRules, Postings, UnmatchedPostings } = cds.entities('com.ncs.glassist');

      // Check if we already have suggestions
      let existing = await SELECT.from(UnmatchedPostings).where({ status: 'pending' });

      if (existing.length === 0) {
        // Generate AI suggestions for all unmatched seed postings
        console.log('🤖 No existing suggestions found — scanning unmatched postings...');
        const unmatchedPostings = await SELECT.from(Postings).where({ status: 'unmatched' });
        const rules = await SELECT.from(GLRules).where({ active: true });

        for (const posting of unmatchedPostings) {
          // Check if this posting already has a suggestion
          const hasSuggestion = await SELECT.one.from(UnmatchedPostings).where({ posting_ID: posting.ID });
          if (hasSuggestion) continue;

          console.log(`🤖 Generating AI suggestion for: "${posting.description}"`);
          const aiSuggestion = await suggestRule(posting.description, rules);

          await INSERT.into(UnmatchedPostings).entries({
            ID: cds.utils.uuid(),
            posting_ID: posting.ID,
            suggestedPattern: aiSuggestion.suggestedPattern,
            suggestedGL: aiSuggestion.suggestedGL,
            rationale: aiSuggestion.rationale,
            similarCount: 1,
            status: 'pending',
            createdAt: new Date().toISOString()
          });
        }

        existing = await SELECT.from(UnmatchedPostings).where({ status: 'pending' });
      }

      // Build summary with posting details
      const results = [];
      for (const suggestion of existing) {
        const posting = await SELECT.one.from(Postings).where({ ID: suggestion.posting_ID });
        results.push({
          unmatchedId: suggestion.ID,
          suggestedPattern: suggestion.suggestedPattern,
          suggestedGL: suggestion.suggestedGL,
          rationale: suggestion.rationale,
          affectedPostings: suggestion.similarCount || 1,
          sampleDescriptions: posting ? posting.description : 'N/A'
        });
      }

      console.log(`✓ Returning ${results.length} pending suggestion(s)`);
      return results;
    });

    this.on('listAllRules', async () => {
      const rules = await SELECT.from(GLRules).where({ active: true });
      console.log(`✓ Returning ${rules.length} active rule(s)`);
      const lines = rules.map(r => `GL ${r.glAccount} - ${r.description} (Pattern: ${r.pattern})`);
      return `Found ${rules.length} active GL rules:\n\n${lines.join('\n')}`;
    });

    this.on('sendDigest', async (req) => {
      const { recipientEmail } = req.data;
      if (!recipientEmail) return req.error(400, 'recipientEmail is required');

      const { UnmatchedPostings, Postings } = cds.entities('com.ncs.glassist');

      // Get pending suggestions (triggers generation if needed)
      const suggestions = await this.send('listMissingRules');

      if (!suggestions || suggestions.length === 0) {
        return {
          messageId: '',
          previewUrl: '',
          suggestionsCount: 0,
          status: 'no_suggestions'
        };
      }

      console.log(`📧 Sending digest with ${suggestions.length} suggestion(s) to ${recipientEmail}...`);
      const result = await sendDigestEmail(recipientEmail, suggestions);
      return result;
    });

    this.on('approveRule', async (req) => {
      const { unmatchedId } = req.data;
      if (!unmatchedId) return req.error(400, 'unmatchedId is required');

      const { GLRules, UnmatchedPostings } = cds.entities('com.ncs.glassist');

      const suggestion = await SELECT.one.from(UnmatchedPostings).where({ ID: unmatchedId });
      if (!suggestion) return req.error(404, `No suggestion found with ID ${unmatchedId}`);
      if (suggestion.status === 'approved') return req.error(409, 'This suggestion has already been approved');

      // Create new active rule
      const newRuleId = cds.utils.uuid();
      await INSERT.into(GLRules).entries({
        ID: newRuleId,
        pattern: suggestion.suggestedPattern,
        glAccount: suggestion.suggestedGL,
        description: `AI-suggested: ${suggestion.suggestedPattern}`,
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: 'joule-approval',
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'joule-approval'
      });

      // Mark suggestion as approved
      await UPDATE(UnmatchedPostings, unmatchedId).set({
        status: 'approved',
        reviewedBy: 'joule-user',
        reviewedAt: new Date().toISOString()
      });

      console.log(`➕ Rule added: ${suggestion.suggestedPattern} -> GL ${suggestion.suggestedGL}`);

      return {
        ID: newRuleId,
        pattern: suggestion.suggestedPattern,
        glAccount: suggestion.suggestedGL,
        description: `AI-suggested: ${suggestion.suggestedPattern}`,
        status: 'approved'
      };
    });

    await super.init();
  }
};
