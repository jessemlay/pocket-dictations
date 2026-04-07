import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type PocketPlugin from './main';
import { PocketApiClient } from './api';

export interface PocketSettings {
	apiKey: string;
	importFolder: string;
	syncIntervalMinutes: number;
	importedIds: string[];
	lastSyncTime: string;
}

export const DEFAULT_SETTINGS: PocketSettings = {
	apiKey: '',
	importFolder: 'Pocket Dictations',
	syncIntervalMinutes: 30,
	importedIds: [],
	lastSyncTime: '',
};

export class PocketSettingTab extends PluginSettingTab {
	plugin: PocketPlugin;

	constructor(app: App, plugin: PocketPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('Pocket Dictations').setHeading();

		// ── API Key ──────────────────────────────────────────────────────────
		const apiKeyDesc = document.createDocumentFragment();
		apiKeyDesc.append(
			'Your Pocket AI API key (starts with pk_). Find it in the Pocket app under ',
			createEl('strong', { text: 'Settings → Integrations' }),
			'. ',
			createEl('a', {
				text: 'View API docs ↗',
				href: 'https://docs.heypocketai.com/docs/api',
			})
		);

		let apiKeyInput: HTMLInputElement;
		const apiKeySetting = new Setting(containerEl)
			.setName('API key')
			.setDesc(apiKeyDesc)
			.addText(text => {
				apiKeyInput = text.inputEl;
				apiKeyInput.type = 'password';
				apiKeyInput.autocomplete = 'off';
				text
					.setPlaceholder('pk_...')
					.setValue(this.plugin.settings.apiKey)
					.onChange(value => {
						this.plugin.settings.apiKey = value.trim();
						void this.plugin.saveSettings();
					});
			})
			.addExtraButton(btn =>
				btn
					.setIcon('eye')
					.setTooltip('Show / hide API key')
					.onClick(() => {
						if (apiKeyInput.type === 'password') {
							apiKeyInput.type = 'text';
							btn.setIcon('eye-off');
						} else {
							apiKeyInput.type = 'password';
							btn.setIcon('eye');
						}
					})
			);

		// Test Connection button
		apiKeySetting.addButton(btn =>
			btn
				.setButtonText('Test connection')
				.setCta()
				.onClick(() => {
					const key = this.plugin.settings.apiKey;
					if (!key) {
						new Notice('Enter your API key first.');
						return;
					}
					btn.setButtonText('Testing…');
					btn.setDisabled(true);
					void new PocketApiClient(key).listRecordings()
						.then(() => {
							new Notice('✅ Pocket API key is valid!');
						})
						.catch((err: unknown) => {
							const msg = err instanceof Error ? err.message : String(err);
							new Notice(`❌ ${msg}`);
						})
						.finally(() => {
							btn.setButtonText('Test connection');
							btn.setDisabled(false);
						});
				})
		);

		// ── Import Folder ────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Import folder')
			.setDesc('Vault folder where Pocket dictation notes will be saved.')
			.addText(text =>
				text
					.setPlaceholder('Pocket Dictations')
					.setValue(this.plugin.settings.importFolder)
					.onChange(value => {
						this.plugin.settings.importFolder = value.trim() || 'Pocket Dictations';
						void this.plugin.saveSettings();
					})
			);

		// ── Auto-Sync Interval ───────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Auto-sync interval (minutes)')
			.setDesc('How often to automatically sync in the background. Set to 0 to disable auto-sync.')
			.addText(text =>
				text
					.setPlaceholder('30')
					.setValue(String(this.plugin.settings.syncIntervalMinutes))
					.onChange(value => {
						const parsed = parseInt(value, 10);
						this.plugin.settings.syncIntervalMinutes = isNaN(parsed) || parsed < 0 ? 0 : parsed;
						void this.plugin.saveSettings();
						this.plugin.restartAutoSync();
					})
			);

		// ── Sync Status ──────────────────────────────────────────────────────
		const statusSetting = new Setting(containerEl).setName('Sync status');

		if (this.plugin.settings.lastSyncTime) {
			statusSetting.setDesc(
				`Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()} · ${this.plugin.settings.importedIds.length} recording(s) imported`
			);
		} else {
			statusSetting.setDesc('Not yet synced.');
		}

		statusSetting.addButton(btn =>
			btn
				.setButtonText('Sync now')
				.onClick(() => {
					btn.setButtonText('Syncing…');
					btn.setDisabled(true);
					void this.plugin.syncNow().finally(() => {
						btn.setButtonText('Sync now');
						btn.setDisabled(false);
						this.display();
					});
				})
		);
	}
}
