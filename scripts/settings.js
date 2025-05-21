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
export function getTrackerConfigs() {
    const logPrefix = `%c[${MODULE_ID} | Settings | getTrackerConfigs]`;
    const errorStyle = "color: red; font-weight: bold;";
    const warningStyle = "color: orange;";

    try {
        const jsonString = game.settings.get(MODULE_ID, SETTINGS.TRACKER_CONFIGS);
        if (jsonString && jsonString.trim() !== "") {
            const configs = JSON.parse(jsonString);
            if (Array.isArray(configs)) {
                const defaultTrackersById = foundry.utils.deepClone(DEFAULT_TRACKER_CONFIGS).reduce((acc, def) => {
                    acc[def.id] = def;
                    return acc;
                }, {});

                return configs.map(userConfig => {
                    const defaultConfig = defaultTrackersById[userConfig.id] || {};
                    return {
                        ...defaultConfig,
                        ...userConfig,
                        regeneration: {
                            ...(defaultConfig.regeneration || {}),
                            ...(userConfig.regeneration || {}),
                            itemFilter: {
                                ...((defaultConfig.regeneration || {}).itemFilter || {}),
                                ...((userConfig.regeneration || {}).itemFilter || {}),
                            }
                        },
                        thresholdEffects: Array.isArray(userConfig.thresholdEffects) ? userConfig.thresholdEffects : (defaultConfig.thresholdEffects || []),
                        specialActions: Array.isArray(userConfig.specialActions) ? userConfig.specialActions : (defaultConfig.specialActions || []),
                        id: userConfig.id || foundry.utils.randomID(),
                        name: userConfig.name || "Unnamed Tracker",
                        enabled: typeof userConfig.enabled === 'boolean' ? userConfig.enabled : (defaultConfig.enabled !== undefined ? defaultConfig.enabled : false),
                        iconClass: userConfig.iconClass || defaultConfig.iconClass || "fas fa-question",
                        iconColor: userConfig.iconColor || defaultConfig.iconColor || "#CCCCCC",
                        defaultValue: typeof userConfig.defaultValue === 'number' ? userConfig.defaultValue : (defaultConfig.defaultValue || 0),
                        maxValue: typeof userConfig.maxValue === 'number' ? userConfig.maxValue : (defaultConfig.maxValue || 100),
                        increasePerInterval: typeof userConfig.increasePerInterval === 'number' ? userConfig.increasePerInterval : (defaultConfig.increasePerInterval || 0),
                    };
                });
            } else {
                console.warn(`${logPrefix} Setting '${SETTINGS.TRACKER_CONFIGS}' is not a valid JSON array. Using full defaults.`, warningStyle);
                return foundry.utils.deepClone(DEFAULT_TRACKER_CONFIGS);
            }
        } else {
            console.warn(`${logPrefix} Setting '${SETTINGS.TRACKER_CONFIGS}' is empty. Using full defaults.`, warningStyle);
            return foundry.utils.deepClone(DEFAULT_TRACKER_CONFIGS);
        }
    } catch (e) {
        console.error(`${logPrefix} Error parsing '${SETTINGS.TRACKER_CONFIGS}' JSON. Using full defaults. Error:`, errorStyle, e);
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