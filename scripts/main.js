// In scripts/main.js
import { MODULE_ID, SETTINGS, FLAG_PREFIX, LAST_UPDATE_TIME_FLAG_KEY } from "./constants.js";
import { NeedsManager } from "./actor-needs.js";
import { SheetIntegration } from "./sheet-integration.js";
import { registerSettings, getTrackerConfigs } from "./settings.js"; // getTrackerConfigs used by NeedsManager/ConditionManager indirectly
import { ConditionManager } from "./condition-manager.js";
// TrackerConfigApp is imported within settings.js where it's used for registerMenu

class SurvivalNeedsModule {
    constructor() {
        this.moduleId = MODULE_ID;
        this.conditionManager = null;
        this.needsManager = null;
        this.sheetIntegration = null;
        console.log(`${this.moduleId} | Module class constructed.`);
    }

    /**
     * Initializes the module: registers settings, sets up Handlebars helpers,
     * then on 'ready', instantiates managers, registers game hooks, and performs initial setup.
     */
    initialize() {
        Hooks.once("init", () => {
            console.log(`${this.moduleId} | Hook: init - Registering settings and Handlebars helpers.`);
            registerSettings(); // This registers all module settings, including the menu for TrackerConfigApp

            // --- Register Handlebars Helpers ---
            Handlebars.registerHelper('join', function(arr, separator) {
                if (foundry.utils.isEmpty(arr)) {
                    return "";
                }
                if (!Array.isArray(arr)) {
                    return String(arr);
                }
                const sep = (typeof separator === 'string' || separator instanceof String) ? separator : ',';
                return arr.join(sep);
            });

            Handlebars.registerHelper('gt', function (a, b, options) {
                return (parseFloat(a) > parseFloat(b)) ? options.fn(this) : options.inverse(this);
            });

            Handlebars.registerHelper('lt', function (a, b, options) {
                return (parseFloat(a) < parseFloat(b)) ? options.fn(this) : options.inverse(this);
            });

            Handlebars.registerHelper('eq', function (a, b, options) {
                // Ensure consistent comparison, especially with values from forms vs. data
                return (String(a) == String(b)) ? options.fn(this) : options.inverse(this);
            });
            
            Handlebars.registerHelper('abs', function(value) {
                return Math.abs(parseFloat(value));
            });

            Handlebars.registerHelper('concat', function() {
                return Array.prototype.slice.call(arguments, 0, -1).join('');
            });
        });

        Hooks.once("ready", async () => {
            console.log(`${this.moduleId} | Hook: ready - System is ready. Initializing managers and hooks.`);
            
            // Instantiate core manager classes
            this.conditionManager = new ConditionManager();
            this.needsManager = new NeedsManager(this.conditionManager); // Inject ConditionManager
            this.sheetIntegration = new SheetIntegration(this.needsManager); // Inject NeedsManager

            this.registerGameHooks();
            await this.performInitialActorSetup(); 
            
            console.log(`${this.moduleId} | All components initialized and game hooks registered.`);
        });
    }

