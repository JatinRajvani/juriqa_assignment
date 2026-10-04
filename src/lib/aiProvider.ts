import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText as vercelGenerateText } from 'ai';

export function getGeminiModel() {
  const geminiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ''
  ).trim();

  if (!geminiKey || geminiKey.length <= 5) return null;

  const google = createGoogleGenerativeAI({
    apiKey: geminiKey,
  });

  let geminiModel = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  if (!geminiModel || geminiModel.includes('3.6') || geminiModel.includes('gpt')) {
    geminiModel = 'gemini-3.8-flash';
  }

  return google(geminiModel);
}

export function getGroqModel() {
  const apiKey = (
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ''
  ).trim();

  if (!apiKey || apiKey.length <= 5) return null;

  const baseURL = process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1';
  let modelName = (process.env.AI_MODEL || 'openai/gpt-oss-20b').trim();

  // If old deprecated model name was specified, upgrade to llama-3.3-70b-versatile
  if (modelName.includes('3.1-8b') || modelName.includes('gpt-oss')) {
    modelName = 'openai/gpt-oss-20b';
  }

  const customGroq = createOpenAI({
    apiKey,
    baseURL,
  });

  return customGroq(modelName);
}

/**
 * Returns primary model based on configuration or fallbacks
 */
export function getAIModel() {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  
  if (provider === 'groq') {
    const groq = getGroqModel();
    if (groq) return groq;
  }

  const gemini = getGeminiModel();
  if (gemini) return gemini;

  const groq = getGroqModel();
  if (groq) return groq;

  // Fallback default
  const google = createGoogleGenerativeAI({ apiKey: 'invalid-key' });
  return google('gemini-1.5-flash');
}

/**
 * Executes text generation trying Gemini FIRST, then Groq as backup.
 */
export async function generateTextWithFallback({
  system,
  prompt,
}: {
  system?: string;
  prompt: string;
}): Promise<{ text: string; providerUsed: string }> {
  // 1. Try Gemini Key First
  const geminiModel = getGeminiModel();
  if (geminiModel) {
    try {
      console.log('Attempting generation with Gemini...');
      const res = await vercelGenerateText({
        model: geminiModel,
        system,
        prompt,
      });

      if (res.text && res.text.trim().length > 0) {
        return { text: res.text, providerUsed: 'gemini' };
      }
      console.warn('Gemini returned empty text, falling back to Groq...');
    } catch (geminiErr: any) {
      console.warn('Gemini API call failed/busy, falling back to Groq:', geminiErr?.message || geminiErr);
    }
  }

  // 2. Try Groq Key as Backup
  const groqModel = getGroqModel();
  if (groqModel) {
    try {
      console.log('Attempting generation with Groq (llama-3.3-70b-versatile)...');
      const res = await vercelGenerateText({
        model: groqModel,
        system,
        prompt,
      });

      if (res.text && res.text.trim().length > 0) {
        return { text: res.text, providerUsed: 'groq' };
      }
      console.warn('Groq returned empty text.');
    } catch (groqErr: any) {
      console.warn('Groq API call failed:', groqErr?.message || groqErr);
    }
  }

  throw new Error('All AI providers (Gemini and Groq) failed or returned empty response.');
}
