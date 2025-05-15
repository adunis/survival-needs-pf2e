// In scripts/condition-manager.js
import { MODULE_ID, SETTINGS, FLAG_PREFIX, CONDITION_FLAG_SOURCE_TRACKER_ID, CONDITION_FLAG_SOURCE_THRESHOLD, CONDITION_FLAG_IS_CRITICAL_VERSION } from "./constants.js";

export class ConditionManager {
    constructor() {
        // console.log(`${MODULE_ID} | ConditionManager: Constructed.`);
        // No specific state needed in constructor for this version
    }

    /**
     * Manages conditions on an actor based on their current needs and tracker configurations.
     * This method first removes all conditions previously applied by this module for the given trackers,
     * then re-applies only the highest-priority conditions that currently meet their thresholds.
     * 
     * @param {ActorPF2e} actor The actor to manage conditions for.
     * @param {Object} currentNeeds An object mapping tracker IDs to their current values (e.g., { hunger: 5 }).
     * @param {Array<Object>} activeTrackerConfigs The array of *enabled* tracker configurations.
     */
    async processActorConditions(actor, currentNeeds, activeTrackerConfigs) {
        if (!actor || !currentNeeds || !activeTrackerConfigs) {
            // console.warn(`${MODULE_ID} | ConditionManager.processActorConditions: Called with invalid arguments. Actor: ${!!actor}, Needs: ${!!currentNeeds}, Configs: ${!!activeTrackerConfigs}`);
            return;
        }
        
        const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);
        if (actor.type !== 'character' && (actor.type !== 'npc' || !affectsNPCs)) {
            return;
        }

        // --- Step 1: Clear existing conditions managed by this module for the currently active trackers ---
        // This helps prevent orphaned conditions if a tracker's config changes or a condition rule is removed.
        const actorExistingConditions = [...actor.conditions.contents]; // Snapshot
        for (const existingCond of actorExistingConditions) {
            const sourceTrackerId = existingCond.getFlag(MODULE_ID, CONDITION_FLAG_SOURCE_TRACKER_ID);
            // If this condition was sourced by any of the trackers we are currently processing
            if (sourceTrackerId && activeTrackerConfigs.some(tc => tc.id === sourceTrackerId)) {
                // console.log(`${MODULE_ID} | ConditionManager: Clearing previous condition '${existingCond.slug}' from tracker '${sourceTrackerId}' on actor '${actor.name}'.`);
                try {
                    // Attempt to remove the specific instance.
                    // The PF2e system handles value reduction or full removal.
                    await actor.decreaseCondition(existingCond.slug, { forceRemove: true, specific: existingCond, tokenMessage: false });
                } catch (e) {
                    console.error(`${MODULE_ID} | ConditionManager: Error removing condition '${existingCond.slug}' for actor '${actor.name}':`, e);
                }
            }
        }

        // Optional: A brief pause to allow the system to fully process removals before re-adding.
        // This might not be strictly necessary if decreaseCondition is fully awaited and effective.
        // await new Promise(resolve => setTimeout(resolve, 10));


        // --- Step 2: Determine the "desired active conditions" based on current needs and highest priority ---
        // Map: conditionSlug -> { def: highestPriorityCondDef, trackerId: sourceTracker.id }
        const conditionsToEffectivelyApply = new Map();

        for (const tracker of activeTrackerConfigs) { // Iterate over already enabled trackers
            if (!tracker.conditions || tracker.conditions.length === 0) continue;

            const needValue = currentNeeds[tracker.id] ?? tracker.defaultValue ?? 0;
            let bestMatchForThisTracker = null;

            // Find the single most severe condition definition met by this tracker's current needValue
            for (const condDef of tracker.conditions) {
                if (needValue >= condDef.threshold) {
                    if (!bestMatchForThisTracker || 
                        (condDef.critical && !bestMatchForThisTracker.critical) ||
                        (condDef.critical === bestMatchForThisTracker.critical && (condDef.value ?? -Infinity) > (bestMatchForThisTracker.value ?? -Infinity)) ||
                        // If values are same (or both non-valued), and critical is same, higher threshold wins
                        (condDef.critical === bestMatchForThisTracker.critical && (condDef.value ?? -Infinity) === (bestMatchForThisTracker.value ?? -Infinity) && condDef.threshold > bestMatchForThisTracker.threshold)
                       ) {
                        bestMatchForThisTracker = condDef;
                    }
                }
            }

            if (bestMatchForThisTracker) {
                const slug = bestMatchForThisTracker.slug;
                const existingApplicationDecision = conditionsToEffectivelyApply.get(slug);

                // If this slug is already slated for application, only overwrite if the new one is higher priority
                if (!existingApplicationDecision ||
                    (bestMatchForThisTracker.critical && !existingApplicationDecision.def.critical) ||
                    (bestMatchForThisTracker.critical === existingApplicationDecision.def.critical && 
                     (bestMatchForThisTracker.value ?? -Infinity) > (existingApplicationDecision.def.value ?? -Infinity))
                   ) {
                    conditionsToEffectivelyApply.set(slug, { 
                        def: bestMatchForThisTracker, 
                        trackerId: tracker.id
                    });
                }
            }
        }

        // --- Step 3: Apply the determined conditions ---
        // Since we cleared module-managed conditions at the start, these are effectively fresh applications.
        for (const [slug, { def, trackerId }] of conditionsToEffectivelyApply) {
            // console.log(`${MODULE_ID} | ConditionManager: Applying condition '${slug}' (Value: ${def.value}, Critical: ${!!def.critical}) on actor '${actor.name}' from tracker '${trackerId}' at threshold ${def.threshold}.`);
            try {
                await actor.increaseCondition(slug, {
                    value: def.value, // PF2e handles undefined value for non-valued conditions
                    tokenMessage: false, // Suppress default chat message for condition application
                    flags: { 
                        [MODULE_ID]: { 
                            [CONDITION_FLAG_SOURCE_TRACKER_ID]: trackerId, 
                            [CONDITION_FLAG_SOURCE_THRESHOLD]: def.threshold,
                            [CONDITION_FLAG_IS_CRITICAL_VERSION]: !!def.critical 
                        } 
                    }
                });
            } catch (e) {
                console.error(`${MODULE_ID} | ConditionManager: Error applying condition '${slug}' for actor '${actor.name}':`, e);
            }
        }
    }
}