    /**
     * Registers all necessary game system hooks for the module's operation.
     */
    registerGameHooks() {
        Hooks.on("pf2e.restForTheNight", async (actor) => {
            if (this.needsManager && actor && actor.type === 'character') {
                // console.log(`${this.moduleId} | ${actor.name} is resting for the night.`);
                await this.needsManager.processLongRest(actor);
            }
        });

        Hooks.on("updateWorldTime", (worldTime, timeAdvanceInSeconds) => {
            if (this.needsManager) {
                this.needsManager.onUpdateWorldTime(worldTime, timeAdvanceInSeconds);
            }
        });

        Hooks.on("renderCharacterSheetPF2e", (app, html, data) => {
            // data.actor is app.actor for CharacterSheetPF2e
            if (this.sheetIntegration && app.actor) { 
                this.sheetIntegration.onRenderCharacterSheet(app, html, app.actor);
            }
        });

        Hooks.on("createActor", async (actor, options, userId) => {
            // Only run for the user who created the actor to avoid multiple initializations in some cases
            if (game.user.id === userId && this.needsManager) {
                // console.log(`${this.moduleId} | Actor ${actor.name} created. Initializing needs.`);
                await this.needsManager.initializeNeedsForActor(actor);
            }
        });

        Hooks.on("updateActor", async (actor, changes, options, userId) => {
            if (!this.needsManager || !this.conditionManager) return;

            // Check if any flags under our module ID changed, specifically tracker values.
            if (changes.flags && changes.flags[MODULE_ID]) {
                const currentTrackerConfigs = this.needsManager.trackerConfigs; // Get currently loaded (enabled) configs
                const changedNeedFlags = Object.keys(changes.flags[MODULE_ID]).some(flagKey =>
                    currentTrackerConfigs.some(tracker => tracker.id === flagKey)
                );

                if (changedNeedFlags) {
                    // This hook catches direct flag manipulations (e.g., sheet input, macros).
                    // The NeedsManager methods (like updateNeedValue) already call conditionManager.
                    // So, this is primarily for external changes to the flags.
                    // console.log(`${MODULE_ID} | Detected direct need flag change for ${actor.name}. Re-evaluating conditions.`);
                    const currentNeeds = this.needsManager.getActorNeeds(actor);
                    await this.conditionManager.processActorConditions(actor, currentNeeds, currentTrackerConfigs);
                }
            }
        });
        // console.log(`${this.moduleId} | Game hooks registered.`);
    }

    /**
     * Performs initial setup for existing actors when the world loads or when settings change.
     * Ensures all relevant actors have their needs initialized and conditions synced.
     * This should typically only run for the GM.
     */
    async performInitialActorSetup() {
        if (!game.user.isGM || !this.needsManager) {
            return;
        }

        // Ensure managers have the latest config loaded (NeedsManager does this on construction and loadTrackerConfigs)
        // No explicit call to loadTrackerConfigs here is needed unless settings could have changed *before* ready for GM.
        // NeedsManager.initializeNeedsForActor will call loadTrackerConfigs itself.

        const actorsToProcess = [];
        const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);

        for (const actor of game.actors) {
            if (actor.type === 'character' || (actor.type === 'npc' && affectsNPCs)) {
                actorsToProcess.push(actor);
            }
        }

        if (actorsToProcess.length > 0) {
            // console.log(`${MODULE_ID} | Performing initial setup/verification for ${actorsToProcess.length} actors.`);
            // Consider a progress bar or batched notifications if this is very slow for many actors.
            // For now, a single notification at the end.
            
            for (const actor of actorsToProcess) {
                // initializeNeedsForActor will set default flag values if missing
                // AND then call conditionManager.processActorConditions to sync conditions.
                await this.needsManager.initializeNeedsForActor(actor);
                // Small delay to prevent overwhelming the server/client if many actors during initial load
                await new Promise(resolve => setTimeout(resolve, game.users.length > 1 ? 50 : 10)); 
            }
            // console.log(`${MODULE_ID} | Initial actor setup/verification complete.`);
            // ui.notifications.info(`${MODULE_ID}: Verified survival needs for ${actorsToProcess.length} actors.`);
        }
    }
}

// --- Global Instantiation ---
// Ensures the module is initialized once.
try {
    if (!window.survivalNeedsInstance) { // Use a more specific name for the instance
        window.survivalNeedsInstance = new SurvivalNeedsModule();
        window.survivalNeedsInstance.initialize(); // This sets up the init and ready hooks
        console.log(`${MODULE_ID} | Main module instance created and initialize() called.`);
    } else {
        // console.log(`${MODULE_ID} | Main module instance already exists.`);
    }
} catch (error) {
    console.error(`${MODULE_ID} | CRITICAL ERROR during global module instantiation or initial setup:`, error);
    ui.notifications.error(
        `${MODULE_ID}: Critical error during startup. The module may not function correctly. Please check the console (F12) for details.`, 
        { permanent: true }
    );
}