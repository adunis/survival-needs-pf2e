// In scripts/actor-needs.js
import { MODULE_ID, SETTINGS, FLAG_PREFIX, LAST_UPDATE_TIME_FLAG_KEY } from "./constants.js";
import { getTrackerConfigs } from "./settings.js"; // To get current configurations

export class NeedsManager {
    constructor(conditionManager) {
        this.conditionManager = conditionManager; // Injected dependency
        this.loadTrackerConfigs(); // Load initial configs
        // console.log(`${MODULE_ID} | NeedsManager: Constructed and configs loaded.`);
    }

    /**
     * Loads (or reloads) the tracker configurations from game settings.
     * This should be called if settings change or at initialization.
     */
    loadTrackerConfigs() {
        this.trackerConfigs = getTrackerConfigs().filter(tc => tc.enabled); // Only work with enabled trackers
        // console.log(`${MODULE_ID} | NeedsManager: Loaded ${this.trackerConfigs.length} enabled tracker configs.`);
    }

    /**
     * Gets the current values of all enabled trackers for a given actor.
     * @param {ActorPF2e} actor
     * @returns {Object} An object mapping trackerId to its current value.
     */
    getActorNeeds(actor) {
        const needs = {};
        if (!actor) return needs;

        for (const tracker of this.trackerConfigs) {
            needs[tracker.id] = actor.getFlag(MODULE_ID, tracker.id) ?? tracker.defaultValue ?? 0;
        }
        return needs;
    }

