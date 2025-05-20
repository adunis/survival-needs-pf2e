// File: scripts/main.js
import {
  MODULE_ID,
  SETTINGS,
  FLAG_PREFIX, // Used in updateActor hook logic
  LAST_UPDATE_TIME_FLAG_KEY, // Used in updateActor hook logic
  // DYNAMIC_EFFECT_FLAG_MODULE_MANAGED // Not directly used in main.js but good to be aware of
} from "./constants.js";
import { NeedsManager } from "./actor-needs.js";
import { SheetIntegration } from "./sheet-integration.js";
import { registerSettings } from "./settings.js"; 
// TrackerConfigApp is imported within settings.js
// ConditionManager (old) and ConditionManagerV2 are handled by NeedsManager now

class SurvivalNeedsModule {
  constructor() {
    this.moduleId = MODULE_ID;
    this.needsManager = null; // Will be initialized
    this.sheetIntegration = null; // Will be initialized
    
    // Debounced function for processing actor effects after updates
    this._debouncedProcessActorEffects = null;
    console.log(`%c[${this.moduleId}] Module class constructed.`, "color: purple; font-weight:bold;");
  }

  /**
   * Initializes the module.
   */
  initialize() {
    Hooks.once("init", () => {
      console.log(`%c[${this.moduleId}] Hook: init - Registering settings and Handlebars helpers.`, "color: green;");
      registerSettings();

      // Handlebars Helpers (ensure they are correctly defined)
      Handlebars.registerHelper("sn_join", function (arr, separator) {
        if (foundry.utils.isEmpty(arr)) return "";
        if (!Array.isArray(arr)) return String(arr);
        return arr.join(typeof separator === "string" ? separator : ",");
      });
      Handlebars.registerHelper("sn_gt", (a, b, options) => parseFloat(a) > parseFloat(b) ? options.fn(this) : options.inverse(this));
      Handlebars.registerHelper("sn_lt", (a, b, options) => parseFloat(a) < parseFloat(b) ? options.fn(this) : options.inverse(this));
      Handlebars.registerHelper("sn_eq", (a, b, options) => String(a) == String(b) ? options.fn(this) : options.inverse(this));
      Handlebars.registerHelper('sn_abs', (value) => Math.abs(parseFloat(value)));
      Handlebars.registerHelper("sn_concat", function () {
        const args = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
        return args.filter(arg => typeof arg !== "undefined" && arg !== null).join("");
      });
    });

    Hooks.once("ready", async () => {
      console.log(`%c[${this.moduleId}] Hook: ready - System is ready. Initializing managers and hooks.`, "color: green;");

      this.needsManager = new NeedsManager(); // NeedsManager now creates its own ConditionManagerV2
      this.sheetIntegration = new SheetIntegration(this.needsManager); 

      // Setup the debounced function for actor updates
      if (this.needsManager && this.needsManager.conditionManagerV2 && 
          typeof this.needsManager.conditionManagerV2.processActorNeedsAndEffects === 'function') {
        this._debouncedProcessActorEffects = foundry.utils.debounce(
          async (actor) => { // Takes actor, gets needs and configs inside
            if (this.needsManager && actor) { 
              console.log(`%c[${this.moduleId}] Debounced call to processActorNeedsAndEffects for ${actor.name}`, "color: blue;");
              const currentNeeds = this.needsManager.getActorNeeds(actor);
              // Ensure trackerConfigs are fresh if settings could have changed
              this.needsManager.loadTrackerConfigs(); 
              await this.needsManager.conditionManagerV2.processActorNeedsAndEffects(actor, currentNeeds, this.needsManager.trackerConfigs);
            } else {
              console.warn(`%c[${this.moduleId}] Debounced call: NeedsManager or actor no longer available.`, "color: orange;");
            }
          }, 
          250 // Debounce delay in ms (adjust as needed)
        );
      } else {
        console.error(`%c[${this.moduleId}] CRITICAL: Failed to create debounced function for actor effects processing.`, "color: red;");
      }

      this.registerGameHooks();
      await this.performInitialActorSetup(); // Should call initializeNeedsForActor which uses V2

      console.log(`%c[${this.moduleId}] All components initialized and game hooks registered.`, "color: green; font-weight:bold;");
    });
  }

