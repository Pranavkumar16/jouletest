using { com.ncs.glassist as db } from '../db/schema';

@path: '/odata/v4/gl-assist'
@Core.Description: 'GL Rule Assist Service — AI-powered GL account determination for SAP Finance. Helps users find the right GL account for postings, detect missing rules, and manage AI-suggested rule additions.'
service GLAssistService {

  @Core.Description: '''
  Use this function when the user wants to find the correct GL account for a specific posting, invoice, expense, or purchase.

  Trigger phrases include:
  - "Which GL account should I use for [description]"
  - "Post [amount] to [vendor] for [description]"
  - "Book an expense for [description]"
  - "What account for [description]"
  - "I need to post [description]"
  - "GL for [description]"

  Returns the best-matching rule with confidence score, or an AI-suggested new rule if confidence is low.

  Do NOT use this to list existing rules (use listAllRules) or to explain past postings (use explainLastPosting).
  '''
  function determineGL(
    description : String  @Core.Description: 'The posting description or memo text from the invoice, for example "Zoom annual subscription renewal" or "Office paper and printer ink from Staples". Required.',
    amount      : Decimal @Core.Description: 'The posting amount in local currency as a number, for example 1200.50. Optional but helps with rule matching when amount thresholds apply.',
    vendor      : String  @Core.Description: 'The vendor or supplier name if known, for example "Zoom Video Communications" or "Staples". Optional.'
  ) returns DeterminationResult;

  @Core.Description: '''
  Use this function when the user asks why the most recent posting failed, went to suspense, or wants an explanation of what happened with the last GL determination.

  Trigger phrases:
  - "Why did that fail"
  - "Why did it go to suspense"
  - "Explain the last posting"
  - "What happened with that invoice"
  - "Why no match"
  - "Tell me why"

  Returns a natural language explanation of the most recent Posting including which rules were considered and why they did or did not match.

  Do NOT use this for general questions about missing rules (use listMissingRules).
  '''
  function explainLastPosting() returns String;

  @Core.Description: '''
  Use this function when the user asks about gaps in the GL rule table, pending AI suggestions awaiting review, or what rules need to be added.

  Trigger phrases:
  - "What rules are missing"
  - "Show pending suggestions"
  - "What gaps are in the rule table"
  - "Rules that need review"
  - "What does the AI recommend"
  - "Show me the AI suggestions"

  Returns a grouped list of AI-proposed rules with counts of how many postings each would cover and sample descriptions. On first call, scans all unmatched postings and generates AI suggestions via GPT-4.1.

  Do NOT use this to list existing active rules (use listAllRules).
  '''
  function listMissingRules() returns array of MissingRuleSummary;

  @Core.Description: '''
  Use this function when the user wants to see the current active GL rules in the rule table.

  Trigger phrases:
  - "Show me all GL rules"
  - "List the current rules"
  - "What rules do we have"
  - "Show the rule table"
  - "What are the existing rules"

  Returns all active rules with patterns, GL accounts, and descriptions.

  Do NOT use this for pending AI suggestions (use listMissingRules).
  '''
  function listAllRules() returns array of RuleInfo;

  @Core.Description: '''
  Use this action when the user wants to send the weekly digest email to the GL master data owner with pending AI-suggested rules. Always confirm the recipient email with the user before calling.

  Trigger phrases:
  - "Email the digest to [address]"
  - "Send the weekly report"
  - "Notify the GL owner"
  - "Email pending suggestions"

  Returns the email message ID and a preview URL.
  '''
  action sendDigest(
    recipientEmail : String @Core.Description: 'The email address to send the digest to, for example "[email protected]". Required.'
  ) returns DigestResult;

  @Core.Description: '''
  Use this action when the user explicitly approves a specific AI-suggested rule to be added to the active rule table. Always confirm with the user before calling.

  Trigger phrases:
  - "Approve the [description] rule"
  - "Add that suggestion"
  - "Yes approve it"
  - "Accept the AI recommendation"

  Promotes the suggestion into the GLRules table and marks the UnmatchedPosting as approved.
  '''
  action approveRule(
    unmatchedId : String @Core.Description: 'The unique ID of the UnmatchedPosting to approve. Get this from listMissingRules results, it is the Suggestion ID field.'
  ) returns ApprovedRuleResult;

  type DeterminationResult {
    glAccount           : String  @Common.Label: 'GL Account';
    confidence          : Decimal @Common.Label: 'Confidence Score';
    matchedPattern      : String  @Common.Label: 'Matched Rule Pattern';
    status              : String  @Common.Label: 'Determination Status';
    explanation         : String  @Common.Label: 'Explanation';
    suggestedPattern    : String  @Common.Label: 'AI Suggested Pattern';
    suggestedGL         : String  @Common.Label: 'AI Suggested GL';
    suggestionRationale : String  @Common.Label: 'AI Reasoning';
  }

  type MissingRuleSummary {
    unmatchedId        : String  @Common.Label: 'Suggestion ID';
    suggestedPattern   : String  @Common.Label: 'Suggested Pattern';
    suggestedGL        : String  @Common.Label: 'Suggested GL Account';
    rationale          : String  @Common.Label: 'AI Reasoning';
    affectedPostings   : Integer @Common.Label: 'Affected Postings';
    sampleDescriptions : String  @Common.Label: 'Sample Descriptions';
  }

  type DigestResult {
    messageId        : String  @Common.Label: 'Email Message ID';
    previewUrl       : String  @Common.Label: 'Email Preview URL';
    suggestionsCount : Integer @Common.Label: 'Suggestions Included';
    status           : String  @Common.Label: 'Send Status';
  }

  type RuleInfo {
    ID          : String  @Common.Label: 'Rule ID';
    pattern     : String  @Common.Label: 'Rule Pattern';
    glAccount   : String  @Common.Label: 'GL Account';
    description : String  @Common.Label: 'Rule Description';
  }

  type ApprovedRuleResult {
    ID          : String  @Common.Label: 'New Rule ID';
    pattern     : String  @Common.Label: 'Rule Pattern';
    glAccount   : String  @Common.Label: 'GL Account';
    description : String  @Common.Label: 'Rule Description';
    status      : String  @Common.Label: 'Approval Status';
  }
}