    /**
     * Checks if an actor requires initialization of need flags.
     * @param {ActorPF2e} actor
     * @returns {boolean} True if any enabled tracker flag or last update time is missing.
     */
    needsInitialization(actor) {
        if (!actor) return false;
        for (const tracker of this.trackerConfigs) {
            if (actor.getFlag(MODULE_ID, tracker.id) === undefined) return true;
        }
        return actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY) === undefined;
    }

    /**
     * Gets the update object required to initialize an actor's need flags.
     * @param {string} actorId - Not strictly needed if actor object is passed, but good for consistency.
     * @returns {Object} An object of flag updates.
     */
    getInitializationFlags() {
        const updates = {};
        for (const tracker of this.trackerConfigs) {
            updates[`${FLAG_PREFIX}.${tracker.id}`] = tracker.defaultValue ?? 0;
        }
        updates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] = game.time.worldTime;
        return updates;
    }

    /**
     * Initializes need flags for an actor if they don't exist and processes their conditions.
     * @param {ActorPF2e} actor
     */
    async initializeNeedsForActor(actor) {
        if (!actor) return;
        this.loadTrackerConfigs(); // Ensure we're using the latest configs

        const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);
        if (actor.type !== 'character' && (actor.type !== 'npc' || !affectsNPCs)) {
            return;
        }

        if (this.needsInitialization(actor)) {
            const initFlags = this.getInitializationFlags();
            // console.log(`${MODULE_ID} | NeedsManager: Initializing needs for ${actor.name} with:`, initFlags);
            await actor.update(initFlags);
        }
        
        // Always process conditions after ensuring flags are set (or were already set)
        const currentNeeds = this.getActorNeeds(actor);
        await this.conditionManager.processActorConditions(actor, currentNeeds, this.trackerConfigs);
    }

    /**
     * Called when game time advances. Updates needs for all relevant actors.
     * @param {number} worldTime - The new current world time in seconds.
     * @param {number} timeAdvanceInSeconds - The amount of time that just passed in seconds.
     */
    async onUpdateWorldTime(worldTime, timeAdvanceInSeconds) {
        if (!game.user.isGM) return;
        this.loadTrackerConfigs(); // Refresh configs in case they changed

        const updateIntervalHours = game.settings.get(MODULE_ID, SETTINGS.UPDATE_INTERVAL_HOURS);
        const updateIntervalSeconds = updateIntervalHours * 3600;
        if (updateIntervalSeconds <= 0 || this.trackerConfigs.length === 0) return;

        const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);
        const actorsToUpdate = [];

        for (const actor of game.actors) {
            if (actor.type !== 'character' && (actor.type !== 'npc' || !affectsNPCs)) {
                continue;
            }

            let lastUpdate = actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY);

            if (lastUpdate === undefined) { // Actor might be new or from before module activation
                await this.initializeNeedsForActor(actor); // This will set lastUpdate and process conditions
                lastUpdate = actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY); // Re-fetch
                if (lastUpdate === undefined) {
                    // console.warn(`${MODULE_ID} | NeedsManager: Actor ${actor.name} still has no LAST_UPDATE_TIME after init attempt. Skipping time update.`);
                    continue;
                }
            }
            
            const timeSinceLastUpdate = worldTime - lastUpdate;

            if (timeSinceLastUpdate >= updateIntervalSeconds) {
                const intervalsPassed = Math.floor(timeSinceLastUpdate / updateIntervalSeconds);
                if (intervalsPassed <= 0) continue;

                const actorFlagUpdates = {};
                let needsActuallyChanged = false;

                for (const tracker of this.trackerConfigs) {
                    const currentValue = actor.getFlag(MODULE_ID, tracker.id) ?? tracker.defaultValue ?? 0;
                    const increaseAmount = (tracker.increasePerInterval ?? 0) * intervalsPassed;
                    
                    // For trackers that increase (like hunger), cap at max.
                    // For trackers that might decrease with time (if increasePerInterval is negative), cap at 0.
                    let newValue;
                    if (increaseAmount >= 0) {
                        newValue = Math.min(tracker.maxValue ?? 10, currentValue + increaseAmount);
                    } else {
                        newValue = Math.max(0, currentValue + increaseAmount);
                    }


                    if (newValue !== currentValue) {
                        actorFlagUpdates[`${FLAG_PREFIX}.${tracker.id}`] = newValue;
                        needsActuallyChanged = true;
                    }
                }
                
                // Set the new last update time to the end of the last fully processed interval
                actorFlagUpdates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] = lastUpdate + (intervalsPassed * updateIntervalSeconds);
                
                if (needsActuallyChanged || actorFlagUpdates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] !== lastUpdate) {
                    actorsToUpdate.push({ actor, updates: actorFlagUpdates });
                }
            }
        }

        if (actorsToUpdate.length > 0) {
            for (const { actor, updates } of actorsToUpdate) {
                try {
                    await actor.update(updates);
                    const currentNeeds = this.getActorNeeds(actor);
                    await this.conditionManager.processActorConditions(actor, currentNeeds, this.trackerConfigs);
                } catch (e) {
                    console.error(`${MODULE_ID} | NeedsManager: Error updating actor ${actor.name} during time update:`, e, updates);
                }
            }
        }
    }

    /**
     * Processes a long rest for an actor, reducing relevant tracker values.
     * @param {ActorPF2e} actor
     */
    async processLongRest(actor) {
        if (!actor) return;
        this.loadTrackerConfigs(); // Refresh configs

        const actorFlagUpdates = {};
        let needsAffectedByRest = false;

        for (const tracker of this.trackerConfigs) {
            if (tracker.regeneration?.byLongRest) {
                const flagKey = tracker.id;
                const currentValue = actor.getFlag(MODULE_ID, flagKey) ?? tracker.defaultValue ?? 0;
                const reductionAmount = tracker.regeneration.longRestAmount ?? 0; // This can be positive or negative
                
                // If reductionAmount is positive, it reduces the need (e.g. sleep deprivation)
                // If reductionAmount is negative, it increases the need (e.g. resets a beneficial tracker to 0, -5 would set it to current - (-5) = current + 5 towards 0 if default is 0)
                // More simply: new value is current - amount. If amount is negative, it becomes current + abs(amount).
                const newValue = Math.max(0, Math.min(tracker.maxValue ?? 10, currentValue - reductionAmount));

                if (newValue !== currentValue) {
                    actorFlagUpdates[`${FLAG_PREFIX}.${flagKey}`] = newValue;
                    needsAffectedByRest = true;
                }
            }
        }

        if (needsAffectedByRest) {
            // A long rest effectively resets the "time since last interval" for all trackers
            actorFlagUpdates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] = game.time.worldTime;
            
            await actor.update(actorFlagUpdates);
            ui.notifications.info(game.i18n.format(`${MODULE_ID}.notifications.rested`, { actorName: actor.name }));
            
            const currentNeeds = this.getActorNeeds(actor);
            await this.conditionManager.processActorConditions(actor, currentNeeds, this.trackerConfigs);
        }
    }
    
    /**
     * Updates a specific need for an actor, usually from manual input or item use.
     * @param {ActorPF2e} actor
     * @param {string} trackerId The ID of the tracker to update.
     * @param {number} newValue The new raw value for the tracker.
     */
    async updateNeedValue(actor, trackerId, newValue) {
        if (!actor || !trackerId) return;
        // No need to call loadTrackerConfigs here as it's called by the methods that would call this (e.g. sheet interaction)
        
        const tracker = this.trackerConfigs.find(t => t.id === trackerId);
        if (!tracker) {
            // console.warn(`${MODULE_ID} | NeedsManager: updateNeedValue called for unknown tracker ID: ${trackerId}`);
            return;
        }

        const clampedValue = Math.max(0, Math.min(tracker.maxValue ?? 10, Number(newValue) || 0));
        const flagKey = tracker.id;
        const currentValue = actor.getFlag(MODULE_ID, flagKey) ?? tracker.defaultValue ?? 0;

        if (clampedValue !== currentValue) {
            await actor.update({ [`${FLAG_PREFIX}.${flagKey}`]: clampedValue });
            const currentNeeds = this.getActorNeeds(actor); // Get all needs after update
            await this.conditionManager.processActorConditions(actor, currentNeeds, this.trackerConfigs);
        }
    }
}