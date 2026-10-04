import mammoth from 'mammoth';

export interface ExtractionResult {
  text: string;
  pageCount: number;
  isScanned: boolean;
  fileType: 'pdf' | 'docx';
}

/**
  Safely decodes URI components from PDF text streams without crashing on malformed percent sequences.
 */
function safeDecodeUriComponent(str: string): string {
  if (!str) return '';
  try {
    return decodeURIComponent(str);
  } catch {
    return str.replace(/%([0-9A-F]{2})/gi, (match, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return match;
      }
    });
  }
}

/**
  Parses PDF buffer using pdf2json (pure Node.js parser with no canvas/DOM dependencies).
  Handles malformed URI strings safely to support multi-hundred page PDF books.
 */
async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFParser = require('pdf2json');
    const pdfParser = new PDFParser(null, true);

    return await new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pdfParser.on('pdfParser_dataError', (errData: any) => {
        reject(new Error(errData.parserError || 'PDF parsing error'));
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          const pageCount = pdfData?.Pages?.length || 1;
          let text = '';

          if (pdfData?.Pages && Array.isArray(pdfData.Pages)) {
            text = pdfData.Pages.map((page: any) => {
              if (!page?.Texts || !Array.isArray(page.Texts)) return '';
              return page.Texts.map((t: any) => {
                if (!t?.R || !Array.isArray(t.R)) return '';
                return t.R.map((r: any) => safeDecodeUriComponent(r.T || '')).join('');
              }).join(' ');
            }).join('\n\n');
          }

          if (!text.trim()) {
            const rawText = pdfParser.getRawTextContent() || '';
            text = safeDecodeUriComponent(rawText);
          }

          resolve({ text, pageCount });
        } catch (err) {
          reject(err);
        }
      });

      pdfParser.parseBuffer(buffer);
    });
  } catch (pdf2jsonErr) {
    console.warn('pdf2json primary parser error, trying secondary parser:', pdf2jsonErr);

    // Secondary fallback: pdf-parse module
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParseModule = require('pdf-parse');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default;
      if (typeof pdfParse === 'function') {
        const data = await pdfParse(buffer);
        return { text: data.text || '', pageCount: data.numpages || 1 };
      }
    } catch {
      // ignore secondary error
    }

    // Tertiary emergency fallback: Extract raw text streams from PDF buffer
    const rawString = buffer.toString('utf-8');
    const textMatches = rawString.match(/\(([^)]+)\)\s*Tj/g) || [];
    const extractedRaw = textMatches
      .map((m) => m.replace(/[()]/g, '').replace(/\s*Tj$/, ''))
      .join(' ');

    if (extractedRaw.trim().length > 20) {
      return {
        text: extractedRaw,
        pageCount: Math.max(1, Math.ceil(extractedRaw.length / 2000)),
      };
    }

    throw new Error('Could not extract text from PDF file.');
  }
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: 'pdf' | 'docx'
): Promise<ExtractionResult> {
  if (fileType === 'pdf') {
    try {
      const { text: rawText, pageCount } = await parsePdfBuffer(buffer);
      const trimmedText = rawText.trim();

      // Detect scanned PDF: empty text or fewer than 15 characters / 5 words
      const words = trimmedText.split(/\s+/).filter(Boolean);
      const isScanned = trimmedText.length < 15 || words.length < 5;

      return {
        text: rawText,
        pageCount,
        isScanned,
        fileType: 'pdf',
      };
    } catch (error) {
      console.error('Error parsing PDF buffer:', error);
      throw new Error(`Failed to parse PDF file: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (fileType === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const rawText = result.value || '';
      const trimmedText = rawText.trim();
      const words = trimmedText.split(/\s+/).filter(Boolean);
      const isScanned = trimmedText.length < 10 || words.length < 3;

      const estimatedPages = Math.max(1, Math.ceil(words.length / 400));

      return {
        text: rawText,
        pageCount: estimatedPages,
        isScanned,
        fileType: 'docx',
      };
    } catch (error) {
      console.error('Error parsing DOCX buffer:', error);
      throw new Error('Failed to parse DOCX file. The file may be corrupt or invalid.');
    }
  }

  throw new Error('Unsupported file format');
}

export function chunkDocumentText(text: string, defaultChunkSize = 1500, overlap = 200) {
  const chunks: Array<{ chunkIndex: number; text: string; pageNumber: number }> = [];
  if (!text) return chunks;

  // Adaptively adjust chunkSize for giant documents to prevent BSON 16MB MongoDB document limit
  let chunkSize = defaultChunkSize;
  if (text.length > 2000000) {
    chunkSize = 6000;
  } else if (text.length > 500000) {
    chunkSize = 3000;
  }

  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    if ((currentChunk + '\n\n' + para).length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        chunkIndex,
        text: currentChunk.trim(),
        pageNumber: 1,
      });
      chunkIndex++;

      // Cap max chunks at 500 to keep MongoDB document size well under 16MB limit
      if (chunks.length >= 500) break;

      const words = currentChunk.split(/\s+/);
      const overlapText = words.slice(Math.max(0, words.length - 30)).join(' ');
      currentChunk = overlapText + '\n\n' + para;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
    }
  }

  if (currentChunk.trim().length > 0 && chunks.length < 500) {
    chunks.push({
      chunkIndex,
      text: currentChunk.trim(),
      pageNumber: 1,
    });
  }

  return chunks;
}
