export interface RetrievalResult {
  contextText: string;
  isPartialContext: boolean;
  evaluatedChunksCount: number;
  totalChunksCount: number;
  evaluatedPagesLabel?: string;
}

export interface ChunkWithScore {
  chunkIndex: number;
  text: string;
  pageNumber: number;
  score: number;
}

/**
  BM25 Algorithm Configuration Parameters
  Standard values recommended for legal document retrieval
 */
export const BM25_CONFIG = {
  k1: 1.2,
  b: 0.75,
};

/**
  Lightweight tokenizer for legal contracts:
  - Converts text to lowercase
  - Preserves legal numbers (e.g. 30, 60, 90, 100000)
  - Preserves legal terms and currency codes (e.g. AED, SOW)
  - Removes non-alphanumeric symbols while retaining spaces and hyphens
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
  Scores document chunks using standard BM25 retrieval algorithm.
  Logs detailed term frequencies, document frequencies, IDF weights, and chunk scores to terminal console.
 */
export function scoreChunksWithBM25(
  query: string,
  chunks: Array<{ chunkIndex: number; text: string; pageNumber: number }>
): ChunkWithScore[] {
  if (!chunks || chunks.length === 0) return [];

  const queryTokens = Array.from(new Set(tokenizeText(query)));
  if (queryTokens.length === 0) {
    return chunks.map((c) => ({ ...c, score: 0 }));
  }

  const N = chunks.length;

  // 1. Compute term frequencies (TF) per chunk and document frequencies (DF) across all chunks
  const chunkTfMaps: Array<Map<string, number>> = [];
  const chunkLengths: number[] = [];
  const dfMap = new Map<string, number>();
  let totalTokensAcrossChunks = 0;

  for (const chunk of chunks) {
    const tokens = tokenizeText(chunk.text);
    const length = tokens.length;
    chunkLengths.push(length);
    totalTokensAcrossChunks += length;

    const tfMap = new Map<string, number>();
    const uniqueTokensInChunk = new Set<string>();

    for (const token of tokens) {
      tfMap.set(token, (tfMap.get(token) || 0) + 1);
      uniqueTokensInChunk.add(token);
    }

    chunkTfMaps.push(tfMap);

    for (const token of uniqueTokensInChunk) {
      dfMap.set(token, (dfMap.get(token) || 0) + 1);
    }
  }

  // 2. Average document (chunk) length
  const avgDocLength = totalTokensAcrossChunks / Math.max(1, N);

  // 3. Compute Inverse Document Frequency (IDF) for query terms
  const idfMap = new Map<string, number>();
  const idfLogs: Array<{ term: string; df: number; idf: number }> = [];

  for (const term of queryTokens) {
    const DF = dfMap.get(term) || 0;
    let idf = 0;
    if (DF > 0) {
      idf = Math.max(0, Math.log(1 + (N - DF + 0.5) / (DF + 0.5)));
    }
    idfMap.set(term, idf);
    idfLogs.push({ term, df: DF, idf: Number(idf.toFixed(4)) });
  }

  // 4. Calculate BM25 score for each chunk
  const { k1, b } = BM25_CONFIG;

  const scoredChunks = chunks.map((chunk, idx) => {
    const tfMap = chunkTfMaps[idx];
    const docLength = chunkLengths[idx];
    let score = 0;

    for (const term of queryTokens) {
      const TF = tfMap.get(term) || 0;
      const IDF = idfMap.get(term) || 0;

      if (TF > 0 && IDF > 0) {
        const numerator = TF * (k1 + 1);
        const denominator = TF + k1 * (1 - b + b * (docLength / Math.max(1, avgDocLength)));
        score += IDF * (numerator / denominator);
      }
    }

    return {
      ...chunk,
      score: Number(score.toFixed(4)),
    };
  });

  return scoredChunks;
}

/**
  Retrieves context text for a query using the BM25 retrieval engine.
  Outputs rich step-by-step terminal logs showing how BM25 selects the Top 10-15 chunks.
 */
export function getContextForQuery(
  query: string,
  fullText: string,
  chunks: Array<{ chunkIndex: number; text: string; pageNumber: number }>,
  maxChars = 22000
): RetrievalResult {
  const totalChunksCount = chunks.length;

  console.log('\n==================================================');
  console.log('🔍 BM25 RETRIEVAL ENGINE EXECUTING');
  console.log(`Query: "${query}"`);
  console.log(`Document Size: ${fullText.length.toLocaleString()} chars | Total Chunks (N): ${totalChunksCount}`);
  console.log('==================================================');

  // Case 1: Small/Medium Document -> Fit entire document in context
  if (fullText.length <= maxChars) {
    console.log('📌 Strategy: Small/Medium Document -> Sending 100% full text to AI context.');
    console.log('==================================================\n');
    return {
      contextText: fullText,
      isPartialContext: false,
      evaluatedChunksCount: totalChunksCount || 1,
      totalChunksCount: totalChunksCount || 1,
    };
  }

  // Case 2: Large Document -> Perform BM25 Chunk Retrieval
  if (!chunks || chunks.length === 0) {
    console.log('⚠️ Strategy: Large Document without chunk array -> Truncating text safely.');
    console.log('==================================================\n');
    return {
      contextText: fullText.slice(0, maxChars),
      isPartialContext: true,
      evaluatedChunksCount: 1,
      totalChunksCount: 1,
      evaluatedPagesLabel: 'First 30 pages',
    };
  }

  // 1. Score all document chunks using BM25
  const scoredChunks = scoreChunksWithBM25(query, chunks);

  // 2. Sort chunks by BM25 relevance score descending
  scoredChunks.sort((a, b) => b.score - a.score);

  // Log Top BM25 Ranked Chunks
  console.log('\n🏆 TOP BM25 RANKED CHUNKS:');
  scoredChunks.slice(0, 15).forEach((chunk, index) => {
    const preview = chunk.text.replace(/\s+/g, ' ').slice(0, 80);
    console.log(`   Rank #${index + 1} | Chunk #${chunk.chunkIndex} | Score: ${chunk.score} | Snippet: "${preview}..."`);
  });

  // 3. Select Top-K best ranked chunks (capped at top 15 chunks) fitting within maxChars context budget
  const maxTopK = 15;
  let currentLength = 0;
  const selectedChunks: typeof chunks = [];

  for (const chunk of scoredChunks) {
    if (selectedChunks.length >= maxTopK) break;
    if (currentLength + chunk.text.length <= maxChars) {
      selectedChunks.push(chunk);
      currentLength += chunk.text.length;
    }
  }

  console.log(`\n📦 SELECTED TOP-K CHUNKS SENT TO AI:`);
  console.log(`   Capped Count: ${selectedChunks.length} of ${totalChunksCount} total sections`);
  console.log(`   Total Context Size: ${currentLength.toLocaleString()} / ${maxChars.toLocaleString()} chars budget`);

  // 4. Sort selected chunks back by original chunkIndex to preserve natural document reading order
  selectedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

  const selectedIndices = selectedChunks.map((c) => c.chunkIndex);
  console.log(`   Sequential Reading Order for AI: [${selectedIndices.join(', ')}]`);
  console.log('==================================================\n');

  const contextText = selectedChunks.map((c) => c.text).join('\n\n--- SECTION BREAK ---\n\n');

  return {
    contextText,
    isPartialContext: true,
    evaluatedChunksCount: selectedChunks.length,
    totalChunksCount,
    evaluatedPagesLabel: `${selectedChunks.length} of ${totalChunksCount} document sections`,
  };
}
