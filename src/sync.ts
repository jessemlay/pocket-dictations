import { App, Notice, TFolder, normalizePath } from 'obsidian';
import type { PocketSettings } from './settings';
import { PocketApiClient } from './api';
import type { PocketRecording } from './api';

export class SyncEngine {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	async run(
		settings: PocketSettings,
		saveSettings: () => Promise<void>
	): Promise<{ imported: number; skipped: number }> {
		if (!settings.apiKey) {
			new Notice('Pocket Dictations: No API key set. Please configure it in settings.');
			return { imported: 0, skipped: 0 };
		}

		const client = new PocketApiClient(settings.apiKey);
		let recordings: PocketRecording[];

		try {
			recordings = await client.listRecordings();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Pocket Dictations: ${message}`);
			return { imported: 0, skipped: 0 };
		}

		const importedSet = new Set(settings.importedIds);

		// Remove IDs from the imported set if their note file no longer exists,
		// so deleted notes get re-imported on the next sync.
		for (const id of Array.from(importedSet)) {
			const recording = recordings.find(r => r.id === id);
			if (recording && !this.noteExists(recording, settings.importFolder)) {
				importedSet.delete(id);
			}
		}

		const newRecordings = recordings.filter(r => !importedSet.has(r.id));

		if (newRecordings.length === 0) {
			settings.importedIds = Array.from(importedSet);
			await saveSettings();
			return { imported: 0, skipped: recordings.length };
		}

		await this.ensureFolder(settings.importFolder);

		let imported = 0;
		for (const summary of newRecordings) {
			try {
				// Fetch the full recording detail to get transcript/summary/action_items
				let detail: PocketRecording = summary;
				try {
					detail = await client.getRecording(summary.id);
				} catch {
					// Fall back to summary-only if detail fetch fails
				}
				await this.createNote(detail, settings.importFolder);
				importedSet.add(summary.id);
				imported++;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				new Notice(`Pocket Dictations: Failed to save "${summary.title}": ${message}`);
			}
		}

		settings.importedIds = Array.from(importedSet);
		settings.lastSyncTime = new Date().toISOString();
		await saveSettings();

		return { imported, skipped: recordings.length - newRecordings.length };
	}

	private noteExists(recording: PocketRecording, folderPath: string): boolean {
		const dateSource = recording.recording_at || recording.created_at;
		const date = dateSource
			? (new Date(dateSource).toISOString().split('T')[0] ?? 'unknown-date')
			: 'unknown-date';
		const safeTitle = sanitizeFilename(recording.title || `Recording ${recording.id}`);
		const filename = normalizePath(`${folderPath}/${date} - ${safeTitle}.md`);
		return this.app.vault.getAbstractFileByPath(filename) !== null;
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath);
		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (!existing) {
			await this.app.vault.createFolder(normalized);
		} else if (!(existing instanceof TFolder)) {
			throw new Error(`"${folderPath}" exists in the vault but is not a folder.`);
		}
	}

	private async createNote(recording: PocketRecording, folderPath: string): Promise<void> {
		// Prefer recording_at (when it was captured) over created_at (when it was processed)
		const dateSource = recording.recording_at || recording.created_at;
		const date = dateSource
			? (new Date(dateSource).toISOString().split('T')[0] ?? 'unknown-date')
			: 'unknown-date';

		const safeTitle = sanitizeFilename(recording.title || `Recording ${recording.id}`);
		const filename = normalizePath(`${folderPath}/${date} - ${safeTitle}.md`);

		if (this.app.vault.getAbstractFileByPath(filename)) {
			return;
		}

		const content = buildNoteContent(recording, date);
		await this.app.vault.create(filename, content);
	}
}

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim().slice(0, 100);
}

function buildNoteContent(recording: PocketRecording, date: string): string {
	// Tags are objects { id, name, color } — extract the name
	// Auto-tag daily highlight recordings regardless of their API tags
	const tagNames = Array.isArray(recording.tags)
		? recording.tags.map(t => t.name).filter(Boolean)
		: [];
	if (recording.id.startsWith('daily-highlights-') && !tagNames.includes('daily-highlights')) {
		tagNames.push('daily-highlights');
	}
	const tagsYaml = tagNames.length > 0
		? `tags: [${tagNames.map(n => `"${n}"`).join(', ')}]`
		: 'tags: []';

	const syncDate = new Date().toLocaleDateString();

	const frontmatter = [
		'---',
		`id: ${recording.id}`,
		`date: ${date}`,
		`source: pocket`,
		`state: ${recording.state ?? 'unknown'}`,
		tagsYaml,
		'---',
	].join('\n');

	const title = `# ${recording.title || `Recording ${recording.id}`}`;
	const syncNote = `> Synced from Pocket on ${syncDate}`;

	// summarizations is a keyed object — grab the first completed entry
	const firstSummarization = recording.summarizations
		? Object.values(recording.summarizations).find(s => s.processingStatus === 'completed') 
			?? Object.values(recording.summarizations)[0]
		: null;

	const summaryText = recording.summary
		?? firstSummarization?.v2?.summary?.markdown
		?? firstSummarization?.v2?.summary?.summary;

	const actionItemsList = firstSummarization?.v2?.actionItems?.actions ?? [];

	const summarySection = [
		'## Summary',
		'',
		summaryText ? summaryText.trim() : '_No summary available._',
	].join('\n');

	const actionItems = actionItemsList.length > 0
		? actionItemsList.map(a => `- ${a.label}`).join('\n')
		: '_No action items._';

	const actionSection = ['## Action Items', '', actionItems].join('\n');

	const transcriptText = normalizeTranscript(recording.transcript);

	const transcriptSection = [
		'## Transcript',
		'',
		transcriptText ? transcriptText.trim() : '_No transcript available._',
	].join('\n');

	return [frontmatter, '', title, '', syncNote, '', summarySection, '', actionSection, '', transcriptSection, ''].join('\n');
}

import type { PocketTranscriptSegment, PocketTranscriptObject } from './api';

function normalizeTranscript(transcript: string | PocketTranscriptSegment[] | PocketTranscriptObject | undefined): string {
	if (!transcript) return '';
	if (typeof transcript === 'string') return transcript;
	if (Array.isArray(transcript)) {
		return transcript.map(seg => seg.text ?? '').filter(Boolean).join(' ');
	}
	// Object shape: { text?, segments?, metadata? }
	if (typeof transcript === 'object') {
		if (transcript.text) return transcript.text;
		if (Array.isArray(transcript.segments)) {
			return transcript.segments.map(seg => seg.text ?? '').filter(Boolean).join(' ');
		}
	}
	return '';
}
