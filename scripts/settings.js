// File: scripts/settings.js
import { MODULE_ID, SETTINGS, DEFAULT_TRACKER_CONFIGS } from "./constants.js";
// TrackerConfigApp is no longer needed if we edit JSON directly
// import { TrackerConfigApp } from "./tracker-config-app.js"; 

export function registerSettings() {
    const logPrefix = `%c[${MODULE_ID} | Settings]`;
    const settingStyle = "color: saddlebrown;";

    // --- Global Settings ---
    game.settings.register(MODULE_ID, SETTINGS.UPDATE_INTERVAL_HOURS, {
        name: `${MODULE_ID}.settings.${SETTINGS.UPDATE_INTERVAL_HOURS}.name`,
        hint: `${MODULE_ID}.settings.${SETTINGS.UPDATE_INTERVAL_HOURS}.hint`,
        scope: "world",
        config: true, // Show in the standard settings list
        type: Number,
        default: 4,
        range: { min: 1, max: 72, step: 1 },
        onChange: value => {
            console.log(`${logPrefix} Setting '${SETTINGS.UPDATE_INTERVAL_HOURS}' changed to: ${value}`, settingStyle);
        }
    });

    game.settings.register(MODULE_ID, SETTINGS.AFFECTS_NPCS, {
        name: `${MODULE_ID}.settings.${SETTINGS.AFFECTS_NPCS}.name`,
        hint: `${MODULE_ID}.settings.${SETTINGS.AFFECTS_NPCS}.hint`,
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: value => {
            console.log(`${logPrefix} Setting '${SETTINGS.AFFECTS_NPCS}' changed to: ${value}`, settingStyle);
            if (window.survivalNeedsGlobalInstance?.needsManager && game.user.isGM) {
                // Consider a targeted re-evaluation if this changes
                // For now, a full setup might be too broad, but it's an option:
                // window.survivalNeedsGlobalInstance.performInitialActorSetup();
            }
        }
    });

    // --- Tracker Configurations Data Setting (Direct JSON Edit) ---
    game.settings.register(MODULE_ID, SETTINGS.TRACKER_CONFIGS, {
        name: `${MODULE_ID}.settings.trackerConfigJSON.name`, // Localization key for "Tracker Configurations (JSON)"
        hint: `${MODULE_ID}.settings.trackerConfigJSON.hint`, // Localization key for hint about editing JSON
        scope: "world",
        config: true, // <<<<<<< SET TO TRUE to make it appear in the settings UI
        type: String, // Stored as a string
        // It's better to use a textarea for editing JSON, but Foundry's default for String is a text input.
        // For a true textarea, you'd typically need a custom FormApplication or use a module like TidyUI Game Settings.
        // However, users can still paste multi-line JSON into a standard text input.
        default: JSON.stringify(DEFAULT_TRACKER_CONFIGS, null, 2), // Pretty-printed JSON as default
        onChange: value => {
            console.log(`${logPrefix} Setting '${SETTINGS.TRACKER_CONFIGS}' (JSON) changed.`, settingStyle);
            // Attempt to parse to see if it's valid JSON early
            try {
                JSON.parse(value);
                console.log(`${logPrefix} New JSON string appears valid. NeedsManager will reload.`, settingStyle);
            } catch (e) {
                ui.notifications.error(game.i18n.format("SURVIVAL_NEEDS.notifications.invalidTrackerJSON", {error: e.message}));
                console.error(`${logPrefix} Invalid JSON provided for Tracker Configurations:`, e);
                // Optionally, you could prevent saving an invalid JSON or revert to default,
                // but Foundry's settings framework doesn't easily support that in an onChange.
                // The getTrackerConfigs() function will handle falling back to defaults if parsing fails.
            }

            if (window.survivalNeedsGlobalInstance?.needsManager) {
                window.survivalNeedsGlobalInstance.needsManager.loadTrackerConfigs();
                // Consider prompting GM to run a full actor effect refresh after such a direct edit
                if (game.user.isGM) {
                    Dialog.confirm({
                        title: game.i18n.localize(`${MODULE_ID}.dialogs.jsonConfigChanged.title`),
                        content: `<p>${game.i18n.localize(`${MODULE_ID}.dialogs.jsonConfigChanged.content`)}</p>`,
                        yes: () => {
                            if (window.survivalNeedsGlobalInstance) {
                                ui.notifications.info(game.i18n.localize(`${MODULE_ID}.dialogs.jsonConfigChanged.refreshing`));
                                window.survivalNeedsGlobalInstance.performInitialActorSetup();
                            }
                        },
                        no: () => {},
                        defaultYes: false
                    });
                }
            }
        }
    });

    // --- REMOVE Menu for Custom Tracker Configuration UI ---
    // game.settings.registerMenu(MODULE_ID, "trackerConfigMenu", { ... }); // THIS LINE IS REMOVED/COMMENTED OUT

    console.log(`%c[${MODULE_ID}] Settings registered (direct JSON edit for trackers).`, "color: green;");
}

/**
 * Retrieves the parsed tracker configurations from settings.
 * Provides default configurations if the setting is invalid or not found.
 */
export function getTrackerConfigs() {
    const logPrefix = `%c[${MODULE_ID} | Settings]`;
    const errorStyle = "color: red; font-weight: bold;";
    const warningStyle = "color: orange;";

    try {
        const jsonString = game.settings.get(MODULE_ID, SETTINGS.TRACKER_CONFIGS);
        if (jsonString && jsonString.trim() !== "") {
            const configs = JSON.parse(jsonString);
            if (Array.isArray(configs)) {
                // Optional: Add more detailed validation for each config object here if desired
                // to ensure it has required keys like id, name, thresholdEffects etc.
                // For now, basic array check is done.
                return configs.map(c => ({ // Basic merge with defaults to ensure core keys
                    id: c.id || foundry.utils.randomID(), 
                    name: c.name || "Unnamed Tracker", 
                    enabled: typeof c.enabled === 'boolean' ? c.enabled : false,
                    iconClass: c.iconClass || "fas fa-question", 
                    iconColor: c.iconColor || "#CCCCCC",
                    defaultValue: typeof c.defaultValue === 'number' ? c.defaultValue : 0, 
                    maxValue: typeof c.maxValue === 'number' ? c.maxValue : 100, 
                    increasePerInterval: typeof c.increasePerInterval === 'number' ? c.increasePerInterval : 0,
                    thresholdEffects: Array.isArray(c.thresholdEffects) ? c.thresholdEffects : [], 
                    regeneration: c.regeneration || { 
                        byLongRest: false, longRestAmount: 0, byItem: false,
                        itemFilter: { types: ["consumable"], nameKeywords: [] },
                        itemRestoreAmount: 0, itemButtonLabel: "Use", itemButtonIcon: "fas fa-hand-paper"
                    },
                    ...c // User's config overrides any well-defined defaults above
                }));
            } else {
                 console.warn(`${logPrefix} Tracker configurations setting is not a valid JSON array. Using defaults. Config was:`, warningStyle, jsonString);
            }
        } else {
            console.warn(`${logPrefix} Tracker configurations setting is empty. Using defaults.`, warningStyle);
        }
        return foundry.utils.deepClone(DEFAULT_TRACKER_CONFIGS); 
    } catch (e) {
        console.error(`${logPrefix} Error parsing Tracker Configurations JSON from settings:`, errorStyle, e);
        ui.notifications.error(game.i18n.localize("SURVIVAL_NEEDS.notifications.errorLoadingTrackerConfig"));
        return foundry.utils.deepClone(DEFAULT_TRACKER_CONFIGS);
    }
}