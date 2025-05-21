// File: scripts/settings.js
import {
    MODULE_ID,
    SETTINGS,
    DEFAULT_TRACKER_CONFIGS,
    DEFAULT_CONSUMPTION_CALC_SETTINGS
} from "./constants.js";

/**
 * Registers all module settings.
 */
export function registerSettings() {
    const logPrefix = `%c[${MODULE_ID} | Settings]`;
    const settingStyle = "color: saddlebrown;";
    const detailStyle = "color: darkslateblue;";

    // --- Global Settings (Update Interval, Affects NPCs) ---
    game.settings.register(MODULE_ID, SETTINGS.UPDATE_INTERVAL_HOURS, {
        name: `${MODULE_ID}.settings.${SETTINGS.UPDATE_INTERVAL_HOURS}.name`,
        hint: `${MODULE_ID}.settings.${SETTINGS.UPDATE_INTERVAL_HOURS}.hint`,
        scope: "world",
        config: true,
        type: Number,
        default: 4,
        range: { min: 1, max: 72, step: 0.1 },
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
            if (game.user.isGM && window.survivalNeedsGlobalInstance?.performInitialActorSetup) {
                // Consider debouncing or notifying GM for manual refresh if many NPCs
                // window.survivalNeedsGlobalInstance.performInitialActorSetup();
            }
        }
    });

    // --- Tracker Definitions JSON ---
    game.settings.register(MODULE_ID, SETTINGS.TRACKER_CONFIGS, {
        name: `${MODULE_ID}.settings.trackerDefinitionsJSON.name`,
        hint: `${MODULE_ID}.settings.trackerDefinitionsJSON.hint`,
        scope: "world",
        config: true,
        type: String,
        default: JSON.stringify(DEFAULT_TRACKER_CONFIGS, null, 2),
        onChange: value => {
            console.log(`${logPrefix} Setting '${SETTINGS.TRACKER_CONFIGS}' (Tracker Definitions JSON) changed by user.`, settingStyle);
            try {
                JSON.parse(value);
                console.log(`${logPrefix} New Tracker Definitions JSON appears valid.`, detailStyle);
            } catch (e) {
                ui.notifications.error(game.i18n.format("SURVIVAL_NEEDS.notifications.invalidTrackerJSON", { error: e.message }));
                console.error(`${logPrefix} Invalid JSON for Tracker Definitions:`, "color:red;", e);
            }
           if (window.survivalNeedsGlobalInstance?.needsManager) {
    // This will now call the corrected loadAllConfigs
     window.survivalNeedsGlobalInstance.needsManager.loadAllConfigs();
        if (game.user.isGM) {
                    Dialog.confirm({
                        title: game.i18n.localize(`${MODULE_ID}.dialogs.jsonConfigChanged.title`),
                        content: game.i18n.localize(`${MODULE_ID}.dialogs.jsonConfigChanged.content`),
                        yes: async () => {
                            if (window.survivalNeedsGlobalInstance?.performInitialActorSetup) {
                                ui.notifications.info(game.i18n.localize(`${MODULE_ID}.dialogs.jsonConfigChanged.refreshing`));
                                await window.survivalNeedsGlobalInstance.performInitialActorSetup();
                            }
                        },
                        no: () => {},
                        defaultYes: true
                    });
                }
            }
        }
    });

    // --- Consumption Calculation Settings JSON ---
    game.settings.register(MODULE_ID, SETTINGS.CONSUMPTION_CALC_SETTINGS, {
        name: `${MODULE_ID}.settings.consumptionCalcSettingsJSON.name`,
        hint: `${MODULE_ID}.settings.consumptionCalcSettingsJSON.hint`,
        scope: "world", config: true, type: String,
        default: JSON.stringify(DEFAULT_CONSUMPTION_CALC_SETTINGS, null, 2),
        onChange: value => {
            console.log(`${logPrefix} Setting '${SETTINGS.CONSUMPTION_CALC_SETTINGS}' changed by user.`, settingStyle);
            try { JSON.parse(value); console.log(`${logPrefix} New Consumption Calc Settings JSON appears valid.`, detailStyle); }
            catch (e) { ui.notifications.error(game.i18n.format("SURVIVAL_NEEDS.notifications.invalidCalcSettingsJSON", { error: e.message })); console.error(`${logPrefix} Invalid JSON for Calc Settings:`, "color:red;", e); }
            if (window.survivalNeedsGlobalInstance?.needsManager) { window.survivalNeedsGlobalInstance.needsManager.loadAllConfigs(); }
        }
    });

 // --- "Reset All Configurations" Action Trigger ---
    game.settings.register(MODULE_ID, "resetAllAction", {
        name: game.i18n.localize(`${MODULE_ID}.settings.resetConfigs.name`), // e.g., "Reset All Configurations"
        hint: game.i18n.localize(`${MODULE_ID}.settings.resetConfigs.hint`), // e.g., "Restores... This action cannot be undone..."
        label: game.i18n.localize(`${MODULE_ID}.settings.resetConfigs.label`), // Button-like text for the checkbox itself
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: async (value) => {
            if (value === true) {
                // Perform the reset action
                await performConfigReset();
                // Important: Set the value back to false so the "button" can be "pressed" again.
                // Use a slight delay to ensure the settings panel can visually update if needed,
                // though usually direct set is fine.
                await game.settings.set(MODULE_ID, "resetAllAction", false);
            }
        }
    });
}

