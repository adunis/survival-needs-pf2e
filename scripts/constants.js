// File: scripts/constants.js

export const MODULE_ID = "survival-needs-pf2e";

// --- SETTING KEYS ---
export const SETTINGS = {
    UPDATE_INTERVAL_HOURS: "updateIntervalHours",
    AFFECTS_NPCS: "affectsNPCs",
    TRACKER_CONFIGS: "trackerConfigs",
};

// --- FLAGS ---
export const FLAG_PREFIX = `flags.${MODULE_ID}`;
export const LAST_UPDATE_TIME_FLAG_KEY = "lastUpdateTime";

// Flags ON our dynamically created Parent Effect Items on Actors
export const DYNAMIC_EFFECT_FLAG_MODULE_MANAGED = "isSurvivalNeedEffect";
export const DYNAMIC_EFFECT_FLAG_SOURCE_TRACKER_ID = "sourceTrackerId";
export const DYNAMIC_EFFECT_FLAG_THRESHOLD_NAME = "thresholdName";


// --- DEFAULT ICONS for Threshold Effects ---
const ICON_PATH_PREFIX = `modules/${MODULE_ID}/icons/`; 

// --- DEFAULT TRACKER CONFIGURATIONS ---
export const DEFAULT_TRACKER_CONFIGS = [
    // --- HUNGER ---
    {
        id: "hunger",
        name: "Hunger",
        enabled: true,
        iconClass: "fas fa-drumstick-bite",
        iconColor: "green",
        defaultValue: 0,
        maxValue: 100,
        increasePerInterval: 0.555, // For 100pts/30days @ 6 (4hr) intervals/day
        thresholdEffects: [
            { 
                threshold: 40, name: "Peckish", icon: `${ICON_PATH_PREFIX}Status_Hunger.png`, 
                symptoms: [{ slug: "fatigued", value: null }]
            },
            { 
                threshold: 70, name: "Famished", icon: `${ICON_PATH_PREFIX}Status_Hunger.png`,
                symptoms: [{ slug: "enfeebled", value: 1 }] // Changed from clumsy for more impact
            },
            { 
                threshold: 90, // Lowered for earlier onset of severe
                name: "Starving", icon: `${ICON_PATH_PREFIX}Status_InjuredMinor.png`, // More severe icon
                symptoms: [
                    { slug: "drained", value: 2 }, 
                    { slug: "enfeebled", value: 2 }, // Added enfeebled
                    { slug: "fatigued", value: null }  // Ensure fatigued persists or reapplies
                ]
            }
        ],
        regeneration: { 
            byLongRest: false, longRestAmount: 0, byItem: true,
            itemFilter: { types: ["consumable", "equipment"], nameKeywords: ["food","ration","meal","jerky","biscuit","bread","cheese","meat","stew","fruit","vegetable","berries","nuts","pemmican","travel","iron"]},
            itemRestoreAmount: 3.33, 
            itemButtonLabel: "Eat Food", itemButtonIcon: "fas fa-utensils",
        },
    },
    // --- THIRST ---
    {
        id: "thirst",
        name: "Thirst",
        enabled: true,
        iconClass: "fas fa-tint",
        iconColor: "#DAA520",
        defaultValue: 0,
        maxValue: 100,
        increasePerInterval: 3.33, // For 100pts/5days @ 6 (4hr) intervals/day
        thresholdEffects: [
            { 
                threshold: 35, name: "Thirsty", icon: `${ICON_PATH_PREFIX}Status_Thirst.png`,
                symptoms: [ { slug: "fatigued", value: null } ]
            },
            { 
                threshold: 70, name: "Parched", icon: `${ICON_PATH_PREFIX}Status_Thirst.png`,
                symptoms: [ { slug: "enfeebled", value: 1 }, {slug: "fatigued", value: null} ] // Fatigued if very parched
            },
            { 
                threshold: 90, // Lowered for earlier onset of severe
                name: "Dehydrated", icon: `${ICON_PATH_PREFIX}Status_DifficultyBreathing.png`, // More severe icon
                symptoms: [ 
                    { slug: "enfeebled", value: 2 }, 
                    { slug: "drained", value: 2 }, // Increased drained
                    { slug: "stupefied", value: 1 } // Added stupefied
                ]
            }
        ],
        regeneration: {
            byLongRest: false, longRestAmount: 0, byItem: true,
            itemFilter: { types: ["consumable", "equipment"], nameKeywords: ["water","drink","waterskin","canteen","flask","ale","beer","wine","mead","juice","tea","broth","potion"]},
            itemRestoreAmount: 20, 
            itemButtonLabel: "Drink", itemButtonIcon: "fas fa-glass-whiskey",
        },
    },
    // --- SLEEP DEPRIVATION ---
    {
        id: "sleep",
        name: "Sleep Deprivation",
        enabled: true,
        iconClass: "fas fa-bed",
        iconColor: "dodgerblue",
        defaultValue: 0,
        maxValue: 100,
        increasePerInterval: 10, 
        thresholdEffects: [
            { 
                threshold: 30, name: "Tired", icon: `${ICON_PATH_PREFIX}Mood_Sleepy.png`,
                symptoms: [ { slug: "fatigued", value: null } ]
            },
            { 
                threshold: 60, name: "Weary", icon: `${ICON_PATH_PREFIX}Mood_Sleepy.png`,
                symptoms: [ { slug: "slowed", value: 1 }, {slug: "stupefied", value: 1} ] // Added stupefied
            },
            { 
                threshold: 85, // Lowered for earlier onset of severe
                name: "Exhausted", icon: `${ICON_PATH_PREFIX}Mood_Ill.png`, // More severe icon
                symptoms: [ 
                    { slug: "stupefied", value: 2 }, 
                    { slug: "slowed", value: 1 }, // Ensure slowed persists
                    { slug: "drained", value: 1 }  // Added drained
                ]
            }
        ],
        regeneration: { byLongRest: true, longRestAmount: 80, byItem: false, },
        specialActions: [ /* ... single button with choices as before ... */ 
            {
                actionId: "manage_sleep", label: "Rest Options", icon: "fas fa-moon", opensChoicesDialog: true,
                choices: [
                    { id: "short_nap", label: "Short Nap (30 min)", timeMinutes: 30, reducesBy: 15, chatMessage: "{actorName} takes a short, refreshing nap." },
                    { id: "moderate_sleep", label: "Sleep (4 hours)", timeMinutes: 240, reducesBy: 40, chatMessage: "{actorName} gets a few hours of solid sleep." },
                    { id: "full_long_rest", label: "Full Night's Rest (8+ hours)", timeMinutes: 480, triggersLongRest: true, chatMessage: "{actorName} settles in for a full night's rest." }
                ]
            }
        ]
    },
    // --- PISS (BLADDER) ---
    {
        id: "piss", name: "Bladder", enabled: true, iconClass: "fas fa-water", iconColor: "gold",
        defaultValue: 0, maxValue: 100, increasePerInterval: 0, 
        thresholdEffects: [
            { threshold: 60, name: "Need to Urinate", icon: `${ICON_PATH_PREFIX}Mood_Discomfort.png`, symptoms: [/* e.g., minor penalty to concentration checks via custom effect */] },
            { threshold: 90, name: "Urgent Bladder", icon: `${ICON_PATH_PREFIX}Mood_Panicked.png`, symptoms: [{ slug: "clumsy", value: 1, note: "Distracted and rushing" }, {slug: "fatigued", value: null}] }
        ],
        regeneration: { byLongRest: false, byItem: false }, 
        specialActions: [ { actionId: "relieve_piss", label: "Urinate", icon: "fas fa-toilet-paper", timeMinutes: 2, reducesTo: 0, chatMessage: "{actorName} finds a moment to relieve their bladder." }]
    },
    // --- POOP (BOWELS) ---
    {
        id: "poop", name: "Bowels", enabled: true, iconClass: "fas fa-poo", iconColor: "saddlebrown",
        defaultValue: 0, maxValue: 100, increasePerInterval: 0, 
        thresholdEffects: [
            { threshold: 70, name: "Need to Defecate", icon: `${ICON_PATH_PREFIX}Mood_Discomfort.png`, symptoms: [{ slug: "slowed", value: 1, note: "Stomach discomfort" }] },
            { threshold: 95, name: "Bowel Emergency", icon: `${ICON_PATH_PREFIX}Mood_Panicked.png`, symptoms: [{ slug: "enfeebled", value: 2, note: "Severe discomfort and cramps" }, {slug:"sickened", value:1}] } // Increased enfeebled, added sickened
        ],
        regeneration: { byLongRest: false, byItem: false },
        specialActions: [ { actionId: "relieve_poop", label: "Defecate", icon: "fas fa-toilet-paper", timeMinutes: 10, reducesTo: 0, chatMessage: "{actorName} takes time for a bowel movement." } ]
    },
    // --- BOREDOM ---
    {
        id: "boredom", name: "Boredom", enabled: true, iconClass: "fas fa-hourglass-end", iconColor: "slategray",
        defaultValue: 0, maxValue: 100, increasePerInterval: 2, // Slightly reduced passive increase
        thresholdEffects: [
            { threshold: 40, name: "Restless", icon: `${ICON_PATH_PREFIX}Mood_Bored.png`, symptoms: [/* Minor penalty to perception or initiative */] },
            { threshold: 70, name: "Bored", icon: `${ICON_PATH_PREFIX}Mood_Bored.png`, symptoms: [{ slug: "stupefied", value: 1, note: "Mind wandering, easily distracted" }] },
            { threshold: 95, name: "Profoundly Bored", icon: `${ICON_PATH_PREFIX}Mood_Sad.png`, symptoms: [{ slug: "stupefied", value: 2, note: "Apathetic, difficult to motivate" }, {slug:"fascinated", value: null, note: "Will latch onto ANYTHING remotely novel, possibly to their detriment."}]} // Fascinated with trivial things
        ],
        regeneration: { byLongRest: false, byItem: false }, 
        specialActions: [ 
            { 
                actionId: "relieve_boredom", label: "Alleviate Boredom", icon: "fas fa-dice", opensChoicesDialog: true,
                choices: [ 
                    // Constructive/Neutral
                    { id: "read", label: "Read a Book", timeMinutes: 60, reducesBy: 40, stressChange: -5, chatMessage: "{actorName} gets lost in a good book." },
                    { id: "practice_skill", label: "Practice a Skill/Craft", timeMinutes: 60, reducesBy: 35, stressChange: 0, chatMessage: "{actorName} hones their abilities." },
                    { id: "play_game", label: "Play a Game (Cards, Dice)", timeMinutes: 30, reducesBy: 25, stressChange: -10, chatMessage: "{actorName} enjoys a lighthearted game." },
                    { id: "socialize_pleasantly", label: "Pleasant Socializing", timeMinutes: 30, reducesBy: 30, stressChange: -15, chatMessage: "{actorName} enjoys some friendly conversation." },
                    { id: "observe_nature", label: "Observe Nature/People Watch", timeMinutes: 20, reducesBy: 15, stressChange: -5, chatMessage: "{actorName} finds interest in their surroundings." },
                    { id: "tinker", label: "Tinker/Fiddle with Something", timeMinutes: 30, reducesBy: 20, stressChange: 0, chatMessage: "{actorName} tinkers with an object." },
                    // Potentially Risky / Mischievous
                    { id: "prank_light", label: "Play a Light Prank (PC/Friendly NPC)", timeMinutes: 10, reducesBy: 30, stressChange: 5, chatMessage: "{actorName} plays a harmless prank, feeling a bit livelier." },
                    { id: "gamble_small", label: "Gamble (Small Stakes)", timeMinutes: 60, reducesBy: 25, stressChange: 10, chatMessage: "{actorName} tries their luck with a small gamble." },
                    { id: "spread_rumor", label: "Spread a Minor (Juicy) Rumor", timeMinutes: 15, reducesBy: 35, stressChange: 5, chatMessage: "{actorName} whispers a tantalizing rumor, a spark of excitement in their eyes." },
                    // Negative / Troublemaking
                    { id: "annoy_someone", label: "Annoy Someone (PC/NPC)", timeMinutes: 5, reducesBy: 20, stressChange: 15, chatMessage: "{actorName} intentionally annoys someone, finding it amusing." },
                    { id: "vandalize_minor", label: "Minor Vandalism/Mischief", timeMinutes: 10, reducesBy: 40, stressChange: 20, chatMessage: "{actorName} causes some minor, troublesome mischief." },
                    { id: "start_argument", label: "Start a Pointless Argument", timeMinutes: 15, reducesBy: 25, stressChange: 25, chatMessage: "{actorName} picks a fight over something trivial, just for the engagement." }
                ]
            }
        ]
    },
    // --- STRESS ---
    {
        id: "stress", name: "Stress", enabled: true, iconClass: "fas fa-bolt", iconColor: "orangered",
        defaultValue: 0, maxValue: 100, increasePerInterval: 0, // Primarily event-driven
        thresholdEffects: [
            { threshold: 40, name: "Anxious", icon: `${ICON_PATH_PREFIX}Mood_Stressed.png`, symptoms: [/* Minor penalty to concentration or social checks */] },
            { threshold: 70, name: "Stressed", icon: `${ICON_PATH_PREFIX}Mood_Stressed.png`, symptoms: [{ slug: "frightened", value: 1, note: "On edge, jumpy" }]},
            { threshold: 95, name: "Overwhelmed", icon: `${ICON_PATH_PREFIX}Mood_Panicked.png`, symptoms: [{ slug: "stupefied", value: 2 }, { slug: "frightened", value: 2, note: "Panicked and mentally scattered" }, {slug: "confused", value: null, note: "Cannot think straight"}]} // Added Confused
        ],
        regeneration: { byLongRest: true, longRestAmount: 50, byItem: false }, 
        specialActions: [
            { 
                actionId: "relieve_stress", label: "Alleviate Stress", icon: "fas fa-peace", opensChoicesDialog: true,
                choices: [
                    // Positive / Healthy
                    { id: "meditate", label: "Meditate / Deep Breathing", timeMinutes: 20, reducesBy: 30, boredomChange: 5, chatMessage: "{actorName} finds a moment of calm through meditation." },
                    { id: "talk_it_out", label: "Talk with a Confidante", timeMinutes: 30, reducesBy: 40, boredomChange: -5, chatMessage: "{actorName} shares their burdens with a friend." },
                    { id: "hobby_relaxing", label: "Engage in a Relaxing Hobby", timeMinutes: 60, reducesBy: 50, boredomChange: -20, chatMessage: "{actorName} loses themself in a relaxing hobby." },
                    { id: "take_walk", label: "Take a Quiet Walk", timeMinutes: 30, reducesBy: 20, boredomChange: 0, chatMessage: "{actorName} clears their head with a quiet walk." },
                    // Neutral / Distraction
                    { id: "vigorous_exercise", label: "Vigorous Exercise", timeMinutes: 30, reducesBy: 35, boredomChange: 10, chatMessage: "{actorName} burns off stress with intense exercise." },
                    { id: "comfort_eat", label: "Comfort Eating (Minor)", timeMinutes: 10, reducesBy: 15, boredomChange: -5, chatMessage: "{actorName} indulges in a small comfort food." }, // Could link to hunger
                    // Risky / Negative Coping
                    { id: "drink_heavily", label: "Drink Heavily (Alcohol)", timeMinutes: 60, reducesBy: 50, boredomChange: -30, chatMessage: "{actorName} tries to drink their stress away. (Thirst satisfied, Piss increases, other effects may apply)" }, // This choice would need special handling to also affect Thirst/Piss/Boredom
                    { id: "lash_out", label: "Lash Out Verbally (NPC/PC)", timeMinutes: 5, reducesBy: 20, boredomChange: -10, chatMessage: "{actorName} vents their frustration by lashing out." }, // Social consequences likely
                    { id: "reckless_act", label: "Minor Reckless Act", timeMinutes: 10, reducesBy: 30, boredomChange: -20, chatMessage: "{actorName} does something a bit reckless to feel alive." }, // Potential for trouble
                    { id: "isolate", label: "Isolate Self", timeMinutes: 60, reducesBy: 10, boredomChange: 20, chatMessage: "{actorName} withdraws, seeking solitude but finding little relief." }
                ]
            }
        ]
    },
    // --- WETNESS ---
    {
        id: "wetness", name: "Wetness", enabled: true, iconClass: "fas fa-cloud-rain", iconColor: "deepskyblue",
        defaultValue: 0, maxValue: 100, increasePerInterval: 0, 
        thresholdEffects: [
            { threshold: 30, name: "Damp", icon: `${ICON_PATH_PREFIX}Status_Wet.png`, symptoms: [/* If cold, perhaps penalty to Fort vs cold */] },
            { threshold: 70, name: "Soaked", icon: `${ICON_PATH_PREFIX}Status_Wet.png`, symptoms: [{ slug: "clumsy", value: 1, note: "Slippery clothes/gear" }, {slug:"fatigued", value:null, note: "Uncomfortable and chilled"}] },
            { threshold: 95, name: "Freezing Wet", icon: `${ICON_PATH_PREFIX}Status_Windchill.png`, symptoms: [{ slug: "slowed", value: 1 }, {slug: "enfeebled", value: 2, note: "Severely impaired by cold and wetness" }, {slug: "drained", value:1}]} // More severe
        ],
        regeneration: { byLongRest: false, byItem: false },
        specialActions: [
            { actionId: "dry_off", label: "Dry Off", icon: "fas fa-fire", timeMinutes: 30, reducesTo: 0, chatMessage: "{actorName} takes time to dry their clothes and gear." }
        ]
    }
];