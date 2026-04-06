import { Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, PocketSettingTab, PocketSettings } from './settings';
import { SyncEngine } from './sync';

export default class PocketPlugin extends Plugin {
	settings: PocketSettings;
	private syncEngine: SyncEngine;
	private autoSyncIntervalId: number | undefined;

	async onload() {
		await this.loadSettings();
		this.syncEngine = new SyncEngine(this.app);

		this.addRibbonIcon('microphone', 'Sync Pocket Dictations', async () => {
			await this.syncNow();
		});

		this.addCommand({
			id: 'sync-pocket-dictations',
			name: 'Sync Pocket Dictations',
			callback: async () => {
				await this.syncNow();
			},
		});

		this.addSettingTab(new PocketSettingTab(this.app, this));

		// Prompt first-time setup if no API key is configured
		if (!this.settings.apiKey) {
			const notice = new Notice(
				'Pocket Dictations: No API key configured. Click here to open settings.',
				10000
			);
			notice.noticeEl.style.cursor = 'pointer';
			notice.noticeEl.addEventListener('click', () => {
				// @ts-ignore – open the settings tab for this plugin
				(this.app as any).setting.openTabById(this.manifest.id);
				notice.hide();
			});
		}

		this.startAutoSync();
	}

	onunload() {
		this.stopAutoSync();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<PocketSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async syncNow(): Promise<void> {
		new Notice('Pocket Dictations: Syncing…');
		const { imported, skipped } = await this.syncEngine.run(this.settings, () => this.saveSettings());
		if (imported > 0) {
			new Notice(`Pocket Dictations: Imported ${imported} new recording${imported !== 1 ? 's' : ''}. (${skipped} already up to date)`);
		} else {
			new Notice('Pocket Dictations: Already up to date.');
		}
	}

	startAutoSync(): void {
		this.stopAutoSync();
		const intervalMs = this.settings.syncIntervalMinutes * 60 * 1000;
		if (intervalMs <= 0) return;

		this.autoSyncIntervalId = this.registerInterval(
			window.setInterval(async () => {
				await this.syncEngine.run(this.settings, () => this.saveSettings());
			}, intervalMs)
		);
	}

	stopAutoSync(): void {
		if (this.autoSyncIntervalId !== undefined) {
			window.clearInterval(this.autoSyncIntervalId);
			this.autoSyncIntervalId = undefined;
		}
	}

	restartAutoSync(): void {
		this.startAutoSync();
	}
}