  /**
   * Registers all necessary game system hooks.
   */
  registerGameHooks() {
    Hooks.on("pf2e.restForTheNight", async (actor) => {
      if (this.needsManager && actor && actor.type === "character") {
        console.log(`%c[${this.moduleId}] ${actor.name} is resting for the night. Processing long rest.`, "color: blue;");
        await this.needsManager.processLongRest(actor); // This will internally call processActorNeedsAndEffects
      }
    });

    Hooks.on("updateWorldTime", (worldTime) => { // timeAdvanceInSeconds is available but not needed by current onUpdateWorldTime
      if (this.needsManager) {
        // onUpdateWorldTime now handles processing effects internally after updating needs
        this.needsManager.onUpdateWorldTime(worldTime); 
      }
    });

    Hooks.on("renderCharacterSheetPF2e", (app, html) => { // data.actor is app.actor
      if (this.sheetIntegration && app.actor) {
        this.sheetIntegration.onRenderCharacterSheet(app, html, app.actor);
      }
    });

    Hooks.on("createActor", async (actor, options, userId) => {
      if (game.user.id === userId && this.needsManager) {
        console.log(`%c[${this.moduleId}] Actor ${actor.name} created. Initializing needs.`, "color: blue;");
        await this.needsManager.initializeNeedsForActor(actor); // This uses V2 internally
      }
    });

    Hooks.on("updateActor", async (actor, changes) => { // options, userId also available
      if (!this.needsManager || !this._debouncedProcessActorEffects) {
        return; // Not ready yet
      }

      // Check if any flags under our module ID changed, specifically tracker values.
      if (changes.flags && changes.flags[MODULE_ID]) {
        // Check if any of the *actual tracker value flags* changed, or the last update time.
        // This avoids triggering on other potential flags our module might set if they aren't need values.
        const changedNeedValueFlags = Object.keys(changes.flags[MODULE_ID]).some(flagKey => 
            this.needsManager.trackerConfigs.some(tracker => tracker.id === flagKey) || 
            flagKey === LAST_UPDATE_TIME_FLAG_KEY
        );

        if (changedNeedValueFlags) {
          // This hook catches direct flag manipulations (e.g., sheet input, macros, time updates from NeedsManager).
          // The NeedsManager methods (like updateNeedValue, onUpdateWorldTime, processLongRest) already call
          // conditionManagerV2.processActorNeedsAndEffects directly or indirectly.
          // However, an external macro changing a flag would be caught here.
          // The debounced call ensures we don't have rapid-fire processing.
          console.log(`%c[${this.moduleId}] Detected relevant flag change for ${actor.name}. Triggering debounced effects processing.`, "color: blue;");
          this._debouncedProcessActorEffects(actor);
        }
      }
    });
    console.log(`%c[${this.moduleId}] Game hooks registered.`, "color: green;");
  }

  /**
   * Performs initial setup for existing actors when the world loads.
   */
  async performInitialActorSetup() {
    if (!game.user.isGM || !this.needsManager) {
      return;
    }
    this.needsManager.loadTrackerConfigs(); // Ensure latest configs

    const actorsToProcess = [];
    const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);

    for (const actor of game.actors) {
      if (actor.type === "character" || (actor.type === "npc" && affectsNPCs)) {
        actorsToProcess.push(actor);
      }
    }

    if (actorsToProcess.length > 0) {
      console.log(`%c[${this.moduleId}] Performing initial setup/verification for ${actorsToProcess.length} actors.`, "color: blue;");
      for (const actor of actorsToProcess) {
        await this.needsManager.initializeNeedsForActor(actor); // Uses V2 internally
        await new Promise((resolve) => setTimeout(resolve, game.users.length > 1 ? 20 : 5)); // Small delay
      }
      console.log(`%c[${this.moduleId}] Initial actor setup/verification complete.`, "color: blue;");
    }
  }
}

// --- Global Instantiation ---
try {
  if (!window.survivalNeedsGlobalInstance) { // More unique global instance name
    window.survivalNeedsGlobalInstance = new SurvivalNeedsModule();
    window.survivalNeedsGlobalInstance.initialize();
    console.log(`%c[${MODULE_ID}] Main module instance created and initialize() called.`, "color: purple; font-weight:bold;");
  }
} catch (error) {
  console.error(`%c[${MODULE_ID}] CRITICAL ERROR during global module instantiation or initial setup:`, "color:red; font-weight:bold;", error);
  ui.notifications.error(`${MODULE_ID}: Critical error during startup. Module may not function correctly. Check console (F12).`, { permanent: true });
}