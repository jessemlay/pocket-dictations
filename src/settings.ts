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

		containerEl.createEl('h2', { text: 'Pocket Dictations' });

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
			.setName('API Key')
			.setDesc(apiKeyDesc)
			.addText(text => {
				apiKeyInput = text.inputEl;
				apiKeyInput.type = 'password';
				apiKeyInput.autocomplete = 'off';
				text
					.setPlaceholder('pk_...')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async value => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
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
				.setButtonText('Test Connection')
				.setCta()
				.onClick(async () => {
					const key = this.plugin.settings.apiKey;
					if (!key) {
						new Notice('Enter your API key first.');
						return;
					}
					btn.setButtonText('Testing…');
					btn.setDisabled(true);
					try {
						const client = new PocketApiClient(key);
						await client.listRecordings();
						new Notice('✅ Pocket API key is valid!');
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						new Notice(`❌ ${msg}`);
					} finally {
						btn.setButtonText('Test Connection');
						btn.setDisabled(false);
					}
				})
		);

		// ── Import Folder ────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Import Folder')
			.setDesc('Vault folder where Pocket dictation notes will be saved.')
			.addText(text =>
				text
					.setPlaceholder('Pocket Dictations')
					.setValue(this.plugin.settings.importFolder)
					.onChange(async value => {
						this.plugin.settings.importFolder = value.trim() || 'Pocket Dictations';
						await this.plugin.saveSettings();
					})
			);

		// ── Auto-Sync Interval ───────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Auto-Sync Interval (minutes)')
			.setDesc('How often to automatically sync in the background. Set to 0 to disable auto-sync.')
			.addText(text =>
				text
					.setPlaceholder('30')
					.setValue(String(this.plugin.settings.syncIntervalMinutes))
					.onChange(async value => {
						const parsed = parseInt(value, 10);
						this.plugin.settings.syncIntervalMinutes = isNaN(parsed) || parsed < 0 ? 0 : parsed;
						await this.plugin.saveSettings();
						this.plugin.restartAutoSync();
					})
			);

		// ── Sync Status ──────────────────────────────────────────────────────
		const statusSetting = new Setting(containerEl).setName('Sync Status');

		if (this.plugin.settings.lastSyncTime) {
			statusSetting.setDesc(
				`Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()} · ${this.plugin.settings.importedIds.length} recording(s) imported`
			);
		} else {
			statusSetting.setDesc('Not yet synced.');
		}

		statusSetting.addButton(btn =>
			btn
				.setButtonText('Sync Now')
				.onClick(async () => {
					btn.setButtonText('Syncing…');
					btn.setDisabled(true);
					await this.plugin.syncNow();
					btn.setButtonText('Sync Now');
					btn.setDisabled(false);
					// Refresh the status description
					this.display();
				})
		);
	}
}
