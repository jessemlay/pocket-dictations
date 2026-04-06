const BASE_URL = 'https://public.heypocketai.com/api/v1';

export interface PocketTag {
	id: string;
	name: string;
	color: string | null;
}

export interface PocketActionItem {
	id?: string;
	label: string;
	status?: string;
	priority?: string;
	isCompleted?: boolean;
}

export interface PocketV2Summary {
	markdown?: string;
	summary?: string;
	bullet_points?: string[];
	title?: string;
	emoji?: string;
}

export interface PocketV2 {
	summary?: PocketV2Summary;
	actionItems?: {
		actions?: PocketActionItem[];
	};
}

export interface PocketSummarization {
	id: string;
	summarizationId?: string;
	processingStatus?: string;
	v2?: PocketV2;
}

export interface PocketTranscriptSegment {
	text: string;
	start?: number;
	end?: number;
	speaker?: string;
	originalText?: string;
	words?: { word: string; start: number; end: number; score: number }[];
}

export interface PocketTranscriptObject {
	text?: string;
	segments?: PocketTranscriptSegment[];
	metadata?: Record<string, unknown>;
}

export interface PocketRecording {
	id: string;
	title: string;
	duration: number | null;
	state: string;
	language: string | null;
	recording_at: string;
	created_at: string;
	updated_at: string;
	tags: PocketTag[];
	// Detail fields (present when fetching a single recording with query params)
	transcript?: string | PocketTranscriptSegment[] | PocketTranscriptObject;
	raw_transcript?: PocketTranscriptObject;
	summary?: string;
	action_items?: PocketActionItem[];
	summarizations?: Record<string, PocketSummarization>;
}

interface ListRecordingsResponse {
	success: boolean;
	data: PocketRecording[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		total_pages: number;
		has_more: boolean;
	};
}

interface GetRecordingResponse {
	success: boolean;
	data: PocketRecording;
}

export class PocketApiClient {
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	private get headers(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
		};
	}

	async listRecordings(): Promise<PocketRecording[]> {
		const recordings: PocketRecording[] = [];
		let page = 1;

		do {
			const url = new URL(`${BASE_URL}/public/recordings`);
			url.searchParams.set('page', String(page));

			const response = await fetch(url.toString(), { headers: this.headers });

			if (response.status === 401) {
				throw new Error('Invalid Pocket API key. Please check your settings.');
			}
			if (!response.ok) {
				throw new Error(`Pocket API error: ${response.status} ${response.statusText}`);
			}

			const body = (await response.json()) as ListRecordingsResponse;
			if (Array.isArray(body.data)) {
				recordings.push(...body.data);
			}

			if (!body.pagination?.has_more) break;
			page++;
		} while (true);

		return recordings;
	}

	async getRecording(id: string): Promise<PocketRecording> {
		const url = new URL(`${BASE_URL}/public/recordings/${encodeURIComponent(id)}`);
		url.searchParams.set('include_transcript', 'true');
		url.searchParams.set('include_summarizations', 'true');

		const response = await fetch(url.toString(), { headers: this.headers });

		if (response.status === 401) {
			throw new Error('Invalid Pocket API key. Please check your settings.');
		}
		if (!response.ok) {
			throw new Error(`Pocket API error: ${response.status} ${response.statusText}`);
		}

		const body = (await response.json()) as GetRecordingResponse;
		return body.data;
	}
}
