/**
 * Rule Matcher for GL Rule Assist
 *
 * Uses Jaccard similarity on lowercased tokenized description vs rule pattern keywords.
 *
 * TODO: Production upgrade — replace Jaccard with HANA Vector Engine for semantic matching:
 *   async function bestMatch(description, rules) {
 *     const embedding = await getEmbedding(description);
 *     const results = await cds.run(
 *       `SELECT *, COSINE_SIMILARITY(embedding, TO_REAL_VECTOR(?)) AS score
 *        FROM com_ncs_glassist_GLRules
 *        WHERE active = true
 *        ORDER BY score DESC LIMIT 1`, [embedding]
 *     );
 *     return { rule: results[0], score: results[0]?.score || 0 };
 *   }
 */

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function jaccardSimilarity(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function bestMatch(description, rules) {
  const descTokens = tokenize(description);
  let bestRule = null;
  let bestScore = 0;

  for (const rule of rules) {
    if (!rule.active) continue;
    const patternTokens = rule.pattern.split('|').map(t => t.trim().toLowerCase());
    const score = jaccardSimilarity(descTokens, patternTokens);

    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  return { rule: bestRule, score: bestScore };
}

module.exports = { bestMatch };
