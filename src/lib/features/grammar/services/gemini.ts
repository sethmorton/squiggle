// Server-side helper for calling Gemini via SvelteKit endpoint
// This file is imported by the client UI to call our own API, not Google directly.
import type { Suggestion } from '../model/suggestion';

export type AiSuggestResponse = {
  suggestions: Suggestion[];
};

let currentController: AbortController | null = null;

export async function fetchAiSuggestions(text: string, apiKey: string): Promise<Suggestion[]> {
  if (currentController) currentController.abort();
  currentController = new AbortController();
  const res = await fetch('/api/grammar/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, apiKey }),
    signal: currentController.signal
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`AI suggest failed: ${res.status} ${msg}`);
  }
  const data = (await res.json()) as AiSuggestResponse;
  return data.suggestions ?? [];
}

export async function fetchAiSuggestionsScoped(
  text: string,
  apiKey: string,
  start: number,
  end: number
): Promise<Suggestion[]> {
  if (currentController) currentController.abort();
  currentController = new AbortController();
  const res = await fetch('/api/grammar/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, apiKey, scope: { start, end } }),
    signal: currentController.signal
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`AI suggest (scoped) failed: ${res.status} ${msg}`);
  }
  const data = (await res.json()) as AiSuggestResponse;
  return data.suggestions ?? [];
}
