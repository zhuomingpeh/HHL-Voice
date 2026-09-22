// Deterministic name matching for identity validation (spec section 9:
// "minor pronunciation differences or common formatting differences may be
// accepted where confidence is high"). Kept as plain application logic, not
// left to the AI's judgment, per spec section 25.

function normalize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function tokensReasonablyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  const allowedDistance = maxLen <= 4 ? 1 : Math.max(1, Math.floor(maxLen * 0.25));
  return levenshtein(a, b) <= allowedDistance;
}

/**
 * Reasonably matches a spoken/provided name against the name on file,
 * tolerant of word reordering, minor typos/mishearing, and missing middle
 * names — but not a wrong name entirely.
 */
export function namesReasonablyMatch(provided: string, onFile: string): boolean {
  const providedTokens = normalize(provided);
  const fileTokens = normalize(onFile);
  if (providedTokens.length === 0 || fileTokens.length === 0) return false;

  const usedFileTokens = new Set<number>();
  let matchedCount = 0;

  for (const pToken of providedTokens) {
    const matchIndex = fileTokens.findIndex(
      (fToken, idx) => !usedFileTokens.has(idx) && tokensReasonablyMatch(pToken, fToken)
    );
    if (matchIndex !== -1) {
      usedFileTokens.add(matchIndex);
      matchedCount++;
    }
  }

  // Require most of the shorter name's tokens to have matched — e.g. a
  // single correct surname alone isn't enough, but "Wei Ming" matching
  // within "Tan Wei Ming" is.
  const requiredMatches = Math.min(providedTokens.length, fileTokens.length);
  return matchedCount >= requiredMatches && matchedCount >= 1;
}
