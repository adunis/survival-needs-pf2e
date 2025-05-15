// In scripts/constants.js

export const MODULE_ID = "pf2e-survival-needs";

// --- SETTING KEYS ---
export const SETTINGS = {
    // Global settings
    UPDATE_INTERVAL_HOURS: "updateIntervalHours",
    AFFECTS_NPCS: "affectsNPCs",

    // The main setting for all tracker configurations
    TRACKER_CONFIGS: "trackerConfigs",
};

// --- FLAGS ---
// Flags for individual tracker values will be dynamically constructed using:
// `${FLAG_PREFIX}.${tracker.id}` e.g., "flags.pf2e-survival-needs.hunger"
export const FLAG_PREFIX = `flags.${MODULE_ID}`;

// Flag for the last time an actor's needs were processed by the interval update
// Stored as: "flags.pf2e-survival-needs.lastUpdateTime"
export const LAST_UPDATE_TIME_FLAG_KEY = "lastUpdateTime"; // The key part after the module ID

// Flags used on Condition items applied by this module
export const CONDITION_FLAG_SOURCE_TRACKER_ID = "sourceTrackerId";
export const CONDITION_FLAG_SOURCE_THRESHOLD = "threshold";
export const CONDITION_FLAG_IS_CRITICAL_VERSION = "isCriticalVersion";


// --- DEFAULT TRACKER CONFIGURATIONS ---
// This structure is critical for both default setup and for the user-facing configuration UI.
export const DEFAULT_TRACKER_CONFIGS = [
    {
        id: "hunger", // Unique internal ID (should not be changed by user for defaults)
        name: "Hunger",
        enabled: true,
        iconClass: "fas fa-drumstick-bite", // Font Awesome icon class
        iconColor: "green",                 // CSS color for the icon
        defaultValue: 0,                    // Starting value for new characters
        maxValue: 10,                       // Maximum value the tracker can reach
        increasePerInterval: 1,             // How much it increases each game time interval
        conditions: [ // Array of condition rules for this tracker
            // Conditions are evaluated in order if priorities need to be handled manually,
            // but the ConditionManager now tries to pick the most severe.
            { 
                threshold: 10,                  // Need value must be >= this threshold
                slug: "drained",                // PF2e condition slug (e.g., from CONFIG.PF2E.conditionTypes)
                value: 2,                       // Value for conditions like drained/stupefied (0 or null for boolean)
                critical: true,                 // If true, this might override non-critical versions of the same slug
                note: "Starving"                // Optional note for GM/player reference
            },
            { threshold: 7, slug: "clumsy", value: 1, critical: false, note: "Famished" },
            { threshold: 4, slug: "fatigued", value: null, critical: false, note: "Peckish" }, // value: null or 0 for boolean conditions
        ],
        regeneration: { // How this need can be reduced
            byLongRest: false,                  // Can a long rest reduce this?
            longRestAmount: 0,                  // How much a long rest reduces it by
            byItem: true,                       // Can items reduce this? (Adds button to sheet)
            itemFilter: {                       // Rules for identifying suitable items
                types: ["consumable"],          // Array of item types (e.g., "consumable", "equipment")
                nameKeywords: ["food", "ration", "meal", "jerky", "berries", "sustenance"], // Keywords in item name
                // traitKeywords: ["food", "healing"], // Future: Check item traits (PF2e system specific)
            },
            itemRestoreAmount: 3,               // How much one item use restores
            itemButtonLabel: "Eat",             // Label for the button on the character sheet
            itemButtonIcon: "fas fa-utensils",  // Icon for the button
        },
    },
    {
        id: "thirst",
        name: "Thirst",
        enabled: true,
        iconClass: "fas fa-tint",
        iconColor: "#DAA520", // Goldenrod
        defaultValue: 0,
        maxValue: 10,
        increasePerInterval: 1,
        conditions: [
            { threshold: 10, slug: "drained", value: 2, critical: true, note: "Dehydrated" },
            { threshold: 7, slug: "stupefied", value: 1, critical: false, note: "Parched" },
            { threshold: 4, slug: "fatigued", value: null, critical: false, note: "Thirsty" },
        ],
        regeneration: {
            byLongRest: false,
            longRestAmount: 0,
            byItem: true,
            itemFilter: {
                types: ["consumable"],
                nameKeywords: ["water", "drink", "ale", "wine", "potion", "waterskin", "canteen"],
                // traitKeywords: ["drinkable", "potion", "elixir"],
            },
            itemRestoreAmount: 3,
            itemButtonLabel: "Drink",
            itemButtonIcon: "fas fa-glass-whiskey",
        },
    },
    {
        id: "sleep", // Represents sleep deprivation
        name: "Sleep Dep.",
        enabled: true,
        iconClass: "fas fa-bed",
        iconColor: "dodgerblue",
        defaultValue: 0,
        maxValue: 10,
        increasePerInterval: 1, // How much deprivation increases if not rested sufficiently
        conditions: [
            { threshold: 9, slug: "stupefied", value: 2, critical: true, note: "Exhausted" }, // Stupefied can go higher
            { threshold: 6, slug: "slowed", value: 1, critical: false, note: "Weary" }, 
            { threshold: 3, slug: "fatigued", value: null, critical: false, note: "Tired" },
        ],
        regeneration: {
            byLongRest: true,
            longRestAmount: 8, // How much deprivation is reduced by a full night's rest
            byItem: false,     // Typically not restored by common items, but configurable
            itemFilter: { types: [], nameKeywords: [] },
            itemRestoreAmount: 0,
            itemButtonLabel: "Nap", // Placeholder if byItem were true
            itemButtonIcon: "fas fa-moon",
        },
    },
    // Example of a custom beneficial tracker:
    /*
    {
        id: "divinePower",
        name: "Divine Favor",
        enabled: false, // Disabled by default, user can enable
        iconClass: "fas fa-cross",
        iconColor: "gold",
        defaultValue: 0,
        maxValue: 5,
        increasePerInterval: 0, // Doesn't increase automatically with time
        conditions: [ // Here, "conditions" are actually buffs
            { threshold: 1, slug: "inspired", value: null, critical: false, note: "Slightly Favored" }, // Assuming 'inspired' is a custom or existing buff
            { threshold: 3, slug: "heroism", value: null, critical: false, note: "Favored" }, // Could be a low-level heroism effect
            { threshold: 5, slug: "bless", value: null, critical: true, note: "Blessed" } // Example of a more potent buff
        ],
        regeneration: { // How this "power" is gained or lost
            byLongRest: true,        // Maybe it resets or partially charges on long rest
            longRestAmount: -5,      // Negative amount means it resets to default (or close to it)
            byItem: true,
            itemFilter: {
                types: ["consumable"],
                nameKeywords: ["holy symbol", "prayer bead", "offering"],
            },
            itemRestoreAmount: 1, // Gaining favor, so positive
            itemButtonLabel: "Pray",
            itemButtonIcon: "fas fa-praying-hands",
        },
    }
    */
];

// Helper to get all managed condition slugs from the current config dynamically
// This is useful for ConditionManager to know which slugs it might be responsible for.
export function getManagedConditionSlugsFromConfigs(trackerConfigs) {
    const slugs = new Set();
    if (!trackerConfigs || !Array.isArray(trackerConfigs)) return [];

    trackerConfigs.forEach(tracker => {
        if (tracker.enabled && tracker.conditions) {
            tracker.conditions.forEach(cond => {
                if (cond.slug) slugs.add(cond.slug);
            });
        }
    });
    return Array.from(slugs);
}