async function performConfigReset() {
    const logPrefix = `%c[${MODULE_ID} | Settings | ResetAction]`;
    console.log(`${logPrefix} Reset action triggered.`, "color:darkred;");

    Dialog.confirm({
        title: game.i18n.localize(`${MODULE_ID}.settings.resetConfigs.name`), // "Reset All Configurations"
        content: `<p>${game.i18n.localize("SURVIVAL_NEEDS.dialogs.resetConfirm.text1")}</p>
                  <p>${game.i18n.localize("SURVIVAL_NEEDS.dialogs.resetConfirm.text2")}</p>`,
        yes: async () => {
            console.log(`${logPrefix} Confirmed. Resetting configurations.`, "color:darkred;");
            try {
                // Set settings directly. Their own onChange handlers will be triggered
                // (e.g., for reloading configs in NeedsManager).
                await game.settings.set(MODULE_ID, SETTINGS.TRACKER_CONFIGS, JSON.stringify(DEFAULT_TRACKER_CONFIGS, null, 2));
                await game.settings.set(MODULE_ID, SETTINGS.CONSUMPTION_CALC_SETTINGS, JSON.stringify(DEFAULT_CONSUMPTION_CALC_SETTINGS, null, 2));
                
                ui.notifications.info(game.i18n.localize("SURVIVAL_NEEDS.notifications.configsReset"));
                console.log(`${logPrefix} Configurations reset.`, "color:darkred;");

                // The onChange for TRACKER_CONFIGS already prompts for actor refresh.
            } catch (e) {
                console.error(`${logPrefix} Error resetting configurations:`, "color:red; font-weight:bold;", e);
                ui.notifications.error(game.i18n.localize("SURVIVAL_NEEDS.notifications.configsResetError"));
            }
        },
        no: () => {
            console.log(`${logPrefix} Reset cancelled by user.`, "color:darkred;");
        },
        defaultYes: false,
        buttons: {
            yes: {
                icon: '<i class="fas fa-trash"></i>',
                label: game.i18n.localize("SURVIVAL_NEEDS.buttons.confirmReset"), // "Yes, Reset Defaults"
                callback: () => { /* Handled by Dialog's yes option */ }
            },
            no: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("Cancel"),
                callback: () => { /* Handled by Dialog's no option */ }
            }
        }
    });
}


/**
 * Retrieves the parsed tracker configurations array.
 */
