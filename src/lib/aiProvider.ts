import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText as vercelGenerateText, streamText as vercelStreamText } from 'ai';

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
  const modelName = (process.env.AI_MODEL || 'openai/gpt-oss-20b').trim();

  const customGroq = createOpenAI({
    apiKey,
    baseURL,
  });

  return customGroq(modelName);
}

/**
 * Returns primary model based on configuration or fallbacks (Groq first)
 */
export function getAIModel() {
  const groq = getGroqModel();
  if (groq) return groq;

  const gemini = getGeminiModel();
  if (gemini) return gemini;

  // Fallback default
  const customGroq = createOpenAI({ apiKey: 'invalid-key', baseURL: 'https://api.groq.com/openai/v1' });
  return customGroq('openai/gpt-oss-20b');
}

/**
 * Executes text generation trying Groq FIRST, then Gemini as backup.
 */
export async function generateTextWithFallback({
  system,
  prompt,
}: {
  system?: string;
  prompt: string;
}): Promise<{ text: string; providerUsed: string }> {
  // 1. Try Groq Key First
  const groqModel = getGroqModel();
  if (groqModel) {
    try {
      console.log('Attempting generation with Groq API first...');
      const res = await vercelGenerateText({
        model: groqModel,
        system,
        prompt,
      });

      if (res.text && res.text.trim().length > 0) {
        return { text: res.text, providerUsed: 'groq' };
      }
      console.warn('Groq returned empty text, falling back to Gemini...');
    } catch (groqErr: any) {
      console.warn('Groq API call failed/busy, falling back to Gemini:', groqErr?.message || groqErr);
    }
  }

  // 2. Try Gemini Key as Backup
  const geminiModel = getGeminiModel();
  if (geminiModel) {
    try {
      console.log('Attempting generation with Gemini as backup...');
      const res = await vercelGenerateText({
        model: geminiModel,
        system,
        prompt,
      });

      if (res.text && res.text.trim().length > 0) {
        return { text: res.text, providerUsed: 'gemini' };
      }
      console.warn('Gemini returned empty text.');
    } catch (geminiErr: any) {
      console.warn('Gemini API call failed:', geminiErr?.message || geminiErr);
    }
  }

  throw new Error('All AI providers (Groq and Gemini) failed or returned empty response.');
}

/**
 * Executes streaming text generation trying Groq FIRST, then Gemini as backup.
 */
export function streamTextWithFallback({
  system,
  messages,
  onFinish,
}: {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  onFinish?: (options: { text: string }) => Promise<void> | void;
}) {
  // 1. Try Groq Key First
  const groqModel = getGroqModel();
  if (groqModel) {
    try {
      console.log('Attempting chat streaming with Groq API first...');
      return vercelStreamText({
        model: groqModel,
        system,
        messages,
        onFinish,
      });
    } catch (groqErr) {
      console.warn('Groq stream initialization failed, falling back to Gemini:', groqErr);
    }
  }

  // 2. Try Gemini Key as Backup
  const geminiModel = getGeminiModel();
  if (geminiModel) {
    console.log('Attempting chat streaming with Gemini as backup...');
    return vercelStreamText({
      model: geminiModel,
      system,
      messages,
      onFinish,
    });
  }

  throw new Error('All streaming AI providers (Groq and Gemini) failed or are unconfigured.');
}
