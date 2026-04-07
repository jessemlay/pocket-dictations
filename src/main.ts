import { App, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, PocketSettingTab, PocketSettings } from './settings';
import { SyncEngine } from './sync';

type AppWithSetting = App & { setting: { openTabById: (id: string) => void } };

export default class PocketPlugin extends Plugin {
	settings: PocketSettings;
	private syncEngine: SyncEngine;
	private autoSyncIntervalId: number | undefined;

	async onload() {
		await this.loadSettings();
		this.syncEngine = new SyncEngine(this.app);

		this.addRibbonIcon('microphone', 'Sync recordings', () => {
			void this.syncNow();
		});

		this.addCommand({
			id: 'sync',
			name: 'Sync recordings',
			callback: () => {
				void this.syncNow();
			},
		});

		this.addSettingTab(new PocketSettingTab(this.app, this));

		// Prompt first-time setup if no API key is configured
		if (!this.settings.apiKey) {
			const notice = new Notice(
				'No API key configured. Click here to open settings.',
				10000
			);
			notice.messageEl.addClass('pocket-notice-clickable');
			notice.messageEl.addEventListener('click', () => {
				(this.app as AppWithSetting).setting.openTabById(this.manifest.id);
				notice.hide();
			});
		}

		this.startAutoSync();
	}

	onunload() {
		this.stopAutoSync();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PocketSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async syncNow(): Promise<void> {
		new Notice('Syncing…');
		const { imported, skipped } = await this.syncEngine.run(this.settings, () => this.saveSettings());
		if (imported > 0) {
			new Notice(`Imported ${imported} new recording${imported !== 1 ? 's' : ''}. (${skipped} already up to date)`);
		} else {
			new Notice('Already up to date.');
		}
	}

	startAutoSync(): void {
		this.stopAutoSync();
		const intervalMs = this.settings.syncIntervalMinutes * 60 * 1000;
		if (intervalMs <= 0) return;

		this.autoSyncIntervalId = this.registerInterval(
			window.setInterval(() => {
				void this.syncEngine.run(this.settings, () => this.saveSettings());
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