// scripts/settings.js
export function getTrackerConfigs() {
    const logPrefix = `%c[${MODULE_ID} | Settings | getTrackerConfigs_V2]`; // Added V2 for easier log tracking
    const errorStyle = "color: red; font-weight: bold;";
    const warningStyle = "color: orange;";
    const detailStyle = "color: purple;";


    try {
        const jsonString = game.settings.get(MODULE_ID, SETTINGS.TRACKER_CONFIGS);
        let userConfigs = [];

        if (jsonString && jsonString.trim() !== "") {
            try {
                const parsed = JSON.parse(jsonString);
                if (Array.isArray(parsed)) {
                    userConfigs = parsed;
                } else {
                    console.warn(`${logPrefix} Setting '${SETTINGS.TRACKER_CONFIGS}' is not a valid JSON array. Will attempt to use defaults more directly.`, warningStyle);
                }
            } catch (parseError) {
                 console.error(`${logPrefix} Error parsing '${SETTINGS.TRACKER_CONFIGS}' JSON. Will use defaults. Error:`, errorStyle, parseError);
                 // Fall through to use defaults if parsing fails
            }
        } else {
            // console.log(`${logPrefix} Setting '${SETTINGS.TRACKER_CONFIGS}' is empty. Will use defaults.`, detailStyle);
            // Fall through to use defaults if string is empty
        }

        const defaults = foundry.utils.deepClone(DEFAULT_TRACKER_CONFIGS);
        
        // If userConfigs is empty (due to empty setting or parse error), return defaults directly
        if (userConfigs.length === 0) {
            // console.log(`${logPrefix} No valid user configs found, returning full DEFAULT_TRACKER_CONFIGS.`, detailStyle);
            return defaults;
        }

        // Merge user configs with defaults, ensuring critical fields like 'enabled' and 'thresholdEffects' are present
        const finalConfigs = defaults.map(defaultConfig => {
            const userVersion = userConfigs.find(uc => uc.id === defaultConfig.id);
            if (userVersion) {
                // Merge, ensuring userVersion properties take precedence, but critical defaults are there
                const merged = {
                    ...defaultConfig, // Start with default
                    ...userVersion,   // Overlay user's settings
                    enabled: typeof userVersion.enabled === 'boolean' ? userVersion.enabled : defaultConfig.enabled, // Ensure boolean
                    thresholdEffects: Array.isArray(userVersion.thresholdEffects) ? userVersion.thresholdEffects : (defaultConfig.thresholdEffects || []), // Ensure array
                    // Ensure sub-objects like regeneration and specialActions are also somewhat merged or defaulted
                    regeneration: {
                        ...(defaultConfig.regeneration || {}),
                        ...(userVersion.regeneration || {}),
                        itemFilter: {
                            ...((defaultConfig.regeneration || {}).itemFilter || {}),
                            ...((userVersion.regeneration || {}).itemFilter || {}),
                        }
                    },
                    specialActions: Array.isArray(userVersion.specialActions) ? userVersion.specialActions : (defaultConfig.specialActions || []),
                    subProperties: Array.isArray(userVersion.subProperties) ? userVersion.subProperties : (defaultConfig.subProperties || undefined)
                };
                return merged;
            }
            return defaultConfig; // If no user version for this default ID, use the default
        });

        // Add any custom trackers from userConfigs that are not in defaults
        userConfigs.forEach(userConfig => {
            if (!finalConfigs.some(fc => fc.id === userConfig.id)) {
                // For purely custom trackers, ensure they have basic defaults if missing
                const customWithDefaults = {
                    enabled: true,
                    thresholdEffects: [],
                    defaultValue: 0,
                    maxValue: 100,
                    iconClass: "fas fa-question",
                    iconColor: "#CCCCCC",
                    ...userConfig // User's custom config overlays these minimum defaults
                };
                finalConfigs.push(customWithDefaults);
            }
        });
        // console.log(`${logPrefix} Final merged/defaulted configs:`, detailStyle, finalConfigs);
        return finalConfigs;

    } catch (e) {
        console.error(`${logPrefix} Critical error in getTrackerConfigs. Using full defaults. Error:`, errorStyle, e);
        ui.notifications.error(game.i18n.localize("SURVIVAL_NEEDS.notifications.errorLoadingTrackerConfig") + ` Using defaults.`);
        return foundry.utils.deepClone(DEFAULT_TRACKER_CONFIGS);
    }
}
/**
 * Retrieves the parsed consumption calculation settings object.
 */
export function getConsumptionCalcSettings() {
    const logPrefix = `%c[${MODULE_ID} | Settings | getConsumptionCalcSettings]`;
    const errorStyle = "color: red; font-weight: bold;";
    const warningStyle = "color: orange;";

    try {
        const jsonString = game.settings.get(MODULE_ID, SETTINGS.CONSUMPTION_CALC_SETTINGS);
        if (jsonString && jsonString.trim() !== "") {
            const settings = JSON.parse(jsonString);
            if (typeof settings === 'object' && settings !== null) {
                return { ...foundry.utils.deepClone(DEFAULT_CONSUMPTION_CALC_SETTINGS), ...settings };
            } else {
                console.warn(`${logPrefix} Setting '${SETTINGS.CONSUMPTION_CALC_SETTINGS}' not a valid JSON object. Using defaults.`, warningStyle);
            }
        } else {
            console.warn(`${logPrefix} Setting '${SETTINGS.CONSUMPTION_CALC_SETTINGS}' is empty. Using defaults.`, warningStyle);
        }
        return foundry.utils.deepClone(DEFAULT_CONSUMPTION_CALC_SETTINGS);
    } catch (e) {
        console.error(`${logPrefix} Error parsing '${SETTINGS.CONSUMPTION_CALC_SETTINGS}' JSON:`, errorStyle, e);
        ui.notifications.error(game.i18n.localize("SURVIVAL_NEEDS.notifications.errorLoadingCalcSettings")  + ` Using defaults.`);
        return foundry.utils.deepClone(DEFAULT_CONSUMPTION_CALC_SETTINGS);
    }
}
/**
 * Initializes handlers for actions triggered from the settings UI (e.g., links, buttons).
 * These handlers are placed on the global `window.SurvivalNeedsNS` namespace.
 */
export function initializeActionHandlers() {
    const logPrefixBase = `%c[${MODULE_ID} | Settings | ActionHandlers]`;
    window.SurvivalNeedsNS = window.SurvivalNeedsNS || {};
    // If other window.SurvivalNeedsNS functions were defined, they would go here.
    // The resetAllConfigsToDefaults is now implicitly handled by performConfigReset.
    console.log(`${logPrefixBase} Action handlers (if any) initialized. Reset logic is now in setting onChange.`, "color:saddlebrown;");
}