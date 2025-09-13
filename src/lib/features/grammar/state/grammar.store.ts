import { writable, derived } from 'svelte/store';
import type { Suggestion } from '../model/suggestion';

export const textStore = writable<string>('');
export const suggestionsStore = writable<Suggestion[]>([]);
export const selectedSuggestionId = writable<string | null>(null);
export const isAiEnabled = writable<boolean>(true);

export const selectedSuggestion = derived(
  [suggestionsStore, selectedSuggestionId],
  ([$sugs, $id]) => $sugs.find((s) => s.id === $id) ?? null
);

export function upsertSuggestions(suggestions: Suggestion[]) {
  suggestionsStore.set(suggestions);
}

